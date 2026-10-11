import { Prisma } from "@prisma/client";
import { prisma } from "../../../../../lib/prisma";
import type { PartnerListingSellerModerationContext } from "../../domain/partner-listings.types";
import { makeListingModerationEventPublicId } from "../../../../moderation/listing-moderation.shared";
import { isListingCategoryAllowed, jsonStringArray } from "../../../../partnership/onboarding";

export async function loadSellerModerationContext(
  sellerId: number,
): Promise<PartnerListingSellerModerationContext | null> {
  const seller = await prisma.appUser.findUnique({
    where: { id: sellerId },
    select: {
      joined_at: true,
      seller_profile: {
        select: {
          is_verified: true,
        },
      },
      _count: {
        select: {
          complaints_against: true,
          orders_as_seller: true,
          listings: true,
        },
      },
    },
  });

  if (!seller) {
    return null;
  }

  return {
    joinedAt: seller.joined_at,
    isVerified: Boolean(seller.seller_profile?.is_verified),
    complaintsCount: seller._count.complaints_against,
    sellerOrdersCount: seller._count.orders_as_seller,
    listingsCount: seller._count.listings,
  };
}

export async function hasBlockingOrderForListing(listingId: number): Promise<boolean> {
  const linked = await prisma.marketOrderItem.findFirst({
    where: {
      listing_id: listingId,
      order: {
        status: {
          not: "CANCELLED",
        },
      },
    },
    select: { id: true },
  });
  return Boolean(linked);
}

export async function hasActivationBlockingOrderForListing(listingId: number): Promise<boolean> {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id: listingId },
    select: {
      has_multiple_stock: true,
      available_quantity: true,
    },
  });

  if (!listing) {
    return false;
  }

  if (listing.has_multiple_stock && listing.available_quantity > 0) {
    return false;
  }

  const linked = await prisma.marketOrderItem.findFirst({
    where: {
      listing_id: listingId,
      order: {
        status: {
          in: ["CREATED", "PAID", "PROCESSING", "PREPARED", "SHIPPED"],
        },
      },
    },
    select: { id: true },
  });
  return Boolean(linked);
}

export async function validateSellerOnboardingForListing(params: {
  sellerId: number;
  category: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const seller = await prisma.appUser.findUnique({
    relationLoadStrategy: "join",
    where: { id: params.sellerId },
    select: {
      payout_profile: { select: { status: true } },
      seller_profile: { select: { is_verified: true } },
      partnership_requests: {
        where: { status: { in: ["APPROVED", "APPROVED_LIMITED"] } },
        orderBy: [{ reviewed_at: "desc" }, { created_at: "desc" }],
        include: { onboarding_profile: true },
      },
      _count: {
        select: {
          listings: { where: { status: { in: ["ACTIVE", "MODERATION"] } } },
        },
      },
    },
  });
  if (seller?.payout_profile?.status !== "VERIFIED") {
    return {
      ok: false,
      status: 403,
      error:
        "Подключите и подтвердите реквизиты для выплат во вкладке «Финансы», чтобы публиковать и активировать объявления.",
    };
  }

  const request =
    seller.partnership_requests.find((candidate) => candidate.status === "APPROVED") ??
    seller.partnership_requests.find((candidate) => candidate.status === "APPROVED_LIMITED") ??
    null;

  if (request === null) {
    return { ok: true };
  }

  if (!request?.onboarding_profile) {
    if (seller.seller_profile?.is_verified) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      error: "Seller onboarding approval is required before creating listings.",
    };
  }

  const allowedCategories = jsonStringArray(
    request.onboarding_profile.allowed_categories ?? request.onboarding_profile.categories,
  );
  if (!isListingCategoryAllowed(params.category, allowedCategories)) {
    return {
      ok: false,
      status: 403,
      error: "This seller is not approved for the selected category.",
    };
  }

  if (request.status === "APPROVED_LIMITED") {
    if (seller._count.listings >= request.onboarding_profile.listing_limit) {
      return {
        ok: false,
        status: 403,
        error: "Limited approval allows only 20 active or moderated listings.",
      };
    }
  }

  return { ok: true };
}

export async function writeListingModerationEvent(params: {
  listingId: number;
  actorUserId: number | null;
  actorType: "SYSTEM" | "ADMIN";
  decision: string;
  reasonCode: string;
  reasonNote?: string | null;
  riskScore?: number | null;
  signals?: string[];
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.listingModerationEvent.create({
    data: {
      public_id: makeListingModerationEventPublicId(),
      listing_id: params.listingId,
      actor_user_id: params.actorUserId,
      actor_type: params.actorType,
      decision: params.decision as any,
      reason_code: params.reasonCode,
      reason_note: params.reasonNote ?? null,
      risk_score: params.riskScore ?? null,
      signals:
        params.signals && params.signals.length > 0
          ? Array.from(new Set(params.signals))
          : undefined,
      metadata: params.metadata ?? undefined,
    },
  });
}

export async function applyAutoModerationDecision(params: {
  listingId: number;
  moderationStatus: "APPROVED" | "REJECTED" | "PENDING";
  listingStatus: string;
  reasonCode: string;
  reasonNote?: string | null;
  riskScore: number;
  signals: string[];
  aiUsed: boolean;
  imageModerationSignals: string[];
}): Promise<{ applied: boolean }> {
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.marketplaceListing.updateMany({
      where: { id: params.listingId },
      data: {
        status: params.listingStatus as any,
        moderation_status: params.moderationStatus,
      },
    });

    if (result.count === 0) {
      return false;
    }

    await tx.listingModerationEvent.create({
      data: {
        public_id: makeListingModerationEventPublicId(),
        listing_id: params.listingId,
        actor_user_id: null,
        actor_type: "SYSTEM",
        decision:
          params.moderationStatus === "APPROVED"
            ? "AUTO_APPROVED"
            : params.moderationStatus === "REJECTED"
              ? "REJECTED"
              : "AUTO_REVIEW",
        reason_code: params.reasonCode,
        reason_note: params.reasonNote ?? null,
        risk_score: params.riskScore,
        signals:
          params.signals.length > 0
            ? Array.from(new Set(params.signals))
            : undefined,
        metadata: {
          aiUsed: params.aiUsed,
          imageModerationSignals: params.imageModerationSignals,
        },
      },
    });

    return true;
  });

  return { applied: updated };
}
