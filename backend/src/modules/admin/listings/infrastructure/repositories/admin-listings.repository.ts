import type { PrismaClient } from "@prisma/client";

export class AdminListingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listListings() {
    return this.prisma.marketplaceListing.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            joined_at: true,
            status: true,
            addresses: {
              select: {
                city: true,
                region: true,
              },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        _count: {
          select: {
            complaints: true,
            order_items: true,
            wishlist_items: true,
            questions: true,
          },
        },
        item: {
          include: {
            subcategory: {
              include: {
                category: true,
              },
            },
          },
        },
        moderation_events: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
        images: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
  }

  hasBlockingOrderForListing(listingId: number) {
    return this.prisma.marketOrderItem.findFirst({
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
  }

  findListingForModeration(publicId: string) {
    return this.prisma.marketplaceListing.findUnique({
      where: { public_id: publicId },
      select: {
        id: true,
        public_id: true,
        seller_id: true,
        title: true,
        moderation_status: true,
        status: true,
      },
    });
  }

  updateListingModeration(params: {
    listingId: number;
    moderationStatus: "PENDING" | "APPROVED" | "REJECTED";
    listingStatus: "ACTIVE" | "INACTIVE" | "MODERATION";
  }) {
    return this.prisma.marketplaceListing.update({
      where: { id: params.listingId },
      data: {
        moderation_status: params.moderationStatus,
        status: params.listingStatus,
      },
    });
  }

  createModerationEvent(params: {
    publicId: string;
    listingId: number;
    actorUserId: number;
    decision: any;
    reasonCode: string;
    reasonNote?: string | null;
    riskScore?: number | null;
    signals?: string[];
    metadata?: any;
  }) {
    return this.prisma.listingModerationEvent.create({
      data: {
        public_id: params.publicId,
        listing_id: params.listingId,
        actor_user_id: params.actorUserId,
        actor_type: "ADMIN",
        decision: params.decision,
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

  findListingByPublicId(publicId: string) {
    return this.prisma.marketplaceListing.findUnique({
      where: { public_id: publicId },
      select: { id: true },
    });
  }

  listModerationEvents(listingId: number) {
    return this.prisma.listingModerationEvent.findMany({
      where: {
        listing_id: listingId,
      },
      include: {
        actor: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 200,
    });
  }

  findListingsForBatch(publicIds: string[]) {
    return this.prisma.marketplaceListing.findMany({
      where: {
        public_id: {
          in: Array.from(new Set(publicIds)),
        },
      },
      select: {
        id: true,
        public_id: true,
        seller_id: true,
        title: true,
        moderation_status: true,
        status: true,
      },
    });
  }

  async batchModerate(params: {
    listings: Array<{
      id: number;
      public_id: string;
      seller_id: number;
      title: string;
      moderation_status: string;
      status: string;
    }>;
    moderationStatus: "APPROVED" | "REJECTED";
    actorUserId: number;
    reasonCode: string;
    reasonNote: string | null;
    decision: any;
    makeEventPublicId: () => string;
    resolveNextStatus: (activationBlockedByOrder: boolean) => "ACTIVE" | "INACTIVE";
  }) {
    return this.prisma.$transaction(async (tx) => {
      const rows: Array<{
        id: string;
        status: string;
        listingStatus: string;
        activationBlockedByOrder: boolean;
      }> = [];

      for (const listing of params.listings) {
        const activationBlockedByOrder = Boolean(
          await tx.marketOrderItem.findFirst({
            where: {
              listing_id: listing.id,
              order: {
                status: {
                  not: "CANCELLED",
                },
              },
            },
            select: { id: true },
          }),
        );

        const updated = await tx.marketplaceListing.update({
          where: { id: listing.id },
          data: {
            moderation_status: params.moderationStatus,
            status: params.resolveNextStatus(activationBlockedByOrder),
          },
        });

        await tx.listingModerationEvent.create({
          data: {
            public_id: params.makeEventPublicId(),
            listing_id: listing.id,
            actor_user_id: params.actorUserId,
            actor_type: "ADMIN",
            decision: params.decision,
            reason_code: params.reasonCode,
            reason_note: params.reasonNote,
            metadata: {
              source: "admin.batch_moderation",
              activationBlockedByOrder,
            },
          },
        });

        rows.push({
          id: listing.public_id,
          status: updated.moderation_status.toLowerCase(),
          listingStatus: updated.status.toLowerCase(),
          activationBlockedByOrder,
        });
      }

      return rows;
    });
  }
}
