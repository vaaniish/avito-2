import {
  CatalogAttributeDefinition,
  CatalogCategory,
  CatalogItem,
  CatalogSubcategory,
  ListingCondition,
  ListingAttribute,
  MarketplaceListing,
  Prisma,
} from "@prisma/client";
import { toClientCondition } from "../../../utils/format";
import {
  buildCatalogBranchHints,
  matchListingByHierarchicalQuery,
  normalizeSearchText,
} from "./search";
type ListingTypeValue = "PRODUCT";
type CatalogSortBy = "popular" | "price-asc" | "price-desc" | "rating" | "newest";
type CatalogPaginatedResponse<T> = {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  searchMeta?: {
    recognizedQuery: string | null;
    emptyStateMessage?: string;
    branchHints: Array<{
      itemPublicId: string;
      itemName: string;
      subcategoryName: string;
      categoryName: string;
      matchedPhrases: string[];
      suggestions: string[];
    }>;
  };
};

const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
const COMPLAINT_RATE_LIMIT_PER_HOUR = 20;
const COMPLAINT_DEDUP_WINDOW_MINUTES = 45;
const MAX_COMPLAINT_DESCRIPTION_LENGTH = 3000;
const INTERNAL_LISTING_ATTRIBUTE_KEYS = new Set([
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

const CP1251_SPECIAL_CHAR_TO_BYTE: Record<number, number> = {
  0x0402: 0x80,
  0x0403: 0x81,
  0x201a: 0x82,
  0x0453: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x20ac: 0x88,
  0x2030: 0x89,
  0x0409: 0x8a,
  0x2039: 0x8b,
  0x040a: 0x8c,
  0x040c: 0x8d,
  0x040b: 0x8e,
  0x040f: 0x8f,
  0x0452: 0x90,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2122: 0x99,
  0x0459: 0x9a,
  0x203a: 0x9b,
  0x045a: 0x9c,
  0x045c: 0x9d,
  0x045b: 0x9e,
  0x045f: 0x9f,
  0x040e: 0xa1,
  0x045e: 0xa2,
  0x0408: 0xa3,
  0x00a4: 0xa4,
  0x0490: 0xa5,
  0x00a6: 0xa6,
  0x00a7: 0xa7,
  0x0401: 0xa8,
  0x00a9: 0xa9,
  0x0404: 0xaa,
  0x00ab: 0xab,
  0x00ac: 0xac,
  0x00ad: 0xad,
  0x00ae: 0xae,
  0x0407: 0xaf,
  0x00b0: 0xb0,
  0x00b1: 0xb1,
  0x0406: 0xb2,
  0x0456: 0xb3,
  0x0491: 0xb4,
  0x00b5: 0xb5,
  0x00b6: 0xb6,
  0x00b7: 0xb7,
  0x0451: 0xb8,
  0x2116: 0xb9,
  0x0454: 0xba,
  0x00bb: 0xbb,
  0x0458: 0xbc,
  0x0405: 0xbd,
  0x0455: 0xbe,
  0x0457: 0xbf,
};

const MOJIBAKE_WEIRD_RE = /[ЃЉЊЋЌЎЏђѓ‚„…†‡€‰™љњћќўџ]/u;

function looksLikeMojibake(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^\?{3,}$/.test(text.replace(/\s+/g, ""))) return true;
  if (MOJIBAKE_WEIRD_RE.test(text)) return true;
  if (text.length >= 8) {
    const rsCount = (text.match(/[РС]/g) ?? []).length;
    return rsCount / text.length > 0.28;
  }
  return false;
}

function decodeCp1251Mojibake(value: string): string | null {
  const bytes: number[] = [];

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (!codePoint) return null;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
      continue;
    }

    if (codePoint >= 0x0410 && codePoint <= 0x044f) {
      bytes.push(codePoint - 0x0350);
      continue;
    }

    const special = CP1251_SPECIAL_CHAR_TO_BYTE[codePoint];
    if (special !== undefined) {
      bytes.push(special);
      continue;
    }

    return null;
  }

  const decoded = Buffer.from(bytes).toString("utf8");
  if (!decoded || decoded.includes("�")) return null;
  return decoded;
}

function normalizeDisplayText(value: string | null | undefined, fallback = ""): string {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (/^\?{3,}$/.test(raw.replace(/\s+/g, ""))) return fallback || "Без названия";

  if (!looksLikeMojibake(raw)) return raw;

  const decoded = decodeCp1251Mojibake(raw)?.trim();
  if (!decoded) return raw;
  if (/^\?{3,}$/.test(decoded.replace(/\s+/g, ""))) return fallback || "Без названия";
  return decoded;
}

function resolveListingType(_rawType: unknown): ListingTypeValue {
  return "PRODUCT";
}

function formatPublishDate(date: Date): string {
  const formatted = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return formatted.replace(",", " в");
}

function formatResponseTime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `около ${minutes} минут`;
  if (minutes < 120) return "около 1 часа";
  return `около ${Math.round(minutes / 60)} часов`;
}

function makeComplaintPublicId(): string {
  return `CMP-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function makeComplaintEventPublicId(): string {
  return `CME-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function listingCategoryName(
  listing: MarketplaceListing & {
    item: (CatalogItem & {
      subcategory: CatalogSubcategory & {
        category: CatalogCategory;
      };
    }) | null;
  },
): string {
  return normalizeDisplayText(listing.item?.name, "Без категории");
}

function listingCatalogRefs(
  listing: MarketplaceListing & {
    item: (CatalogItem & {
      subcategory: CatalogSubcategory & {
        category: CatalogCategory;
      };
    }) | null;
  },
) {
  return {
    catalogCategoryId: listing.item?.subcategory.category.public_id ?? null,
    catalogSubcategoryId: listing.item?.subcategory.public_id ?? null,
    catalogItemId: listing.item?.public_id ?? null,
  };
}

function listingBreadcrumbs(
  listing: MarketplaceListing & {
    item: (CatalogItem & {
      subcategory: CatalogSubcategory & {
        category: CatalogCategory;
      };
    }) | null;
  },
): string[] {
  if (!listing.item) return ["Главная", "Без категории"];
  return [
    "Главная",
    normalizeDisplayText(listing.item.subcategory.category.name, "Без категории"),
    normalizeDisplayText(listing.item.subcategory.name, "Без категории"),
    normalizeDisplayText(listing.item.name, "Без категории"),
  ];
}

function listingSpecifications(
  params: {
    attributes: ListingAttribute[];
    techGrade: string | null;
    techBatteryHealth: number | null;
    techDefects: string | null;
    techIncluded: string | null;
  },
): Record<string, string> | undefined {
  const object: Record<string, string> = {};
  for (const attribute of params.attributes) {
    if (INTERNAL_LISTING_ATTRIBUTE_KEYS.has(attribute.key)) continue;
    if (attribute.key.startsWith("__custom_")) continue;
    object[attribute.key] = attribute.value;
  }

  if (!Object.keys(object).length) return undefined;
  return object;
}

function extractSellerCity(seller: { addresses: Array<{ city: string }> }): string {
  return seller.addresses[0]?.city?.trim() ?? "";
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseCatalogSortBy(value: unknown): CatalogSortBy {
  if (
    value === "price-asc" ||
    value === "price-desc" ||
    value === "rating" ||
    value === "newest"
  ) {
    return value;
  }
  return "popular";
}

function normalizeWords(value: string): string[] {
  return value
    .split(/\s+/)
    .map((part) => normalizeDisplayText(part, "").trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSearchToken(value: unknown): string {
  return normalizeSearchTarget(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchTarget(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().toLowerCase();
  if (typeof value === "number" || typeof value === "boolean") return String(value).toLowerCase();
  if (value instanceof Date) return value.toISOString().toLowerCase();
  if (Array.isArray(value)) return value.map((item) => normalizeSearchTarget(item)).join(" ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map((item) => normalizeSearchTarget(item))
      .join(" ");
  }
  return "";
}

function resolveEffectivePrice(listing: { price: number; sale_price: number | null }): number {
  if (listing.sale_price !== null && listing.sale_price < listing.price) {
    return listing.sale_price;
  }
  return listing.price;
}

function listingAttributeSearchText(
  attributes: Array<{ key: string; value: string }> | undefined,
): string {
  if (!attributes?.length) return "";
  return attributes
    .filter((attribute) => !INTERNAL_LISTING_ATTRIBUTE_KEYS.has(attribute.key))
    .map((attribute) => `${normalizeDisplayText(attribute.key, "")} ${normalizeDisplayText(attribute.value, "")}`)
    .join(" ");
}

function buildCatalogSearchText(listing: {
  title: string;
  description?: string | null;
  sku?: string | null;
  seller?: { name?: string | null; addresses?: Array<{ city?: string | null }> };
  item?: {
    name?: string | null;
    subcategory?: {
      name?: string | null;
      category?: { name?: string | null };
    } | null;
  } | null;
  attributes?: Array<{ key: string; value: string }>;
}): string {
  return normalizeSearchToken({
    title: normalizeDisplayText(listing.title, ""),
    description: normalizeDisplayText(listing.description ?? "", ""),
    seller: normalizeDisplayText(listing.seller?.name ?? "", ""),
    city: normalizeDisplayText(listing.seller?.addresses?.[0]?.city ?? "", ""),
    sku: normalizeDisplayText(listing.sku ?? "", ""),
    category: normalizeDisplayText(listing.item?.name ?? "", ""),
    subcategory: normalizeDisplayText(listing.item?.subcategory?.name ?? "", ""),
    catalogCategory: normalizeDisplayText(listing.item?.subcategory?.category?.name ?? "", ""),
    attributes: listingAttributeSearchText(listing.attributes),
  });
}

function buildCatalogSearchRank(listing: {
  title: string;
  sku?: string | null;
  item?: { name?: string | null } | null;
}, normalizedQuery: string): number {
  if (!normalizedQuery) return 0;
  const candidates = [
    normalizeSearchToken(listing.sku ?? ""),
    normalizeSearchToken(listing.item?.name ?? ""),
    normalizeSearchToken(listing.title),
  ].filter(Boolean);

  let rank = 0;
  for (const candidate of candidates) {
    if (candidate === normalizedQuery) {
      rank = Math.max(rank, 300);
      continue;
    }
    if (candidate.startsWith(normalizedQuery)) {
      rank = Math.max(rank, 200);
      continue;
    }
    if (candidate.includes(normalizedQuery)) {
      rank = Math.max(rank, 100);
    }
  }
  return rank;
}

type CatalogFilterParams = {
  searchQuery: string;
  minPrice: number;
  maxPrice: number;
  minRating: number;
  showOnlySale: boolean;
  condition: ListingCondition | null;
  includeWords: string[];
  excludeWords: string[];
};

function listingMatchesCatalogFilters(
  listing: {
    id: number;
    seller_id?: number;
    title: string;
    description?: string | null;
    sku?: string | null;
    price: number;
    sale_price: number | null;
    rating: number;
    condition: ListingCondition;
    seller?: { name?: string | null; addresses?: Array<{ city?: string | null }> };
    item?: {
      id: number;
      name?: string | null;
      subcategory?: {
        id: number;
        name?: string | null;
        category?: { id: number; name?: string | null };
      } | null;
    } | null;
    attributes?: Array<{ key: string; value: string }>;
    search_keywords?: Array<{ phrase: string; normalized_phrase: string; weight: number; source: string }>;
  },
  filters: CatalogFilterParams,
  searchRules: any[],
): { matches: boolean; searchText: string; searchRank: number } {
  const effectivePrice = resolveEffectivePrice(listing);
  if (effectivePrice < filters.minPrice || effectivePrice > filters.maxPrice) {
    return { matches: false, searchText: "", searchRank: 0 };
  }
  if (listing.rating < filters.minRating) {
    return { matches: false, searchText: "", searchRank: 0 };
  }
  if (filters.showOnlySale && effectivePrice >= listing.price) {
    return { matches: false, searchText: "", searchRank: 0 };
  }
  if (filters.condition && listing.condition !== filters.condition) {
    return { matches: false, searchText: "", searchRank: 0 };
  }

  const normalizedQuery = normalizeSearchText(filters.searchQuery);
  const searchText = buildCatalogSearchText(listing);
  const hierarchicalSearch = matchListingByHierarchicalQuery(listing, normalizedQuery, searchRules);
  const searchRank = Math.max(
    buildCatalogSearchRank(listing, normalizedQuery),
    hierarchicalSearch.rank,
  );

  if (normalizedQuery && !hierarchicalSearch.matches) {
    return { matches: false, searchText, searchRank };
  }
  if (
    filters.includeWords.length > 0 &&
    filters.includeWords.some((word) => !searchText.includes(normalizeSearchToken(word)))
  ) {
    return { matches: false, searchText, searchRank };
  }
  if (
    filters.excludeWords.length > 0 &&
    filters.excludeWords.some((word) => searchText.includes(normalizeSearchToken(word)))
  ) {
    return { matches: false, searchText, searchRank };
  }

  return { matches: true, searchText, searchRank };
}

function sortCatalogCandidates<T extends {
  id: number;
  price: number;
  sale_price: number | null;
  rating: number;
  created_at: Date;
  views: number;
}>(
  candidates: Array<T & { searchRank: number }>,
  sortBy: CatalogSortBy,
): Array<T & { searchRank: number }> {
  return [...candidates].sort((left, right) => {
    if (left.searchRank !== right.searchRank) {
      return right.searchRank - left.searchRank;
    }

    const leftPrice = resolveEffectivePrice(left);
    const rightPrice = resolveEffectivePrice(right);
    switch (sortBy) {
      case "price-asc":
        if (leftPrice !== rightPrice) return leftPrice - rightPrice;
        break;
      case "price-desc":
        if (leftPrice !== rightPrice) return rightPrice - leftPrice;
        break;
      case "rating":
        if (left.rating !== right.rating) return right.rating - left.rating;
        break;
      case "newest":
        if (left.created_at.getTime() !== right.created_at.getTime()) {
          return right.created_at.getTime() - left.created_at.getTime();
        }
        break;
      default:
        if (left.views !== right.views) return right.views - left.views;
        if (left.created_at.getTime() !== right.created_at.getTime()) {
          return right.created_at.getTime() - left.created_at.getTime();
        }
        break;
    }
    return right.id - left.id;
  });
}

function parseCatalogCondition(value: unknown): ListingCondition | null {
  if (value === "new") return "NEW";
  if (value === "used") return "USED";
  return null;
}

function listingStatusToClient(status: string): "active" | "inactive" | "moderation" {
  if (status === "ACTIVE") return "active";
  if (status === "MODERATION") return "moderation";
  return "inactive";
}

function moderationStatusToClient(status: string): "approved" | "pending" | "rejected" {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  return "pending";
}

function getListingUnavailableReason(listing: {
  status: string;
  moderation_status: string;
}): string | null {
  if (listing.status === "MODERATION" || listing.moderation_status === "PENDING") {
    return "Объявление на модерации";
  }
  if (listing.moderation_status === "REJECTED") {
    return "Объявление отклонено модерацией";
  }
  if (listing.status !== "ACTIVE") {
    return "Снято с публикации";
  }
  return null;
}

type SellerReviewMetrics = {
  rating: number;
  reviewsCount: number;
};

type CatalogAttributeDefinitionDto = {
  key: string;
  label: string;
  inputType: string;
  required: boolean;
  options: string[];
  unit: string | null;
  min: number | null;
  max: number | null;
  defaultValue: string | null;
  orderIndex: number;
};

function jsonStringOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? normalizeDisplayText(item) : ""))
    .filter(Boolean);
}

function toAttributeDefinitionDto(
  definition: CatalogAttributeDefinition,
): CatalogAttributeDefinitionDto {
  return {
    key: definition.key,
    label: normalizeDisplayText(definition.label, definition.key),
    inputType: definition.input_type,
    required: definition.required,
    options: jsonStringOptions(definition.options),
    unit: definition.unit,
    min: definition.min_value,
    max: definition.max_value,
    defaultValue: definition.default_value,
    orderIndex: definition.order_index,
  };
}

function isSystemBackedProductAttributeDefinition(
  definition: Pick<CatalogAttributeDefinition, "key" | "label">,
): boolean {
  const key = definition.key.trim().toLocaleLowerCase("ru-RU");
  const label = definition.label.trim().toLocaleLowerCase("ru-RU");
  return key === "condition_grade" || (key === "condition" && label === "состояние");
}

function toClientAttributeDefinitionDtos(
  definitions: CatalogAttributeDefinition[],
  type: "PRODUCT",
): CatalogAttributeDefinitionDto[] {
  return definitions
    .filter(
      (definition) =>
        type !== "PRODUCT" || !isSystemBackedProductAttributeDefinition(definition),
    )
    .map(toAttributeDefinitionDto);
}

function mergeAttributeDefinitionDtos(
  base: CatalogAttributeDefinitionDto[],
  overrides: CatalogAttributeDefinitionDto[],
): CatalogAttributeDefinitionDto[] {
  const byKey = new Map<string, CatalogAttributeDefinitionDto>();
  for (const definition of base) {
    byKey.set(definition.key, definition);
  }
  for (const definition of overrides) {
    byKey.set(definition.key, {
      ...byKey.get(definition.key),
      ...definition,
      orderIndex: byKey.get(definition.key)?.orderIndex ?? definition.orderIndex,
    });
  }
  return Array.from(byKey.values()).sort((a, b) => a.orderIndex - b.orderIndex);
}


const catalogListingDetailInclude = {
  seller: {
    select: {
      public_id: true,
      name: true,
      avatar: true,
      joined_at: true,
      addresses: {
        select: {
          city: true,
        },
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
  images: {
    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
  },
  attributes: {
    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.MarketplaceListingInclude;

type CatalogListingDetail = Prisma.MarketplaceListingGetPayload<{
  include: typeof catalogListingDetailInclude;
}>;

function mapCatalogListingToProduct(
  listing: CatalogListingDetail,
  sellerReviewMetricsBySellerId: Map<number, SellerReviewMetrics>,
) {
  const primaryImage = listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE;
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
    images: listing.images.map((image) => image.url),
    rating: sellerReviewMetricsBySellerId.get(listing.seller_id)?.rating ?? listing.rating,
    sellerRating:
      sellerReviewMetricsBySellerId.get(listing.seller_id)?.rating ?? listing.rating,
    sellerReviewsCount:
      sellerReviewMetricsBySellerId.get(listing.seller_id)?.reviewsCount ?? 0,
    seller: normalizeDisplayText(listing.seller.name, "Продавец"),
    sellerId: listing.seller.public_id,
    sellerAvatar: listing.seller.avatar,
    sellerJoinedAt: listing.seller.joined_at,
    category: listingCategoryName(listing),
    catalogCategoryId: catalogRefs.catalogCategoryId,
    catalogSubcategoryId: catalogRefs.catalogSubcategoryId,
    catalogItemId: catalogRefs.catalogItemId,
    sku: listing.sku,
    isNew: listing.condition === "NEW",
    isSale: salePrice !== null,
    isVerified: Boolean(listing.seller.seller_profile?.is_verified),
    description: normalizeDisplayText(listing.description ?? "", ""),
    shippingBySeller: listing.shipping_by_seller,
    city: normalizeDisplayText(extractSellerCity(listing.seller), ""),
    publishDate: formatPublishDate(listing.created_at),
    views: listing.views,
    sellerResponseTime: formatResponseTime(
      listing.seller.seller_profile?.average_response_minutes,
    ),
    sellerListings: listing.seller._count.listings,
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
}


export {
  buildCatalogBranchHints,
  COMPLAINT_DEDUP_WINDOW_MINUTES,
  COMPLAINT_RATE_LIMIT_PER_HOUR,
  FALLBACK_LISTING_IMAGE,
  INTERNAL_LISTING_ATTRIBUTE_KEYS,
  MAX_COMPLAINT_DESCRIPTION_LENGTH,
  catalogListingDetailInclude,
  extractSellerCity,
  formatPublishDate,
  formatResponseTime,
  getListingUnavailableReason,
  listingBreadcrumbs,
  listingCatalogRefs,
  listingCategoryName,
  listingMatchesCatalogFilters,
  listingSpecifications,
  listingStatusToClient,
  makeComplaintEventPublicId,
  makeComplaintPublicId,
  matchListingByHierarchicalQuery,
  mapCatalogListingToProduct,
  mergeAttributeDefinitionDtos,
  moderationStatusToClient,
  normalizeDisplayText,
  normalizeSearchText,
  normalizeWords,
  parseBooleanFlag,
  parseCatalogCondition,
  parseCatalogSortBy,
  resolveListingType,
  sortCatalogCandidates,
  toClientAttributeDefinitionDtos,
};

export type {
  CatalogAttributeDefinitionDto,
  CatalogListingDetail,
  CatalogPaginatedResponse,
  CatalogSortBy,
  ListingTypeValue,
  SellerReviewMetrics,
};
