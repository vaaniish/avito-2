import type { Prisma } from "@prisma/client";

const INTERNAL_ATTRIBUTE_KEYS = new Set([
  "__meeting_address",
  "__catalog_category",
  "__catalog_subcategory",
  "__catalog_item",
  "__catalog_item_custom",
  "__catalog_request_attributes",
  "__catalog_request_comment",
  "__custom_manufacturer",
  "__has_defects",
  "__listing_state",
]);

export type EffectiveSearchRule = {
  publicId: string;
  phrase: string;
  normalizedPhrase: string;
  weight: number;
  categoryId?: number;
  subcategoryId?: number;
  itemId?: number;
  normalizedCategoryNames?: string[];
  normalizedSubcategoryNames?: string[];
  normalizedItemNames?: string[];
  normalizedBrand?: string | null;
  normalizedModel?: string | null;
  normalizedCharacteristicKey?: string | null;
  normalizedCharacteristicValue?: string | null;
  source: string;
};

export type ListingSearchSnapshot = {
  id: number;
  title: string;
  description?: string | null;
  sku?: string | null;
  item?: {
    id: number;
    public_id?: string;
    name?: string | null;
    subcategory?: {
      id: number;
      public_id?: string;
      name?: string | null;
      category?: {
        id: number;
        public_id?: string;
        name?: string | null;
      };
    } | null;
  } | null;
  attributes?: Array<{ key: string; value: string }>;
  search_keywords?: Array<{ phrase: string; normalized_phrase: string; weight: number; source: string }>;
};

export type CatalogItemSearchSnapshot = {
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

export type KeywordEntry = {
  phrase: string;
  normalizedPhrase: string;
  weight: number;
  source: string;
};

type ListingKeywordBuildResult = {
  keywords: KeywordEntry[];
  normalizedBrand: string;
  normalizedModel: string;
};

type SearchMatchResult = {
  matches: boolean;
  rank: number;
  matchedPhrases: string[];
  keywords: KeywordEntry[];
};

type TitleAliasRule = {
  triggers: string[];
  keywords: string[];
  weight: number;
  source: string;
};

export type CatalogBranchHint = {
  itemPublicId: string;
  itemName: string;
  subcategoryName: string;
  categoryName: string;
  matchedPhrases: string[];
  suggestions: string[];
  score: number;
};

const TITLE_ALIAS_RULES: TitleAliasRule[] = [
  {
    triggers: ["iphone", "macbook", "airpods", "apple watch", "ipad", "imac"],
    keywords: ["apple", "эпл", "техника apple", "устройства apple"],
    weight: 114,
    source: "brand-alias:apple",
  },
  {
    triggers: ["iphone"],
    keywords: ["apple смартфон", "apple телефон", "смартфон apple", "телефон apple"],
    weight: 116,
    source: "family-alias:iphone",
  },
  {
    triggers: ["apple watch", "watch series", "watch ultra", "смарт часы", "умные часы"],
    keywords: ["часы", "смарт часы", "умные часы", "смарт-часы", "браслет"],
    weight: 112,
    source: "family-alias:watches",
  },
  {
    triggers: ["macbook", "imac"],
    keywords: ["компьютер", "ноутбук", "apple компьютер", "apple ноутбук"],
    weight: 108,
    source: "family-alias:mac",
  },
  {
    triggers: ["airpods"],
    keywords: ["наушники apple", "apple наушники", "гарнитура apple"],
    weight: 104,
    source: "family-alias:airpods",
  },
  {
    triggers: ["galaxy", "samsung"],
    keywords: ["samsung", "самсунг"],
    weight: 108,
    source: "brand-alias:samsung",
  },
  {
    triggers: ["playstation", "ps5", "ps4", "dualsense"],
    keywords: ["sony", "консоль", "игровая консоль", "приставка"],
    weight: 104,
    source: "family-alias:playstation",
  },
  {
    triggers: ["xbox", "series x", "series s"],
    keywords: ["microsoft", "консоль", "игровая консоль", "приставка"],
    weight: 104,
    source: "family-alias:xbox",
  },
  {
    triggers: ["rtx", "geforce"],
    keywords: ["nvidia", "видеокарта", "графическая карта"],
    weight: 102,
    source: "family-alias:rtx",
  },
  {
    triggers: ["ryzen"],
    keywords: ["amd", "процессор", "cpu"],
    weight: 100,
    source: "family-alias:ryzen",
  },
];

function displayText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function normalizeSearchText(value: unknown): string {
  const raw = String(value ?? "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/([a-zа-я])(\d)/giu, "$1 $2")
    .replace(/(\d)([a-zа-я])/giu, "$1 $2")
    .replace(/["'`«»]/g, " ")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw;
}

export function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function dedupeTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens.filter(Boolean)));
}

function attributeEntries(
  attributes: Array<{ key: string; value: string }> | undefined,
): Array<{ key: string; normalizedKey: string; value: string; normalizedValue: string }> {
  if (!attributes?.length) return [];
  return attributes
    .map((attribute) => ({
      key: displayText(attribute.key),
      normalizedKey: normalizeSearchText(attribute.key),
      value: displayText(attribute.value),
      normalizedValue: normalizeSearchText(attribute.value),
    }))
    .filter(
      (attribute) =>
        attribute.normalizedKey.length > 0 &&
        attribute.normalizedValue.length > 0 &&
        !INTERNAL_ATTRIBUTE_KEYS.has(attribute.normalizedKey),
    );
}

function readAttributeValue(
  attributes: Array<{ normalizedKey: string; normalizedValue: string }>,
  candidates: string[],
): string {
  const normalizedCandidates = candidates.map((candidate) => normalizeSearchText(candidate));
  return (
    attributes.find((attribute) => normalizedCandidates.includes(attribute.normalizedKey))
      ?.normalizedValue ?? ""
  );
}

function contiguousPhrases(value: string, maxWindow = 4): string[] {
  const tokens = tokenizeSearchText(value);
  const phrases: string[] = [];
  for (let start = 0; start < tokens.length; start += 1) {
    for (let window = 1; window <= maxWindow && start + window <= tokens.length; window += 1) {
      const phrase = tokens.slice(start, start + window).join(" ").trim();
      if (phrase.length >= 2) {
        phrases.push(phrase);
      }
    }
  }
  return phrases;
}

function containsAnyNormalizedPhrase(haystacks: string[], phrases: string[]): boolean {
  return phrases.some((phrase) => haystacks.some((haystack) => haystack.includes(phrase)));
}

function applyTitleAliasRules(
  map: Map<string, KeywordEntry>,
  haystacks: string[],
): void {
  for (const rule of TITLE_ALIAS_RULES) {
    if (!containsAnyNormalizedPhrase(haystacks, rule.triggers)) continue;
    for (const keyword of rule.keywords) {
      pushKeyword(map, keyword, rule.weight, rule.source);
    }
  }
}

function pushKeyword(
  map: Map<string, KeywordEntry>,
  phrase: string,
  weight: number,
  source: string,
): void {
  const cleanPhrase = displayText(phrase);
  const normalizedPhrase = normalizeSearchText(cleanPhrase);
  if (!cleanPhrase || !normalizedPhrase) return;

  const existing = map.get(normalizedPhrase);
  if (!existing || weight > existing.weight) {
    map.set(normalizedPhrase, {
      phrase: cleanPhrase,
      normalizedPhrase,
      weight,
      source,
    });
  }
}

function addPhraseCombos(
  map: Map<string, KeywordEntry>,
  values: Array<{ value: string; weight: number; source: string }>,
): void {
  const normalizedValues = values
    .map((entry) => ({
      normalized: normalizeSearchText(entry.value),
      weight: entry.weight,
      source: entry.source,
    }))
    .filter((entry) => entry.normalized.length > 0);

  for (const entry of normalizedValues) {
    pushKeyword(map, entry.normalized, entry.weight, entry.source);
  }

  for (let index = 0; index < normalizedValues.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < normalizedValues.length; nextIndex += 1) {
      const left = normalizedValues[index];
      const right = normalizedValues[nextIndex];
      pushKeyword(
        map,
        `${left.normalized} ${right.normalized}`,
        Math.max(left.weight, right.weight),
        `${left.source}+${right.source}`,
      );
      pushKeyword(
        map,
        `${right.normalized} ${left.normalized}`,
        Math.max(left.weight, right.weight) - 1,
        `${right.source}+${left.source}`,
      );
    }
  }
}

function buildDerivedKeywords(
  listing: ListingSearchSnapshot,
  rules: EffectiveSearchRule[],
): ListingKeywordBuildResult {
  const map = new Map<string, KeywordEntry>();
  const categoryName = displayText(listing.item?.subcategory?.category?.name ?? "");
  const subcategoryName = displayText(listing.item?.subcategory?.name ?? "");
  const itemName = displayText(listing.item?.name ?? "");
  const title = displayText(listing.title);
  const sku = displayText(listing.sku ?? "");
  const description = displayText(listing.description ?? "");
  const attributes = attributeEntries(listing.attributes);
  const normalizedTitle = normalizeSearchText(title);
  const normalizedSku = normalizeSearchText(sku);
  const normalizedDescription = normalizeSearchText(description);
  const aliasHaystacks = [normalizedTitle, normalizedSku, normalizedDescription].filter(Boolean);
  const inferredBrand = containsAnyNormalizedPhrase(aliasHaystacks, ["iphone", "macbook", "airpods", "apple watch", "ipad", "imac"])
    ? "apple"
    : containsAnyNormalizedPhrase(aliasHaystacks, ["galaxy", "samsung"])
      ? "samsung"
      : containsAnyNormalizedPhrase(aliasHaystacks, ["playstation", "ps5", "ps4", "dualsense"])
        ? "sony"
        : containsAnyNormalizedPhrase(aliasHaystacks, ["xbox", "series x", "series s"])
          ? "microsoft"
          : containsAnyNormalizedPhrase(aliasHaystacks, ["rtx", "geforce"])
            ? "nvidia"
            : containsAnyNormalizedPhrase(aliasHaystacks, ["ryzen"])
              ? "amd"
              : "";
  const normalizedBrand =
    readAttributeValue(attributes, ["brand", "бренд", "производитель", "manufacturer"]) ||
    inferredBrand;
  const normalizedModel =
    readAttributeValue(attributes, ["model", "модель"]) ||
    (normalizedTitle.startsWith("iphone ")
      ? normalizedTitle.split(" ").slice(0, 3).join(" ")
      : normalizedTitle.startsWith("macbook ")
        ? normalizedTitle.split(" ").slice(0, 3).join(" ")
        : normalizedTitle.startsWith("apple watch ")
          ? normalizedTitle.split(" ").slice(0, 4).join(" ")
          : "");
  const normalizedStorage = readAttributeValue(
    attributes,
    ["storage", "memory", "память", "объем памяти", "накопитель"],
  );

  pushKeyword(map, title, 120, "title");
  if (sku) pushKeyword(map, sku, 115, "sku");
  if (itemName) pushKeyword(map, itemName, 108, "item");
  if (subcategoryName) pushKeyword(map, subcategoryName, 104, "subcategory");
  if (categoryName) pushKeyword(map, categoryName, 100, "category");
  if (description) {
    contiguousPhrases(description, 3)
      .slice(0, 18)
      .forEach((phrase) => pushKeyword(map, phrase, 42, "description"));
  }

  contiguousPhrases(title, 4).forEach((phrase) => pushKeyword(map, phrase, 118, "title-ngram"));
  applyTitleAliasRules(map, aliasHaystacks);

  for (const attribute of attributes) {
    pushKeyword(map, attribute.value, 90, "attribute");
    pushKeyword(map, `${attribute.key} ${attribute.value}`, 68, "attribute-pair");
  }

  if (normalizedBrand) {
    pushKeyword(map, normalizedBrand, 112, "brand");
    contiguousPhrases(normalizedBrand, 3).forEach((phrase) =>
      pushKeyword(map, phrase, 112, "brand-ngram"),
    );
  }
  if (normalizedModel) {
    pushKeyword(map, normalizedModel, 116, "model");
    contiguousPhrases(normalizedModel, 4).forEach((phrase) =>
      pushKeyword(map, phrase, 114, "model-ngram"),
    );
  }
  if (normalizedStorage) {
    pushKeyword(map, normalizedStorage, 92, "storage");
  }

  addPhraseCombos(
    map,
    [
      { value: categoryName, weight: 98, source: "category" },
      { value: subcategoryName, weight: 102, source: "subcategory" },
      { value: itemName, weight: 108, source: "item" },
      { value: normalizedBrand, weight: 112, source: "brand" },
      { value: normalizedModel, weight: 116, source: "model" },
      { value: normalizedStorage, weight: 90, source: "storage" },
    ].filter((entry) => normalizeSearchText(entry.value).length > 0),
  );

  for (const rule of rules) {
    if (!ruleMatchesListing(rule, listing, attributes, normalizedBrand, normalizedModel)) {
      continue;
    }
    pushKeyword(map, rule.phrase, rule.weight, rule.source);
    if (normalizedBrand) {
      pushKeyword(map, `${rule.phrase} ${normalizedBrand}`, rule.weight + 8, `${rule.source}+brand`);
      pushKeyword(map, `${normalizedBrand} ${rule.phrase}`, rule.weight + 9, `brand+${rule.source}`);
    }
    if (normalizedModel) {
      pushKeyword(map, `${rule.phrase} ${normalizedModel}`, rule.weight + 10, `${rule.source}+model`);
      pushKeyword(map, `${normalizedModel} ${rule.phrase}`, rule.weight + 11, `model+${rule.source}`);
    }
  }

  return {
    keywords: Array.from(map.values()),
    normalizedBrand,
    normalizedModel,
  };
}

function ruleMatchesListing(
  rule: EffectiveSearchRule,
  listing: ListingSearchSnapshot,
  attributes: Array<{ normalizedKey: string; normalizedValue: string }>,
  normalizedBrand: string,
  normalizedModel: string,
): boolean {
  if (rule.itemId && listing.item?.id !== rule.itemId) return false;
  if (rule.subcategoryId && listing.item?.subcategory?.id !== rule.subcategoryId) return false;
  if (rule.categoryId && listing.item?.subcategory?.category?.id !== rule.categoryId) return false;

  const categoryName = normalizeSearchText(listing.item?.subcategory?.category?.name ?? "");
  const subcategoryName = normalizeSearchText(listing.item?.subcategory?.name ?? "");
  const itemName = normalizeSearchText(listing.item?.name ?? "");

  if (
    rule.normalizedCategoryNames &&
    rule.normalizedCategoryNames.length > 0 &&
    !rule.normalizedCategoryNames.includes(categoryName)
  ) {
    return false;
  }
  if (
    rule.normalizedSubcategoryNames &&
    rule.normalizedSubcategoryNames.length > 0 &&
    !rule.normalizedSubcategoryNames.includes(subcategoryName)
  ) {
    return false;
  }
  if (
    rule.normalizedItemNames &&
    rule.normalizedItemNames.length > 0 &&
    !rule.normalizedItemNames.includes(itemName)
  ) {
    return false;
  }

  if (rule.normalizedBrand && rule.normalizedBrand !== normalizedBrand) return false;
  if (rule.normalizedModel && rule.normalizedModel !== normalizedModel) return false;

  if (rule.normalizedCharacteristicKey) {
    const matchingAttribute = attributes.find(
      (attribute) => attribute.normalizedKey === rule.normalizedCharacteristicKey,
    );
    if (!matchingAttribute) return false;
    if (
      rule.normalizedCharacteristicValue &&
      matchingAttribute.normalizedValue !== rule.normalizedCharacteristicValue
    ) {
      return false;
    }
  }

  return true;
}

function keywordMatchScore(query: string, queryTokens: string[], keyword: KeywordEntry): number {
  if (!query || queryTokens.length === 0) return 0;

  if (keyword.normalizedPhrase === query) {
    return 1800 + keyword.weight * 4;
  }

  if (keyword.normalizedPhrase.startsWith(`${query} `) || keyword.normalizedPhrase.startsWith(query)) {
    return 1350 + keyword.weight * 3;
  }

  const phraseTokens = tokenizeSearchText(keyword.normalizedPhrase);
  const allTokensMatch = queryTokens.every((token) => phraseTokens.includes(token));
  if (allTokensMatch) {
    const exactTokenCountBonus = phraseTokens.length === queryTokens.length ? 150 : 0;
    const specificityPenalty = Math.max(0, phraseTokens.length - queryTokens.length) * 14;
    return 980 + keyword.weight * 2 + exactTokenCountBonus - specificityPenalty;
  }

  if (queryTokens.length === 1 && keyword.normalizedPhrase.includes(query)) {
    return 640 + keyword.weight;
  }

  return 0;
}

function fallbackAggregateScore(
  queryTokens: string[],
  keywords: KeywordEntry[],
): number {
  if (queryTokens.length === 0) return 0;
  const aggregateTokens = new Set(
    keywords.flatMap((keyword) => tokenizeSearchText(keyword.normalizedPhrase)),
  );
  const matchesAll = queryTokens.every((token) => aggregateTokens.has(token));
  return matchesAll ? 380 : 0;
}

function keywordComparator(left: KeywordEntry, right: KeywordEntry): number {
  return right.weight - left.weight || left.normalizedPhrase.localeCompare(right.normalizedPhrase, "ru-RU");
}

function isDropdownSuggestionSourceAllowed(source: string): boolean {
  return (
    source === "title" ||
    source === "item" ||
    source === "brand" ||
    source === "model" ||
    source === "storage" ||
    source === "preset" ||
    source === "title-ngram" ||
    source === "brand-ngram" ||
    source === "model-ngram" ||
    source.startsWith("brand-alias:") ||
    source.startsWith("family-alias:")
  );
}

function isCompactSuggestionPhrase(keyword: KeywordEntry): boolean {
  const tokenCount = tokenizeSearchText(keyword.normalizedPhrase).length;
  if (tokenCount === 0 || tokenCount > 4) return false;
  if (keyword.normalizedPhrase.length > 42) return false;
  if (keyword.source.includes("+")) return false;
  if (keyword.source === "description" || keyword.source === "attribute-pair") return false;
  return isDropdownSuggestionSourceAllowed(keyword.source);
}

export function resolveListingSearchKeywords(
  listing: ListingSearchSnapshot,
  rules: EffectiveSearchRule[],
): KeywordEntry[] {
  const { keywords: derivedKeywords } = buildDerivedKeywords(listing, rules);
  const merged = new Map<string, KeywordEntry>();

  for (const keyword of derivedKeywords) {
    pushKeyword(merged, keyword.phrase, keyword.weight, keyword.source);
  }

  for (const persisted of listing.search_keywords ?? []) {
    pushKeyword(merged, persisted.phrase, persisted.weight, persisted.source);
  }

  return Array.from(merged.values()).sort(keywordComparator);
}

export function matchListingByHierarchicalQuery(
  listing: ListingSearchSnapshot,
  query: string,
  rules: EffectiveSearchRule[],
): SearchMatchResult {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeSearchText(normalizedQuery);
  const keywords = resolveListingSearchKeywords(listing, rules);

  if (!normalizedQuery) {
    return {
      matches: true,
      rank: 0,
      matchedPhrases: [],
      keywords,
    };
  }

  const scoredMatches = keywords
    .map((keyword) => ({
      keyword,
      score: keywordMatchScore(normalizedQuery, queryTokens, keyword),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || keywordComparator(left.keyword, right.keyword));

  const fallbackScore = scoredMatches.length > 0 ? 0 : fallbackAggregateScore(queryTokens, keywords);
  const rank = scoredMatches[0]?.score ?? fallbackScore;

  return {
    matches: rank > 0,
    rank,
    matchedPhrases: scoredMatches.slice(0, 5).map((entry) => entry.keyword.phrase),
    keywords,
  };
}

export function buildSuggestionPhrases(
  query: string,
  keywords: KeywordEntry[],
  limit = 5,
): Array<{ phrase: string; normalizedPhrase: string; score: number }> {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeSearchText(normalizedQuery);
  const suggestions = new Map<string, { phrase: string; normalizedPhrase: string; score: number }>();

  for (const keyword of keywords) {
    if (!keyword.normalizedPhrase || keyword.normalizedPhrase === normalizedQuery) {
      continue;
    }

    const score = keywordMatchScore(normalizedQuery, queryTokens, keyword);
    const shouldSuggest =
      score > 0 ||
      (queryTokens.length > 0 &&
        queryTokens.every((token) => tokenizeSearchText(keyword.normalizedPhrase).includes(token)));

    if (!shouldSuggest) continue;

    const suggestionScore =
      Math.max(score, 420) + keyword.weight - Math.max(0, tokenizeSearchText(keyword.normalizedPhrase).length - queryTokens.length) * 12;
    const existing = suggestions.get(keyword.normalizedPhrase);
    if (!existing || suggestionScore > existing.score) {
      suggestions.set(keyword.normalizedPhrase, {
        phrase: keyword.phrase,
        normalizedPhrase: keyword.normalizedPhrase,
        score: suggestionScore,
      });
    }
  }

  return Array.from(suggestions.values())
    .sort((left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase, "ru-RU"))
    .slice(0, limit);
}

export function buildLiveSearchSuggestionPhrases(
  query: string,
  keywords: KeywordEntry[],
  limit = 5,
): Array<{ phrase: string; normalizedPhrase: string; score: number }> {
  return buildSuggestionPhrases(
    query,
    keywords.filter(isCompactSuggestionPhrase),
    limit,
  );
}

export function buildCatalogBranchHints(
  query: string,
  items: CatalogItemSearchSnapshot[],
  rules: EffectiveSearchRule[],
  limit = 5,
): CatalogBranchHint[] {
  return items
    .map((item) => {
      const match = matchCatalogItemByHierarchicalQuery(item, query, rules);
      if (!match.matches) return null;
      return {
        itemPublicId: item.public_id,
        itemName: item.name,
        subcategoryName: item.subcategory.name,
        categoryName: item.subcategory.category.name,
        matchedPhrases: match.matchedPhrases,
        suggestions: buildLiveSearchSuggestionPhrases(query, match.keywords, 3).map((entry) => entry.phrase),
        score: match.rank,
      } satisfies CatalogBranchHint;
    })
    .filter((item): item is CatalogBranchHint => Boolean(item))
    .sort((left, right) => right.score - left.score || left.itemName.localeCompare(right.itemName, "ru-RU"))
    .slice(0, limit);
}

function buildCatalogItemKeywords(
  item: CatalogItemSearchSnapshot,
  rules: EffectiveSearchRule[],
): KeywordEntry[] {
  const map = new Map<string, KeywordEntry>();
  pushKeyword(map, item.name, 116, "item");
  pushKeyword(map, item.subcategory.name, 104, "subcategory");
  pushKeyword(map, item.subcategory.category.name, 100, "category");
  contiguousPhrases(item.name, 4).forEach((phrase) => pushKeyword(map, phrase, 118, "item-ngram"));
  addPhraseCombos(map, [
    { value: item.subcategory.category.name, weight: 100, source: "category" },
    { value: item.subcategory.name, weight: 104, source: "subcategory" },
    { value: item.name, weight: 116, source: "item" },
  ]);

  for (const rule of rules) {
    const categoryName = normalizeSearchText(item.subcategory.category.name);
    const subcategoryName = normalizeSearchText(item.subcategory.name);
    const itemName = normalizeSearchText(item.name);
    if (rule.itemId && rule.itemId !== item.id) continue;
    if (rule.subcategoryId && rule.subcategoryId !== item.subcategory.id) continue;
    if (rule.categoryId && rule.categoryId !== item.subcategory.category.id) continue;
    if (
      rule.normalizedCategoryNames &&
      rule.normalizedCategoryNames.length > 0 &&
      !rule.normalizedCategoryNames.includes(categoryName)
    ) {
      continue;
    }
    if (
      rule.normalizedSubcategoryNames &&
      rule.normalizedSubcategoryNames.length > 0 &&
      !rule.normalizedSubcategoryNames.includes(subcategoryName)
    ) {
      continue;
    }
    if (
      rule.normalizedItemNames &&
      rule.normalizedItemNames.length > 0 &&
      !rule.normalizedItemNames.includes(itemName)
    ) {
      continue;
    }
    pushKeyword(map, rule.phrase, rule.weight, rule.source);
  }

  return Array.from(map.values()).sort(keywordComparator);
}

export function matchCatalogItemByHierarchicalQuery(
  item: CatalogItemSearchSnapshot,
  query: string,
  rules: EffectiveSearchRule[],
): SearchMatchResult {
  const normalizedQuery = normalizeSearchText(query);
  const queryTokens = tokenizeSearchText(normalizedQuery);
  const keywords = buildCatalogItemKeywords(item, rules);

  if (!normalizedQuery) {
    return {
      matches: true,
      rank: 0,
      matchedPhrases: [],
      keywords,
    };
  }

  const scoredMatches = keywords
    .map((keyword) => ({
      keyword,
      score: keywordMatchScore(normalizedQuery, queryTokens, keyword),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || keywordComparator(left.keyword, right.keyword));

  return {
    matches: scoredMatches.length > 0,
    rank: scoredMatches[0]?.score ?? 0,
    matchedPhrases: scoredMatches.slice(0, 5).map((entry) => entry.keyword.phrase),
    keywords,
  };
}
