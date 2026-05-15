import {
  matchListingByHierarchicalQuery,
  normalizeDisplayText,
  normalizeSearchText,
} from "../catalog.service";
import type { CatalogRepositoryPort } from "../catalog.types";

export class GetSuggestionsService {
  constructor(private readonly repository: CatalogRepositoryPort) {}

  async execute(input: { query: string }) {
    const query = String(input.query ?? "").trim();
    if (query.length < 2) {
      return [];
    }

    const [searchRules, listings] = await Promise.all([
      this.repository.loadEffectiveSearchRules(),
      this.repository.findSuggestionListings(),
    ]);

    const suggestions = new Map<string, any>();
    const pushSuggestion = (suggestion: any) => {
      const key = normalizeSearchText(suggestion.query || suggestion.title);
      if (!key) return;
      const existing = suggestions.get(key);
      if (!existing || suggestion.rank > existing.rank) {
        suggestions.set(key, suggestion);
      }
    };

    const listingBackedPhraseCounts = new Map<string, number>();
    const pushListingBackedCount = (value: string) => {
      const key = normalizeSearchText(value);
      if (!key) return;
      listingBackedPhraseCounts.set(key, (listingBackedPhraseCounts.get(key) ?? 0) + 1);
    };

    for (const listing of listings) {
      const matched = matchListingByHierarchicalQuery(listing, query, searchRules);
      if (!matched.matches) continue;

      const normalizedQuery = normalizeSearchText(query);
      const listingTitle = normalizeDisplayText(listing.title, "");
      const listingSku = normalizeDisplayText(listing.sku ?? "", "");
      const listingItemName = normalizeDisplayText(listing.item?.name ?? "", "");
      const normalizedTitle = normalizeSearchText(listingTitle);
      const normalizedSku = normalizeSearchText(listingSku);
      const normalizedItemName = normalizeSearchText(listingItemName);
      const suggestionSubtitle = normalizeDisplayText(
        listing.item?.subcategory.name ??
          listing.item?.subcategory.category.name ??
          "Категория",
        "Категория",
      );
      const exactTitleMatch = normalizedTitle === normalizedQuery;
      const titleContainsQuery = normalizedTitle.includes(normalizedQuery);
      const skuContainsQuery = normalizedSku.includes(normalizedQuery);
      const itemContainsQuery = normalizedItemName.includes(normalizedQuery);
      const productRankBoost =
        (exactTitleMatch ? 420 : 0) +
        (titleContainsQuery ? 260 : 0) +
        (skuContainsQuery ? 120 : 0) +
        (itemContainsQuery ? 60 : 0);
      pushSuggestion({
        type: "product",
        title: listingTitle,
        subtitle: listingSku ? `${suggestionSubtitle} · ${listingSku}` : suggestionSubtitle,
        query: listingTitle,
        rank: matched.rank + 140 + productRankBoost,
      });
      pushListingBackedCount(listingTitle);
      if (listingSku) pushListingBackedCount(listingSku);
    }

    return Array.from(suggestions.values())
      .filter(
        (suggestion) =>
          (listingBackedPhraseCounts.get(
            normalizeSearchText(suggestion.query || suggestion.title),
          ) ?? 0) > 0,
      )
      .sort((left, right) => right.rank - left.rank || left.title.localeCompare(right.title, "ru"))
      .slice(0, 5)
      .map(({ type, title, subtitle, query }) => ({
        type,
        title,
        subtitle,
        query,
      }));
  }
}
