import {
  extractSellerCity,
  formatPublishDate,
  formatResponseTime,
  listingBreadcrumbs,
  listingCatalogRefs,
  listingCategoryName,
  listingMatchesCatalogFilters,
  listingSpecifications,
  normalizeDisplayText,
  normalizeWords,
  parseBooleanFlag,
  parseCatalogCondition,
  parseCatalogSortBy,
} from "../catalog.service";
import { toClientCondition } from "../../../../utils/format";
import { notFound, validationError } from "../../../../common/application-error";
import type { CatalogRepositoryPort } from "../catalog.types";

export class GetSellerListingsService {
  constructor(private readonly repository: CatalogRepositoryPort) {}

  async execute(input: {
    sellerPublicId: string;
    query: Record<string, unknown>;
  }) {
    const sellerPublicId = String(input.sellerPublicId ?? "").trim();
    if (!sellerPublicId) {
      throw validationError("Invalid seller ID");
    }

    const limitRaw = input.query.limit ? Number(input.query.limit) : 24;
    const offsetRaw = input.query.offset ? Number(input.query.offset) : 0;
    if (!Number.isInteger(limitRaw) || limitRaw <= 0) {
      throw validationError("Invalid limit");
    }
    if (!Number.isInteger(offsetRaw) || offsetRaw < 0) {
      throw validationError("Invalid offset");
    }

    const seller = await this.repository.findSellerByPublicId(sellerPublicId);
    if (!seller) {
      throw notFound("Seller not found");
    }

    const listingWhere = {
      seller_id: seller.id,
      status: "ACTIVE",
      moderation_status: "APPROVED",
    };
    const sortBy = parseCatalogSortBy(input.query.sortBy);
    const searchQuery = normalizeDisplayText(
      String(input.query.searchQuery ?? ""),
      "",
    );
    const minPrice = input.query.minPrice ? Number(input.query.minPrice) : 0;
    const maxPrice = input.query.maxPrice
      ? Number(input.query.maxPrice)
      : Number.MAX_SAFE_INTEGER;
    const minRating = input.query.minRating ? Number(input.query.minRating) : 0;
    const showOnlySale = parseBooleanFlag(input.query.showOnlySale);
    const condition = parseCatalogCondition(input.query.condition);
    const includeWords = normalizeWords(String(input.query.includeWords ?? ""));
    const excludeWords = normalizeWords(String(input.query.excludeWords ?? ""));
    const itemPublicId = String(input.query.itemId ?? "").trim();
    const itemPublicIds = String(input.query.itemIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (input.query.minPrice && (!Number.isFinite(minPrice) || minPrice < 0)) {
      throw validationError("Invalid minPrice");
    }
    if (input.query.maxPrice && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
      throw validationError("Invalid maxPrice");
    }
    if (input.query.minRating && (!Number.isFinite(minRating) || minRating < 0)) {
      throw validationError("Invalid minRating");
    }
    if (maxPrice < minPrice) {
      throw validationError("Invalid price range");
    }

    let itemId: number | undefined;
    let itemIds: number[] | undefined;
    if (itemPublicId) {
      itemId = await this.repository.resolveCatalogItemId("PRODUCT", itemPublicId) ?? undefined;
      if (itemId === undefined) {
        throw notFound("Catalog item not found");
      }
    } else if (itemPublicIds.length > 0) {
      itemIds = await this.repository.resolveCatalogItemIds("PRODUCT", itemPublicIds);
    }

    const [searchRules, candidateListings, sellerReviewMetricsBySellerId, sellerReviews] =
      await Promise.all([
        this.repository.loadEffectiveSearchRules(),
        this.repository.findListingCandidates({
          ...listingWhere,
          ...(typeof itemId === "number"
            ? { item_id: itemId }
            : itemIds
              ? { item_id: { in: itemIds.length > 0 ? itemIds : [-1] } }
              : {}),
          ...(condition ? { condition } : {}),
        }),
        this.repository.loadSellerReviewMetrics([seller.id]),
        this.repository.loadSellerReviews(seller.id, 50),
      ]);

    const filteredCandidates = input.query ? candidateListings
      .map((listing) => {
        const sellerRating =
          sellerReviewMetricsBySellerId.get(seller.id)?.rating ?? listing.rating;
        const candidateWithEffectiveRating = {
          ...listing,
          rating: sellerRating,
        };
        const result = listingMatchesCatalogFilters(candidateWithEffectiveRating, {
          searchQuery,
          minPrice,
          maxPrice,
          minRating,
          showOnlySale,
          condition,
          includeWords,
          excludeWords,
        }, searchRules);
        if (!result.matches) return null;
        return {
          ...candidateWithEffectiveRating,
          searchRank: result.searchRank,
        };
      })
      .filter(Boolean) as Array<any> : [];

    const orderedIds = filteredCandidates
      .sort((left, right) => {
        if (sortBy === "price-asc") return left.price - right.price;
        if (sortBy === "price-desc") return right.price - left.price;
        if (sortBy === "rating") return right.rating - left.rating;
        if (sortBy === "newest") {
          return (
            new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
          );
        }
        return right.views - left.views;
      })
      .slice(offsetRaw, offsetRaw + Math.min(limitRaw, 100))
      .map((listing) => listing.id);

    const listings = orderedIds.length
      ? await this.repository.findDetailedListingsByIds(orderedIds)
      : [];
    const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
    const orderedListings = orderedIds
      .map((id) => listingsById.get(id))
      .filter(Boolean) as Array<any>;

    const sellerName = normalizeDisplayText(seller.name, "Продавец");
    const sellerCity = normalizeDisplayText(extractSellerCity(seller), "");
    const sellerResponseTime = formatResponseTime(
      seller.seller_profile?.average_response_minutes,
    );
    const sellerListings = seller._count.listings;
    const sellerVerified = Boolean(seller.seller_profile?.is_verified);
    const sellerReviewMetrics = sellerReviewMetricsBySellerId.get(seller.id) ?? {
      rating: 0,
      reviewsCount: 0,
    };

    return {
      seller: {
        id: seller.public_id,
        name: sellerName,
        avatar: seller.avatar,
        city: sellerCity,
        isVerified: sellerVerified,
        responseTime: sellerResponseTime,
        rating: sellerReviewMetrics.rating,
        reviewsCount: sellerReviewMetrics.reviewsCount,
        listingsCount: sellerListings,
        joinedAt: seller.joined_at,
      },
      reviews: sellerReviews,
      items: orderedListings.map((listing) => {
        const primaryImage =
          listing.images[0]?.url ??
          "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
        const salePrice =
          listing.sale_price !== null && listing.sale_price < listing.price
            ? listing.sale_price
            : null;
        const catalogRefs = listingCatalogRefs(listing);

        return {
          id: listing.public_id,
          title: normalizeDisplayText(listing.title, "Без названия"),
          price: listing.price,
          salePrice,
          image: primaryImage,
          images: listing.images.map((image: any) => image.url),
          rating: sellerReviewMetrics.rating,
          sellerRating: sellerReviewMetrics.rating,
          sellerReviewsCount: sellerReviewMetrics.reviewsCount,
          seller: sellerName,
          sellerId: seller.public_id,
          sellerAvatar: seller.avatar,
          sellerJoinedAt: seller.joined_at,
          category: listingCategoryName(listing),
          catalogCategoryId: catalogRefs.catalogCategoryId,
          catalogSubcategoryId: catalogRefs.catalogSubcategoryId,
          catalogItemId: catalogRefs.catalogItemId,
          sku: listing.sku,
          isNew: listing.condition === "NEW",
          isSale: salePrice !== null,
          isVerified: sellerVerified,
          description: normalizeDisplayText(listing.description ?? "", ""),
          shippingBySeller: listing.shipping_by_seller,
          city: sellerCity,
          publishDate: formatPublishDate(listing.created_at),
          views: listing.views,
          sellerResponseTime,
          sellerListings,
          breadcrumbs: listingBreadcrumbs(listing),
          specifications: listingSpecifications({
            attributes: listing.attributes,
            techGrade: listing.tech_grade,
            techBatteryHealth: listing.tech_battery_health,
            techDefects: listing.tech_defects,
            techIncluded: listing.tech_included,
          }),
          isPriceLower: salePrice !== null,
          condition: toClientCondition(listing.condition),
        };
      }),
      pagination: {
        limit: Math.min(limitRaw, 100),
        offset: offsetRaw,
        total: filteredCandidates.length,
        hasMore: offsetRaw + orderedListings.length < filteredCandidates.length,
      },
    };
  }
}
