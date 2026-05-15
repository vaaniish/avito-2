import { prisma } from "../../../../../lib/prisma";
import type { PartnerListingsSearchRepositoryPort } from "../../domain/partner-listings.types";
import { parseListingType, type ListingTypeValue } from "../../domain/partner-listings.helpers";
import {
  buildSuggestionPhrases,
  loadEffectiveCatalogSearchRules,
  matchCatalogItemByHierarchicalQuery,
} from "../../../../catalog/catalog-search.shared";
import {
  normalizeReferenceSearchText,
  catalogReferenceTitleSuggestions,
} from "../../../../catalog/domain/catalog-reference.helpers";
import { findCatalogReferenceCreateSuggestions } from "../../../../catalog/infrastructure/repositories/catalog-reference.repository";

type CreateSuggestionCatalogItem = {
  id: number;
  public_id: string;
  name: string;
  subcategory: {
    id: number;
    public_id: string;
    name: string;
    category: {
      id: number;
      public_id: string;
      name: string;
    };
  };
};

function createSuggestionTokens(value: string): string[] {
  return normalizeReferenceSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

async function findGenericCreateSuggestionItems(
  query: string,
  type: ListingTypeValue,
): Promise<CreateSuggestionCatalogItem[]> {
  const tokens = createSuggestionTokens(query).slice(0, 8);
  if (tokens.length === 0) return [];

  return prisma.catalogItem.findMany({
    where: {
      subcategory: {
        category: {
          type,
        },
      },
      OR: tokens.map((token) => ({
        name: {
          contains: token,
          mode: "insensitive",
        },
      })),
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
    orderBy: [{ order_index: "asc" }, { id: "asc" }],
    take: 80,
  });
}

export class PartnerListingsSearchRepository
  implements PartnerListingsSearchRepositoryPort
{
  async getTitleSuggestions(params: { query: string; type?: unknown }) {
    const query = params.query.trim();
    if (query.length < 2) {
      return [];
    }

    const type = parseListingType(params.type);
    const normalizedQuery = query.toLocaleLowerCase("ru-RU");
    const [listingTitles, catalogTitles] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where: {
          type,
          title: {
            contains: query,
            mode: "insensitive",
          },
        },
        select: {
          title: true,
          views: true,
        },
        orderBy: [{ views: "desc" }, { created_at: "desc" }],
        take: 30,
      }),
      prisma.catalogItem.findMany({
        where: {
          name: {
            contains: query,
            mode: "insensitive",
          },
          subcategory: {
            category: {
              type,
            },
          },
        },
        select: {
          name: true,
        },
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        take: 20,
      }),
    ]);

    const scored = new Map<string, number>();
    const scoreTitle = (title: string, baseScore: number): number => {
      const normalizedTitle = title.toLocaleLowerCase("ru-RU");
      let score = baseScore;
      if (normalizedTitle === normalizedQuery) score += 20;
      else if (normalizedTitle.startsWith(normalizedQuery)) score += 10;
      else if (normalizedTitle.includes(normalizedQuery)) score += 5;
      score -= Math.min(4, Math.floor(title.length / 35));
      return score;
    };

    for (const listing of listingTitles) {
      const title = listing.title.trim();
      if (!title) continue;
      const nextScore = scoreTitle(title, 12) + Math.min(10, Math.floor(listing.views / 25));
      const prev = scored.get(title) ?? Number.NEGATIVE_INFINITY;
      if (nextScore > prev) scored.set(title, nextScore);
    }

    for (const catalog of catalogTitles) {
      const title = catalog.name.trim();
      if (!title) continue;
      const nextScore = scoreTitle(title, 8);
      const prev = scored.get(title) ?? Number.NEGATIVE_INFINITY;
      if (nextScore > prev) scored.set(title, nextScore);
    }

    return Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
      .slice(0, 8)
      .map(([title]) => title);
  }

  async getCreateSuggestions(params: { query: string; type?: unknown }) {
    const query = params.query.trim();
    const type = parseListingType(params.type);
    const [searchRules, referenceSuggestions] = await Promise.all([
      loadEffectiveCatalogSearchRules(prisma),
      type === "PRODUCT" && query.length >= 2
        ? await findCatalogReferenceCreateSuggestions(query, type)
        : [],
    ]);
    const baseTitleSuggestions =
      type === "PRODUCT" ? catalogReferenceTitleSuggestions(query, referenceSuggestions) : [];
    if (type !== "PRODUCT" || query.length < 2) {
      return {
        query,
        chips: baseTitleSuggestions.slice(0, 5),
        titleSuggestions: baseTitleSuggestions.slice(0, 5),
        matches: [],
      };
    }

    const matches: Array<{
      itemId: string;
      itemPublicId: string;
      itemName: string;
      subcategoryId: string;
      subcategoryName: string;
      categoryId: string;
      categoryName: string;
      score: number;
    }> = [];
    const seenItemIds = new Set<string>();
    const derivedTitleSuggestions = new Map<string, { value: string; score: number }>();

    const pushTitleSuggestion = (value: string, score: number) => {
      const normalized = normalizeReferenceSearchText(value);
      if (!normalized || normalized === normalizeReferenceSearchText(query)) return;
      const existing = derivedTitleSuggestions.get(normalized);
      if (!existing || score > existing.score) {
        derivedTitleSuggestions.set(normalized, { value, score });
      }
    };

    if (referenceSuggestions.length > 0) {
      const referenceItemNames = Array.from(
        new Set(referenceSuggestions.map((suggestion) => suggestion.itemName)),
      );
      const referenceCatalogItems = await prisma.catalogItem.findMany({
        where: {
          name: { in: referenceItemNames },
          subcategory: { category: { type } },
        },
        include: {
          subcategory: {
            include: {
              category: true,
            },
          },
        },
      });
      const catalogItemByName = new Map(referenceCatalogItems.map((item) => [item.name, item]));
      for (const suggestion of referenceSuggestions) {
        const item = catalogItemByName.get(suggestion.itemName);
        if (!item || seenItemIds.has(item.public_id)) continue;
        seenItemIds.add(item.public_id);
        matches.push({
          itemId: item.public_id,
          itemPublicId: item.public_id,
          itemName: item.name,
          subcategoryId: item.subcategory.public_id,
          subcategoryName: item.subcategory.name,
          categoryId: item.subcategory.category.public_id,
          categoryName: item.subcategory.category.name,
          score: suggestion.score,
        });
        pushTitleSuggestion(item.name, suggestion.score + 16);
      }
    }

    const catalogItems = await findGenericCreateSuggestionItems(query, type);
    for (const item of catalogItems) {
      if (seenItemIds.has(item.public_id)) continue;
      const itemMatch = matchCatalogItemByHierarchicalQuery(item, query, searchRules);
      const score = itemMatch.rank;
      if (score < 18) continue;
      seenItemIds.add(item.public_id);
      matches.push({
        itemId: item.public_id,
        itemPublicId: item.public_id,
        itemName: item.name,
        subcategoryId: item.subcategory.public_id,
        subcategoryName: item.subcategory.name,
        categoryId: item.subcategory.category.public_id,
        categoryName: item.subcategory.category.name,
        score,
      });
      pushTitleSuggestion(item.name, score + 10);
      for (const suggestion of buildSuggestionPhrases(query, itemMatch.keywords, 4)) {
        pushTitleSuggestion(suggestion.phrase, suggestion.score);
      }
    }

    const titleSuggestions = Array.from(derivedTitleSuggestions.values())
      .concat(baseTitleSuggestions.map((value, index) => ({ value, score: 600 - index * 10 })))
      .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value, "ru-RU"))
      .filter(
        (item, index, list) =>
          index ===
          list.findIndex(
            (candidate) =>
              normalizeReferenceSearchText(candidate.value) ===
              normalizeReferenceSearchText(item.value),
          ),
      )
      .slice(0, 5)
      .map((entry) => entry.value);

    return {
      query,
      chips: titleSuggestions,
      titleSuggestions,
      matches: matches
        .sort((a, b) => b.score - a.score || a.itemName.localeCompare(b.itemName, "ru"))
        .slice(0, 5),
    };
  }

  async guessCategory(params: { title: string; type?: unknown }) {
    const title = params.title.trim();
    if (title.length < 2) {
      return { category: null, confidence: 0 };
    }

    const type = parseListingType(params.type);
    const normalizedTitle = title.toLocaleLowerCase("ru-RU");
    const [listingMatches, catalogMatches] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where: {
          type,
          title: {
            contains: title,
            mode: "insensitive",
          },
          item: {
            isNot: null,
          },
        },
        select: {
          title: true,
          views: true,
          item: {
            select: {
              subcategory: {
                select: {
                  category: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ views: "desc" }, { created_at: "desc" }],
        take: 80,
      }),
      prisma.catalogItem.findMany({
        where: {
          name: {
            contains: title,
            mode: "insensitive",
          },
          subcategory: {
            category: {
              type,
            },
          },
        },
        select: {
          name: true,
          subcategory: {
            select: {
              category: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        take: 60,
      }),
    ]);

    const scoreByCategory = new Map<string, { score: number; source: "listing" | "catalog" }>();
    const pushScore = (category: string, score: number, source: "listing" | "catalog") => {
      if (!category) return;
      const current = scoreByCategory.get(category);
      if (!current) {
        scoreByCategory.set(category, { score, source });
        return;
      }
      scoreByCategory.set(category, {
        score: current.score + score,
        source: current.source === "listing" ? "listing" : source,
      });
    };

    for (const row of listingMatches) {
      const categoryName = row.item?.subcategory.category.name ?? "";
      if (!categoryName) continue;
      const rowTitle = row.title.trim().toLocaleLowerCase("ru-RU");
      let score = 14;
      if (rowTitle === normalizedTitle) score += 36;
      else if (rowTitle.startsWith(normalizedTitle)) score += 20;
      else if (rowTitle.includes(normalizedTitle)) score += 10;
      score += Math.min(20, Math.floor((row.views ?? 0) / 25));
      pushScore(categoryName, score, "listing");
    }

    for (const row of catalogMatches) {
      const categoryName = row.subcategory.category.name ?? "";
      if (!categoryName) continue;
      const itemName = row.name.trim().toLocaleLowerCase("ru-RU");
      let score = 8;
      if (itemName === normalizedTitle) score += 22;
      else if (itemName.startsWith(normalizedTitle)) score += 14;
      else if (itemName.includes(normalizedTitle)) score += 7;
      pushScore(categoryName, score, "catalog");
    }

    const sorted = Array.from(scoreByCategory.entries())
      .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0], "ru"));

    if (!sorted.length) {
      return { category: null, confidence: 0 };
    }

    const [topCategory, top] = sorted[0];
    const secondScore = sorted[1]?.[1].score ?? 0;
    const ambiguous =
      secondScore > 0 && top.score < secondScore * 1.15 && top.score - secondScore < 6;

    if (ambiguous || top.score < 18) {
      return { category: null, confidence: 0 };
    }

    return {
      category: topCategory,
      confidence: Math.min(100, Math.round(top.score)),
      source: top.source,
    };
  }
}
