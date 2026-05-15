import { prisma } from "../../../../lib/prisma";
import { loadEffectiveCatalogSearchRules } from "./catalog-search.repository";
import {
  catalogListingDetailInclude,
  normalizeDisplayText,
} from "../../domain/catalog.service";

export class CatalogRepository {
  async findCategoriesWithTree(type: "PRODUCT") {
    return prisma.catalogCategory.findMany({
      where: { type },
      include: {
        attribute_definitions: {
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
        },
        subcategories: {
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
          include: {
            attribute_definitions: {
              orderBy: [{ order_index: "asc" }, { id: "asc" }],
            },
            items: {
              orderBy: [{ order_index: "asc" }, { id: "asc" }],
              include: {
                attribute_definitions: {
                  orderBy: [{ order_index: "asc" }, { id: "asc" }],
                },
              },
            },
          },
        },
      },
      orderBy: [{ order_index: "asc" }, { id: "asc" }],
    });
  }

  async groupVisibleListingCountsByItem(type: "PRODUCT") {
    return prisma.marketplaceListing.groupBy({
      by: ["item_id"],
      where: {
        type,
        status: "ACTIVE",
        moderation_status: "APPROVED",
        item_id: {
          not: null,
        },
      },
      _count: {
        _all: true,
      },
    });
  }

  async resolveCatalogItemId(type: "PRODUCT", publicId: string) {
    const item = await prisma.catalogItem.findFirst({
      where: {
        public_id: publicId,
        subcategory: {
          category: {
            type,
          },
        },
      },
      select: { id: true },
    });
    return item?.id ?? null;
  }

  async resolveCatalogItemIds(type: "PRODUCT", publicIds: string[]) {
    const items = await prisma.catalogItem.findMany({
      where: {
        public_id: {
          in: Array.from(new Set(publicIds)).slice(0, 200),
        },
        subcategory: {
          category: {
            type,
          },
        },
      },
      select: { id: true },
    });
    return items.map((item) => item.id);
  }

  async findActiveApprovedListings(params: {
    where: Record<string, unknown>;
    take?: number;
    skip?: number;
  }) {
    return prisma.marketplaceListing.findMany({
      where: params.where,
      include: catalogListingDetailInclude,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...(typeof params.take === "number"
        ? { take: params.take, skip: params.skip ?? 0 }
        : {}),
    });
  }

  async findListingCandidates(where: Record<string, unknown>) {
    return prisma.marketplaceListing.findMany({
      where,
      select: {
        id: true,
        seller_id: true,
        public_id: true,
        title: true,
        description: true,
        price: true,
        sale_price: true,
        rating: true,
        condition: true,
        created_at: true,
        views: true,
        sku: true,
        shipping_by_seller: true,
        tech_grade: true,
        tech_battery_health: true,
        tech_defects: true,
        tech_included: true,
        seller: {
          select: {
            name: true,
            addresses: {
              select: { city: true },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        item: {
          select: {
            id: true,
            public_id: true,
            name: true,
            subcategory: {
              select: {
                id: true,
                public_id: true,
                name: true,
                category: {
                  select: {
                    id: true,
                    public_id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
        attributes: {
          select: {
            key: true,
            value: true,
          },
        },
        search_keywords: {
          select: {
            phrase: true,
            normalized_phrase: true,
            weight: true,
            source: true,
          },
          orderBy: [{ weight: "desc" }, { id: "asc" }],
        },
      },
    });
  }

  async findBranchHintItems(type: "PRODUCT") {
    return prisma.catalogItem.findMany({
      where: {
        subcategory: {
          category: {
            type,
          },
        },
      },
      select: {
        id: true,
        public_id: true,
        name: true,
        subcategory: {
          select: {
            id: true,
            public_id: true,
            name: true,
            category: {
              select: {
                id: true,
                public_id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findDetailedListingsByIds(ids: number[]) {
    return prisma.marketplaceListing.findMany({
      where: { id: { in: ids } },
      include: catalogListingDetailInclude,
    });
  }

  async loadSellerReviewMetrics(sellerIds: number[]) {
    const map = new Map<number, { rating: number; reviewsCount: number }>();
    const uniqueSellerIds = Array.from(new Set(sellerIds));
    if (uniqueSellerIds.length === 0) return map;

    const rows = await prisma.listingReview.findMany({
      where: {
        listing: {
          seller_id: {
            in: uniqueSellerIds,
          },
        },
      },
      select: {
        rating: true,
        listing: {
          select: {
            seller_id: true,
          },
        },
      },
    });

    const totals = new Map<number, { sum: number; count: number }>();
    for (const row of rows) {
      const current = totals.get(row.listing.seller_id) ?? { sum: 0, count: 0 };
      current.sum += row.rating;
      current.count += 1;
      totals.set(row.listing.seller_id, current);
    }

    for (const sellerId of uniqueSellerIds) {
      const item = totals.get(sellerId);
      if (!item || item.count === 0) {
        map.set(sellerId, { rating: 0, reviewsCount: 0 });
        continue;
      }
      map.set(sellerId, {
        rating: Number((item.sum / item.count).toFixed(1)),
        reviewsCount: item.count,
      });
    }

    return map;
  }

  async loadSellerReviews(sellerId: number, limit = 50) {
    const rows = await prisma.listingReview.findMany({
      where: {
        listing: {
          seller_id: sellerId,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: Math.max(1, Math.min(limit, 100)),
      select: {
        id: true,
        rating: true,
        comment: true,
        created_at: true,
        author: {
          select: {
            display_name: true,
            avatar: true,
          },
        },
        listing: {
          select: {
            public_id: true,
            title: true,
          },
        },
      },
    });

    return rows.map((review) => ({
      id: String(review.id),
      author: normalizeDisplayText(review.author.display_name ?? "", "Покупатель"),
      avatar: review.author.avatar,
      rating: review.rating,
      comment: normalizeDisplayText(review.comment, ""),
      date: review.created_at.toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      }),
      sortTs: review.created_at.getTime(),
      listingId: review.listing.public_id,
      listingTitle: normalizeDisplayText(review.listing.title, "Объявление"),
    }));
  }

  async findListingDetailsByPublicId(publicId: string) {
    return prisma.marketplaceListing.findFirst({
      where: { public_id: publicId },
      include: catalogListingDetailInclude,
    });
  }

  async findBuyerAccessOrderItem(listingId: number, buyerId: number) {
    return prisma.marketOrderItem.findFirst({
      where: {
        listing_id: listingId,
        order: {
          buyer_id: buyerId,
        },
      },
      select: { id: true },
    }) as Promise<{ id: true } | null>;
  }

  async incrementListingViews(publicId: string) {
    const updated = await prisma.marketplaceListing.updateMany({
      where: {
        public_id: publicId,
        status: "ACTIVE",
        moderation_status: "APPROVED",
      },
      data: {
        views: {
          increment: 1,
        },
      },
    });

    if (!updated.count) {
      return 0;
    }

    const listing = await prisma.marketplaceListing.findUnique({
      where: { public_id: publicId },
      select: { views: true },
    });

    return listing?.views ?? 0;
  }

  async findSellerByPublicId(publicId: string) {
    return prisma.appUser.findFirst({
      where: {
        public_id: publicId,
        role: "SELLER",
      },
      select: {
        id: true,
        public_id: true,
        name: true,
        avatar: true,
        joined_at: true,
        addresses: {
          select: { city: true },
          orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
          take: 1,
        },
        _count: {
          select: {
            listings: true,
          },
        },
        seller_profile: {
          select: {
            is_verified: true,
            average_response_minutes: true,
          },
        },
      },
    });
  }

  async findSuggestionListings() {
    return prisma.marketplaceListing.findMany({
      where: {
        status: "ACTIVE",
        moderation_status: "APPROVED",
      },
      select: {
        id: true,
        title: true,
        description: true,
        sku: true,
        type: true,
        attributes: {
          select: {
            key: true,
            value: true,
          },
        },
        search_keywords: {
          select: {
            phrase: true,
            normalized_phrase: true,
            weight: true,
            source: true,
          },
          orderBy: [{ weight: "desc" }, { id: "asc" }],
        },
        item: {
          select: {
            id: true,
            name: true,
            subcategory: {
              select: {
                id: true,
                name: true,
                category: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findListingQuestionContext(publicId: string) {
    return prisma.marketplaceListing.findUnique({
      where: { public_id: publicId },
      select: {
        id: true,
        title: true,
        seller_id: true,
        public_id: true,
        status: true,
        moderation_status: true,
        seller: {
          select: { name: true },
        },
      },
    });
  }

  async findListingQuestions(listingId: number) {
    return prisma.listingQuestion.findMany({
      where: { listing_id: listingId },
      include: {
        buyer: {
          select: { name: true },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
  }

  async countListingQuestions(listingId: number) {
    return prisma.listingQuestion.count({
      where: { listing_id: listingId },
    });
  }

  async findListingQuestionsPage(listingId: number, take: number, skip: number) {
    return prisma.listingQuestion.findMany({
      where: { listing_id: listingId },
      include: {
        buyer: {
          select: { name: true },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take,
      skip,
    });
  }

  async createListingQuestion(params: {
    listingId: number;
    buyerId: number;
    question: string;
  }) {
    return prisma.listingQuestion.create({
      data: {
        public_id: `Q-${Date.now()}`,
        listing_id: params.listingId,
        buyer_id: params.buyerId,
        question: params.question,
        status: "PENDING",
      },
      include: {
        buyer: {
          select: { name: true },
        },
      },
    });
  }

  async findComplaintListing(publicId: string) {
    return prisma.marketplaceListing.findUnique({
      where: { public_id: publicId },
      select: {
        id: true,
        public_id: true,
        seller_id: true,
        title: true,
      },
    });
  }

  async countComplaintsFromReporterSince(reporterId: number, since: Date) {
    return prisma.complaint.count({
      where: {
        reporter_id: reporterId,
        created_at: {
          gte: since,
        },
      },
    });
  }

  async findDuplicateComplaint(params: {
    reporterId: number;
    listingId: number;
    complaintType: string;
    since: Date;
  }) {
    return prisma.complaint.findFirst({
      where: {
        reporter_id: params.reporterId,
        listing_id: params.listingId,
        complaint_type: params.complaintType,
        status: {
          in: ["NEW", "PENDING"],
        },
        created_at: {
          gte: params.since,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
  }

  async createComplaintWithEvent(params: {
    publicId: string;
    eventPublicId: string;
    complaintType: string;
    listingId: number;
    sellerId: number;
    reporterId: number;
    description: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const complaint = await tx.complaint.create({
        data: {
          public_id: params.publicId,
          status: "NEW",
          complaint_type: params.complaintType,
          listing_id: params.listingId,
          seller_id: params.sellerId,
          reporter_id: params.reporterId,
          description: params.description,
          evidence: null,
        },
      });

      await tx.complaintEvent.create({
        data: {
          public_id: params.eventPublicId,
          complaint_id: complaint.id,
          actor_user_id: params.reporterId,
          event_type: "SUBMITTED",
          to_status: "NEW",
          note: params.description.slice(0, 280),
          metadata: {
            source: "catalog_listing_complaint",
          },
        },
      });

      return complaint;
    });
  }

  async loadEffectiveSearchRules() {
    return loadEffectiveCatalogSearchRules(prisma);
  }
}
