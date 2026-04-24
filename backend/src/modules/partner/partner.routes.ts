import {
  CatalogCategory,
  CatalogItem,
  CatalogSubcategory,
  ListingImage,
  MarketOrder,
  MarketOrderItem,
  OrderStatus,
  PlatformTransaction,
  SellerType,
} from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import {
  evaluateListingModeration,
  type AutoModerationDecision,
  type SellerModerationContext,
} from "./listing-moderation";
import {
  fetchTrackingStatus,
  type DeliveryExternalStatus,
  type DeliveryProviderCode,
  validateTrackingNumber,
} from "./order-delivery";
import {
  toClientCondition,
  toPartnerListingStatus,
  toQuestionStatus,
} from "../../utils/format";
import { detectCircumventionSignals } from "../moderation/anti-circumvention";
import { enforceCircumventionViolation } from "../moderation/circumvention-enforcement";
import {
  assertOrderStatusTransitionAllowed,
  isOrderStatusTransitionAllowed,
} from "../orders/order-status-fsm";

const partnerRouter = Router();
type ListingTypeValue = "PRODUCT" | "SERVICE";
type ListingConditionValue = "NEW" | "USED";
type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";
type OrderStatusValue =
  | "CREATED"
  | "PAID"
  | "PROCESSING"
  | "PREPARED"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";
type SellerEditableOrderStatus = "PREPARED";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const LISTING_ACTIVE: ListingStatusValue = "ACTIVE";
const LISTING_INACTIVE: ListingStatusValue = "INACTIVE";
const LISTING_MODERATION: ListingStatusValue = "MODERATION";
const ORDER_DELIVERY_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_TRACKING_PROVIDER: DeliveryProviderCode = "yandex_pvz";
const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

type PartnerOrderRow = MarketOrder & {
  items: MarketOrderItem[];
  transactions: PlatformTransaction[];
  buyer: {
    public_id: string;
    name: string;
  };
};

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return req.ip || null;
}

async function writeOrderStatusTransition(params: {
  orderId: number;
  orderPublicId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: number | null;
  reason: string;
  ipAddress: string | null;
}): Promise<void> {
  await prisma.orderStatusHistory.create({
    data: {
      order_id: params.orderId,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      changed_by_id: params.actorUserId,
      reason: params.reason,
    },
  });

  await prisma.auditLog.create({
    data: {
      public_id: makeAuditPublicId(),
      actor_user_id: params.actorUserId,
      action: "order.status_changed",
      entity_type: "order",
      entity_public_id: params.orderPublicId,
      details: {
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        reason: params.reason,
      },
      ip_address: params.ipAddress,
    },
  });
}

function parseListingType(value: unknown): ListingTypeValue {
  return value === "services" ? "SERVICE" : "PRODUCT";
}

function toDeliveryType(value: string): "pickup" | "delivery" {
  return value === "PICKUP" ? "pickup" : "delivery";
}

function parseCondition(value: unknown): ListingConditionValue {
  return value === "used" ? "USED" : "NEW";
}

function normalizeImageArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
    if (unique.size >= 10) break;
  }

  return Array.from(unique);
}

function parseOrderStatus(value: unknown): OrderStatusValue | null {
  const raw = typeof value === "string" ? value.toUpperCase() : "";
  if (raw === "CREATED") return "CREATED";
  if (raw === "PAID") return "PAID";
  if (raw === "PROCESSING") return "PROCESSING";
  if (raw === "PREPARED") return "PREPARED";
  if (raw === "SHIPPED") return "SHIPPED";
  if (raw === "DELIVERED") return "DELIVERED";
  if (raw === "COMPLETED") return "COMPLETED";
  if (raw === "CANCELLED") return "CANCELLED";
  return null;
}

function parseSellerEditableOrderStatus(value: unknown): SellerEditableOrderStatus | null {
  const raw = parseOrderStatus(value);
  if (raw === "PREPARED") return raw;
  return null;
}

function normalizeTrackingProvider(value: unknown): DeliveryProviderCode {
  if (value === "russian_post") return "russian_post";
  if (value === "yandex_pvz") return "yandex_pvz";
  return DEFAULT_TRACKING_PROVIDER;
}

function mapExternalDeliveryStatusToOrderStatus(
  status: DeliveryExternalStatus,
): OrderStatusValue | null {
  if (status === "IN_TRANSIT") return "SHIPPED";
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "ISSUED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  return null;
}

type PayoutLegalTypeValue = "COMPANY" | "IP" | "BRAND" | "ADMIN_APPROVED";

function parsePayoutLegalType(value: unknown): PayoutLegalTypeValue | null {
  if (value === "COMPANY") return "COMPANY";
  if (value === "IP") return "IP";
  if (value === "BRAND") return "BRAND";
  if (value === "ADMIN_APPROVED") return "ADMIN_APPROVED";
  return null;
}

function normalizeDigits(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\D+/g, "");
}

function normalizeRequiredText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isValidTaxId(taxId: string): boolean {
  return taxId.length === 10 || taxId.length === 12;
}

function isValidBic(bic: string): boolean {
  return bic.length === 9;
}

function isValidBankAccount(account: string): boolean {
  return account.length === 20;
}

function shouldSyncDeliveryStatus(
  order: Pick<
    MarketOrder,
    "status" | "delivery_type" | "tracking_number" | "delivery_checked_at"
  >,
): boolean {
  if (order.delivery_type !== "DELIVERY") return false;
  if (!order.tracking_number) return false;
  if (order.status === "CANCELLED" || order.status === "COMPLETED") return false;
  if (!order.delivery_checked_at) return true;
  return Date.now() - order.delivery_checked_at.getTime() >= ORDER_DELIVERY_SYNC_INTERVAL_MS;
}

async function hasBlockingOrderForListing(listingId: number): Promise<boolean> {
  const linked = await prisma.marketOrderItem.findFirst({
    where: {
      listing_id: listingId,
      order: {
        status: {
          not: "CANCELLED",
        },
      },
    },
    select: { id: true },
  });
  return Boolean(linked);
}

async function syncSingleOrderDeliveryStatus(
  order: Pick<
    MarketOrder,
    | "id"
    | "public_id"
    | "status"
    | "delivery_type"
    | "tracking_provider"
    | "tracking_number"
    | "tracking_url"
    | "delivered_at"
    | "issued_at"
    | "delivery_checked_at"
  >,
): Promise<void> {
  if (!shouldSyncDeliveryStatus(order)) {
    return;
  }

  const provider = normalizeTrackingProvider(order.tracking_provider);
  const tracking = await fetchTrackingStatus({
    provider,
    trackingNumber: order.tracking_number ?? "",
  });
  if (!tracking) {
    return;
  }

  const nextStatus = mapExternalDeliveryStatusToOrderStatus(tracking.status);
  const now = new Date();
  const data: Partial<MarketOrder> = {
    delivery_checked_at: now,
    delivery_ext_status: tracking.rawStatus ?? tracking.status,
  };

  if (tracking.trackingUrl && tracking.trackingUrl !== order.tracking_url) {
    data.tracking_url = tracking.trackingUrl;
  }

  let statusChanged = false;
  if (nextStatus && nextStatus !== order.status) {
    if (
      isOrderStatusTransitionAllowed({
        fromStatus: order.status,
        toStatus: nextStatus,
      })
    ) {
      data.status = nextStatus;
      statusChanged = true;
    }
  }

  if (nextStatus === "DELIVERED" && !order.delivered_at) {
    data.delivered_at = now;
  }

  if (nextStatus === "COMPLETED") {
    if (!order.delivered_at) {
      data.delivered_at = now;
    }
    if (!order.issued_at) {
      data.issued_at = now;
    }
  }

  await prisma.marketOrder.update({
    where: { id: order.id },
    data,
  });

  if (statusChanged && nextStatus) {
    await writeOrderStatusTransition({
      orderId: order.id,
      orderPublicId: order.public_id,
      fromStatus: order.status,
      toStatus: nextStatus,
      actorUserId: null,
      reason: "delivery.sync.external_status",
      ipAddress: null,
    });
  }
}

function parseListingStatus(value: unknown): ListingStatusValue | null {
  if (value === "active") return LISTING_ACTIVE;
  if (value === "inactive") return LISTING_INACTIVE;
  if (value === "moderation") return LISTING_MODERATION;
  return null;
}

function resolveSellerStatusTransition(
  current: ListingStatusValue,
  requested: ListingStatusValue,
): { nextStatus: ListingStatusValue; nextModerationStatus: "APPROVED" | "PENDING" | "REJECTED" } | null {
  if (current === requested) {
    if (current === LISTING_MODERATION) {
      return { nextStatus: LISTING_MODERATION, nextModerationStatus: "PENDING" };
    }
    if (current === LISTING_ACTIVE) {
      return { nextStatus: LISTING_ACTIVE, nextModerationStatus: "APPROVED" };
    }
    return null;
  }

  if (current === LISTING_ACTIVE && requested === LISTING_INACTIVE) {
    return { nextStatus: LISTING_INACTIVE, nextModerationStatus: "APPROVED" };
  }

  if (current === LISTING_INACTIVE && requested === LISTING_MODERATION) {
    return { nextStatus: LISTING_MODERATION, nextModerationStatus: "PENDING" };
  }

  if (current === LISTING_MODERATION && requested === LISTING_INACTIVE) {
    return { nextStatus: LISTING_INACTIVE, nextModerationStatus: "PENDING" };
  }

  return null;
}

function makePublicId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
}

function formatListingPublicId(id: number): string {
  return `LST-${String(id).padStart(4, "0")}`;
}

type ListingAttributeInput = { key: string; value: string };

function normalizeAttributes(input: unknown): ListingAttributeInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduplicated = new Map<string, ListingAttributeInput>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const rawKey = "key" in entry ? entry.key : undefined;
    const rawValue = "value" in entry ? entry.value : undefined;
    if (typeof rawKey !== "string" || typeof rawValue !== "string") continue;

    const key = rawKey.trim();
    const value = rawValue.trim();
    if (!key || !value) continue;

    const normalizedKey = key.toLowerCase();
    if (!deduplicated.has(normalizedKey)) {
      deduplicated.set(normalizedKey, { key: key.slice(0, 120), value: value.slice(0, 500) });
    }
  }

  return Array.from(deduplicated.values()).slice(0, 20);
}

function normalizeCategory(category: string): string {
  const normalized = category.trim();
  return normalized || "No category";
}

function extractCategoryName(
  item:
    | (CatalogItem & {
        subcategory: CatalogSubcategory & {
          category: CatalogCategory;
        };
      })
    | null
    | undefined,
): string {
  return item?.subcategory?.category?.name ?? "No category";
}

async function loadSellerModerationContext(
  sellerId: number,
): Promise<SellerModerationContext | null> {
  const seller = await prisma.appUser.findUnique({
    where: { id: sellerId },
    select: {
      joined_at: true,
      seller_profile: {
        select: {
          is_verified: true,
        },
      },
      _count: {
        select: {
          complaints_against: true,
          orders_as_seller: true,
          listings: true,
        },
      },
    },
  });

  if (!seller) {
    return null;
  }

  return {
    joinedAt: seller.joined_at,
    isVerified: Boolean(seller.seller_profile?.is_verified),
    complaintsCount: seller._count.complaints_against,
    sellerOrdersCount: seller._count.orders_as_seller,
    listingsCount: seller._count.listings,
  };
}

async function resolveAutoModerationDecision(params: {
  sellerId: number;
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl?: string | null;
}): Promise<AutoModerationDecision> {
  const seller = await loadSellerModerationContext(params.sellerId);
  return evaluateListingModeration({
    title: params.title,
    description: params.description,
    category: params.category,
    price: params.price,
    imageUrl: params.imageUrl,
    seller,
  });
}

function queueListingAutoModeration(params: {
  listingId: number;
  sellerId: number;
  title: string;
  description: string;
  category: string;
  price: number;
  imageUrl?: string | null;
}): void {
  setImmediate(() => {
    void (async () => {
      try {
        const moderationDecision = await resolveAutoModerationDecision({
          sellerId: params.sellerId,
          title: params.title,
          description: params.description,
          category: params.category,
          price: params.price,
          imageUrl: params.imageUrl,
        });

        await prisma.marketplaceListing.update({
          where: { id: params.listingId },
          data: {
            status: moderationDecision.listingStatus,
            moderation_status: moderationDecision.moderationStatus,
          },
        });
      } catch (error) {
        console.error("Async moderation job failed:", error);
      }
    })();
  });
}

async function getOrCreateFallbackItem(
  type: ListingTypeValue,
  itemName: string,
): Promise<number> {
  const fallbackCategoryName = type === "SERVICE" ? "Services" : "Products";
  const fallbackCategoryPublicId = type === "SERVICE" ? "service-fallback" : "product-fallback";
  const fallbackSubcategoryPublicId =
    type === "SERVICE" ? "service-fallback-other" : "product-fallback-other";

  let category = await prisma.catalogCategory.findFirst({
    where: {
      type,
      name: fallbackCategoryName,
    },
  });

  if (!category) {
    category = await prisma.catalogCategory.create({
      data: {
        public_id: fallbackCategoryPublicId,
        type,
        name: fallbackCategoryName,
        icon_key: "box",
        order_index: 9_999,
      },
    });
  }

  let subcategory = await prisma.catalogSubcategory.findFirst({
    where: {
      category_id: category.id,
      name: "Other",
    },
  });

  if (!subcategory) {
    subcategory = await prisma.catalogSubcategory.create({
      data: {
        category_id: category.id,
        public_id: fallbackSubcategoryPublicId,
        name: "Other",
        order_index: 9_999,
      },
    });
  }

  const item = await prisma.catalogItem.create({
    data: {
      subcategory_id: subcategory.id,
      public_id: makePublicId("ITM"),
      name: itemName,
      order_index: 9_999,
    },
  });

  return item.id;
}

async function resolveCatalogItemId(
  type: ListingTypeValue,
  rawCategory: string,
): Promise<number | null> {
  const categoryName = normalizeCategory(rawCategory);
  if (!categoryName || categoryName === "No category") return null;

  const itemByName = await prisma.catalogItem.findFirst({
    where: {
      name: {
        equals: categoryName,
        mode: "insensitive",
      },
      subcategory: {
        category: {
          type,
        },
      },
    },
    select: { id: true },
  });

  if (itemByName) {
    return itemByName.id;
  }

  const categoryByName = await prisma.catalogCategory.findFirst({
    where: {
      type,
      name: {
        equals: categoryName,
        mode: "insensitive",
      },
    },
    include: {
      subcategories: {
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        include: {
          items: {
            orderBy: [{ order_index: "asc" }, { id: "asc" }],
            take: 1,
          },
        },
      },
    },
  });

  if (categoryByName) {
    for (const subcategory of categoryByName.subcategories) {
      const firstItem = subcategory.items[0];
      if (firstItem) return firstItem.id;
    }
  }

  const subcategoryByName = await prisma.catalogSubcategory.findFirst({
    where: {
      name: {
        equals: categoryName,
        mode: "insensitive",
      },
      category: {
        type,
      },
    },
    include: {
      items: {
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        take: 1,
      },
    },
  });

  if (subcategoryByName?.items[0]) {
    return subcategoryByName.items[0].id;
  }

  return getOrCreateFallbackItem(type, categoryName);
}

function listingImageUrl(images: ListingImage[]): string {
  return images[0]?.url ?? FALLBACK_LISTING_IMAGE;
}

function extractSellerCity(seller: { addresses: Array<{ city: string }> }): string | null {
  const city = seller.addresses[0]?.city?.trim();
  return city || null;
}

partnerRouter.get("/listings", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const type = parseListingType(req.query.type);

    const listings = await prisma.marketplaceListing.findMany({
      where: {
        seller_id: session.user.id,
        type,
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
        seller: {
          select: {
            addresses: {
              select: {
                city: true,
              },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        attributes: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
        images: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      listings.map((listing) => ({
          id: listing.public_id,
          title: listing.title,
          price: listing.price,
          condition: toClientCondition(listing.condition),
          status: toPartnerListingStatus(listing.status),
          moderationStatus: listing.moderation_status.toLowerCase(),
          views: listing.views,
          created_at: listing.created_at,
          image: listingImageUrl(listing.images),
          images: listing.images.map((image) => image.url),
          description: listing.description,
          city: extractSellerCity(listing.seller),
          category: extractCategoryName(listing.item),
          attributes: listing.attributes.map((attribute) => ({
            key: attribute.key,
            value: attribute.value,
          })),
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching partner listings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.get("/listings/title-suggestions", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < 2) {
      res.json([]);
      return;
    }
    const type = parseListingType(req.query.type);
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

    const suggestions = Array.from(scored.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
      .slice(0, 8)
      .map(([title]) => title);

    res.json(suggestions);
  } catch (error) {
    console.error("Error getting title suggestions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.get("/payout-profile", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const profile = await prisma.sellerPayoutProfile.findUnique({
      where: {
        seller_id: session.user.id,
      },
      select: {
        public_id: true,
        legal_type: true,
        legal_name: true,
        tax_id: true,
        bank_account: true,
        bank_bic: true,
        correspondent_account: true,
        bank_name: true,
        recipient_name: true,
        status: true,
        verified_at: true,
        rejection_reason: true,
        updated_at: true,
      },
    });

    if (!profile) {
      res.json({ profile: null });
      return;
    }

    res.json({
      profile: {
        id: profile.public_id,
        legalType: profile.legal_type,
        legalName: profile.legal_name,
        taxId: profile.tax_id,
        bankAccount: profile.bank_account,
        bankBic: profile.bank_bic,
        correspondentAccount: profile.correspondent_account,
        bankName: profile.bank_name,
        recipientName: profile.recipient_name,
        status: profile.status.toLowerCase(),
        verifiedAt: profile.verified_at,
        rejectionReason: profile.rejection_reason,
        updatedAt: profile.updated_at,
      },
    });
  } catch (error) {
    console.error("Error fetching payout profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.put("/payout-profile", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as {
      legalType?: unknown;
      legalName?: unknown;
      taxId?: unknown;
      bankAccount?: unknown;
      bankBic?: unknown;
      correspondentAccount?: unknown;
      bankName?: unknown;
      recipientName?: unknown;
    };

    const legalType = parsePayoutLegalType(body.legalType);
    const legalName = normalizeRequiredText(body.legalName);
    const taxId = normalizeDigits(body.taxId);
    const bankAccount = normalizeDigits(body.bankAccount);
    const bankBic = normalizeDigits(body.bankBic);
    const correspondentAccount = normalizeDigits(body.correspondentAccount);
    const bankName = normalizeRequiredText(body.bankName);
    const recipientName = normalizeRequiredText(body.recipientName);

    if (!legalType) {
      res.status(400).json({
        error: "Invalid legal type. Use COMPANY, IP, BRAND or ADMIN_APPROVED.",
      });
      return;
    }

    if (
      !legalName ||
      !bankName ||
      !recipientName ||
      !isValidTaxId(taxId) ||
      !isValidBankAccount(bankAccount) ||
      !isValidBic(bankBic) ||
      !isValidBankAccount(correspondentAccount)
    ) {
      res.status(400).json({
        error:
          "Invalid payout requisites. Check legal name, tax id, account, BIC and correspondent account.",
      });
      return;
    }

    const payload = {
      legal_type: legalType as SellerType,
      legal_name: legalName,
      tax_id: taxId,
      bank_account: bankAccount,
      bank_bic: bankBic,
      correspondent_account: correspondentAccount,
      bank_name: bankName,
      recipient_name: recipientName,
      status: "PENDING" as const,
      verified_by_id: null,
      verified_at: null,
      rejection_reason: null,
    };

    const saved = await prisma.sellerPayoutProfile.upsert({
      where: {
        seller_id: session.user.id,
      },
      create: {
        public_id: makePublicId("PAYOUT"),
        seller_id: session.user.id,
        ...payload,
      },
      update: payload,
      select: {
        public_id: true,
        legal_type: true,
        legal_name: true,
        tax_id: true,
        bank_account: true,
        bank_bic: true,
        correspondent_account: true,
        bank_name: true,
        recipient_name: true,
        status: true,
        updated_at: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: session.user.id,
        action: "seller.payout_profile.updated",
        entity_type: "user",
        entity_public_id: null,
        details: {
          payoutProfileId: saved.public_id,
          status: saved.status,
        },
        ip_address: getRequestIp(req),
      },
    });

    res.json({
      success: true,
      profile: {
        id: saved.public_id,
        legalType: saved.legal_type,
        legalName: saved.legal_name,
        taxId: saved.tax_id,
        bankAccount: saved.bank_account,
        bankBic: saved.bank_bic,
        correspondentAccount: saved.correspondent_account,
        bankName: saved.bank_name,
        recipientName: saved.recipient_name,
        status: saved.status.toLowerCase(),
        updatedAt: saved.updated_at,
      },
    });
  } catch (error) {
    console.error("Error upserting payout profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.get("/listings/category-guess", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const title = typeof req.query.title === "string" ? req.query.title.trim() : "";
    if (title.length < 2) {
      res.json({ category: null, confidence: 0 });
      return;
    }

    const type = parseListingType(req.query.type);
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

    const pushScore = (category: string, score: number, source: "listing" | "catalog"): void => {
      if (!category) return;
      const current = scoreByCategory.get(category);
      if (!current) {
        scoreByCategory.set(category, { score, source });
        return;
      }
      const nextScore = current.score + score;
      const nextSource = current.source === "listing" ? "listing" : source;
      scoreByCategory.set(category, { score: nextScore, source: nextSource });
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
      res.json({ category: null, confidence: 0 });
      return;
    }

    const [topCategory, top] = sorted[0];
    const secondScore = sorted[1]?.[1].score ?? 0;
    const ambiguous =
      secondScore > 0 &&
      top.score < secondScore * 1.15 &&
      top.score - secondScore < 6;

    if (ambiguous || top.score < 18) {
      res.json({ category: null, confidence: 0 });
      return;
    }

    res.json({
      category: topCategory,
      confidence: Math.min(100, Math.round(top.score)),
      source: top.source,
    });
  } catch (error) {
    console.error("Error guessing listing category:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.post("/listings", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as {
      title?: unknown;
      price?: unknown;
      condition?: unknown;
      description?: unknown;
      category?: unknown;
      image?: unknown;
      images?: unknown;
      attributes?: unknown;
      type?: unknown;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const price = Number(body.price ?? 0);
    const condition = parseCondition(body.condition);
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const category =
      typeof body.category === "string" ? body.category.trim() : "No category";
    const legacyImage = typeof body.image === "string" ? body.image.trim() : "";
    const imagesFromArray = normalizeImageArray(body.images);
    const images = imagesFromArray.length > 0
      ? imagesFromArray
      : legacyImage
        ? [legacyImage]
        : [];
    const type = parseListingType(body.type);
    const attributes = normalizeAttributes(body.attributes);

    if (!title || !Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: "Provide valid title and price" });
      return;
    }

    if (images.length === 0) {
      res.status(400).json({ error: "Provide at least one image" });
      return;
    }

    const itemId = await resolveCatalogItemId(type, category);
    const imageUrl = images[0];
    const roundedPrice = Math.round(price);
    const created = await prisma.$transaction(async (tx) => {
      const listing = await tx.marketplaceListing.create({
        data: {
          // Temporary id first, then deterministic LST-#### based on numeric id.
          public_id: makePublicId("LSTTMP"),
          seller_id: session.user.id,
          type,
          title,
          description: description || null,
          item_id: itemId,
          price: roundedPrice,
          condition,
          status: LISTING_MODERATION,
          moderation_status: "PENDING",
        },
        include: {
          seller: {
            select: {
              addresses: {
                select: {
                  city: true,
                },
                orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                take: 1,
              },
            },
          },
          attributes: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
        },
      });

      await tx.listingImage.createMany({
        data: images.map((url, index) => ({
          listing_id: listing.id,
          url,
          sort_order: index,
        })),
      });

      if (attributes.length > 0) {
        await tx.listingAttribute.createMany({
          data: attributes.map((attribute, index) => ({
            listing_id: listing.id,
            key: attribute.key,
            value: attribute.value,
            sort_order: index,
          })),
        });
      }

      return tx.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          public_id: formatListingPublicId(listing.id),
        },
        include: {
          seller: {
            select: {
              addresses: {
                select: {
                  city: true,
                },
                orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                take: 1,
              },
            },
          },
          images: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
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
          attributes: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
        },
      });
    });

    queueListingAutoModeration({
      listingId: created.id,
      sellerId: session.user.id,
      title,
      description,
      category,
      price: roundedPrice,
      imageUrl,
    });

    res.status(201).json({
      id: created.public_id,
      title: created.title,
      price: created.price,
      condition: toClientCondition(created.condition),
      status: toPartnerListingStatus(created.status),
      moderationStatus: created.moderation_status.toLowerCase(),
      views: created.views,
      created_at: created.created_at,
      image: listingImageUrl(created.images),
      images: created.images.map((listingImage) => listingImage.url),
      description: created.description,
      category: extractCategoryName(created.item),
      city: extractSellerCity(created.seller),
      attributes: created.attributes.map((attribute) => ({
        key: attribute.key,
        value: attribute.value,
      })),
      moderation: {
        status: "pending",
        reason: "queued_for_background_moderation",
        riskScore: null,
        signals: [],
        aiUsed: false,
      },
    });
  } catch (error) {
    console.error("Error creating listing:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.patch(
  "/listings/:publicId",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const existing = await prisma.marketplaceListing.findFirst({
        where: {
          public_id: String(publicId),
          seller_id: session.user.id,
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
          images: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
          seller: {
            select: {
              addresses: {
                select: {
                  city: true,
                },
                orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                take: 1,
              },
            },
          },
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const body = (req.body ?? {}) as {
        title?: unknown;
        price?: unknown;
        condition?: unknown;
        description?: unknown;
        category?: unknown;
        image?: unknown;
        images?: unknown;
        attributes?: unknown;
      };

      const price = body.price === undefined ? undefined : Number(body.price);
      if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
        res.status(400).json({ error: "Invalid price" });
        return;
      }

      const nextCategory =
        typeof body.category === "string" ? body.category.trim() : undefined;
      const nextItemId =
        nextCategory === undefined
          ? undefined
          : await resolveCatalogItemId(existing.type as ListingTypeValue, nextCategory);
      const nextImagesFromBody =
        body.images === undefined ? undefined : normalizeImageArray(body.images);
      const legacyImage =
        typeof body.image === "string" ? body.image.trim() : undefined;
      const nextImages =
        nextImagesFromBody !== undefined
          ? nextImagesFromBody
          : legacyImage !== undefined
            ? legacyImage
              ? [legacyImage]
              : []
            : undefined;
      if (nextImages !== undefined && nextImages.length === 0) {
        res.status(400).json({ error: "Provide at least one image" });
        return;
      }
      const nextAttributes =
        body.attributes === undefined ? undefined : normalizeAttributes(body.attributes);
      const nextTitle =
        typeof body.title === "string" ? body.title.trim() : existing.title;
      const nextDescription =
        typeof body.description === "string"
          ? body.description.trim()
          : existing.description ?? "";
      const nextPrice =
        price === undefined ? existing.price : Math.round(price);
      const nextCategoryForModeration =
        nextCategory === undefined
          ? extractCategoryName(existing.item)
          : nextCategory;
      const nextImageForModeration =
        nextImages === undefined
          ? existing.images[0]?.url ?? FALLBACK_LISTING_IMAGE
          : nextImages[0];
      const updated = await prisma.$transaction(async (tx) => {
        const listing = await tx.marketplaceListing.update({
          where: { id: existing.id },
          data: {
            title: typeof body.title === "string" ? body.title.trim() : undefined,
            price: price === undefined ? undefined : Math.round(price),
            condition:
              body.condition === undefined
                ? undefined
                : parseCondition(body.condition),
            description:
              typeof body.description === "string"
                ? body.description.trim()
                : undefined,
            item_id: nextItemId,
            status: LISTING_MODERATION,
            moderation_status: "PENDING",
          },
        });

        if (nextImages !== undefined) {
          await tx.listingImage.deleteMany({
            where: { listing_id: listing.id },
          });
          await tx.listingImage.createMany({
            data: nextImages.map((url, index) => ({
              listing_id: listing.id,
              url,
              sort_order: index,
            })),
          });
        }

        if (nextAttributes !== undefined) {
          await tx.listingAttribute.deleteMany({
            where: { listing_id: listing.id },
          });
          if (nextAttributes.length > 0) {
            await tx.listingAttribute.createMany({
              data: nextAttributes.map((attribute, index) => ({
                listing_id: listing.id,
                key: attribute.key,
                value: attribute.value,
                sort_order: index,
              })),
            });
          }
        }

        return listing;
      });

      const reloaded = await prisma.marketplaceListing.findUnique({
        where: { id: updated.id },
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
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
          images: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
          seller: {
            select: {
              addresses: {
                select: {
                  city: true,
                },
                orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                take: 1,
              },
            },
          },
        },
      });

      if (!reloaded) {
        res.status(404).json({ error: "Listing not found after update" });
        return;
      }

      queueListingAutoModeration({
        listingId: reloaded.id,
        sellerId: session.user.id,
        title: nextTitle,
        description: nextDescription,
        category: nextCategoryForModeration,
        price: nextPrice,
        imageUrl: nextImageForModeration,
      });

      res.json({
        id: reloaded.public_id,
        title: reloaded.title,
        price: reloaded.price,
        condition: toClientCondition(reloaded.condition),
        status: toPartnerListingStatus(reloaded.status),
        moderationStatus: reloaded.moderation_status.toLowerCase(),
        views: reloaded.views,
        created_at: reloaded.created_at,
        image: listingImageUrl(reloaded.images),
        images: reloaded.images.map((listingImage) => listingImage.url),
        description: reloaded.description,
        category: extractCategoryName(reloaded.item),
        city: extractSellerCity(reloaded.seller),
        attributes: reloaded.attributes.map((attribute) => ({
          key: attribute.key,
          value: attribute.value,
        })),
        moderation: {
          status: "pending",
          reason: "queued_for_background_moderation",
          riskScore: null,
          signals: [],
          aiUsed: false,
        },
      });
    } catch (error) {
      console.error("Error updating listing:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

partnerRouter.post(
  "/listings/:publicId/toggle-status",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const existing = await prisma.marketplaceListing.findFirst({
        where: {
          public_id: String(publicId),
          seller_id: session.user.id,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const currentStatus = existing.status as ListingStatusValue;
      const requestedStatus =
        currentStatus === LISTING_INACTIVE
          ? LISTING_MODERATION
          : LISTING_INACTIVE;
      const transition = resolveSellerStatusTransition(currentStatus, requestedStatus);
      if (!transition) {
        res.status(409).json({
          error: "Unsupported status transition",
          status: toPartnerListingStatus(existing.status),
        });
        return;
      }

      if (
        transition.nextStatus === LISTING_MODERATION &&
        (await hasBlockingOrderForListing(existing.id))
      ) {
        res.status(409).json({
          error:
            "Нельзя повторно активировать объявление: по нему уже есть неотмененный заказ.",
          status: toPartnerListingStatus(existing.status),
        });
        return;
      }

      const updated = await prisma.marketplaceListing.update({
        where: { id: existing.id },
        data: {
          status: transition.nextStatus,
          moderation_status: transition.nextModerationStatus,
        },
      });

      res.json({
        success: true,
        status: toPartnerListingStatus(updated.status),
      });
    } catch (error) {
      console.error("Error toggling listing status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

partnerRouter.patch(
  "/listings/:publicId/status",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as { status?: unknown };
      const nextStatus = parseListingStatus(body.status);
      if (!nextStatus) {
        res.status(400).json({ error: "Invalid listing status" });
        return;
      }

      const { publicId } = req.params;
      const existing = await prisma.marketplaceListing.findFirst({
        where: {
          public_id: String(publicId),
          seller_id: session.user.id,
        },
        select: {
          id: true,
          status: true,
          moderation_status: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      if (nextStatus === LISTING_ACTIVE) {
        res.status(400).json({
          error: "Direct activation is not allowed for seller",
          status: toPartnerListingStatus(existing.status),
        });
        return;
      }

      const transition = resolveSellerStatusTransition(
        existing.status as ListingStatusValue,
        nextStatus,
      );
      if (!transition) {
        res.status(409).json({
          error: "Unsupported status transition",
          status: toPartnerListingStatus(existing.status),
        });
        return;
      }

      if (
        transition.nextStatus === LISTING_MODERATION &&
        (await hasBlockingOrderForListing(existing.id))
      ) {
        res.status(409).json({
          error:
            "Нельзя повторно активировать объявление: по нему уже есть неотмененный заказ.",
          status: toPartnerListingStatus(existing.status),
        });
        return;
      }

      const updated = await prisma.marketplaceListing.update({
        where: { id: existing.id },
        data: {
          status: transition.nextStatus,
          moderation_status: transition.nextModerationStatus,
        },
      });

      res.json({
        success: true,
        status: toPartnerListingStatus(updated.status),
        moderationStatus: updated.moderation_status.toLowerCase(),
      });
    } catch (error) {
      console.error("Error setting listing status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

partnerRouter.delete(
  "/listings/:publicId",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const existing = await prisma.marketplaceListing.findFirst({
        where: {
          public_id: String(publicId),
          seller_id: session.user.id,
        },
        select: { id: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      if (await hasBlockingOrderForListing(existing.id)) {
        res.status(409).json({
          error:
            "Нельзя удалить объявление, связанное с неотмененным заказом. Это нарушит финансовую прозрачность.",
        });
        return;
      }

      await prisma.marketplaceListing.delete({
        where: { id: existing.id },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting listing:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

partnerRouter.get("/orders", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    let orders = await prisma.marketOrder.findMany({
      where: {
        seller_id: session.user.id,
      },
      include: {
        buyer: {
          select: {
            public_id: true,
            name: true,
          },
        },
        items: true,
        transactions: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    const ordersForSync = orders.filter((order) => shouldSyncDeliveryStatus(order));
    if (ordersForSync.length > 0) {
      await Promise.all(ordersForSync.map((order) => syncSingleOrderDeliveryStatus(order)));
      orders = await prisma.marketOrder.findMany({
        where: {
          seller_id: session.user.id,
        },
        include: {
          buyer: {
            select: {
              public_id: true,
              name: true,
            },
          },
          items: true,
          transactions: {
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });
    }

    res.json(
      orders.map((order: PartnerOrderRow) => {
        const latestTransaction = order.transactions[0] ?? null;
        const grossAmount = latestTransaction?.amount ?? order.total_price;
        const commissionAmount = latestTransaction?.commission ?? null;
        const sellerPayout = commissionAmount === null ? null : grossAmount - commissionAmount;

        return {
          id: order.public_id,
          buyer_name: order.buyer.name,
          buyer_id: order.buyer.public_id,
          total_price: order.total_price,
          status: order.status,
          delivery_type: toDeliveryType(order.delivery_type),
          created_at: order.created_at,
          tracking_provider: order.tracking_provider,
          tracking_number: order.tracking_number,
          tracking_url: order.tracking_url,
          delivery_ext_status: order.delivery_ext_status,
          delivery_address: order.delivery_address,
          finance: {
            gross_amount: grossAmount,
            commission_rate: latestTransaction?.commission_rate ?? null,
            commission_amount: commissionAmount,
            seller_payout: sellerPayout,
            transaction_status: latestTransaction?.status ?? null,
            payment_provider: latestTransaction?.payment_provider?.toLowerCase() ?? null,
            payment_intent_id: latestTransaction?.payment_intent_id ?? null,
          },
          items: order.items.map((item: MarketOrderItem) => ({
            id: String(item.id),
            name: item.name,
            quantity: item.quantity,
            price: item.price,
          })),
        };
      }),
    );
  } catch (error) {
    console.error("Error fetching partner orders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.patch(
  "/orders/:publicId/status",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { status?: unknown };
      const nextStatus = parseSellerEditableOrderStatus(body.status);

      if (!nextStatus) {
        res.status(400).json({ error: "Invalid order status" });
        return;
      }

      const existing = await prisma.marketOrder.findFirst({
        where: {
          public_id: String(publicId),
          seller_id: session.user.id,
        },
        select: {
          id: true,
          public_id: true,
          status: true,
          tracking_number: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      if (existing.status !== "PAID") {
        res.status(409).json({
          error: "Only PAID orders can be moved to PREPARED manually",
        });
        return;
      }

      assertOrderStatusTransitionAllowed({
        fromStatus: existing.status,
        toStatus: nextStatus,
        context: "seller.mark_prepared",
      });

      const updatedCount = await prisma.marketOrder.updateMany({
        where: { id: existing.id, status: "PAID" },
        data: { status: nextStatus },
      });

      if (updatedCount.count === 0) {
        res.status(409).json({
          error: "Order status was updated automatically. Reload and retry.",
        });
        return;
      }

      await writeOrderStatusTransition({
        orderId: existing.id,
        orderPublicId: existing.public_id,
        fromStatus: existing.status,
        toStatus: nextStatus,
        actorUserId: session.user.id,
        reason: "seller.mark_prepared",
        ipAddress: getRequestIp(req),
      });

      res.json({
        success: true,
        status: nextStatus,
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("ORDER_STATUS_TRANSITION_NOT_ALLOWED")) {
        res.status(409).json({ error: "Order transition is not allowed by workflow rules." });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

partnerRouter.patch(
  "/orders/:publicId/tracking",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const body = (req.body ?? {}) as {
        tracking_number?: unknown;
        provider?: unknown;
      };
      const rawTrackingNumber =
        typeof body.tracking_number === "string" ? body.tracking_number.trim() : "";
      if (!rawTrackingNumber) {
        res.status(400).json({ error: "Tracking number is required" });
        return;
      }

      const existing = await prisma.marketOrder.findFirst({
        where: {
          public_id: String(publicId),
          seller_id: session.user.id,
        },
        select: {
          id: true,
          public_id: true,
          status: true,
          delivery_type: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          delivery_checked_at: true,
          delivered_at: true,
          issued_at: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Order not found" });
        return;
      }

      if (existing.delivery_type !== "DELIVERY") {
        res.status(400).json({ error: "Tracking number is available only for delivery orders" });
        return;
      }

      if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
        res.status(409).json({ error: "Tracking number cannot be changed for completed orders" });
        return;
      }

      const provider = normalizeTrackingProvider(body.provider);
      const validation = await validateTrackingNumber({
        provider,
        trackingNumber: rawTrackingNumber,
      });
      if (!validation.valid) {
        res.status(400).json({ error: "Invalid tracking number for selected delivery service" });
        return;
      }

      assertOrderStatusTransitionAllowed({
        fromStatus: existing.status,
        toStatus: "SHIPPED",
        context: "seller.tracking_assigned",
      });

      await prisma.marketOrder.update({
        where: { id: existing.id },
        data: {
          status: "SHIPPED",
          tracking_provider: provider,
          tracking_number: validation.normalizedTrackingNumber,
          tracking_url: validation.trackingUrl || null,
          delivery_checked_at: new Date(),
          delivery_ext_status: null,
          delivered_at: null,
          issued_at: null,
        },
      });

      if (existing.status !== "SHIPPED") {
        await writeOrderStatusTransition({
          orderId: existing.id,
          orderPublicId: existing.public_id,
          fromStatus: existing.status,
          toStatus: "SHIPPED",
          actorUserId: session.user.id,
          reason: "seller.tracking_assigned",
          ipAddress: getRequestIp(req),
        });
      }

      const refreshed = await prisma.marketOrder.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          public_id: true,
          status: true,
          delivery_type: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          delivery_checked_at: true,
          delivered_at: true,
          issued_at: true,
        },
      });

      if (refreshed) {
        await syncSingleOrderDeliveryStatus(refreshed);
      }

      const finalState = await prisma.marketOrder.findUnique({
        where: { id: existing.id },
        select: {
          status: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          delivery_ext_status: true,
        },
      });

      if (finalState && finalState.status !== "SHIPPED") {
        assertOrderStatusTransitionAllowed({
          fromStatus: "SHIPPED",
          toStatus: finalState.status,
          context: "delivery.sync.after_tracking_update",
        });
        await writeOrderStatusTransition({
          orderId: existing.id,
          orderPublicId: existing.public_id,
          fromStatus: "SHIPPED",
          toStatus: finalState.status,
          actorUserId: null,
          reason: "delivery.sync.after_tracking_update",
          ipAddress: getRequestIp(req),
        });
      }

      res.json({
        success: true,
        status: finalState?.status ?? "SHIPPED",
        tracking_provider: finalState?.tracking_provider ?? provider,
        tracking_number:
          finalState?.tracking_number ?? validation.normalizedTrackingNumber,
        tracking_url: finalState?.tracking_url ?? validation.trackingUrl,
        delivery_ext_status: finalState?.delivery_ext_status ?? null,
      });
    } catch (error) {
      console.error("Error applying tracking number:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("ORDER_STATUS_TRANSITION_NOT_ALLOWED")) {
        res.status(409).json({ error: "Tracking update conflicts with current order workflow state." });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

partnerRouter.get("/questions", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const questions = await prisma.listingQuestion.findMany({
      where: {
        listing: {
          seller_id: session.user.id,
        },
      },
      include: {
        listing: {
          select: {
            public_id: true,
            title: true,
          },
        },
        buyer: {
          select: {
            public_id: true,
            name: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      questions.map((question) => ({
          id: question.public_id,
          listingId: question.listing.public_id,
          listingTitle: question.listing.title,
          buyerName: question.buyer.name,
          buyerId: question.buyer.public_id,
          question: question.question,
          answer: question.answer,
          status: toQuestionStatus(question.status),
          createdAt: question.created_at,
          answeredAt: question.answered_at,
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.post(
  "/questions/:publicId/answer",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { answer?: unknown };
      const answer = typeof body.answer === "string" ? body.answer.trim() : "";

      if (!answer) {
        res.status(400).json({ error: "Answer must not be empty" });
        return;
      }

      const existing = await prisma.listingQuestion.findFirst({
        where: {
          public_id: String(publicId),
          listing: {
            seller_id: session.user.id,
          },
        },
        select: {
          id: true,
          public_id: true,
          buyer_id: true,
          listing: {
            select: {
              id: true,
              public_id: true,
              seller_id: true,
            },
          },
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      const circumventionSignals = detectCircumventionSignals(answer);
      if (circumventionSignals.length > 0) {
        const enforcement = await enforceCircumventionViolation({
          req,
          actorUserId: session.user.id,
          actorRole: session.user.role,
          channel: "seller_answer",
          text: answer,
          signals: circumventionSignals,
          listingPublicId: existing.listing.public_id,
          questionPublicId: existing.public_id,
          autoComplaint: {
            listingId: existing.listing.id,
            listingPublicId: existing.listing.public_id,
            sellerId: existing.listing.seller_id,
            reporterId: existing.buyer_id,
            questionPublicId: existing.public_id,
          },
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
            "Ответ отклонен: запрещено передавать контакты и уводить сделку вне платформы. Нарушение зафиксировано.",
          complaintId: enforcement.complaintPublicId,
        });
        return;
      }

      const updated = await prisma.listingQuestion.update({
        where: { id: existing.id },
        data: {
          answer,
          status: "ANSWERED",
          answered_at: new Date(),
        },
      });

      res.json({
        success: true,
        id: updated.public_id,
        answer: updated.answer,
        answeredAt: updated.answered_at,
        status: toQuestionStatus(updated.status),
      });
    } catch (error) {
      console.error("Error answering question:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export { partnerRouter };
