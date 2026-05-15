import { notFound, validationError } from "../../../../../common/application-error";
import {
  buildListingPublicUrl,
  extractPrimaryAddressInfo,
} from "../../../common/domain/admin-common.helpers";
import { toAdminListingStatus } from "../../../../../utils/format";
import {
  buildAutoFlags,
  parseModerationStatus,
  requireModerationStatus,
  resolveNextListingStatus,
  toModerationDecision,
  type ModerationStatusValue,
} from "../../domain/admin-listings.helpers";
import type { AdminListingsAuditGateway } from "../../infrastructure/gateways/admin-listings-audit.gateway";
import type { AdminListingsNotificationGateway } from "../../infrastructure/gateways/admin-listings-notification.gateway";
import type { AdminListingsRepository } from "../../infrastructure/repositories/admin-listings.repository";
import {
  defaultListingModerationReasonCode,
  makeListingModerationEventPublicId,
  parseListingModerationReasonCode,
} from "../../../../moderation/listing-moderation.shared";

export class ListAdminListingsService {
  constructor(private readonly repository: AdminListingsRepository) {}

  async execute() {
    const listings = await this.repository.listListings();
    return listings.map((listing) => {
      const latestModeration = listing.moderation_events[0] ?? null;
      const addressInfo = extractPrimaryAddressInfo(listing.seller.addresses);
      return {
        id: listing.public_id,
        listingUrl: buildListingPublicUrl(listing.public_id),
        title: listing.title,
        description: listing.description,
        images: listing.images.map((image) => image.url),
        sellerId: listing.seller.public_id,
        sellerName: listing.seller.name,
        sellerStatus: listing.seller.status.toLowerCase(),
        sellerJoinedAt: listing.seller.joined_at,
        status: toAdminListingStatus(listing.moderation_status),
        listingStatus: listing.status.toLowerCase(),
        createdAt: listing.created_at,
        category: listing.item?.name ?? "No category",
        city: addressInfo.city,
        region: addressInfo.region,
        price: listing.price,
        salePrice: listing.sale_price,
        views: listing.views,
        rating: listing.rating,
        complaintsCount: listing._count.complaints,
        ordersCount: listing._count.order_items,
        wishlistCount: listing._count.wishlist_items,
        questionsCount: listing._count.questions,
        autoFlags: buildAutoFlags({
          description: listing.description,
          seller: listing.seller,
          complaints_count: listing._count.complaints,
        }),
        latestModeration: latestModeration
          ? {
              id: latestModeration.public_id,
              decision: latestModeration.decision.toLowerCase(),
              reasonCode: latestModeration.reason_code,
              reasonNote: latestModeration.reason_note,
              riskScore: latestModeration.risk_score,
              signals: Array.isArray(latestModeration.signals)
                ? (latestModeration.signals as string[])
                : [],
              createdAt: latestModeration.created_at,
            }
          : null,
      };
    });
  }
}

export class UpdateAdminListingModerationService {
  constructor(
    private readonly repository: AdminListingsRepository,
    private readonly auditGateway: AdminListingsAuditGateway,
    private readonly notificationGateway: AdminListingsNotificationGateway,
  ) {}

  async execute(input: {
    publicId: string;
    status: unknown;
    reasonCode: unknown;
    reasonNote: unknown;
    actorUserId: number;
    requestIp: string | null;
  }) {
    const parsedStatus = requireModerationStatus(input.status);
    const parsedReasonCode = parseListingModerationReasonCode(input.reasonCode);
    const reasonCode =
      parsedReasonCode ??
      defaultListingModerationReasonCode({ moderationStatus: parsedStatus });
    const reasonNote =
      typeof input.reasonNote === "string"
        ? input.reasonNote.trim().slice(0, 2000)
        : null;

    const existing = await this.repository.findListingForModeration(input.publicId);
    if (!existing) {
      throw notFound("Listing not found");
    }

    const activationBlockedByOrder =
      parsedStatus === "APPROVED"
        ? Boolean(await this.repository.hasBlockingOrderForListing(existing.id))
        : false;
    const nextListingStatus = resolveNextListingStatus({
      moderationStatus: parsedStatus,
      activationBlockedByOrder,
    });

    const updated = await this.repository.updateListingModeration({
      listingId: existing.id,
      moderationStatus: parsedStatus,
      listingStatus: nextListingStatus,
    });

    await this.repository.createModerationEvent({
      publicId: makeListingModerationEventPublicId(),
      listingId: existing.id,
      actorUserId: input.actorUserId,
      decision: toModerationDecision(parsedStatus),
      reasonCode,
      reasonNote,
      metadata: {
        source: "admin.patch_moderation",
        activationBlockedByOrder,
      },
    });

    await this.auditGateway.write({
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
      action: "listing.moderation_changed",
      entityType: "listing",
      entityPublicId: input.publicId,
      details: {
        beforeModerationStatus: existing.moderation_status,
        afterModerationStatus: updated.moderation_status,
        beforeListingStatus: existing.status,
        afterListingStatus: updated.status,
        activationBlockedByOrder,
        reasonCode,
        reasonNote,
      },
    });

    await this.notificationGateway.notifyModerationDecision({
      sellerId: existing.seller_id,
      listingPublicId: existing.public_id,
      title: existing.title,
      moderationStatus: parsedStatus,
      reasonNote,
      reasonCode,
    });

    return {
      success: true,
      status: toAdminListingStatus(updated.moderation_status),
      listingStatus: updated.status.toLowerCase(),
      activationBlockedByOrder,
      reasonCode,
      reasonNote,
    };
  }
}

export class ListAdminListingModerationEventsService {
  constructor(private readonly repository: AdminListingsRepository) {}

  async execute(publicId: string) {
    const listing = await this.repository.findListingByPublicId(publicId);
    if (!listing) {
      throw notFound("Listing not found");
    }

    const events = await this.repository.listModerationEvents(listing.id);
    return {
      events: events.map((event) => ({
        id: event.public_id,
        actorType: event.actor_type.toLowerCase(),
        actor: event.actor
          ? {
              id: event.actor.public_id,
              name: event.actor.name,
              email: event.actor.email,
            }
          : null,
        decision: event.decision.toLowerCase(),
        reasonCode: event.reason_code,
        reasonNote: event.reason_note,
        riskScore: event.risk_score,
        signals: Array.isArray(event.signals) ? (event.signals as string[]) : [],
        metadata: event.metadata,
        createdAt: event.created_at,
      })),
    };
  }
}

export class BatchModerateAdminListingsService {
  constructor(
    private readonly repository: AdminListingsRepository,
    private readonly auditGateway: AdminListingsAuditGateway,
    private readonly notificationGateway: AdminListingsNotificationGateway,
  ) {}

  async execute(input: {
    listingIds?: unknown;
    status: unknown;
    reasonCode: unknown;
    reasonNote: unknown;
    actorUserId: number;
    requestIp: string | null;
  }) {
    const listingIds = Array.isArray(input.listingIds)
      ? input.listingIds
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    if (listingIds.length === 0) {
      throw validationError("listingIds are required");
    }

    const parsedStatus = parseModerationStatus(input.status);
    if (!parsedStatus || parsedStatus === "PENDING") {
      throw validationError("Batch supports only approved or rejected status");
    }

    const parsedReasonCode = parseListingModerationReasonCode(input.reasonCode);
    const reasonCode =
      parsedReasonCode ??
      defaultListingModerationReasonCode({ moderationStatus: parsedStatus });
    const reasonNote =
      typeof input.reasonNote === "string"
        ? input.reasonNote.trim().slice(0, 2000)
        : null;

    const existing = await this.repository.findListingsForBatch(listingIds);
    if (existing.length === 0) {
      throw notFound("No listings found for provided ids");
    }

    const results = await this.repository.batchModerate({
      listings: existing,
      moderationStatus: parsedStatus,
      actorUserId: input.actorUserId,
      reasonCode,
      reasonNote,
      decision: toModerationDecision(parsedStatus),
      makeEventPublicId: makeListingModerationEventPublicId,
      resolveNextStatus: (activationBlockedByOrder) =>
        parsedStatus === "APPROVED"
          ? activationBlockedByOrder
            ? "INACTIVE"
            : "ACTIVE"
          : "INACTIVE",
    });

    await this.auditGateway.write({
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
      action: "listing.moderation_changed",
      entityType: "listing",
      entityPublicId: null,
      details: {
        mode: "batch",
        listingIds: existing.map((item) => item.public_id),
        status: parsedStatus,
        reasonCode,
        reasonNote,
      },
    });

    await this.notificationGateway.notifyMany(
      existing.map((listing) => ({
        sellerId: listing.seller_id,
        listingPublicId: listing.public_id,
        title: listing.title,
        moderationStatus: parsedStatus,
        reasonCode,
        reasonNote,
      })),
    );

    return {
      success: true,
      updated: results.length,
      reasonCode,
      reasonNote,
      items: results,
    };
  }
}
