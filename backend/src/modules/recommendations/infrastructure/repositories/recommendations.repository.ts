import type {
  CartCrossSellRule,
  Prisma,
  PrismaClient,
  RecommendationEventType,
} from "@prisma/client";
import { catalogListingDetailInclude, mapCatalogListingToProduct } from "../../../catalog/domain/catalog.service";
import {
  buildReasonLabel,
  bucketPrice,
  computeTimeDecay,
  getRecommendationLimit,
  limitCandidates,
  normalizeScore,
  PROFILE_LOOKBACK_DAYS,
  resolveRecommendationEventWeight,
  VIEW_DEDUP_MINUTES,
} from "../../domain/recommendations.helpers";
import type {
  RecommendationCandidate,
  RecommendationContext,
  RecommendationEventInput,
  RecommendationEventResult,
  RecommendationItemDto,
  RecommendationRefreshJob,
} from "../../domain/recommendations.types";

const ACTIVE_LISTING_WHERE = {
  status: "ACTIVE",
  moderation_status: "APPROVED",
  type: "PRODUCT",
} satisfies Prisma.MarketplaceListingWhereInput;

type ListingWithDetail = Prisma.MarketplaceListingGetPayload<{
  include: typeof catalogListingDetailInclude;
}>;

type ProfileEntry = { key: string; score: number };

function inferBrand(listing: {
  title: string;
  attributes: Array<{ key: string; value: string }>;
}) {
  const attr = listing.attributes.find((item) =>
    /brand|бренд|manufacturer|производитель/i.test(item.key),
  );
  if (attr?.value?.trim()) return attr.value.trim();

  const firstWord = listing.title.trim().split(/\s+/)[0] ?? "";
  if (firstWord.length >= 2 && /^[\p{L}\d-]+$/u.test(firstWord)) {
    return firstWord;
  }

  return "";
}

function normalizeRecommendationText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .normalize("NFKD");
}

function parseProfileEntries(raw: Prisma.JsonValue): ProfileEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const key = "key" in item ? String((item as { key?: unknown }).key ?? "").trim() : "";
      const score = Number(
        "score" in item ? (item as { score?: unknown }).score ?? 0 : 0,
      );
      if (!key || !Number.isFinite(score) || score <= 0) return null;
      return { key, score };
    })
    .filter((item): item is ProfileEntry => Boolean(item));
}

function parseIdArray(raw: Prisma.JsonValue): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}

function scoreEntries(entries: Map<string, number>): ProfileEntry[] {
  return Array.from(entries.entries())
    .map(([key, score]) => ({ key, score: normalizeScore(score) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
}

export class RecommendationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async resolveListingByPublicId(publicId: string) {
    return this.prisma.marketplaceListing.findFirst({
      where: {
        public_id: publicId,
        ...ACTIVE_LISTING_WHERE,
      },
      select: {
        id: true,
        public_id: true,
        seller_id: true,
        title: true,
        price: true,
        item_id: true,
        created_at: true,
      },
    });
  }

  async recordEvent(input: RecommendationEventInput): Promise<RecommendationEventResult> {
    const listingId =
      Number.isInteger(input.listingId) && Number(input.listingId) > 0
        ? Number(input.listingId)
        : input.listingPublicId
          ? (await this.resolveListingByPublicId(input.listingPublicId))?.id ?? null
          : null;

    if (!listingId) {
      return {
        success: true,
        recorded: false,
        listingId: null,
        eventType: input.eventType,
      };
    }

    if (input.eventType === "VIEW") {
      const dedupeSince = new Date(Date.now() - VIEW_DEDUP_MINUTES * 60 * 1000);
      const duplicate = await this.prisma.recommendationEvent.findFirst({
        where: {
          user_id: input.userId,
          listing_id: listingId,
          event_type: "VIEW",
          occurred_at: {
            gte: dedupeSince,
          },
        },
        select: { id: true },
      });
      if (duplicate) {
        return {
          success: true,
          recorded: false,
          listingId,
          eventType: input.eventType,
        };
      }
    }

    const eventWeight = resolveRecommendationEventWeight(
      input.eventType,
      input.eventWeight,
    );

    await this.prisma.recommendationEvent.create({
      data: {
        user_id: input.userId,
        listing_id: listingId,
        session_id: input.sessionId ?? null,
        event_type: input.eventType,
        event_weight: eventWeight,
        source_page: input.sourcePage ?? null,
      },
    });

    await this.enqueueRefreshJob({
      entityType: "USER",
      entityId: input.userId,
      reason: `event:${input.eventType.toLowerCase()}`,
      priority: input.eventType === "PURCHASE_COMPLETED" ? 90 : 70,
    });
    await this.enqueueRefreshJob({
      entityType: "LISTING",
      entityId: listingId,
      reason: `event:${input.eventType.toLowerCase()}`,
      priority: input.eventType === "PURCHASE_COMPLETED" ? 80 : 60,
    });
    if (
      input.eventType === "WISHLIST" ||
      input.eventType === "PURCHASE_PAID" ||
      input.eventType === "PURCHASE_COMPLETED" ||
      input.eventType === "REVIEW"
    ) {
      await this.enqueueRefreshJob({
        entityType: "GLOBAL",
        entityId: 1,
        reason: `event:${input.eventType.toLowerCase()}`,
        priority: 50,
      });
    }

    return {
      success: true,
      recorded: true,
      listingId,
      eventType: input.eventType,
    };
  }

  async enqueueRefreshJob(params: {
    entityType: "USER" | "LISTING" | "GLOBAL";
    entityId: number;
    reason: string;
    priority: number;
  }) {
    await this.prisma.recommendationRefreshQueue.create({
      data: {
        entity_type: params.entityType,
        entity_id: params.entityId,
        reason: params.reason,
        priority: params.priority,
      },
    });
  }

  async claimRefreshJobs(limit: number): Promise<RecommendationRefreshJob[]> {
    const now = new Date();
    const candidates = await this.prisma.recommendationRefreshQueue.findMany({
      where: {
        next_run_at: { lte: now },
        locked_at: null,
      },
      orderBy: [{ priority: "desc" }, { next_run_at: "asc" }, { id: "asc" }],
      take: limit,
    });

    const claimed: RecommendationRefreshJob[] = [];
    for (const job of candidates) {
      const locked = await this.prisma.recommendationRefreshQueue.updateMany({
        where: {
          id: job.id,
          locked_at: null,
        },
        data: {
          locked_at: now,
          attempts: {
            increment: 1,
          },
        },
      });
      if (locked.count === 1) {
        claimed.push(job);
      }
    }
    return claimed;
  }

  async completeRefreshJob(jobId: number) {
    await this.prisma.recommendationRefreshQueue.delete({
      where: { id: jobId },
    });
  }

  async retryRefreshJob(jobId: number, attempts: number) {
    const delayMinutes = Math.min(30, Math.max(2, attempts * 2));
    await this.prisma.recommendationRefreshQueue.update({
      where: { id: jobId },
      data: {
        locked_at: null,
        next_run_at: new Date(Date.now() + delayMinutes * 60 * 1000),
      },
    });
  }

  async recomputeUserInterestProfile(userId: number) {
    const since = new Date(Date.now() - PROFILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const events = await this.prisma.recommendationEvent.findMany({
      where: {
        user_id: userId,
        occurred_at: {
          gte: since,
        },
      },
      orderBy: [{ occurred_at: "desc" }, { id: "desc" }],
      take: 500,
      include: {
        listing: {
          include: {
            item: {
              include: {
                subcategory: {
                  include: {
                    category: true,
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
          },
        },
      },
    });

    const categoryScores = new Map<string, number>();
    const brandScores = new Map<string, number>();
    const priceBucketScores = new Map<string, number>();
    const recentListingIds: number[] = [];
    const recentStrongListingIds: number[] = [];

    for (const event of events) {
      const decay = computeTimeDecay({
        occurredAt: event.occurred_at,
        eventType: event.event_type,
      });
      const weightedScore = event.event_weight * decay;
      const categoryId = event.listing.item?.subcategory.category.public_id ?? "";
      const brand = inferBrand({
        title: event.listing.title,
        attributes: event.listing.attributes,
      });
      const priceBucket = bucketPrice(event.listing.price);

      if (categoryId) {
        categoryScores.set(categoryId, (categoryScores.get(categoryId) ?? 0) + weightedScore);
      }
      if (brand) {
        brandScores.set(brand, (brandScores.get(brand) ?? 0) + weightedScore);
      }
      priceBucketScores.set(
        priceBucket,
        (priceBucketScores.get(priceBucket) ?? 0) + weightedScore,
      );

      if (!recentListingIds.includes(event.listing_id)) {
        recentListingIds.push(event.listing_id);
      }
      if (
        (event.event_type === "PURCHASE_PAID" ||
          event.event_type === "PURCHASE_COMPLETED" ||
          event.event_type === "WISHLIST" ||
          event.event_type === "ADD_TO_CART") &&
        !recentStrongListingIds.includes(event.listing_id)
      ) {
        recentStrongListingIds.push(event.listing_id);
      }
    }

    await this.prisma.userInterestProfile.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        top_categories_json: scoreEntries(categoryScores),
        top_brands_json: scoreEntries(brandScores),
        top_price_buckets_json: scoreEntries(priceBucketScores),
        recent_listing_ids_json: recentListingIds.slice(0, 20),
        short_term_listing_ids_json: recentStrongListingIds.slice(0, 10),
      },
      update: {
        top_categories_json: scoreEntries(categoryScores),
        top_brands_json: scoreEntries(brandScores),
        top_price_buckets_json: scoreEntries(priceBucketScores),
        recent_listing_ids_json: recentListingIds.slice(0, 20),
        short_term_listing_ids_json: recentStrongListingIds.slice(0, 10),
      },
    });
  }

  async recomputeListingSimilarities(listingId: number) {
    const sourceListing = await this.prisma.marketplaceListing.findFirst({
      where: {
        id: listingId,
        ...ACTIVE_LISTING_WHERE,
      },
      include: {
        item: {
          include: {
            subcategory: {
              include: { category: true },
            },
          },
        },
        attributes: {
          select: {
            key: true,
            value: true,
          },
        },
      },
    });
    if (!sourceListing) return;

    const coViewScores = await this.computeCoViewScores(listingId);
    const coPurchaseScores = await this.computeCoPurchaseScores(listingId);
    const candidates = await this.prisma.marketplaceListing.findMany({
      where: {
        ...ACTIVE_LISTING_WHERE,
        id: {
          not: listingId,
        },
        OR: [
          sourceListing.item_id
            ? {
                item_id: sourceListing.item_id,
              }
            : undefined,
          sourceListing.item?.subcategory.category.id
            ? {
                item: {
                  subcategory: {
                    category_id: sourceListing.item.subcategory.category.id,
                  },
                },
              }
            : undefined,
        ].filter(Boolean) as Prisma.MarketplaceListingWhereInput[],
      },
      take: 60,
      include: {
        item: {
          include: {
            subcategory: {
              include: { category: true },
            },
          },
        },
        attributes: {
          select: {
            key: true,
            value: true,
          },
        },
      },
    });

    await this.prisma.itemSimilarity.deleteMany({
      where: {
        listing_id: listingId,
      },
    });

    const sourceBrand = inferBrand({
      title: sourceListing.title,
      attributes: sourceListing.attributes,
    }).toLowerCase();

    const similarityRows = candidates
      .map((candidate) => {
        const coViewScore = coViewScores.get(candidate.id) ?? 0;
        const coPurchaseScore = coPurchaseScores.get(candidate.id) ?? 0;
        const candidateBrand = inferBrand({
          title: candidate.title,
          attributes: candidate.attributes,
        }).toLowerCase();
        const sameItem = sourceListing.item_id && candidate.item_id === sourceListing.item_id ? 1 : 0;
        const sameCategory =
          sourceListing.item?.subcategory.category.id &&
          candidate.item?.subcategory.category.id === sourceListing.item.subcategory.category.id
            ? 1
            : 0;
        const sameBrand = sourceBrand && candidateBrand === sourceBrand ? 1 : 0;
        const priceDistance = Math.abs(candidate.price - sourceListing.price);
        const priceScore = Math.max(0, 1 - priceDistance / Math.max(sourceListing.price, 1));
        const contentScore = normalizeScore(
          sameItem * 0.55 + sameCategory * 0.2 + sameBrand * 0.15 + priceScore * 0.1,
        );
        const hybridScore = normalizeScore(
          coViewScore * 0.45 + coPurchaseScore * 0.35 + contentScore * 0.2,
        );

        return {
          listing_id: listingId,
          related_listing_id: candidate.id,
          contentScore,
          coViewScore,
          coPurchaseScore,
          hybridScore,
        };
      })
      .filter((item) => item.hybridScore > 0 || item.contentScore > 0)
      .sort((left, right) => right.hybridScore - left.hybridScore)
      .slice(0, 16);

    if (similarityRows.length === 0) return;

    await this.prisma.itemSimilarity.createMany({
      data: similarityRows.flatMap((row) => {
        const items: Array<{
          listing_id: number;
          related_listing_id: number;
          source: "CO_VIEW" | "CO_PURCHASE" | "CONTENT" | "HYBRID";
          score: number;
        }> = [
          {
            listing_id: row.listing_id,
            related_listing_id: row.related_listing_id,
            source: "HYBRID",
            score: row.hybridScore,
          },
        ];
        if (row.coViewScore > 0) {
          items.push({
            listing_id: row.listing_id,
            related_listing_id: row.related_listing_id,
            source: "CO_VIEW",
            score: row.coViewScore,
          });
        }
        if (row.coPurchaseScore > 0) {
          items.push({
            listing_id: row.listing_id,
            related_listing_id: row.related_listing_id,
            source: "CO_PURCHASE",
            score: row.coPurchaseScore,
          });
        }
        if (row.contentScore > 0) {
          items.push({
            listing_id: row.listing_id,
            related_listing_id: row.related_listing_id,
            source: "CONTENT",
            score: row.contentScore,
          });
        }
        return items;
      }),
    });
  }

  async recomputeSegmentPopularity() {
    const since = new Date(Date.now() - PROFILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const topListings = await this.prisma.recommendationEvent.groupBy({
      by: ["listing_id"],
      where: {
        occurred_at: { gte: since },
      },
      _sum: {
        event_weight: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          event_weight: "desc",
        },
      },
      take: 120,
    });

    const listingIds = topListings.map((item) => item.listing_id);
    const listings = listingIds.length
      ? await this.prisma.marketplaceListing.findMany({
          where: {
            id: { in: listingIds },
            ...ACTIVE_LISTING_WHERE,
          },
          include: {
            item: {
              include: {
                subcategory: {
                  include: { category: true },
                },
              },
            },
            attributes: {
              select: {
                key: true,
                value: true,
              },
            },
          },
        })
      : [];

    await this.prisma.segmentPopularity.deleteMany({});
    if (listings.length === 0) return;

    const byListingId = new Map(topListings.map((item) => [item.listing_id, item]));
    await this.prisma.segmentPopularity.createMany({
      data: listings.map((listing) => ({
        category_public_id: listing.item?.subcategory.category.public_id ?? null,
        category_name: listing.item?.subcategory.category.name ?? null,
        brand: inferBrand({
          title: listing.title,
          attributes: listing.attributes,
        }) || null,
        price_bucket: bucketPrice(listing.price),
        listing_id: listing.id,
        score: normalizeScore(
          Number(byListingId.get(listing.id)?._sum.event_weight ?? 0) +
            Number(byListingId.get(listing.id)?._count._all ?? 0) * 0.2,
        ),
        source_event_count: Number(byListingId.get(listing.id)?._count._all ?? 0),
      })),
    });
  }

  async recomputeAll() {
    await this.recomputeSegmentPopularity();
    const activeListingIds = await this.prisma.marketplaceListing.findMany({
      where: ACTIVE_LISTING_WHERE,
      select: { id: true },
      take: 150,
      orderBy: [{ views: "desc" }, { created_at: "desc" }],
    });

    for (const listing of activeListingIds) {
      await this.recomputeListingSimilarities(listing.id);
    }

    const activeUsers = await this.prisma.recommendationEvent.groupBy({
      by: ["user_id"],
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          user_id: "desc",
        },
      },
      take: 150,
    });
    for (const user of activeUsers) {
      await this.recomputeUserInterestProfile(user.user_id);
    }
  }

  async processRefreshJob(job: RecommendationRefreshJob) {
    if (job.entity_type === "USER") {
      await this.recomputeUserInterestProfile(job.entity_id);
      return;
    }
    if (job.entity_type === "LISTING") {
      await this.recomputeListingSimilarities(job.entity_id);
      return;
    }
    await this.recomputeSegmentPopularity();
  }

  async getHomeRecommendations(params: { userId: number | null; limit?: number }) {
    const limit = getRecommendationLimit("home");
    if (params.userId) {
      const profile = await this.prisma.userInterestProfile.findUnique({
        where: { user_id: params.userId },
      });
      if (!profile) {
        await this.recomputeUserInterestProfile(params.userId);
      }
    }
    return this.buildRecommendations({
      context: "home",
      userId: params.userId,
      limit: params.limit ?? limit,
    });
  }

  async getCatalogRecommendationScores(params: {
    userId: number | null;
    listingIds: number[];
  }) {
    const candidateIds = Array.from(
      new Set(
        params.listingIds.filter(
          (listingId) => Number.isInteger(listingId) && Number(listingId) > 0,
        ),
      ),
    );
    if (!params.userId || candidateIds.length === 0) {
      return new Map<number, number>();
    }

    let profile = await this.prisma.userInterestProfile.findUnique({
      where: { user_id: params.userId },
    });
    if (!profile) {
      await this.recomputeUserInterestProfile(params.userId);
      profile = await this.prisma.userInterestProfile.findUnique({
        where: { user_id: params.userId },
      });
    }
    if (!profile) {
      return new Map<number, number>();
    }

    const topCategories = parseProfileEntries(profile.top_categories_json ?? []);
    const topBrands = parseProfileEntries(profile.top_brands_json ?? []);
    const topPriceBuckets = parseProfileEntries(profile.top_price_buckets_json ?? []);
    const recentListingIds = parseIdArray(profile.recent_listing_ids_json ?? []);
    const strongListingIds = parseIdArray(profile.short_term_listing_ids_json ?? []);
    const anchorListingIds =
      strongListingIds.slice(0, 4).length > 0
        ? strongListingIds.slice(0, 4)
        : recentListingIds.slice(0, 4);

    const purchasedListingIds = await this.loadPurchasedListingIds(params.userId);
    const categoryScoreMap = new Map(topCategories.map((item) => [item.key, item.score]));
    const brandScoreMap = new Map(
      topBrands.map((item) => [item.key.toLowerCase(), item.score]),
    );
    const priceScoreMap = new Map(topPriceBuckets.map((item) => [item.key, item.score]));
    const similarityScoreMap = new Map<number, number>();

    if (anchorListingIds.length > 0) {
      const similarities = await this.prisma.itemSimilarity.findMany({
        where: {
          listing_id: {
            in: anchorListingIds,
          },
          related_listing_id: {
            in: candidateIds,
          },
          source: "HYBRID",
        },
        orderBy: [{ score: "desc" }],
      });

      for (const similarity of similarities) {
        const current = similarityScoreMap.get(similarity.related_listing_id) ?? 0;
        if (similarity.score > current) {
          similarityScoreMap.set(
            similarity.related_listing_id,
            normalizeScore(similarity.score),
          );
        }
      }
    }

    const listings = await this.prisma.marketplaceListing.findMany({
      where: {
        id: {
          in: candidateIds,
        },
        ...ACTIVE_LISTING_WHERE,
      },
      select: {
        id: true,
        title: true,
        price: true,
        views: true,
        attributes: {
          select: {
            key: true,
            value: true,
          },
        },
        item: {
          select: {
            subcategory: {
              select: {
                category: {
                  select: {
                    public_id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const anchorSet = new Set(anchorListingIds);
    const scores = new Map<number, number>();

    for (const listing of listings) {
      const categoryId = listing.item?.subcategory.category.public_id ?? "";
      const brand = inferBrand({
        title: listing.title,
        attributes: listing.attributes,
      }).toLowerCase();
      const priceBucket = bucketPrice(listing.price);
      const categoryAffinity = categoryScoreMap.get(categoryId) ?? 0;
      const brandAffinity = brandScoreMap.get(brand) ?? 0;
      const priceAffinity = priceScoreMap.get(priceBucket) ?? 0;
      const similarityScore = similarityScoreMap.get(listing.id) ?? 0;
      const segmentScore = normalizeScore(
        categoryAffinity * 1.2 + brandAffinity + priceAffinity * 0.9,
      );
      const popularityScore = normalizeScore(Math.min(1.5, Number(listing.views ?? 0) / 200));
      let finalScore = normalizeScore(
        segmentScore * 0.55 + similarityScore * 0.35 + popularityScore * 0.1,
      );

      if (anchorSet.has(listing.id)) {
        finalScore = Math.max(finalScore, normalizeScore(1.6 + similarityScore));
      }

      if (purchasedListingIds.has(listing.id)) {
        finalScore = normalizeScore(finalScore * 0.15);
      }

      if (finalScore > 0) {
        scores.set(listing.id, finalScore);
      }
    }

    return scores;
  }

  async getSimilarRecommendations(params: {
    userId: number | null;
    listingPublicId: string;
    limit?: number;
  }) {
    const listing = await this.resolveListingByPublicId(params.listingPublicId);
    if (!listing) return [];
    const existing = await this.prisma.itemSimilarity.count({
      where: { listing_id: listing.id },
    });
    if (existing === 0) {
      await this.recomputeListingSimilarities(listing.id);
    }
    return this.buildRecommendations({
      context: "similar",
      userId: params.userId,
      anchorListingIds: [listing.id],
      excludeListingIds: [listing.id],
      limit: params.limit ?? getRecommendationLimit("similar"),
    });
  }

  async getCartRecommendations(params: {
    userId: number | null;
    listingPublicIds: string[];
    limit?: number;
  }) {
    const listings = await this.prisma.marketplaceListing.findMany({
      where: {
        public_id: { in: Array.from(new Set(params.listingPublicIds)).slice(0, 20) },
        ...ACTIVE_LISTING_WHERE,
      },
      include: {
        item: {
          include: {
            subcategory: {
              include: {
                category: true,
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
      },
    });
    if (listings.length === 0) return [];

    return this.buildCartCrossSellRecommendations({
      sourceListings: listings,
      excludeListingIds: listings.map((item) => item.id),
      limit: params.limit ?? getRecommendationLimit("cart"),
    });
  }

  async explainRecommendations(params: {
    context: RecommendationContext;
    userId: number | null;
    listingPublicId?: string | null;
    listingPublicIds?: string[];
  }) {
    if (params.context === "similar" && params.listingPublicId) {
      return this.getSimilarRecommendations({
        userId: params.userId,
        listingPublicId: params.listingPublicId,
        limit: 6,
      });
    }
    if (params.context === "cart") {
      return this.getCartRecommendations({
        userId: params.userId,
        listingPublicIds: params.listingPublicIds ?? [],
        limit: 6,
      });
    }
    return this.getHomeRecommendations({
      userId: params.userId,
      limit: 6,
    });
  }

  private async computeCoViewScores(listingId: number) {
    const viewers = await this.prisma.recommendationEvent.findMany({
      where: {
        listing_id: listingId,
        event_type: {
          in: ["VIEW", "WISHLIST", "ADD_TO_CART"],
        },
      },
      distinct: ["user_id"],
      select: { user_id: true },
      take: 100,
    });

    if (viewers.length === 0) return new Map<number, number>();
    const grouped = await this.prisma.recommendationEvent.groupBy({
      by: ["listing_id"],
      where: {
        user_id: {
          in: viewers.map((item) => item.user_id),
        },
        listing_id: {
          not: listingId,
        },
        event_type: {
          in: ["VIEW", "WISHLIST", "ADD_TO_CART"],
        },
      },
      _sum: {
        event_weight: true,
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _sum: {
          event_weight: "desc",
        },
      },
      take: 24,
    });

    return new Map(
      grouped.map((item) => [
        item.listing_id,
        normalizeScore(
          Number(item._sum.event_weight ?? 0) / Math.max(1, viewers.length),
        ),
      ]),
    );
  }

  private async computeCoPurchaseScores(listingId: number) {
    const relatedOrders = await this.prisma.marketOrderItem.findMany({
      where: {
        listing_id: listingId,
        order: {
          status: {
            in: ["PAID", "DELIVERED", "COMPLETED"],
          },
        },
      },
      select: { order_id: true },
      take: 100,
    });
    if (relatedOrders.length === 0) return new Map<number, number>();

    const grouped = await this.prisma.marketOrderItem.groupBy({
      by: ["listing_id"],
      where: {
        order_id: {
          in: relatedOrders.map((item) => item.order_id),
        },
        listing_id: {
          not: listingId,
        },
      },
      _count: {
        _all: true,
      },
      orderBy: {
        _count: {
          listing_id: "desc",
        },
      },
      take: 24,
    });

    return new Map(
      grouped
        .filter((item) => Number.isInteger(item.listing_id))
        .map((item) => [
          Number(item.listing_id),
          normalizeScore(item._count._all / Math.max(1, relatedOrders.length)),
        ]),
    );
  }

  private async loadUserProfile(userId: number | null) {
    if (!userId) return null;
    return this.prisma.userInterestProfile.findUnique({
      where: { user_id: userId },
    });
  }

  private async loadPurchasedListingIds(userId: number | null) {
    if (!userId) return new Set<number>();
    const rows = await this.prisma.marketOrderItem.findMany({
      where: {
        order: {
          buyer_id: userId,
          status: {
            in: ["PAID", "DELIVERED", "COMPLETED"],
          },
        },
        listing_id: {
          not: null,
        },
      },
      select: {
        listing_id: true,
      },
    });
    return new Set(
      rows
        .map((row) => row.listing_id)
        .filter((value): value is number => Number.isInteger(value)),
    );
  }

  private ruleMatchesSourceListing(
    rule: CartCrossSellRule,
    listing: {
      title: string;
      item_id: number | null;
      item: {
        subcategory: {
          id: number;
          category: {
            id: number;
          };
        };
      } | null;
      attributes: Array<{ key: string; value: string }>;
    },
  ) {
    if (rule.source_item_id !== null && rule.source_item_id !== listing.item_id) return false;
    if (
      rule.source_subcategory_id !== null &&
      rule.source_subcategory_id !== listing.item?.subcategory.id
    ) {
      return false;
    }
    if (
      rule.source_category_id !== null &&
      rule.source_category_id !== listing.item?.subcategory.category.id
    ) {
      return false;
    }

    const brand = inferBrand({
      title: listing.title,
      attributes: listing.attributes,
    });
    if (
      rule.source_brand &&
      normalizeRecommendationText(rule.source_brand) !== normalizeRecommendationText(brand)
    ) {
      return false;
    }
    if (rule.source_model) {
      const normalizedTitle = normalizeRecommendationText(listing.title);
      if (!normalizedTitle.includes(normalizeRecommendationText(rule.source_model))) {
        return false;
      }
    }

    return true;
  }

  private ruleMatchesTargetListing(
    rule: CartCrossSellRule,
    listing: ListingWithDetail,
  ) {
    if (rule.target_item_id !== null && rule.target_item_id !== listing.item_id) return false;
    if (
      rule.target_subcategory_id !== null &&
      rule.target_subcategory_id !== listing.item?.subcategory.id
    ) {
      return false;
    }
    if (
      rule.target_category_id !== null &&
      rule.target_category_id !== listing.item?.subcategory.category.id
    ) {
      return false;
    }
    if (rule.target_brand) {
      const brand = inferBrand({
        title: listing.title,
        attributes: listing.attributes,
      });
      if (normalizeRecommendationText(brand) !== normalizeRecommendationText(rule.target_brand)) {
        return false;
      }
    }
    return true;
  }

  private async buildCartCrossSellRecommendations(params: {
    sourceListings: Array<{
      id: number;
      title: string;
      item_id: number | null;
      item: {
        subcategory: {
          id: number;
          category: {
            id: number;
          };
        };
      } | null;
      attributes: Array<{ key: string; value: string }>;
    }>;
    excludeListingIds: number[];
    limit: number;
  }): Promise<RecommendationItemDto[]> {
    const sourceItemIds = Array.from(
      new Set(
        params.sourceListings
          .map((listing) => listing.item_id)
          .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
      ),
    );
    const sourceSubcategoryIds = Array.from(
      new Set(
        params.sourceListings
          .map((listing) => listing.item?.subcategory.id ?? null)
          .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
      ),
    );
    const sourceCategoryIds = Array.from(
      new Set(
        params.sourceListings
          .map((listing) => listing.item?.subcategory.category.id ?? null)
          .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
      ),
    );

    const rules = await this.prisma.cartCrossSellRule.findMany({
      where: {
        is_active: true,
        OR: [
          sourceItemIds.length > 0
            ? {
                source_item_id: {
                  in: sourceItemIds,
                },
              }
            : undefined,
          sourceSubcategoryIds.length > 0
            ? {
                source_subcategory_id: {
                  in: sourceSubcategoryIds,
                },
              }
            : undefined,
          sourceCategoryIds.length > 0
            ? {
                source_category_id: {
                  in: sourceCategoryIds,
                },
              }
            : undefined,
        ].filter(Boolean) as Prisma.CartCrossSellRuleWhereInput[],
      },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
    });
    if (rules.length === 0) return [];

    const matchedRules = params.sourceListings.flatMap((listing) =>
      rules
        .filter((rule) => this.ruleMatchesSourceListing(rule, listing))
        .map((rule) => ({
          rule,
          anchorListingId: listing.id,
        })),
    );
    if (matchedRules.length === 0) return [];

    const targetItemIds = Array.from(
      new Set(
        matchedRules
          .map((entry) => entry.rule.target_item_id)
          .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
      ),
    );
    const targetSubcategoryIds = Array.from(
      new Set(
        matchedRules
          .map((entry) => entry.rule.target_subcategory_id)
          .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
      ),
    );
    const targetCategoryIds = Array.from(
      new Set(
        matchedRules
          .map((entry) => entry.rule.target_category_id)
          .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
      ),
    );
    if (
      targetItemIds.length === 0 &&
      targetSubcategoryIds.length === 0 &&
      targetCategoryIds.length === 0
    ) {
      return [];
    }

    const listings = await this.prisma.marketplaceListing.findMany({
      where: {
        ...ACTIVE_LISTING_WHERE,
        id: {
          notIn: params.excludeListingIds,
        },
        OR: [
          targetItemIds.length > 0
            ? {
                item_id: {
                  in: targetItemIds,
                },
              }
            : undefined,
          targetSubcategoryIds.length > 0
            ? {
                item: {
                  subcategory: {
                    id: {
                      in: targetSubcategoryIds,
                    },
                  },
                },
              }
            : undefined,
          targetCategoryIds.length > 0
            ? {
                item: {
                  subcategory: {
                    category_id: {
                      in: targetCategoryIds,
                    },
                  },
                },
              }
            : undefined,
        ].filter(Boolean) as Prisma.MarketplaceListingWhereInput[],
      },
      include: catalogListingDetailInclude,
      take: Math.max(params.limit * 8, 36),
    });
    if (listings.length === 0) return [];

    const candidateMap = new Map<number, RecommendationCandidate>();
    for (const listing of listings) {
      let bestScore = 0;
      let bestDebug: Record<string, unknown> | null = null;
      for (const entry of matchedRules) {
        if (!this.ruleMatchesTargetListing(entry.rule, listing as ListingWithDetail)) continue;
        const popularityBoost = Math.min(0.35, (listing.views ?? 0) / 1000);
        const score = normalizeScore(entry.rule.priority + popularityBoost);
        if (score <= bestScore) continue;
        bestScore = score;
        bestDebug = {
          anchorListingId: entry.anchorListingId,
          crossSellRuleId: entry.rule.id,
          targetItemId: entry.rule.target_item_id,
          targetSubcategoryId: entry.rule.target_subcategory_id,
          targetCategoryId: entry.rule.target_category_id,
        };
      }

      if (bestScore > 0 && bestDebug) {
        candidateMap.set(listing.id, {
          listingId: listing.id,
          score: bestScore,
          source: "CROSS_SELL",
          reason: buildReasonLabel("CROSS_SELL"),
          debug: bestDebug,
        });
      }
    }

    const candidates = limitCandidates(Array.from(candidateMap.values()), params.limit * 3);
    if (candidates.length === 0) return [];

    const sellerMetrics = await this.loadSellerMetrics(listings);
    const listingsById = new Map(listings.map((listing) => [listing.id, listing]));

    const ranked: RecommendationItemDto[] = [];
    for (const candidate of candidates) {
      const listing = listingsById.get(candidate.listingId);
      if (!listing) continue;
      ranked.push({
        listing: mapCatalogListingToProduct(listing as ListingWithDetail, sellerMetrics),
        score: candidate.score,
        reason: candidate.reason,
        source: "cross_sell",
        debug: candidate.debug,
      });
    }

    return ranked.slice(0, params.limit);
  }

  private async buildRecommendations(params: {
    context: RecommendationContext;
    userId: number | null;
    anchorListingIds?: number[];
    excludeListingIds?: number[];
    limit: number;
  }): Promise<RecommendationItemDto[]> {
    const profile = await this.loadUserProfile(params.userId);
    const purchasedListingIds = await this.loadPurchasedListingIds(params.userId);
    const topCategories = parseProfileEntries(profile?.top_categories_json ?? []);
    const topBrands = parseProfileEntries(profile?.top_brands_json ?? []);
    const topPriceBuckets = parseProfileEntries(profile?.top_price_buckets_json ?? []);
    const recentListingIds = parseIdArray(profile?.recent_listing_ids_json ?? []);
    const strongListingIds = parseIdArray(profile?.short_term_listing_ids_json ?? []);
    const anchorListingIds =
      params.anchorListingIds && params.anchorListingIds.length > 0
        ? params.anchorListingIds
        : strongListingIds.slice(0, 4).length > 0
          ? strongListingIds.slice(0, 4)
          : recentListingIds.slice(0, 4);

    const candidates: RecommendationCandidate[] = [];
    const excludedIds = new Set<number>([
      ...(params.excludeListingIds ?? []),
      ...Array.from(purchasedListingIds),
    ]);

    if (anchorListingIds.length > 0) {
      const hybridSimilarities = await this.prisma.itemSimilarity.findMany({
        where: {
          listing_id: {
            in: anchorListingIds,
          },
          source: "HYBRID",
        },
        orderBy: [{ score: "desc" }],
        take: params.limit * 4,
      });
      for (const similarity of hybridSimilarities) {
        if (excludedIds.has(similarity.related_listing_id)) continue;
        candidates.push({
          listingId: similarity.related_listing_id,
          score: normalizeScore(similarity.score * (params.context === "similar" ? 1.15 : 1)),
          source: "CO_VIEW",
          reason: buildReasonLabel(params.context === "cart" ? "CO_PURCHASE" : "RECENT"),
          debug: {
            base: similarity.score,
            anchorListingId: similarity.listing_id,
            similaritySource: "HYBRID",
          },
        });
      }
    }

    if (params.context === "cart" && anchorListingIds.length > 0) {
      for (const anchorListingId of anchorListingIds) {
        const coPurchase = await this.computeCoPurchaseScores(anchorListingId);
        for (const [relatedListingId, score] of coPurchase.entries()) {
          if (excludedIds.has(relatedListingId)) continue;
          candidates.push({
            listingId: relatedListingId,
            score: normalizeScore(score * 1.3),
            source: "CO_PURCHASE",
            reason: buildReasonLabel("CO_PURCHASE"),
            debug: {
              anchorListingId,
              coPurchaseScore: score,
            },
          });
        }
      }
    }

    if (topCategories.length > 0 || topPriceBuckets.length > 0) {
      const popular = await this.prisma.segmentPopularity.findMany({
        where: {
          OR: [
            topCategories.length > 0
              ? {
                  category_public_id: {
                    in: topCategories.map((item) => item.key),
                  },
                }
              : undefined,
            topPriceBuckets.length > 0
              ? {
                  price_bucket: {
                    in: topPriceBuckets.map((item) => item.key),
                  },
                }
              : undefined,
          ].filter(Boolean) as Prisma.SegmentPopularityWhereInput[],
        },
        orderBy: [{ score: "desc" }, { updated_at: "desc" }],
        take: params.limit * 3,
      });
      for (const item of popular) {
        if (excludedIds.has(item.listing_id)) continue;
        candidates.push({
          listingId: item.listing_id,
          score: normalizeScore(item.score * 0.8),
          source: "SEGMENT",
          reason: buildReasonLabel("SEGMENT"),
          debug: {
            segmentScore: item.score,
            category: item.category_public_id,
            brand: item.brand,
            priceBucket: item.price_bucket,
          },
        });
      }
    }

    if (candidates.length === 0) {
      const popularFallback = await this.prisma.marketplaceListing.findMany({
        where: ACTIVE_LISTING_WHERE,
        orderBy: [{ views: "desc" }, { created_at: "desc" }],
        take: params.limit * 2,
        select: { id: true, views: true },
      });
      for (const listing of popularFallback) {
        if (excludedIds.has(listing.id)) continue;
        candidates.push({
          listingId: listing.id,
          score: normalizeScore(Number(listing.views ?? 0) / 10 + 1),
          source: "POPULAR",
          reason: buildReasonLabel("POPULAR"),
          debug: {
            views: listing.views,
          },
        });
      }
    }

    const topCandidateIds = limitCandidates(candidates, params.limit * 3).map(
      (item) => item.listingId,
    );
    if (topCandidateIds.length === 0) return [];

    const listings = await this.prisma.marketplaceListing.findMany({
      where: {
        id: {
          in: topCandidateIds,
        },
        ...ACTIVE_LISTING_WHERE,
      },
      include: catalogListingDetailInclude,
    });
    const sellerMetrics = await this.loadSellerMetrics(listings);
    const listingsById = new Map(listings.map((listing) => [listing.id, listing]));

    const categoryScoreMap = new Map(topCategories.map((item) => [item.key, item.score]));
    const brandScoreMap = new Map(
      topBrands.map((item) => [item.key.toLowerCase(), item.score]),
    );
    const priceScoreMap = new Map(topPriceBuckets.map((item) => [item.key, item.score]));
    const recentBoostIds = new Set(anchorListingIds);
    const sellerCounts = new Map<number, number>();
    const ranked: RecommendationItemDto[] = [];

    for (const candidate of limitCandidates(candidates, params.limit * 3)) {
      const listing = listingsById.get(candidate.listingId);
      if (!listing) continue;

      const categoryId = listing.item?.subcategory.category.public_id ?? "";
      const brand = inferBrand({
        title: listing.title,
        attributes: listing.attributes,
      }).toLowerCase();
      const priceBucket = bucketPrice(listing.price);
      const categoryAffinity = categoryScoreMap.get(categoryId) ?? 0;
      const brandAffinity = brandScoreMap.get(brand) ?? 0;
      const priceAffinity = priceScoreMap.get(priceBucket) ?? 0;
      const userAffinity = normalizeScore(
        1 +
          categoryAffinity * 0.08 +
          brandAffinity * 0.05 +
          priceAffinity * 0.04,
      );
      const recencyBoost = recentBoostIds.has(listing.id) ? 0.95 : 1;
      const listingQualityBoost = normalizeScore(
        1 +
          (sellerMetrics.get(listing.seller_id)?.rating ?? listing.rating) * 0.03,
      );
      const popularityBoost = normalizeScore(1 + Math.min(2, listing.views / 100));
      const sellerSeen = sellerCounts.get(listing.seller_id) ?? 0;
      const diversityPenalty = sellerSeen >= 2 ? 0.55 : sellerSeen === 1 ? 0.85 : 1;
      const finalScore = normalizeScore(
        candidate.score *
          userAffinity *
          recencyBoost *
          listingQualityBoost *
          popularityBoost *
          diversityPenalty,
      );

      sellerCounts.set(listing.seller_id, sellerSeen + 1);
      ranked.push({
        listing: mapCatalogListingToProduct(listing as ListingWithDetail, sellerMetrics),
        score: finalScore,
        reason: candidate.reason,
        source: String(candidate.source).toLowerCase(),
        debug: {
          ...candidate.debug,
          userAffinity,
          recencyBoost,
          listingQualityBoost,
          popularityBoost,
          diversityPenalty,
        },
      });
    }

    return ranked
      .sort((left, right) => right.score - left.score)
      .slice(0, params.limit);
  }

  private async loadSellerMetrics(listings: Array<{ seller_id: number }>) {
    const sellerIds = Array.from(new Set(listings.map((listing) => listing.seller_id)));
    const map = new Map<number, { rating: number; reviewsCount: number }>();
    if (sellerIds.length === 0) return map;

    const rows = await this.prisma.listingReview.findMany({
      where: {
        listing: {
          seller_id: {
            in: sellerIds,
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

    for (const sellerId of sellerIds) {
      const current = totals.get(sellerId);
      if (!current || current.count === 0) {
        map.set(sellerId, { rating: 0, reviewsCount: 0 });
        continue;
      }
      map.set(sellerId, {
        rating: Number((current.sum / current.count).toFixed(1)),
        reviewsCount: current.count,
      });
    }
    return map;
  }
}
