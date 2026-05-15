import {
  buildCatalogBranchHints,
  normalizeWords,
  normalizeDisplayText,
  parseBooleanFlag,
  parseCatalogCondition,
  parseCatalogSortBy,
  resolveListingType,
  sortCatalogCandidates,
  listingMatchesCatalogFilters,
  mapCatalogListingToProduct,
} from "../catalog.service";
import { notFound, validationError } from "../../../../common/application-error";
import type { CatalogRepositoryPort } from "../catalog.types";

type QueryInput = Record<string, unknown>;

export class GetListingsService {
  constructor(private readonly repository: CatalogRepositoryPort) {}

  async execute(query: QueryInput) {
    const type = resolveListingType(query.type);
    const usePagination = query.paginated === "1";
    const limit = query.limit ? Number(query.limit) : usePagination ? 24 : undefined;
    const offset = query.offset ? Number(query.offset) : 0;
    const sortBy = parseCatalogSortBy(query.sortBy);
    const searchQuery = normalizeDisplayText(String(query.searchQuery ?? ""), "");
    const minPrice = query.minPrice ? Number(query.minPrice) : 0;
    const maxPrice = query.maxPrice ? Number(query.maxPrice) : Number.MAX_SAFE_INTEGER;
    const minRating = query.minRating ? Number(query.minRating) : 0;
    const showOnlySale = parseBooleanFlag(query.showOnlySale);
    const condition = parseCatalogCondition(query.condition);
    const includeWords = normalizeWords(String(query.includeWords ?? ""));
    const excludeWords = normalizeWords(String(query.excludeWords ?? ""));
    const itemPublicId = String(query.itemId ?? "").trim();
    const itemPublicIds = String(query.itemIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (query.limit && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
      throw validationError("Invalid limit");
    }
    if (query.offset && (!Number.isInteger(offset) || offset < 0)) {
      throw validationError("Invalid offset");
    }
    if (query.minPrice && (!Number.isFinite(minPrice) || minPrice < 0)) {
      throw validationError("Invalid minPrice");
    }
    if (query.maxPrice && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
      throw validationError("Invalid maxPrice");
    }
    if (query.minRating && (!Number.isFinite(minRating) || minRating < 0)) {
      throw validationError("Invalid minRating");
    }
    if (maxPrice < minPrice) {
      throw validationError("Invalid price range");
    }

    let itemId: number | undefined;
    let itemIds: number[] | undefined;
    if (itemPublicId) {
      itemId = await this.repository.resolveCatalogItemId(type, itemPublicId) ?? undefined;
      if (itemId === undefined) {
        throw notFound("Catalog item not found");
      }
    } else if (itemPublicIds.length > 0) {
      itemIds = await this.repository.resolveCatalogItemIds(type, itemPublicIds);
    }

    const take = typeof limit === "number" ? Math.min(limit, 100) : undefined;
    const baseWhere = {
      type,
      status: "ACTIVE",
      moderation_status: "APPROVED",
      ...(typeof itemId === "number"
        ? { item_id: itemId }
        : itemIds
          ? { item_id: { in: itemIds.length > 0 ? itemIds : [-1] } }
          : {}),
      ...(condition ? { condition } : {}),
    };

    if (!usePagination) {
      const listings = await this.repository.findActiveApprovedListings({
        where: baseWhere,
        take,
        skip: typeof take === "number" ? offset : undefined,
      });
      const sellerReviewMetricsBySellerId = await this.repository.loadSellerReviewMetrics(
        listings.map((listing) => listing.seller_id),
      );

      return listings.map((listing) =>
        mapCatalogListingToProduct(listing, sellerReviewMetricsBySellerId),
      );
    }

    const [searchRules, candidateListings] = await Promise.all([
      this.repository.loadEffectiveSearchRules(),
      this.repository.findListingCandidates(baseWhere),
    ]);
    const sellerReviewMetricsBySellerIdForCandidates =
      await this.repository.loadSellerReviewMetrics(
        candidateListings.map((listing) => listing.seller_id),
      );

    const filteredCandidates = sortCatalogCandidates(
      candidateListings
        .map((listing) => {
          const sellerRating =
            sellerReviewMetricsBySellerIdForCandidates.get(listing.seller_id)?.rating ??
            listing.rating;
          const candidateWithEffectiveRating = {
            ...listing,
            rating: sellerRating,
          };
          const result = listingMatchesCatalogFilters(
            candidateWithEffectiveRating,
            {
              searchQuery,
              minPrice,
              maxPrice,
              minRating,
              showOnlySale,
              condition,
              includeWords,
              excludeWords,
            },
            searchRules,
          );
          if (!result.matches) return null;
          return {
            ...candidateWithEffectiveRating,
            searchRank: result.searchRank,
          };
        })
        .filter(Boolean) as Array<any>,
      sortBy,
    );

    const total = filteredCandidates.length;
    const pagedCandidateIds = filteredCandidates
      .slice(offset, offset + (take ?? 24))
      .map((listing) => listing.id);

    if (pagedCandidateIds.length === 0) {
      const branchHints =
        searchQuery.trim().length >= 2
          ? buildCatalogBranchHints(
              searchQuery,
              await this.repository.findBranchHintItems(type),
              searchRules,
              4,
            )
          : [];

      return {
        items: [],
        pagination: {
          limit: take ?? 24,
          offset,
          total,
          hasMore: false,
        },
        searchMeta: {
          recognizedQuery: branchHints.length > 0 ? searchQuery.trim() : null,
          emptyStateMessage:
            branchHints.length > 0
              ? "Запрос распознан как ветка каталога, но сейчас в этой группе нет активных объявлений."
              : undefined,
          branchHints: branchHints.map((hint) => ({
            itemPublicId: hint.itemPublicId,
            itemName: hint.itemName,
            subcategoryName: hint.subcategoryName,
            categoryName: hint.categoryName,
            matchedPhrases: hint.matchedPhrases,
            suggestions: hint.suggestions,
          })),
        },
      };
    }

    const listings = await this.repository.findDetailedListingsByIds(
      pagedCandidateIds,
    );
    const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
    const orderedListings = pagedCandidateIds
      .map((id) => listingsById.get(id))
      .filter(Boolean) as Array<any>;
    const sellerReviewMetricsBySellerId = await this.repository.loadSellerReviewMetrics(
      orderedListings.map((listing) => listing.seller_id),
    );

    return {
      items: orderedListings.map((listing) =>
        mapCatalogListingToProduct(listing, sellerReviewMetricsBySellerId),
      ),
      pagination: {
        limit: take ?? 24,
        offset,
        total,
        hasMore: offset + orderedListings.length < total,
      },
    };
  }
}
