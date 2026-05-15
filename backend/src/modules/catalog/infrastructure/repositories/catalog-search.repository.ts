import type { Prisma, PrismaClient } from "@prisma/client";
import presetRules from "../../data/search-rule-presets.json";
import type { EffectiveSearchRule } from "../../domain/search";
import { normalizeSearchText, resolveListingSearchKeywords } from "../../domain/search";

type SearchPresetRule = {
  phrases: string[];
  categoryNames?: string[];
  subcategoryNames?: string[];
  itemNames?: string[];
  weight?: number;
};

const SEARCH_RULE_PRESETS = (presetRules as SearchPresetRule[]).map((rule, index) => ({
  publicId: `preset-${index + 1}`,
  phrases: rule.phrases,
  normalizedCategoryNames: (rule.categoryNames ?? []).map(normalizeSearchText),
  normalizedSubcategoryNames: (rule.subcategoryNames ?? []).map(normalizeSearchText),
  normalizedItemNames: (rule.itemNames ?? []).map(normalizeSearchText),
  weight: rule.weight ?? 60,
}));

export async function loadEffectiveCatalogSearchRules(
  prismaClient: PrismaClient | Prisma.TransactionClient,
): Promise<EffectiveSearchRule[]> {
  const dbRules = await prismaClient.catalogSearchRule.findMany({
    select: {
      public_id: true,
      phrase: true,
      normalized_phrase: true,
      weight: true,
      category_id: true,
      subcategory_id: true,
      item_id: true,
      normalized_brand: true,
      normalized_model: true,
      characteristic_key: true,
      characteristic_value: true,
      source: true,
    },
    orderBy: [{ weight: "desc" }, { id: "asc" }],
  });

  const effectiveRules: EffectiveSearchRule[] = dbRules.map((rule) => ({
    publicId: rule.public_id,
    phrase: rule.phrase,
    normalizedPhrase: rule.normalized_phrase,
    weight: rule.weight,
    categoryId: rule.category_id ?? undefined,
    subcategoryId: rule.subcategory_id ?? undefined,
    itemId: rule.item_id ?? undefined,
    normalizedBrand: rule.normalized_brand,
    normalizedModel: rule.normalized_model,
    normalizedCharacteristicKey: normalizeSearchText(rule.characteristic_key ?? ""),
    normalizedCharacteristicValue: normalizeSearchText(rule.characteristic_value ?? ""),
    source: rule.source,
  }));

  for (const preset of SEARCH_RULE_PRESETS) {
    for (const phrase of preset.phrases) {
      effectiveRules.push({
        publicId: `${preset.publicId}:${normalizeSearchText(phrase)}`,
        phrase,
        normalizedPhrase: normalizeSearchText(phrase),
        weight: preset.weight,
        normalizedCategoryNames: preset.normalizedCategoryNames,
        normalizedSubcategoryNames: preset.normalizedSubcategoryNames,
        normalizedItemNames: preset.normalizedItemNames,
        source: "preset",
      });
    }
  }

  return effectiveRules;
}

export async function syncListingSearchKeywords(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient;
  listingId: number;
}): Promise<void> {
  const [listing, rules] = await Promise.all([
    params.prismaClient.marketplaceListing.findUnique({
      where: { id: params.listingId },
      select: {
        id: true,
        title: true,
        description: true,
        sku: true,
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
        attributes: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          select: {
            key: true,
            value: true,
          },
        },
      },
    }),
    loadEffectiveCatalogSearchRules(params.prismaClient),
  ]);

  if (!listing) return;

  const keywords = resolveListingSearchKeywords(listing, rules);
  await params.prismaClient.listingSearchKeyword.deleteMany({
    where: { listing_id: params.listingId },
  });

  if (keywords.length === 0) return;

  await params.prismaClient.listingSearchKeyword.createMany({
    data: keywords.map((keyword) => ({
      listing_id: params.listingId,
      phrase: keyword.phrase,
      normalized_phrase: keyword.normalizedPhrase,
      weight: keyword.weight,
      source: keyword.source,
    })),
  });
}

function makeRulePublicId(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(4, "0")}`;
}

async function resolveNamedTargets(
  prismaClient: PrismaClient | Prisma.TransactionClient,
  table: "catalogCategory" | "catalogSubcategory" | "catalogItem",
  names: string[],
): Promise<Array<{ id: number; name: string }>> {
  if (names.length === 0) return [];
  const normalizedNames = names.map(normalizeSearchText);
  if (table === "catalogCategory") {
    const rows = await prismaClient.catalogCategory.findMany({
      select: { id: true, name: true },
    });
    return rows.filter((row) => normalizedNames.includes(normalizeSearchText(row.name)));
  }
  if (table === "catalogSubcategory") {
    const rows = await prismaClient.catalogSubcategory.findMany({
      select: { id: true, name: true },
    });
    return rows.filter((row) => normalizedNames.includes(normalizeSearchText(row.name)));
  }

  const rows = await prismaClient.catalogItem.findMany({
    select: { id: true, name: true },
  });
  return rows.filter((row) => normalizedNames.includes(normalizeSearchText(row.name)));
}

export async function importCatalogSearchRulePresets(
  prismaClient: PrismaClient | Prisma.TransactionClient,
): Promise<{ rulesCreated: number }> {
  const [categories, subcategories, items] = await Promise.all([
    resolveNamedTargets(
      prismaClient,
      "catalogCategory",
      SEARCH_RULE_PRESETS.flatMap((preset) => preset.normalizedCategoryNames ?? []),
    ),
    resolveNamedTargets(
      prismaClient,
      "catalogSubcategory",
      SEARCH_RULE_PRESETS.flatMap((preset) => preset.normalizedSubcategoryNames ?? []),
    ),
    resolveNamedTargets(
      prismaClient,
      "catalogItem",
      SEARCH_RULE_PRESETS.flatMap((preset) => preset.normalizedItemNames ?? []),
    ),
  ]);

  const categoryIdsByName = new Map(categories.map((row) => [normalizeSearchText(row.name), row.id]));
  const subcategoryIdsByName = new Map(subcategories.map((row) => [normalizeSearchText(row.name), row.id]));
  const itemIdsByName = new Map(items.map((row) => [normalizeSearchText(row.name), row.id]));

  const rows: Prisma.CatalogSearchRuleCreateManyInput[] = [];
  for (const preset of SEARCH_RULE_PRESETS) {
    const categoryIds = (preset.normalizedCategoryNames ?? [])
      .map((name) => categoryIdsByName.get(name))
      .filter((value): value is number => typeof value === "number");
    const subcategoryIds = (preset.normalizedSubcategoryNames ?? [])
      .map((name) => subcategoryIdsByName.get(name))
      .filter((value): value is number => typeof value === "number");
    const itemIds = (preset.normalizedItemNames ?? [])
      .map((name) => itemIdsByName.get(name))
      .filter((value): value is number => typeof value === "number");

    const targets: Array<{ categoryId?: number; subcategoryId?: number; itemId?: number }> =
      itemIds.length > 0
        ? itemIds.map((itemId) => ({ itemId }))
        : subcategoryIds.length > 0
          ? subcategoryIds.map((subcategoryId) => ({ subcategoryId }))
          : categoryIds.map((categoryId) => ({ categoryId }));

    for (const target of targets) {
      for (const phrase of preset.phrases) {
        rows.push({
          public_id: makeRulePublicId("SRH", rows.length),
          phrase,
          normalized_phrase: normalizeSearchText(phrase),
          category_id: target.categoryId ?? null,
          subcategory_id: target.subcategoryId ?? null,
          item_id: target.itemId ?? null,
          weight: preset.weight,
          source: "preset",
        });
      }
    }
  }

  if (rows.length === 0) {
    return { rulesCreated: 0 };
  }

  await prismaClient.catalogSearchRule.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return { rulesCreated: rows.length };
}
