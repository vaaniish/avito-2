import {
  CatalogAttributeDefinition,
  CatalogCategory,
  CatalogItem,
  CatalogSubcategory,
  ListingAttribute,
  MarketplaceListing,
} from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { getSessionUser, requireAnyRole } from "../../lib/session";
import { detectCircumventionSignals } from "../moderation/anti-circumvention";
import { enforceCircumventionViolation } from "../moderation/circumvention-enforcement";
import { toClientCondition } from "../../utils/format";
import {
  buildTargetUrl,
  createNotification,
  notifyAdmins,
} from "../notifications/notification.service";

const catalogRouter = Router();
type ListingTypeValue = "PRODUCT";

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

async function loadSellerReviewMetrics(
  sellerIds: number[],
): Promise<Map<number, SellerReviewMetrics>> {
  const map = new Map<number, SellerReviewMetrics>();
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
    const key = row.listing.seller_id;
    const current = totals.get(key) ?? { sum: 0, count: 0 };
    current.sum += row.rating;
    current.count += 1;
    totals.set(key, current);
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

async function loadSellerReviews(sellerId: number, limit = 50): Promise<
  Array<{
    id: string;
    author: string;
    avatar: string | null;
    rating: number;
    comment: string;
    date: string;
    sortTs: number;
    listingId: string;
    listingTitle: string;
  }>
> {
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

catalogRouter.get("/categories", async (req: Request, res: Response) => {
  try {
    const type = resolveListingType(req.query.type);
    const [categories, visibleListingCounts] = await Promise.all([
      prisma.catalogCategory.findMany({
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
      }),
      prisma.marketplaceListing.groupBy({
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
      }),
    ]);
    const countByItemId = new Map(
      visibleListingCounts
        .filter((row) => row.item_id !== null)
        .map((row) => [row.item_id as number, row._count._all]),
    );
    const categoryCounts = new Map<number, number>();
    const subcategoryCounts = new Map<number, number>();
    for (const category of categories) {
      for (const subcategory of category.subcategories) {
        for (const item of subcategory.items) {
          const count = countByItemId.get(item.id) ?? 0;
          if (count === 0) continue;
          categoryCounts.set(category.id, (categoryCounts.get(category.id) ?? 0) + count);
          subcategoryCounts.set(
            subcategory.id,
            (subcategoryCounts.get(subcategory.id) ?? 0) + count,
          );
        }
      }
    }

    res.json(
      categories.map((category) => ({
        id: category.public_id,
        name: normalizeDisplayText(category.name, "Без названия"),
        icon_key: category.icon_key,
        count: categoryCounts.get(category.id) ?? 0,
        attributeSchema: toClientAttributeDefinitionDtos(
          category.attribute_definitions,
          type,
        ),
        subcategories: category.subcategories.map((subcategory) => {
          const inheritedSchema = mergeAttributeDefinitionDtos(
            toClientAttributeDefinitionDtos(category.attribute_definitions, type),
            toClientAttributeDefinitionDtos(subcategory.attribute_definitions, type),
          );
          return {
            id: subcategory.public_id,
            name: normalizeDisplayText(subcategory.name, "Без названия"),
            count: subcategoryCounts.get(subcategory.id) ?? 0,
            items: subcategory.items.map((item) =>
              normalizeDisplayText(item.name, "Без названия"),
            ),
            catalogItems: subcategory.items.map((item) => ({
              id: item.public_id,
              name: normalizeDisplayText(item.name, "Без названия"),
              count: countByItemId.get(item.id) ?? 0,
              categoryId: category.public_id,
              subcategoryId: subcategory.public_id,
            })),
            attributeSchema: inheritedSchema,
            itemAttributeSchemas: Object.fromEntries(
              subcategory.items.map((item) => [
                normalizeDisplayText(item.name, "Без названия"),
                mergeAttributeDefinitionDtos(
                  [],
                  toClientAttributeDefinitionDtos(item.attribute_definitions, type),
                ),
              ]),
            ),
          };
        }),
      })),
    );
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

catalogRouter.get("/listings", async (req: Request, res: Response) => {
  try {
    const type = resolveListingType(req.query.type);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const itemPublicId = String(req.query.itemId ?? "").trim();
    const itemPublicIds = String(req.query.itemIds ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (req.query.limit && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
      return res.status(400).json({ error: "Invalid limit" });
    }
    if (req.query.offset && (!Number.isInteger(offset) || offset < 0)) {
      return res.status(400).json({ error: "Invalid offset" });
    }

    let itemId: number | undefined;
    let itemIds: number[] | undefined;
    if (itemPublicId) {
      const item = await prisma.catalogItem.findFirst({
        where: {
          public_id: itemPublicId,
          subcategory: {
            category: {
              type,
            },
          },
        },
        select: { id: true },
      });
      if (!item) {
        return res.status(404).json({ error: "Catalog item not found" });
      }
      itemId = item.id;
    } else if (itemPublicIds.length > 0) {
      const uniquePublicIds = Array.from(new Set(itemPublicIds)).slice(0, 200);
      const items = await prisma.catalogItem.findMany({
        where: {
          public_id: {
            in: uniquePublicIds,
          },
          subcategory: {
            category: {
              type,
            },
          },
        },
        select: { id: true },
      });
      itemIds = items.map((item) => item.id);
    }

    const take = typeof limit === "number" ? Math.min(limit, 100) : undefined;
    const skip = take ? offset : undefined;

    const listings = await prisma.marketplaceListing.findMany({
      where: {
        type,
        status: "ACTIVE",
        moderation_status: "APPROVED",
        ...(typeof itemId === "number"
          ? { item_id: itemId }
          : itemIds
            ? { item_id: { in: itemIds.length > 0 ? itemIds : [-1] } }
            : {}),
      },
      include: {
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
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      ...(typeof take === "number" ? { take, skip } : {}),
    });

    const sellerReviewMetricsBySellerId = await loadSellerReviewMetrics(
      listings.map((listing) => listing.seller_id),
    );

    return res.json(
      listings.map((listing) => {
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
            rating:
              sellerReviewMetricsBySellerId.get(listing.seller_id)?.rating ?? 0,
            sellerRating:
              sellerReviewMetricsBySellerId.get(listing.seller_id)?.rating ?? 0,
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
            specifications: listingSpecifications({ attributes: listing.attributes, techGrade: listing.tech_grade, techBatteryHealth: listing.tech_battery_health, techDefects: listing.tech_defects, techIncluded: listing.tech_included }),
            isPriceLower: salePrice !== null,
            condition: toClientCondition(listing.condition),
          };
        },
      ),
    );
  } catch (error) {
    console.error("Error fetching listings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

catalogRouter.get("/listings/:publicId", async (req: Request, res: Response) => {
  try {
    const publicId = String(req.params.publicId ?? "").trim();
    if (!publicId) {
      return res.status(400).json({ error: "Invalid listing ID" });
    }

    const sessionUser = await getSessionUser(req);

    const listing = await prisma.marketplaceListing.findFirst({
      where: {
        public_id: publicId,
      },
      include: {
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
      },
    });

    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }

    const isPubliclyAvailable =
      listing.status === "ACTIVE" && listing.moderation_status === "APPROVED";

    if (!isPubliclyAvailable) {
      if (!sessionUser) {
        return res.status(404).json({ error: "Listing not found" });
      }

      let hasRelatedAccess =
        sessionUser.role === "ADMIN" || listing.seller_id === sessionUser.id;

      if (!hasRelatedAccess) {
        const relatedOrderItem = await prisma.marketOrderItem.findFirst({
          where: {
            listing_id: listing.id,
            order: {
              buyer_id: sessionUser.id,
            },
          },
          select: { id: true },
        });

        hasRelatedAccess = Boolean(relatedOrderItem);
      }

      if (!hasRelatedAccess) {
        return res.status(404).json({ error: "Listing not found" });
      }
    }

    const primaryImage = listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE;
    const salePrice =
      listing.sale_price !== null && listing.sale_price < listing.price
        ? listing.sale_price
        : null;
    const [sellerReviewMetricsBySellerId, sellerReviews] = await Promise.all([
      loadSellerReviewMetrics([listing.seller_id]),
      loadSellerReviews(listing.seller_id, 50),
    ]);
    const sellerReviewMetrics = sellerReviewMetricsBySellerId.get(listing.seller_id) ?? {
      rating: 0,
      reviewsCount: 0,
    };
    const catalogRefs = listingCatalogRefs(listing);

    return res.json({
      id: listing.public_id,
      title: normalizeDisplayText(listing.title, "Без названия"),
      price: listing.price,
      salePrice,
      image: primaryImage,
      images: listing.images.map((image) => image.url),
      rating: sellerReviewMetrics.rating,
      sellerRating: sellerReviewMetrics.rating,
      sellerReviewsCount: sellerReviewMetrics.reviewsCount,
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
      location: extractSellerCity(listing.seller),
      city: extractSellerCity(listing.seller),
      publishDate: formatPublishDate(listing.created_at),
      views: listing.views,
      sellerListings: listing.seller._count.listings,
      sellerResponseTime: formatResponseTime(
        listing.seller.seller_profile?.average_response_minutes,
      ),
      breadcrumbs: listingBreadcrumbs(listing),
      condition: toClientCondition(listing.condition),
      specifications: listingSpecifications({ attributes: listing.attributes, techGrade: listing.tech_grade, techBatteryHealth: listing.tech_battery_health, techDefects: listing.tech_defects, techIncluded: listing.tech_included }),
      listingStatus: listingStatusToClient(listing.status),
      moderationStatus: moderationStatusToClient(listing.moderation_status),
      isAvailable: isPubliclyAvailable,
      unavailableReason: getListingUnavailableReason(listing),
      reviews: sellerReviews,
    });
  } catch (error) {
    console.error("Error fetching listing by id:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

catalogRouter.post("/listings/:publicId/view", async (req: Request, res: Response) => {
  try {
    const publicId = String(req.params.publicId ?? "").trim();
    if (!publicId) {
      return res.status(400).json({ error: "Invalid listing ID" });
    }

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
      return res.status(404).json({ error: "Listing not found" });
    }

    const listing = await prisma.marketplaceListing.findUnique({
      where: {
        public_id: publicId,
      },
      select: {
        views: true,
      },
    });

    return res.json({
      success: true,
      views: listing?.views ?? 0,
    });
  } catch (error) {
    console.error("Error incrementing listing views:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

catalogRouter.get("/sellers/:publicId/listings", async (req: Request, res: Response) => {
  try {
    const sellerPublicId = String(req.params.publicId ?? "").trim();
    if (!sellerPublicId) {
      return res.status(400).json({ error: "Invalid seller ID" });
    }

    const limitRaw = req.query.limit ? Number(req.query.limit) : 24;
    const offsetRaw = req.query.offset ? Number(req.query.offset) : 0;
    if (!Number.isInteger(limitRaw) || limitRaw <= 0) {
      return res.status(400).json({ error: "Invalid limit" });
    }
    if (!Number.isInteger(offsetRaw) || offsetRaw < 0) {
      return res.status(400).json({ error: "Invalid offset" });
    }

    const take = Math.min(limitRaw, 100);
    const skip = offsetRaw;

    const seller = await prisma.appUser.findFirst({
      where: {
        public_id: sellerPublicId,
        role: "SELLER",
      },
      select: {
        id: true,
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
    });

    if (!seller) {
      return res.status(404).json({ error: "Seller not found" });
    }

    const listingWhere = {
      seller_id: seller.id,
      status: "ACTIVE" as const,
      moderation_status: "APPROVED" as const,
    };

    const [total, listings, sellerReviewMetricsBySellerId, sellerReviews] = await Promise.all([
      prisma.marketplaceListing.count({
        where: listingWhere,
      }),
      prisma.marketplaceListing.findMany({
        where: listingWhere,
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
          images: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
          attributes: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take,
        skip,
      }),
      loadSellerReviewMetrics([seller.id]),
      loadSellerReviews(seller.id, 50),
    ]);

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

    return res.json({
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
      items: listings.map((listing) => {
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
          specifications: listingSpecifications({ attributes: listing.attributes, techGrade: listing.tech_grade, techBatteryHealth: listing.tech_battery_health, techDefects: listing.tech_defects, techIncluded: listing.tech_included }),
          isPriceLower: salePrice !== null,
          condition: toClientCondition(listing.condition),
        };
      }),
      pagination: {
        limit: take,
        offset: skip,
        total,
        hasMore: skip + listings.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching seller listings:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

catalogRouter.get("/suggestions", async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q ?? "").trim();
    if (query.length < 2) {
      res.json([]);
      return;
    }

    const normalized = query.toLowerCase();
    const [listings, categories] = await Promise.all([
      prisma.marketplaceListing.findMany({
        where: {
          status: "ACTIVE",
          moderation_status: "APPROVED",
        },
        select: {
          title: true,
          type: true,
          item: {
            select: {
              name: true,
              subcategory: {
                select: {
                  name: true,
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
      }),
      prisma.catalogCategory.findMany({
        include: {
          subcategories: {
            include: {
              items: true,
            },
          },
        },
      }),
    ]);

    const suggestions: Array<{
      type: "product" | "service" | "category";
      title: string;
      subtitle?: string;
      query: string;
    }> = [];

    for (const listing of listings) {
      const listingTitle = normalizeDisplayText(listing.title, "");
      if (!listingTitle.toLowerCase().includes(normalized)) continue;

      const suggestionSubtitle = normalizeDisplayText(
        listing.item?.subcategory.name ??
          listing.item?.subcategory.category.name ??
          "Категория",
        "Категория",
      );
      suggestions.push({
        type: "product",
        title: listingTitle,
        subtitle: suggestionSubtitle,
        query: listingTitle,
      });
    }

    for (const category of categories) {
      const categoryName = normalizeDisplayText(category.name, "Категория");
      if (categoryName.toLowerCase().includes(normalized)) {
        suggestions.push({
          type: "category",
          title: categoryName,
          subtitle: "Категория",
          query: categoryName,
        });
      }

      for (const subcategory of category.subcategories) {
        const subcategoryName = normalizeDisplayText(subcategory.name, "Категория");
        if (subcategoryName.toLowerCase().includes(normalized)) {
          suggestions.push({
            type: "category",
            title: subcategoryName,
            subtitle: categoryName,
            query: subcategoryName,
          });
        }

        for (const item of subcategory.items) {
          const itemName = normalizeDisplayText(item.name, "Без названия");
          if (!itemName.toLowerCase().includes(normalized)) continue;
          suggestions.push({
            type: "category",
            title: itemName,
            subtitle: subcategoryName,
            query: itemName,
          });
        }
      }
    }

    const deduped = suggestions
      .sort((left: { title: string }, right: { title: string }) => {
        const leftStarts = left.title.toLowerCase().startsWith(normalized);
        const rightStarts = right.title.toLowerCase().startsWith(normalized);
        if (leftStarts === rightStarts) return 0;
        return leftStarts ? -1 : 1;
      })
      .filter(
        (item: { title: string }, index: number, list: { title: string }[]) =>
          index ===
          list.findIndex(
            (candidate) =>
              candidate.title.toLowerCase() === item.title.toLowerCase(),
          ),
      )
      .slice(0, 7);

    res.json(deduped);
  } catch (error) {
    console.error("Error fetching suggestions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

catalogRouter.get(
  "/listings/:publicId/questions",
  async (req: Request, res: Response) => {
    try {
      const { publicId } = req.params;
      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(publicId) },
        select: { id: true, seller: { select: { name: true } } },
      });

      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const usePagination =
        req.query.paginated === "1" ||
        req.query.limit !== undefined ||
        req.query.offset !== undefined;

      const mapQuestion = (question: {
        public_id: string;
        created_at: Date;
        question: string;
        answer: string | null;
        answered_at: Date | null;
        buyer: { name: string };
      }) => ({
        id: question.public_id,
        user: question.buyer.name,
        date: question.created_at,
        question: question.question,
        answer: question.answer,
        answerDate: question.answered_at,
        helpful: 0,
      });

      if (!usePagination) {
        const questions = await prisma.listingQuestion.findMany({
          where: { listing_id: listing.id },
          include: {
            buyer: {
              select: { name: true },
            },
          },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });

        res.json(questions.map(mapQuestion));
        return;
      }

      const limitRaw = req.query.limit ? Number(req.query.limit) : 6;
      const offsetRaw = req.query.offset ? Number(req.query.offset) : 0;
      if (!Number.isInteger(limitRaw) || limitRaw <= 0) {
        res.status(400).json({ error: "Invalid limit" });
        return;
      }
      if (!Number.isInteger(offsetRaw) || offsetRaw < 0) {
        res.status(400).json({ error: "Invalid offset" });
        return;
      }

      const take = Math.min(limitRaw, 50);
      const skip = offsetRaw;

      const [total, questions] = await Promise.all([
        prisma.listingQuestion.count({
          where: { listing_id: listing.id },
        }),
        prisma.listingQuestion.findMany({
          where: { listing_id: listing.id },
          include: {
            buyer: {
              select: { name: true },
            },
          },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take,
          skip,
        }),
      ]);

      res.json({
        items: questions.map(mapQuestion),
        pagination: {
          limit: take,
          offset: skip,
          total,
          hasMore: skip + questions.length < total,
        },
      });
    } catch (error) {
      console.error("Error fetching listing questions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

catalogRouter.post(
  "/listings/:publicId/questions",
  async (req: Request, res: Response) => {
    try {
      const { publicId } = req.params;
      const body = (req.body ?? {}) as { question?: unknown };
      const questionText =
        typeof body.question === "string" ? body.question.trim() : "";

      if (questionText.length < 3) {
        res.status(400).json({ error: "Question is too short" });
        return;
      }

      const session = await requireAnyRole(req, ["BUYER"]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(publicId) },
        select: { id: true, title: true, seller_id: true, public_id: true },
      });

      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const circumventionSignals = detectCircumventionSignals(questionText);
      if (circumventionSignals.length > 0) {
        const enforcement = await enforceCircumventionViolation({
          req,
          actorUserId: session.user.id,
          actorRole: session.user.role,
          channel: "buyer_question",
          text: questionText,
          signals: circumventionSignals,
          listingPublicId: listing.public_id,
        });

        if (enforcement.blocked) {
          const blockedUntil = enforcement.blockedUntil
            ? ` до ${enforcement.blockedUntil.toISOString()}`
            : "";
          res.status(403).json({
            error: `Аккаунт временно заблокирован${blockedUntil} за повторные попытки обхода платформы.`,
          });
          return;
        }

        res.status(400).json({
          error:
            "Запрещено передавать контакты и уводить общение вне платформы в вопросах к товару. Нарушение зафиксировано.",
        });
        return;
      }

      const created = await prisma.listingQuestion.create({
        data: {
          public_id: `Q-${Date.now()}`,
          listing_id: listing.id,
          buyer_id: session.user.id,
          question: questionText,
          status: "PENDING",
        },
        include: {
          buyer: {
            select: { name: true },
          },
        },
      });

      await createNotification({
        userId: listing.seller_id,
        type: "NEW_QUESTION",
        message: `Новый вопрос по вашему товару «${listing.title}».`,
        targetUrl: buildTargetUrl("questions"),
      });

      res.status(201).json({
        id: created.public_id,
        user: created.buyer.name,
        date: created.created_at,
        question: created.question,
        answer: created.answer,
        answerDate: created.answered_at,
        helpful: 0,
      });
    } catch (error) {
      console.error("Error creating listing question:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

catalogRouter.post(
  "/listings/:publicId/complaints",
  async (req: Request, res: Response) => {
    try {
      const access = await requireAnyRole(req, ["BUYER", "SELLER", "ADMIN"]);
      if (!access.ok) {
        res.status(access.status).json({ error: access.message });
        return;
      }

      const listingPublicId = String(req.params.publicId ?? "").trim();
      if (!listingPublicId) {
        res.status(400).json({ error: "Invalid listing ID" });
        return;
      }

      const body = (req.body ?? {}) as {
        complaintType?: unknown;
        description?: unknown;
      };

      const complaintType =
        typeof body.complaintType === "string" ? body.complaintType.trim() : "";
      if (complaintType.length < 2 || complaintType.length > 80) {
        res.status(400).json({ error: "Invalid complaint type" });
        return;
      }

      const description =
        typeof body.description === "string" ? body.description.trim() : "";
      if (description.length < 8 || description.length > MAX_COMPLAINT_DESCRIPTION_LENGTH) {
        res.status(400).json({ error: "Invalid complaint description" });
        return;
      }

      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: listingPublicId },
        select: {
          id: true,
          public_id: true,
          seller_id: true,
          title: true,
        },
      });

      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const complaintsInHour = await prisma.complaint.count({
        where: {
          reporter_id: access.user.id,
          created_at: {
            gte: oneHourAgo,
          },
        },
      });

      if (complaintsInHour >= COMPLAINT_RATE_LIMIT_PER_HOUR) {
        res.status(429).json({
          error:
            "Too many complaints from this account. Please wait before submitting another one.",
        });
        return;
      }

      const dedupeWindowStart = new Date(
        Date.now() - COMPLAINT_DEDUP_WINDOW_MINUTES * 60 * 1000,
      );
      const existingDuplicate = await prisma.complaint.findFirst({
        where: {
          reporter_id: access.user.id,
          listing_id: listing.id,
          complaint_type: complaintType,
          created_at: {
            gte: dedupeWindowStart,
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      if (existingDuplicate) {
        res.status(200).json({
          id: existingDuplicate.public_id,
          status: existingDuplicate.status.toLowerCase(),
          deduplicated: true,
          createdAt: existingDuplicate.created_at,
          message: "Similar complaint already exists within the deduplication window.",
        });
        return;
      }

      const created = await prisma.$transaction(async (tx) => {
        const complaint = await tx.complaint.create({
          data: {
            public_id: makeComplaintPublicId(),
            status: "NEW",
            complaint_type: complaintType,
            listing_id: listing.id,
            seller_id: listing.seller_id,
            reporter_id: access.user.id,
            description,
            evidence: null,
          },
        });

        await tx.complaintEvent.create({
          data: {
            public_id: makeComplaintEventPublicId(),
            complaint_id: complaint.id,
            actor_user_id: access.user.id,
            event_type: "SUBMITTED",
            to_status: "NEW",
            note: description.slice(0, 280),
            metadata: {
              source: "catalog_listing_complaint",
            },
          },
        });

        return complaint;
      });

      await notifyAdmins({
        type: "SYSTEM",
        message: `Новая жалоба на объявление «${listing.title}».`,
        targetUrl: buildTargetUrl("admin", "complaints"),
      });
      await createNotification({
        userId: listing.seller_id,
        type: "SYSTEM",
        message: `На объявление «${listing.title}» поступила жалоба. Мы проверим обращение.`,
        targetUrl: buildTargetUrl("partner"),
      });

      res.status(201).json({
        id: created.public_id,
        status: created.status.toLowerCase(),
        deduplicated: false,
        createdAt: created.created_at,
      });
    } catch (error) {
      console.error("Error creating listing complaint:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export { catalogRouter };
