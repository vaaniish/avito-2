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

export async function validateSellerOnboardingForListing(params: {
  sellerId: number;
  category: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  type PartnershipRequestWithOnboarding = Prisma.PartnershipRequestGetPayload<{
    include: { onboarding_profile: true };
  }>;

  const payoutProfile = await prisma.sellerPayoutProfile.findUnique({
    where: { seller_id: params.sellerId },
    select: { status: true },
  });
  if (payoutProfile?.status !== "VERIFIED") {
    return {
      ok: false,
      status: 403,
      error: "Before publishing listings, verify the seller payout profile.",
    };
  }

  let request: PartnershipRequestWithOnboarding | null | undefined;
  try {
    request = await prisma.partnershipRequest.findFirst({
      where: {
        user_id: params.sellerId,
        status: "APPROVED",
      },
      orderBy: [{ reviewed_at: "desc" }, { created_at: "desc" }],
      include: {
        onboarding_profile: true,
      },
    });
  } catch {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { user_id: params.sellerId },
      select: { is_verified: true },
    });
    request = sellerProfile?.is_verified ? null : undefined;
  }

  if (!request) {
    request = await prisma.partnershipRequest.findFirst({
      where: {
        user_id: params.sellerId,
        status: "APPROVED_LIMITED",
      },
      orderBy: [{ reviewed_at: "desc" }, { created_at: "desc" }],
      include: {
        onboarding_profile: true,
      },
    }).catch(() => null);
  }

  if (request === null) {
    return { ok: true };
  }

  if (!request?.onboarding_profile) {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { user_id: params.sellerId },
      select: { is_verified: true },
    });
    if (sellerProfile?.is_verified) {
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
    const activeListingsCount = await prisma.marketplaceListing.count({
      where: {
        seller_id: params.sellerId,
        status: { in: ["ACTIVE", "MODERATION"] },
      },
    });
    if (activeListingsCount >= request.onboarding_profile.listing_limit) {
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
