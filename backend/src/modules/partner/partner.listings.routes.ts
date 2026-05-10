import {
  CatalogAttributeDefinition,
  CatalogCategory,
  CatalogItem,
  CatalogSubcategory,
  ListingModerationDecision,
  ListingImage,
  MarketplaceListing,
  MarketOrder,
  MarketOrderItem,
  OrderStatus,
  Prisma,
  PlatformTransaction,
  SellerType,
} from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import {
  catalogReferenceBrandOptions,
  catalogReferenceAttributeDefinitions,
  catalogReferenceFields,
  catalogReferenceModelOptions,
  catalogReferenceTitleSuggestions,
  aggregateCatalogReferenceCharacteristics,
  findCatalogReferenceCreateSuggestions,
  findCatalogReferenceItem,
  findCatalogReferenceSelectedModel,
  firstCatalogReferenceVariant,
  normalizeReferenceSearchText as normalizeSearchText,
  validateCatalogReferenceCombination,
} from "../catalog/catalog-reference.service";
import {
  evaluateListingModeration,
  type AutoModerationDecision,
  type ImageModerationSignal,
  type SellerModerationContext,
} from "./listing-moderation";
import {
  normalizeListingTechState,
  validateListingQuality,
  type ListingTechState,
} from "./listing-quality";
import {
  fetchTrackingStatus,
  type DeliveryExternalStatus,
  type DeliveryProviderCode,
  validateTrackingNumber,
} from "./order-delivery";
import { toPartnerListingStatus } from "../../utils/format";
import {
  makeListingModerationEventPublicId,
} from "../moderation/listing-moderation.shared";
import {
  assertOrderStatusTransitionAllowed,
  isOrderStatusTransitionAllowed,
} from "../orders/order-status-fsm";
import {
  isListingCategoryAllowed,
  jsonStringArray,
} from "../partnership/onboarding";
import {
  buildTargetUrl,
  createNotification,
  listingModerationNotification,
  notifyAdmins,
} from "../notifications/notification.service";
import { makeAuditPublicId, makePublicId, normalizeRequiredText } from "./partner.shared";

const partnerListingsRouter = Router();
type ListingTypeValue = "PRODUCT";
type ListingConditionValue = "NEW" | "USED";
type ListingStateValue = "new" | "restored" | "used";
type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";
type OrderStatusValue = OrderStatus;
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
const META_ATTR_LISTING_STATE = "__listing_state";
const META_ATTR_CATEGORY_ROOT = "__catalog_category";
const META_ATTR_SUBCATEGORY = "__catalog_subcategory";
const META_ATTR_CATALOG_ITEM = "__catalog_item";
const META_ATTR_CATALOG_ITEM_CUSTOM = "__catalog_item_custom";
const META_ATTR_CATALOG_REQUEST_ATTRIBUTES = "__catalog_request_attributes";
const META_ATTR_CATALOG_REQUEST_COMMENT = "__catalog_request_comment";
const META_ATTR_CUSTOM_PREFIX = "__custom_";
const CUSTOM_VALUE_OPTION = "Другое / предложить значение";
const PUBLIC_ATTR_DEFECTS = "Дефекты";
const CATALOG_META_ATTRIBUTE_KEYS = new Set([
  META_ATTR_CATEGORY_ROOT.toLocaleLowerCase("ru-RU"),
  META_ATTR_SUBCATEGORY.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM_CUSTOM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_ATTRIBUTES.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_COMMENT.toLocaleLowerCase("ru-RU"),
  "__meeting_address",
  "__has_defects",
]);
const CUSTOM_ITEM_META_ATTRIBUTE_KEYS = new Set([
  META_ATTR_CATEGORY_ROOT.toLocaleLowerCase("ru-RU"),
  META_ATTR_SUBCATEGORY.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM_CUSTOM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_ATTRIBUTES.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_COMMENT.toLocaleLowerCase("ru-RU"),
  "__meeting_address",
]);
type PartnerOrderRow = MarketOrder & {
  items: Array<MarketOrderItem & { listing: Pick<MarketplaceListing, "public_id"> | null }>;
  transactions: PlatformTransaction[];
  buyer: {
    public_id: string;
    name: string;
  };
};

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return req.ip || null;
}

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
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

function parseListingType(_value: unknown): ListingTypeValue {
  return "PRODUCT";
}

function toDeliveryType(value: string): "pickup" | "delivery" {
  return value === "PICKUP" ? "pickup" : "delivery";
}

function parseListingState(value: unknown): ListingStateValue {
  if (value === "restored") return "restored";
  if (value === "used") return "used";
  return "new";
}

function toDbCondition(state: ListingStateValue): ListingConditionValue {
  return state === "new" ? "NEW" : "USED";
}

function mergeListingStateAttributes(params: {
  attributes: ListingAttributeInput[];
  listingState: ListingStateValue;
}): ListingAttributeInput[] {
  const deduplicated = new Map<string, ListingAttributeInput>();
  for (const attribute of params.attributes) {
    const key = attribute.key.trim();
    const value = attribute.value.trim();
    if (!key || !value) continue;
    deduplicated.set(key.toLowerCase(), { key, value });
  }

  deduplicated.set(META_ATTR_LISTING_STATE.toLowerCase(), {
    key: META_ATTR_LISTING_STATE,
    value: params.listingState,
  });

  return Array.from(deduplicated.values()).slice(0, 64);
}

function extractListingStateFromAttributes(
  attributes: Array<{ key: string; value: string }> | undefined,
): ListingStateValue | null {
  if (!attributes || attributes.length === 0) return null;
  const found = attributes.find((attribute) => attribute.key === META_ATTR_LISTING_STATE);
  if (!found) return null;
  const value = found.value.trim().toLowerCase();
  if (value === "restored") return "restored";
  if (value === "used") return "used";
  if (value === "new") return "new";
  return null;
}

function toClientListingState(params: {
  condition: ListingConditionValue;
  attributes: Array<{ key: string; value: string }> | undefined;
}): ListingStateValue {
  const fromAttributes = extractListingStateFromAttributes(params.attributes);
  if (fromAttributes) return fromAttributes;
  return params.condition === "NEW" ? "new" : "used";
}

function toClientTechGrade(value: string | null): string | null {
  if (!value) return null;
  if (value === "A_PLUS") return "A+";
  return value;
}

function toClientTechState(params: {
  grade: string | null;
  batteryHealth: number | null;
  defects: string | null;
  included: string | null;
}): {
  grade: string;
  batteryHealthPercent: number;
  defects: string;
  included: string;
} | null {
  if (
    !params.grade ||
    params.batteryHealth === null ||
    !params.defects ||
    !params.included
  ) {
    return null;
  }

  return {
    grade: toClientTechGrade(params.grade) ?? params.grade,
    batteryHealthPercent: params.batteryHealth,
    defects: params.defects,
    included: params.included,
  };
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

function normalizeImageModerationSignals(input: unknown): ImageModerationSignal[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const allowed = new Set<ImageModerationSignal>([
    "image_exact_duplicate",
    "image_near_duplicate",
    "image_low_contrast",
    "image_low_resolution",
    "image_similar_composition",
  ]);
  const signals = new Set<ImageModerationSignal>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const normalized = value.trim() as ImageModerationSignal;
    if (allowed.has(normalized)) {
      signals.add(normalized);
    }
  }

  return Array.from(signals).slice(0, 12);
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

async function validateSellerOnboardingForListing(params: {
  sellerId: number;
  category: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  type PartnershipRequestWithOnboarding = Prisma.PartnershipRequestGetPayload<{
    include: { onboarding_profile: true };
  }>;

  const payoutProfile = await prisma.sellerPayoutProfile.findUnique({
    where: { seller_id: params.sellerId },
    select: { status: true },
  });
  if (payoutProfile?.status !== "VERIFIED") {
    return {
      ok: false,
      status: 403,
      error: "Before publishing listings, verify the seller payout profile.",
    };
  }

  let request: PartnershipRequestWithOnboarding | null | undefined;
  try {
    request = await prisma.partnershipRequest.findFirst({
      where: {
        user_id: params.sellerId,
        status: "APPROVED",
      },
      orderBy: [{ reviewed_at: "desc" }, { created_at: "desc" }],
      include: {
        onboarding_profile: true,
      },
    });
  } catch {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { user_id: params.sellerId },
      select: { is_verified: true },
    });
    request = sellerProfile?.is_verified ? null : undefined;
  }

  if (!request) {
    request = await prisma.partnershipRequest.findFirst({
      where: {
        user_id: params.sellerId,
        status: "APPROVED_LIMITED",
      },
      orderBy: [{ reviewed_at: "desc" }, { created_at: "desc" }],
      include: {
        onboarding_profile: true,
      },
    }).catch(() => null);
  }

  if (request === null) {
    return { ok: true };
  }

  if (!request?.onboarding_profile) {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { user_id: params.sellerId },
      select: { is_verified: true },
    });
    if (sellerProfile?.is_verified) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      error: "Seller onboarding approval is required before creating listings.",
    };
  }

  const allowedCategories = jsonStringArray(
    request.onboarding_profile.allowed_categories ?? request.onboarding_profile.categories,
  );
  if (!isListingCategoryAllowed(params.category, allowedCategories)) {
    return {
      ok: false,
      status: 403,
      error: "This seller is not approved for the selected category.",
    };
  }

  if (request.status === "APPROVED_LIMITED") {
    const activeListingsCount = await prisma.marketplaceListing.count({
      where: {
        seller_id: params.sellerId,
        status: { in: ["ACTIVE", "MODERATION"] },
      },
    });
    if (activeListingsCount >= request.onboarding_profile.listing_limit) {
      return {
        ok: false,
        status: 403,
        error: "Limited approval allows only 20 active or moderated listings.",
      };
    }
  }

  return { ok: true };
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

function formatListingPublicId(id: number): string {
  return `LST-${String(id).padStart(4, "0")}`;
}

function formatDraftPublicId(id: number): string {
  return `DRF-${String(id).padStart(4, "0")}`;
}

async function writeListingModerationEvent(params: {
  listingId: number;
  actorUserId: number | null;
  actorType: "SYSTEM" | "ADMIN";
  decision: ListingModerationDecision;
  reasonCode: string;
  reasonNote?: string | null;
  riskScore?: number | null;
  signals?: string[];
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.listingModerationEvent.create({
    data: {
      public_id: makeListingModerationEventPublicId(),
      listing_id: params.listingId,
      actor_user_id: params.actorUserId,
      actor_type: params.actorType,
      decision: params.decision,
      reason_code: params.reasonCode,
      reason_note: params.reasonNote ?? null,
      risk_score: params.riskScore ?? null,
      signals:
        params.signals && params.signals.length > 0
          ? Array.from(new Set(params.signals))
          : undefined,
      metadata: params.metadata ?? undefined,
    },
  });
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

  return Array.from(deduplicated.values()).slice(0, 60);
}

function getAttributeValue(
  attributes: ListingAttributeInput[],
  key: string,
): string {
  const normalizedKey = key.toLocaleLowerCase("ru-RU");
  return (
    attributes.find((attribute) => attribute.key.toLocaleLowerCase("ru-RU") === normalizedKey)?.value.trim() ??
    ""
  );
}

function getAttributeValueByAnyKey(
  attributes: ListingAttributeInput[],
  keys: string[],
): string {
  for (const key of keys) {
    const value = getAttributeValue(attributes, key);
    if (value) return value;
  }
  return "";
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
  return item?.name ?? "No category";
}

function extractCatalogItemNameFromAttributes(
  attributes: Array<{ key: string; value: string }> | undefined,
): string | null {
  const itemName = attributes?.find((attribute) => attribute.key === META_ATTR_CATALOG_ITEM)?.value.trim();
  const customName = attributes?.find((attribute) => attribute.key === META_ATTR_CATALOG_ITEM_CUSTOM)?.value.trim();
  return customName || itemName || null;
}

function listingCategoryNameForClient(
  item:
    | (CatalogItem & {
        subcategory: CatalogSubcategory & {
          category: CatalogCategory;
        };
      })
    | null
    | undefined,
  attributes: Array<{ key: string; value: string }> | undefined,
): string {
  return extractCategoryName(item) === "No category"
    ? extractCatalogItemNameFromAttributes(attributes) ?? "No category"
    : extractCategoryName(item);
}

function ensureCatalogMetaAttributes(
  attributes: ListingAttributeInput[],
  item:
    | (CatalogItem & {
        subcategory: CatalogSubcategory & {
          category: CatalogCategory;
        };
      })
    | null
    | undefined,
): ListingAttributeInput[] {
  if (!item) return attributes;
  const next = [...attributes];
  const ensure = (key: string, value: string) => {
    if (getAttributeValue(next, key)) return;
    next.push({ key, value });
  };
  ensure(META_ATTR_CATEGORY_ROOT, item.subcategory.category.name);
  ensure(META_ATTR_SUBCATEGORY, item.subcategory.name);
  ensure(META_ATTR_CATALOG_ITEM, item.name);
  return next;
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
  imageModerationSignals?: ImageModerationSignal[];
}): Promise<AutoModerationDecision> {
  const seller = await loadSellerModerationContext(params.sellerId);
  return evaluateListingModeration({
    title: params.title,
    description: params.description,
    category: params.category,
    price: params.price,
    imageUrl: params.imageUrl,
    imageModerationSignals: params.imageModerationSignals,
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
  imageModerationSignals?: ImageModerationSignal[];
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
          imageModerationSignals: params.imageModerationSignals,
        });

        await prisma.$transaction(async (tx) => {
          const updated = await tx.marketplaceListing.updateMany({
            where: { id: params.listingId },
            data: {
              status: moderationDecision.listingStatus,
              moderation_status: moderationDecision.moderationStatus,
            },
          });

          if (updated.count === 0) {
            return;
          }

          await tx.listingModerationEvent.create({
            data: {
              public_id: makeListingModerationEventPublicId(),
              listing_id: params.listingId,
              actor_user_id: null,
              actor_type: "SYSTEM",
              decision:
                moderationDecision.moderationStatus === "APPROVED"
                  ? "AUTO_APPROVED"
                  : moderationDecision.moderationStatus === "REJECTED"
                    ? "REJECTED"
                    : "AUTO_REVIEW",
              reason_code:
                moderationDecision.moderationStatus === "APPROVED"
                  ? "AUTO_APPROVE_NO_FLAGS"
                  : moderationDecision.moderationStatus === "REJECTED"
                    ? "AUTO_REJECT_HIGH_CONFIDENCE_VIOLATION"
                    : "AUTO_REVIEW_FLAGGED_BY_RULES_OR_AI",
              reason_note: moderationDecision.reason,
              risk_score: Math.round(moderationDecision.riskScore),
              signals:
                moderationDecision.signals.length > 0
                  ? Array.from(new Set(moderationDecision.signals))
                  : undefined,
              metadata: {
                aiUsed: moderationDecision.aiUsed,
                imageModerationSignals: params.imageModerationSignals ?? [],
              },
            },
          });

          const sellerNotification = listingModerationNotification({
            sellerId: params.sellerId,
            listingPublicId: String(params.listingId),
            title: params.title,
            moderationStatus: moderationDecision.moderationStatus,
            reasonNote: moderationDecision.reason,
            reasonCode:
              moderationDecision.moderationStatus === "APPROVED"
                ? "AUTO_APPROVE_NO_FLAGS"
                : moderationDecision.moderationStatus === "REJECTED"
                  ? "AUTO_REJECT_HIGH_CONFIDENCE_VIOLATION"
                  : "AUTO_REVIEW_FLAGGED_BY_RULES_OR_AI",
          });
          await tx.notification.create({
            data: {
              user_id: sellerNotification.userId,
              type: sellerNotification.type ?? "SYSTEM",
              message: sellerNotification.message,
              target_url: sellerNotification.targetUrl,
            },
          });

          if (moderationDecision.moderationStatus === "PENDING") {
            const admins = await tx.appUser.findMany({
              where: { role: "ADMIN", status: "ACTIVE" },
              select: { id: true },
            });
            if (admins.length > 0) {
              await tx.notification.createMany({
                data: admins.map((admin) => ({
                  user_id: admin.id,
                  type: "SYSTEM",
                  message: `Объявление «${params.title}» требует ручной модерации.`,
                  target_url: buildTargetUrl("admin", "listings"),
                })),
              });
            }
          }
        });
      } catch (error) {
        console.error("Async moderation job failed:", error);
      }
    })();
  });
}

type AttributeDefinitionForValidation = Pick<
  CatalogAttributeDefinition,
  | "key"
  | "label"
  | "input_type"
  | "required"
  | "options"
  | "unit"
  | "min_value"
  | "max_value"
  | "default_value"
  | "order_index"
>;

type PartnerCatalogSelection = {
  itemId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  categoryName: string;
  subcategoryName: string;
  itemName: string;
  isCustomCategory: boolean;
  isCustomSubcategory: boolean;
  isCustomItem: boolean;
  attributeDefinitions: AttributeDefinitionForValidation[];
};

type PartnerCatalogSelectionResult =
  | { ok: true; selection: PartnerCatalogSelection }
  | { ok: false; status: number; error: string; reasonCode: string };

function normalizeCatalogSuggestionValue(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ");
}

function validateCatalogSuggestionValue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return "Укажите вид понятнее: минимум 2 символа";
  if (trimmed.length > 80) return "Слишком длинный вид: максимум 80 символов";
  if (!/[a-zа-я0-9]/iu.test(trimmed)) return "Вид должен содержать буквы или цифры";
  const normalized = normalizeCatalogSuggestionValue(trimmed);
  const blocked = [
    "гондошлеп",
    "хуй",
    "хуи",
    "бляд",
    "ебат",
    "ебан",
    "пизд",
    "fuck",
    "shit",
  ];
  if (blocked.some((word) => normalized.includes(word))) {
    return "Такое значение нельзя добавить в справочник";
  }
  return null;
}

function readTrimmedBodyString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

function isValidCatalogRequestEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/u.test(value.trim());
}

function isValidCatalogRequestUrl(value: string): boolean {
  const rawValue = value.trim();
  try {
    const url = new URL(/^https?:\/\//iu.test(rawValue) ? rawValue : `https://${rawValue}`);
    const hostname = url.hostname.toLocaleLowerCase("ru-RU");
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      /^[a-zа-я0-9.-]+\.[a-zа-я]{2,24}$/iu.test(hostname) &&
      !hostname.startsWith(".") &&
      !hostname.endsWith(".") &&
      !hostname.includes("..")
    );
  } catch {
    return false;
  }
}

function mergeCatalogAttributeDefinitions(
  ...groups: AttributeDefinitionForValidation[][]
): AttributeDefinitionForValidation[] {
  const byKey = new Map<string, AttributeDefinitionForValidation>();
  for (const group of groups) {
    for (const definition of group) {
      const previous = byKey.get(definition.key);
      byKey.set(definition.key, {
        ...previous,
        ...definition,
        order_index: previous?.order_index ?? definition.order_index,
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.order_index - b.order_index);
}

function isSystemBackedProductAttributeDefinition(
  definition: Pick<AttributeDefinitionForValidation, "key" | "label">,
): boolean {
  const key = definition.key.trim().toLocaleLowerCase("ru-RU");
  const label = definition.label.trim().toLocaleLowerCase("ru-RU");
  return key === "condition_grade" || (key === "condition" && label === "состояние");
}

function filterCatalogAttributeDefinitionsForListingType(
  definitions: AttributeDefinitionForValidation[],
  type: "PRODUCT",
): AttributeDefinitionForValidation[] {
  if (type !== "PRODUCT") return definitions;
  return definitions.filter(
    (definition) => !isSystemBackedProductAttributeDefinition(definition),
  );
}

function findAttributeDefinitionValue(
  attributes: ListingAttributeInput[],
  definition: AttributeDefinitionForValidation,
): string {
  const direct = getAttributeValueByAnyKey(attributes, [definition.label, definition.key]);
  return direct;
}

function applyCatalogAttributeDefaults(
  attributes: ListingAttributeInput[],
  definitions: AttributeDefinitionForValidation[],
): ListingAttributeInput[] {
  const next = [...attributes];
  const existingKeys = new Set(next.map((attribute) => attribute.key.toLocaleLowerCase("ru-RU")));
  for (const definition of definitions) {
    const value = findAttributeDefinitionValue(next, definition);
    if (value || !definition.default_value) continue;
    const key = definition.label || definition.key;
    if (existingKeys.has(key.toLocaleLowerCase("ru-RU"))) continue;
    next.push({ key, value: definition.default_value });
    existingKeys.add(key.toLocaleLowerCase("ru-RU"));
  }
  return next;
}

function validateAttributesAgainstSchema(
  attributes: ListingAttributeInput[],
  definitions: AttributeDefinitionForValidation[],
): { ok: true } | { ok: false; error: string; reasonCode: string } {
  const schemaKeys = new Set<string>();
  for (const definition of definitions) {
    schemaKeys.add(definition.key.toLocaleLowerCase("ru-RU"));
    schemaKeys.add(definition.label.toLocaleLowerCase("ru-RU"));
  }

  for (const attribute of attributes) {
    const normalizedKey = attribute.key.toLocaleLowerCase("ru-RU");
    if (!normalizedKey.startsWith(META_ATTR_CUSTOM_PREFIX)) continue;
    const schemaKey = normalizedKey.slice(META_ATTR_CUSTOM_PREFIX.length);
    if (!schemaKeys.has(schemaKey)) continue;
    const suggestionError = validateCatalogSuggestionValue(attribute.value);
    if (suggestionError) {
      return {
        ok: false,
        error: suggestionError,
        reasonCode: "LISTING_ATTRIBUTE_CUSTOM_VALUE_INVALID",
      };
    }
  }

  for (const definition of definitions) {
    const value = findAttributeDefinitionValue(attributes, definition).trim();
    const customValue = getAttributeValue(
      attributes,
      `${META_ATTR_CUSTOM_PREFIX}${definition.key}`,
    ) || getAttributeValue(attributes, `${META_ATTR_CUSTOM_PREFIX}${definition.label}`);
    const hasCustomValue = Boolean(customValue.trim());
    if (definition.required && !value && !hasCustomValue) {
      return {
        ok: false,
        error: `Заполните характеристику: ${definition.label}`,
        reasonCode: "LISTING_REQUIRED_ATTRIBUTES_MISSING",
      };
    }
    if (!value) continue;

    if (definition.input_type === "number") {
      const numericValue = Number(value.replace(",", "."));
      if (!Number.isFinite(numericValue)) {
        return {
          ok: false,
          error: `Характеристика «${definition.label}» должна быть числом`,
          reasonCode: "LISTING_ATTRIBUTE_INVALID",
        };
      }
      if (definition.min_value !== null && numericValue < definition.min_value) {
        return {
          ok: false,
          error: `Характеристика «${definition.label}» должна быть не меньше ${definition.min_value}`,
          reasonCode: "LISTING_ATTRIBUTE_INVALID",
        };
      }
      if (definition.max_value !== null && numericValue > definition.max_value) {
        return {
          ok: false,
          error: `Характеристика «${definition.label}» должна быть не больше ${definition.max_value}`,
          reasonCode: "LISTING_ATTRIBUTE_INVALID",
        };
      }
    }

    const options = jsonStringArray(definition.options);
    if (definition.input_type === "select" && options.length === 0) {
      return {
        ok: false,
        error: `Справочник характеристики «${definition.label}» настроен без вариантов`,
        reasonCode: "LISTING_ATTRIBUTE_SCHEMA_INVALID",
      };
    }
    if (
      definition.input_type === "select" &&
      value === CUSTOM_VALUE_OPTION &&
      !hasCustomValue
    ) {
      return {
        ok: false,
        error: `Укажите предлагаемое значение: ${definition.label}`,
        reasonCode: "LISTING_ATTRIBUTE_CUSTOM_VALUE_REQUIRED",
      };
    }
    if (
      definition.input_type === "select" &&
      hasCustomValue &&
      value &&
      value !== CUSTOM_VALUE_OPTION
    ) {
      return {
        ok: false,
        error: `Предлагаемое значение характеристики «${definition.label}» отправляется только через пункт «${CUSTOM_VALUE_OPTION}»`,
        reasonCode: "LISTING_ATTRIBUTE_CUSTOM_VALUE_REQUIRES_SUGGESTION",
      };
    }
    if (definition.input_type === "select" && !options.includes(value)) {
      return {
        ok: false,
        error: `Выберите значение из списка: ${definition.label}`,
        reasonCode: "LISTING_ATTRIBUTE_INVALID",
      };
    }
    if (definition.input_type !== "select" && options.length > 0 && !options.includes(value)) {
      return {
        ok: false,
        error: `Выберите значение из списка: ${definition.label}`,
        reasonCode: "LISTING_ATTRIBUTE_INVALID",
      };
    }
  }

  return { ok: true };
}

function getSchemaValue(
  attributes: ListingAttributeInput[],
  key: string,
  label: string,
): string {
  return getAttributeValueByAnyKey(attributes, [key, label]);
}

async function validateItemSchemaConstraints(
  attributes: ListingAttributeInput[],
  selection: PartnerCatalogSelection,
): Promise<{ ok: true } | { ok: false; error: string; reasonCode: string }> {
  if (selection.isCustomItem) return { ok: true };

  const value = (key: string, label: string) => getSchemaValue(attributes, key, label);

  if (await findCatalogReferenceItem(selection.itemName)) {
    return validateCatalogReferenceCombination(selection.itemName, attributes);
  }

  if (selection.itemName === "Блок питания") {
    const power = Number(value("power", "Мощность").replace(",", "."));
    const gpuConnector = value("gpu_power_connector", "Питание видеокарты");
    const atxVersion = value("atx_version", "Стандарт ATX");
    const formFactor = value("form_factor", "Форм-фактор");
    if (Number.isFinite(power) && power < 500 && /12VHPWR|3x 8-pin/.test(gpuConnector)) {
      return {
        ok: false,
        error: "Блок питания до 500 Вт не может быть заявлен с флагманским GPU-питанием",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
    if (Number.isFinite(power) && power < 600 && (atxVersion === "ATX 3.0" || atxVersion === "ATX 3.1")) {
      return {
        ok: false,
        error: "ATX 3.x для блока питания ниже 600 Вт выглядит невозможной комбинацией",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
    if (formFactor === "Внешний адаптер" && Number.isFinite(power) && power > 330) {
      return {
        ok: false,
        error: "Внешний адаптер питания не должен быть мощнее 330 Вт",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  if (selection.itemName === "Стиральная машина") {
    const loadType = value("load_type", "Тип загрузки");
    const depth = Number(value("depth", "Глубина").replace(",", "."));
    if (loadType === "Вертикальная" && Number.isFinite(depth) && depth < 45) {
      return {
        ok: false,
        error: "Вертикальная стиральная машина не может иметь глубину меньше 45 см",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  if (selection.itemName === "Духовой шкаф") {
    const ovenType = value("oven_type", "Тип");
    const cleaningType = value("cleaning_type", "Очистка");
    if (ovenType === "Газовый" && cleaningType === "Пиролитическая") {
      return {
        ok: false,
        error: "Пиролитическая очистка доступна для электрических духовых шкафов, не для газовых",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  if (selection.itemName === "Холодильник") {
    const fridgeType = value("fridge_type", "Тип");
    const height = Number(value("height", "Высота").replace(",", "."));
    if (fridgeType === "Side-by-Side" && Number.isFinite(height) && height < 150) {
      return {
        ok: false,
        error: "Side-by-Side холодильник ниже 150 см выглядит невозможной комбинацией",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  return { ok: true };
}

function filterAttributesForCatalogSelection(
  attributes: ListingAttributeInput[],
  selection: PartnerCatalogSelection,
): ListingAttributeInput[] {
  const allowedSchemaKeys = new Set<string>();
  for (const definition of selection.attributeDefinitions) {
    allowedSchemaKeys.add(definition.key.toLocaleLowerCase("ru-RU"));
    allowedSchemaKeys.add(definition.label.toLocaleLowerCase("ru-RU"));
  }

  const allowedMetaKeys = selection.isCustomItem
    ? CUSTOM_ITEM_META_ATTRIBUTE_KEYS
    : CATALOG_META_ATTRIBUTE_KEYS;
  const next: ListingAttributeInput[] = [];
  const seen = new Set<string>();
  for (const attribute of attributes) {
    const key = attribute.key.trim();
    const value = attribute.value.trim();
    if (!key || !value) continue;
    const normalizedKey = key.toLocaleLowerCase("ru-RU");
    const isAllowed =
      allowedMetaKeys.has(normalizedKey) ||
      allowedSchemaKeys.has(normalizedKey) ||
      (!selection.isCustomItem &&
        normalizedKey === PUBLIC_ATTR_DEFECTS.toLocaleLowerCase("ru-RU"));
    if (!isAllowed) continue;
    if (normalizedKey.startsWith(META_ATTR_CUSTOM_PREFIX)) continue;
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    next.push({ key, value });
  }
  return next.slice(0, 60);
}

async function upsertCatalogSuggestion(params: {
  type: ListingTypeValue;
  categoryId: number | null;
  subcategoryId: number | null;
  itemId?: number | null;
  proposedById: number;
  rawValue: string;
  entityType: "CATEGORY" | "ITEM" | "MANUFACTURER" | "MODEL" | "ATTRIBUTE_VALUE" | "SUBCATEGORY" | "ATTRIBUTE_SCHEMA";
  reason: string;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  const normalizedValue = normalizeCatalogSuggestionValue(params.rawValue);
  const existing = await prisma.catalogSuggestion.findFirst({
    where: {
      entity_type: params.entityType,
      type: params.type,
      category_id: params.categoryId,
      subcategory_id: params.subcategoryId,
      normalized_value: normalizedValue,
    },
    select: { id: true, usage_count: true },
  });

  if (existing) {
    await prisma.catalogSuggestion.update({
      where: { id: existing.id },
      data: {
        usage_count: { increment: 1 },
        raw_value: params.rawValue.trim(),
        reason: params.reason,
        payload: params.payload ?? undefined,
      },
    });
    return;
  }

  await prisma.catalogSuggestion.create({
    data: {
      public_id: makePublicId("CSG"),
      entity_type: params.entityType,
      type: params.type,
      category_id: params.categoryId,
      subcategory_id: params.subcategoryId,
      item_id: params.itemId ?? null,
      proposed_by_id: params.proposedById,
      raw_value: params.rawValue.trim(),
      normalized_value: normalizedValue,
      reason: params.reason,
      payload: params.payload ?? undefined,
    },
  });
}

async function resolvePartnerCatalogSelection(params: {
  type: ListingTypeValue;
  rawCategory: string;
  attributes: ListingAttributeInput[];
}): Promise<PartnerCatalogSelectionResult> {
  const categoryName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_CATEGORY_ROOT));
  const subcategoryName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_SUBCATEGORY));
  const selectedItemName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_CATALOG_ITEM));
  const customItemName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_CATALOG_ITEM_CUSTOM));

  if (!categoryName || !subcategoryName || !selectedItemName) {
    return {
      ok: false,
      status: 400,
      error: "Выберите категорию, подкатегорию и вид из справочника",
      reasonCode: "LISTING_CATALOG_SELECTION_REQUIRED",
    };
  }

  const category = await prisma.catalogCategory.findFirst({
    where: {
      type: params.type,
      name: { equals: categoryName, mode: "insensitive" },
    },
    include: {
      attribute_definitions: true,
    },
  });

  if (!category) {
    const suggestionError = validateCatalogSuggestionValue(categoryName);
    if (suggestionError) {
      return {
        ok: false,
        status: 400,
        error: suggestionError,
        reasonCode: "LISTING_CATALOG_SUGGESTION_INVALID",
      };
    }
    return {
      ok: true,
      selection: {
        itemId: null,
        categoryId: null,
        subcategoryId: null,
        categoryName,
        subcategoryName,
        itemName: customItemName || selectedItemName,
        isCustomCategory: true,
        isCustomSubcategory: true,
        isCustomItem: true,
        attributeDefinitions: [],
      },
    };
  }

  const subcategory = await prisma.catalogSubcategory.findFirst({
    where: {
      category_id: category.id,
      name: { equals: subcategoryName, mode: "insensitive" },
    },
    include: {
      attribute_definitions: true,
    },
  });

  if (!subcategory) {
    const suggestionError = validateCatalogSuggestionValue(subcategoryName);
    if (suggestionError) {
      return {
        ok: false,
        status: 400,
        error: suggestionError,
        reasonCode: "LISTING_CATALOG_SUGGESTION_INVALID",
      };
    }
    return {
      ok: true,
      selection: {
        itemId: null,
        categoryId: category.id,
        subcategoryId: null,
        categoryName: category.name,
        subcategoryName,
        itemName: customItemName || selectedItemName,
        isCustomCategory: false,
        isCustomSubcategory: true,
        isCustomItem: true,
        attributeDefinitions: [],
      },
    };
  }

  const itemNameForLookup = customItemName ? "" : selectedItemName;
  const item = itemNameForLookup
    ? await prisma.catalogItem.findFirst({
        where: {
          subcategory_id: subcategory.id,
          name: { equals: itemNameForLookup, mode: "insensitive" },
        },
        include: {
          attribute_definitions: true,
        },
      })
    : null;

  const isCustomItem = Boolean(customItemName) || !item;
  const resolvedItemName = customItemName || selectedItemName;
  if (isCustomItem) {
    const suggestionError = validateCatalogSuggestionValue(resolvedItemName);
    if (suggestionError) {
      return {
        ok: false,
        status: 400,
        error: suggestionError,
        reasonCode: "LISTING_CATALOG_SUGGESTION_INVALID",
      };
    }
  }

  const isReferenceItem = !isCustomItem && item
    ? Boolean(await findCatalogReferenceItem(item.name))
    : false;
  const attributeDefinitions = filterCatalogAttributeDefinitionsForListingType(
    mergeCatalogAttributeDefinitions(
      category.attribute_definitions,
      subcategory.attribute_definitions,
      isReferenceItem ? [] : item?.attribute_definitions ?? [],
      isReferenceItem && item
        ? await catalogReferenceAttributeDefinitions(item.name, params.attributes)
        : [],
    ),
    params.type,
  );

  return {
    ok: true,
    selection: {
      itemId: isCustomItem ? null : item?.id ?? null,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      categoryName: category.name,
      subcategoryName: subcategory.name,
      itemName: resolvedItemName,
      isCustomCategory: false,
      isCustomSubcategory: false,
      isCustomItem,
      attributeDefinitions,
    },
  };
}

async function createCatalogSuggestionsForListing(params: {
  type: ListingTypeValue;
  sellerId: number;
  attributes: ListingAttributeInput[];
  selection: PartnerCatalogSelection;
  listingPublicId?: string;
  title?: string;
}): Promise<void> {
  const requestBrand =
    getAttributeValue(params.attributes, "brand") ||
    getAttributeValue(params.attributes, "manufacturer") ||
    getAttributeValue(params.attributes, "Производитель / бренд");
  const requestModel =
    getAttributeValue(params.attributes, "model") ||
    getAttributeValue(params.attributes, "Модель");
  const requestImportantAttributes =
    getAttributeValue(params.attributes, META_ATTR_CATALOG_REQUEST_ATTRIBUTES);
  const requestComment = getAttributeValue(
    params.attributes,
    META_ATTR_CATALOG_REQUEST_COMMENT,
  );
  const hasRequestLink = /^Ссылка:\s*\S+/imu.test(requestComment ?? "");
  const hasRequestEmail = /^Почта:\s*\S+/imu.test(requestComment ?? "");
  const hasRequestPhoto = /^Фото\s+(?:товара|наклейки|товара,\s*упаковки\s+или\s+маркировки):\s*\S+/imu.test(
    requestComment ?? "",
  );

  if (
    !requestBrand ||
    !requestModel ||
    !requestImportantAttributes ||
    !hasRequestLink ||
    !hasRequestEmail ||
    !hasRequestPhoto
  ) {
    return;
  }

  const basePayload: Prisma.InputJsonObject = {
    categoryName: params.selection.categoryName,
    subcategoryName: params.selection.subcategoryName,
    proposedItem: params.selection.itemName,
    brand: requestBrand,
    model: requestModel,
    importantAttributes: requestImportantAttributes,
    comment: requestComment,
    listingPublicId: params.listingPublicId ?? null,
    title: params.title ?? null,
  };
  if (params.selection.isCustomCategory) {
    await upsertCatalogSuggestion({
      type: params.type,
      categoryId: null,
      subcategoryId: null,
      proposedById: params.sellerId,
      rawValue: params.selection.categoryName,
      entityType: "CATEGORY",
      reason: "seller_custom_catalog_category",
      payload: basePayload,
    });
    return;
  }

  if (params.selection.isCustomSubcategory) {
    await upsertCatalogSuggestion({
      type: params.type,
      categoryId: params.selection.categoryId,
      subcategoryId: null,
      proposedById: params.sellerId,
      rawValue: params.selection.subcategoryName,
      entityType: "SUBCATEGORY",
      reason: "seller_custom_catalog_subcategory",
      payload: basePayload,
    });
    return;
  }

  if (params.selection.isCustomItem) {
    await upsertCatalogSuggestion({
      type: params.type,
      categoryId: params.selection.categoryId,
      subcategoryId: params.selection.subcategoryId,
      proposedById: params.sellerId,
      rawValue: params.selection.itemName,
      entityType: "ITEM",
      reason: "seller_custom_catalog_item",
      payload: basePayload,
    });
  }

  for (const definition of params.selection.attributeDefinitions) {
    const value =
      getAttributeValue(params.attributes, `${META_ATTR_CUSTOM_PREFIX}${definition.key}`) ||
      getAttributeValue(params.attributes, `${META_ATTR_CUSTOM_PREFIX}${definition.label}`);
    if (!value) continue;
    const suggestionError = validateCatalogSuggestionValue(value);
    if (suggestionError) continue;
    await upsertCatalogSuggestion({
      type: params.type,
      categoryId: params.selection.categoryId,
      subcategoryId: params.selection.subcategoryId,
      itemId: params.selection.itemId,
      proposedById: params.sellerId,
      rawValue: value,
      entityType: definition.key === "manufacturer" ? "MANUFACTURER" : "ATTRIBUTE_VALUE",
      reason: "seller_custom_attribute_value",
      payload: {
        ...basePayload,
        attributeKey: definition.key,
        attributeLabel: definition.label,
      },
    });
  }
}

function listingImageUrl(images: ListingImage[]): string {
  return images[0]?.url ?? FALLBACK_LISTING_IMAGE;
}

function extractSellerCity(seller: { addresses: Array<{ city: string }> }): string | null {
  const city = seller.addresses[0]?.city?.trim();
  return city || null;
}

function safeJsonPayload(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

function draftToClient(draft: {
  public_id: string;
  title: string | null;
  type: ListingTypeValue;
  category_id: number | null;
  subcategory_id: number | null;
  item_id: number | null;
  payload: Prisma.JsonValue;
  current_screen: string;
  updated_at: Date;
  created_at: Date;
}) {
  return {
    id: draft.public_id,
    title: draft.title ?? "",
    type: "products",
    categoryId: draft.category_id,
    subcategoryId: draft.subcategory_id,
    itemId: draft.item_id,
    payload: draft.payload,
    currentScreen: draft.current_screen,
    updatedAt: draft.updated_at,
    createdAt: draft.created_at,
  };
}

type CreateSuggestionCatalogItem = CatalogItem & {
  subcategory: CatalogSubcategory & {
    category: CatalogCategory;
  };
};

function createSuggestionTokens(value: string): string[] {
  return normalizeSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function genericCatalogItemScore(
  query: string,
  item: CreateSuggestionCatalogItem,
): number {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedItem = normalizeSearchText(item.name);
  if (!normalizedQuery || !normalizedItem) return 0;

  const queryTokens = createSuggestionTokens(query);
  const itemTokens = createSuggestionTokens(item.name);
  let score = 0;

  if (normalizedItem === normalizedQuery) score += 100;
  if (normalizedItem.includes(normalizedQuery)) score += 70;
  if (normalizedQuery.includes(normalizedItem)) score += 65;

  for (const queryToken of queryTokens) {
    if (normalizedItem.includes(queryToken)) score += 34;
    for (const itemToken of itemTokens) {
      if (itemToken === queryToken) score += 18;
      else if (itemToken.startsWith(queryToken) || queryToken.startsWith(itemToken)) {
        score += 12;
      }
    }
  }

  const normalizedSubcategory = normalizeSearchText(item.subcategory.name);
  const normalizedCategory = normalizeSearchText(item.subcategory.category.name);
  if (normalizedSubcategory && normalizedQuery.includes(normalizedSubcategory)) score += 10;
  if (normalizedCategory && normalizedQuery.includes(normalizedCategory)) score += 6;

  score -= Math.min(12, Math.floor(normalizedItem.length / 18));
  return Math.max(0, Math.min(score, 100));
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
    include: {
      subcategory: {
        include: {
          category: true,
        },
      },
    },
    orderBy: [{ order_index: "asc" }, { id: "asc" }],
    take: 80,
  });
}

partnerListingsRouter.get("/listings", async (req: Request, res: Response) => {
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
        moderation_events: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      listings.map((listing) => {
        const latestModeration = listing.moderation_events[0] ?? null;
        return {
          id: listing.public_id,
          title: listing.title,
          price: listing.price,
          condition: toClientListingState({
            condition: listing.condition as ListingConditionValue,
            attributes: listing.attributes,
          }),
          status: toPartnerListingStatus(listing.status),
          moderationStatus: listing.moderation_status.toLowerCase(),
          moderation: {
            status: listing.moderation_status.toLowerCase(),
            reasonCode: latestModeration?.reason_code ?? null,
            reasonNote: latestModeration?.reason_note ?? null,
            decidedAt: latestModeration?.created_at ?? null,
          },
          views: listing.views,
          created_at: listing.created_at,
          image: listingImageUrl(listing.images),
          images: listing.images.map((image) => image.url),
          description: listing.description,
          city: extractSellerCity(listing.seller),
          category: listingCategoryNameForClient(listing.item, listing.attributes),
          techState: toClientTechState({
            grade: listing.tech_grade,
            batteryHealth: listing.tech_battery_health,
            defects: listing.tech_defects,
            included: listing.tech_included,
          }),
          attributes: listing.attributes.map((attribute) => ({
            key: attribute.key,
            value: attribute.value,
          })),
        };
      }),
    );
  } catch (error) {
    console.error("Error fetching partner listings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerListingsRouter.get("/listings/title-suggestions", async (req: Request, res: Response) => {
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

partnerListingsRouter.get("/listings/create-suggestions", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const type = parseListingType(req.query.type);
    const referenceSuggestions =
      type === "PRODUCT" && query.length >= 2
        ? await findCatalogReferenceCreateSuggestions(query, type)
        : [];
    const titleSuggestions =
      type === "PRODUCT" ? catalogReferenceTitleSuggestions(query, referenceSuggestions) : [];
    const chips = titleSuggestions;
    if (type !== "PRODUCT" || query.length < 2) {
      res.json({ query, chips, titleSuggestions, matches: [] });
      return;
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

    if (referenceSuggestions.length > 0) {
      const referenceItemNames = Array.from(
        new Set(referenceSuggestions.map((suggestion) => suggestion.itemName)),
      );
      const referenceCatalogItems = await prisma.catalogItem.findMany({
        where: {
          name: {
            in: referenceItemNames,
          },
          subcategory: {
            category: {
              type,
            },
          },
        },
        include: {
          subcategory: {
            include: {
              category: true,
            },
          },
        },
      });
      const catalogItemByName = new Map(
        referenceCatalogItems.map((item) => [item.name, item]),
      );
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
      }
    }

    const catalogItems = await findGenericCreateSuggestionItems(query, type);
    for (const item of catalogItems) {
      if (seenItemIds.has(item.public_id)) continue;
      const score = genericCatalogItemScore(query, item);
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
    }

    res.json({
      query,
      chips,
      titleSuggestions,
      matches: matches
        .sort((a, b) => b.score - a.score || a.itemName.localeCompare(b.itemName, "ru"))
        .slice(0, 8),
    });
  } catch (error) {
    console.error("Error getting create suggestions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerListingsRouter.post("/listings/catalog-requests", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const mode = readTrimmedBodyString(body, "mode") === "catalog" ? "catalog" : "characteristic";
    const categoryName = readTrimmedBodyString(body, "categoryName");
    const subcategoryName = readTrimmedBodyString(body, "subcategoryName");
    const itemName = readTrimmedBodyString(body, "itemName");
    const brand = readTrimmedBodyString(body, "brand");
    const model = readTrimmedBodyString(body, "model");
    const importantAttributes = readTrimmedBodyString(body, "importantAttributes");
    const comment = readTrimmedBodyString(body, "comment");
    const link = readTrimmedBodyString(body, "link");
    const email = readTrimmedBodyString(body, "email");
    const photoName = readTrimmedBodyString(body, "photoName");
    const photoLabel = readTrimmedBodyString(body, "photoLabel");
    const title = readTrimmedBodyString(body, "title");
    const type: ListingTypeValue = "PRODUCT";

    const requiredFields = [
      [categoryName, "Укажите категорию"],
      [subcategoryName, "Укажите подкатегорию"],
      [itemName, "Укажите вид товара"],
      [brand, "Укажите бренд"],
      [model, "Укажите модель"],
      [importantAttributes.length >= 10 ? importantAttributes : "", "Опишите важные характеристики"],
      [photoName, "Прикрепите фото товара"],
      [link, "Укажите ссылку на описание"],
      [email, "Укажите почту продавца"],
    ] as const;
    const missing = requiredFields.find(([value]) => !value);
    if (missing) {
      res.status(400).json({ error: missing[1] });
      return;
    }

    for (const value of [categoryName, subcategoryName, itemName]) {
      const suggestionError = validateCatalogSuggestionValue(value);
      if (suggestionError) {
        res.status(400).json({ error: suggestionError });
        return;
      }
    }
    if (!isValidCatalogRequestUrl(link)) {
      res.status(400).json({
        error: "Укажите корректную ссылку на сайт, например example.com или https://example.ru",
      });
      return;
    }
    if (!isValidCatalogRequestEmail(email)) {
      res.status(400).json({
        error: "Укажите корректную почту, например seller@example.ru",
      });
      return;
    }

    const category = await prisma.catalogCategory.findFirst({
      where: { type, name: { equals: categoryName, mode: "insensitive" } },
      select: { id: true, public_id: true, name: true },
    });
    const subcategory = category
      ? await prisma.catalogSubcategory.findFirst({
          where: {
            category_id: category.id,
            name: { equals: subcategoryName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        })
      : null;
    const item = subcategory
      ? await prisma.catalogItem.findFirst({
          where: {
            subcategory_id: subcategory.id,
            name: { equals: itemName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        })
      : null;

    const payload: Prisma.InputJsonObject = {
      categoryName,
      subcategoryName,
      proposedItem: itemName,
      brand,
      model,
      importantAttributes,
      comment,
      link,
      email,
      photoName,
      photoLabel,
      listingPublicId: null,
      title: title || null,
      requestMode: mode,
    };

    let entityType: "CATEGORY" | "SUBCATEGORY" | "ITEM" = "ITEM";
    let rawValue = itemName;
    let reason = mode === "catalog" ? "seller_custom_catalog_item" : "seller_catalog_reference_request";
    if (mode === "catalog" && !category) {
      entityType = "CATEGORY";
      rawValue = categoryName;
      reason = "seller_custom_catalog_category";
    } else if (mode === "catalog" && !subcategory) {
      entityType = "SUBCATEGORY";
      rawValue = subcategoryName;
      reason = "seller_custom_catalog_subcategory";
    }

    await upsertCatalogSuggestion({
      type,
      categoryId: category?.id ?? null,
      subcategoryId: subcategory?.id ?? null,
      itemId: item?.id ?? null,
      proposedById: session.user.id,
      rawValue,
      entityType,
      reason,
      payload,
    });

    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Error creating catalog request:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Не удалось отправить запрос",
    });
  }
});

partnerListingsRouter.get("/listings/catalog-reference", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const itemName = typeof req.query.item === "string" ? req.query.item.trim() : "";
    const brand = typeof req.query.brand === "string" ? req.query.brand.trim() : "";
    const model = typeof req.query.model === "string" ? req.query.model.trim() : "";
    if (!itemName) {
      res.status(400).json({ error: "Catalog item is required" });
      return;
    }

    const brandOptions = await catalogReferenceBrandOptions(itemName);
    if (!brandOptions) {
      res.json({
        item: itemName,
        supported: false,
        brands: [],
      });
      return;
    }

    if (!brand) {
      res.json({
        item: brandOptions.itemName,
        supported: true,
        brands: brandOptions.brands,
      });
      return;
    }

    const modelOptions = await catalogReferenceModelOptions(itemName, brand);
    if (!modelOptions) {
      res.json({
        item: brandOptions.itemName,
        supported: true,
        brand,
        models: [],
      });
      return;
    }

    if (!model) {
      res.json({
        item: modelOptions.itemName,
        supported: true,
        brand: modelOptions.brand,
        models: modelOptions.models,
      });
      return;
    }

    const selected = await findCatalogReferenceSelectedModel(itemName, brand, model);
    if (!selected) {
      res.json({
        item: modelOptions.itemName,
        supported: true,
        brand: modelOptions.brand,
        model,
        variants: [],
        characteristics: [],
        fields: [],
      });
      return;
    }

    const selectedVariant = firstCatalogReferenceVariant(selected.model);
    const fields = catalogReferenceFields(selected.model);
    res.json({
      item: selected.itemName,
      supported: true,
      brand: selected.brand.brand,
      model: selected.model.model,
      variants: selected.model.variants.map((variant) => ({
        productId: variant.productId,
        title: variant.title,
        characteristics: aggregateCatalogReferenceCharacteristics(variant.characteristics),
      })),
      characteristics: selectedVariant
        ? aggregateCatalogReferenceCharacteristics(selectedVariant.characteristics)
        : [],
      fields,
    });
  } catch (error) {
    console.error("Error getting catalog reference:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerListingsRouter.get("/listings/category-guess", async (req: Request, res: Response) => {
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

partnerListingsRouter.post("/listings", async (req: Request, res: Response) => {
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
      imageModerationSignals?: unknown;
      attributes?: unknown;
      techState?: unknown;
      type?: unknown;
      draftId?: unknown;
    };

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const price = Number(body.price ?? 0);
    const listingState = parseListingState(body.condition);
    const condition = toDbCondition(listingState);
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
    const imageModerationSignals = normalizeImageModerationSignals(
      body.imageModerationSignals,
    );
    const type = parseListingType(body.type);
    const draftId = typeof body.draftId === "string" ? body.draftId.trim() : "";
    let attributes = normalizeAttributes(body.attributes);
    const techState = normalizeListingTechState(body.techState);

    if (!title || !Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: "Provide valid title and price" });
      return;
    }

    const catalogSelection = await resolvePartnerCatalogSelection({
      type,
      rawCategory: category,
      attributes,
    });
    if (!catalogSelection.ok) {
      res.status(catalogSelection.status).json({
        error: catalogSelection.error,
        reasonCode: catalogSelection.reasonCode,
      });
      return;
    }

    attributes = applyCatalogAttributeDefaults(
      attributes,
      catalogSelection.selection.attributeDefinitions,
    );
    const attributeValidation = validateAttributesAgainstSchema(
      attributes,
      catalogSelection.selection.attributeDefinitions,
    );
    if (!attributeValidation.ok) {
      res.status(400).json({
        error: attributeValidation.error,
        reasonCode: attributeValidation.reasonCode,
      });
      return;
    }
    const constraintValidation = await validateItemSchemaConstraints(
      attributes,
      catalogSelection.selection,
    );
    if (!constraintValidation.ok) {
      res.status(400).json({
        error: constraintValidation.error,
        reasonCode: constraintValidation.reasonCode,
      });
      return;
    }
    const suggestionAttributes = attributes;
    attributes = filterAttributesForCatalogSelection(
      attributes,
      catalogSelection.selection,
    );

    if (session.user.role !== ROLE_ADMIN) {
      const onboardingAccess = await validateSellerOnboardingForListing({
        sellerId: session.user.id,
        category: catalogSelection.selection.categoryName,
      });
      if (!onboardingAccess.ok) {
        res.status(onboardingAccess.status).json({ error: onboardingAccess.error });
        return;
      }
    }

    const qualityValidation = validateListingQuality({
      type,
      images,
      techState,
    });
    if (!qualityValidation.ok) {
      res.status(400).json({
        error: qualityValidation.error,
        reasonCode: qualityValidation.reasonCode,
      });
      return;
    }

    const itemId = catalogSelection.selection.itemId;
    const imageUrl = images[0];
    const roundedPrice = Math.round(price);
    const persistedAttributes = mergeListingStateAttributes({
      attributes,
      listingState,
    });
    const createdRow = await prisma.$transaction(async (tx) => {
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
          tech_grade: techState?.grade ?? null,
          tech_battery_health: techState?.batteryHealthPercent ?? null,
          tech_defects: techState?.defects ?? null,
          tech_included: techState?.included ?? null,
          photo_count: images.length,
          photo_front_present: false,
          photo_back_present: false,
          photo_left_present: false,
          photo_right_present: false,
          status: LISTING_MODERATION,
          moderation_status: "PENDING",
        },
        select: {
          id: true,
          public_id: true,
          title: true,
          price: true,
        },
      });

      await tx.listingImage.createMany({
        data: images.map((url, index) => ({
          listing_id: listing.id,
          url,
          sort_order: index,
        })),
      });

      if (persistedAttributes.length > 0) {
        await tx.listingAttribute.createMany({
          data: persistedAttributes.map((attribute, index) => ({
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
        select: {
          id: true,
          public_id: true,
          title: true,
          price: true,
        },
      });
    });

    const created = await prisma.marketplaceListing.findUnique({
      where: { id: createdRow.id },
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

    if (!created) {
      throw new Error("Created listing not found after transaction");
    }

    await createCatalogSuggestionsForListing({
      type,
      sellerId: session.user.id,
      attributes: suggestionAttributes,
      selection: catalogSelection.selection,
      listingPublicId: created.public_id,
      title: created.title,
    }).catch((error) => {
      console.error("Error saving catalog suggestion:", error);
    });

    await writeListingModerationEvent({
      listingId: created.id,
      actorUserId: null,
      actorType: "SYSTEM",
      decision: "QUEUED",
      reasonCode: "QUEUED_FOR_BACKGROUND_MODERATION",
      reasonNote: "Listing queued for automatic moderation",
        metadata: {
          source: "partner.create",
          imageModerationSignals,
        },
      });

    await notifyAdmins({
      type: "SYSTEM",
      message: `Новое объявление «${created.title}» ожидает модерации.`,
      targetUrl: buildTargetUrl("admin", "listings"),
    });

    queueListingAutoModeration({
      listingId: created.id,
      sellerId: session.user.id,
      title,
      description,
      category: catalogSelection.selection.itemName || category,
      price: roundedPrice,
      imageUrl,
      imageModerationSignals,
    });

    if (draftId) {
      await prisma.listingDraft
        .deleteMany({
          where: {
            public_id: draftId,
            seller_id: session.user.id,
          },
        })
        .catch((error) => {
          console.error("Error deleting submitted draft:", error);
        });
    }

    res.status(201).json({
      id: created.public_id,
      title: created.title,
      price: created.price,
      condition: toClientListingState({
        condition: created.condition as ListingConditionValue,
        attributes: created.attributes,
      }),
      status: toPartnerListingStatus(created.status),
      moderationStatus: created.moderation_status.toLowerCase(),
      views: created.views,
      created_at: created.created_at,
      image: listingImageUrl(created.images),
      images: created.images.map((listingImage) => listingImage.url),
      description: created.description,
      category: listingCategoryNameForClient(created.item, created.attributes),
      city: extractSellerCity(created.seller),
      techState: toClientTechState({
        grade: created.tech_grade,
        batteryHealth: created.tech_battery_health,
        defects: created.tech_defects,
        included: created.tech_included,
      }),
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

partnerListingsRouter.patch(
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
          attributes: {
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
        imageModerationSignals?: unknown;
        attributes?: unknown;
        techState?: unknown;
      };

      const price = body.price === undefined ? undefined : Number(body.price);
      if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
        res.status(400).json({ error: "Invalid price" });
        return;
      }

      const nextCategory =
        typeof body.category === "string" ? body.category.trim() : undefined;
      const existingAttributeInputs = existing.attributes.map((attribute) => ({
        key: attribute.key,
        value: attribute.value,
      }));
      let nextAttributes =
        body.attributes === undefined ? undefined : normalizeAttributes(body.attributes);
      let catalogSelection: PartnerCatalogSelection | null = null;
      let nextItemId: number | null | undefined = undefined;
      let nextCategoryForModeration = listingCategoryNameForClient(
        existing.item,
        existing.attributes,
      );
      if (nextCategory !== undefined || nextAttributes !== undefined) {
        const selectionAttributes = ensureCatalogMetaAttributes(
          nextAttributes ?? existingAttributeInputs,
          existing.item,
        );
        const selectionResult = await resolvePartnerCatalogSelection({
          type: existing.type as ListingTypeValue,
          rawCategory: nextCategory ?? nextCategoryForModeration,
          attributes: selectionAttributes,
        });
        if (!selectionResult.ok) {
          res.status(selectionResult.status).json({
            error: selectionResult.error,
            reasonCode: selectionResult.reasonCode,
          });
          return;
        }

        catalogSelection = selectionResult.selection;
        nextItemId = catalogSelection.itemId;
        nextCategoryForModeration = catalogSelection.itemName;

        nextAttributes = applyCatalogAttributeDefaults(
          selectionAttributes,
          catalogSelection.attributeDefinitions,
        );
        const attributeValidation = validateAttributesAgainstSchema(
          nextAttributes,
          catalogSelection.attributeDefinitions,
        );
        if (!attributeValidation.ok) {
          res.status(400).json({
            error: attributeValidation.error,
            reasonCode: attributeValidation.reasonCode,
          });
          return;
        }
        const constraintValidation = await validateItemSchemaConstraints(
          nextAttributes,
          catalogSelection,
        );
        if (!constraintValidation.ok) {
          res.status(400).json({
            error: constraintValidation.error,
            reasonCode: constraintValidation.reasonCode,
          });
          return;
        }
        const suggestionAttributes = nextAttributes;
        nextAttributes = filterAttributesForCatalogSelection(
          nextAttributes,
          catalogSelection,
        );
        (catalogSelection as PartnerCatalogSelection & {
          suggestionAttributes?: ListingAttributeInput[];
        }).suggestionAttributes = suggestionAttributes;

        if (session.user.role !== ROLE_ADMIN) {
          const onboardingAccess = await validateSellerOnboardingForListing({
            sellerId: session.user.id,
            category: catalogSelection.categoryName,
          });
          if (!onboardingAccess.ok) {
            res.status(onboardingAccess.status).json({ error: onboardingAccess.error });
            return;
          }
        }
      }
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
      const imageModerationSignals = normalizeImageModerationSignals(
        body.imageModerationSignals,
      );
      if (nextImages !== undefined && nextImages.length === 0) {
        res.status(400).json({ error: "Provide at least one image" });
        return;
      }
      const incomingListingState =
        body.condition === undefined ? undefined : parseListingState(body.condition);
      const incomingTechState =
        body.techState === undefined ? undefined : normalizeListingTechState(body.techState);
      if (body.techState !== undefined && !incomingTechState) {
        res.status(400).json({
          error: "Invalid techState payload",
          reasonCode: "QUALITY_TECH_FIELDS_INCOMPLETE",
        });
        return;
      }
      const normalizedExistingTechState = normalizeListingTechState({
        grade: existing.tech_grade,
        batteryHealthPercent: existing.tech_battery_health,
        defects: existing.tech_defects,
        included: existing.tech_included,
      });
      const nextTechState: ListingTechState | null =
        incomingTechState ?? normalizedExistingTechState;
      const nextTitle =
        typeof body.title === "string" ? body.title.trim() : existing.title;
      const nextDescription =
        typeof body.description === "string"
          ? body.description.trim()
          : existing.description ?? "";
      const nextPrice =
        price === undefined ? existing.price : Math.round(price);
      const nextImageForModeration =
        nextImages === undefined
          ? existing.images[0]?.url ?? FALLBACK_LISTING_IMAGE
          : nextImages[0];
      const qualityValidation = validateListingQuality({
        type: existing.type as ListingTypeValue,
        images:
          nextImages ??
          existing.images.map((image) => image.url),
        techState: nextTechState,
      });
      if (!qualityValidation.ok) {
        res.status(400).json({
          error: qualityValidation.error,
          reasonCode: qualityValidation.reasonCode,
        });
        return;
      }
      const updated = await prisma.$transaction(async (tx) => {
        const nextListingState =
          incomingListingState ??
          toClientListingState({
            condition: existing.condition as ListingConditionValue,
            attributes: existing.attributes,
          });
        const listing = await tx.marketplaceListing.update({
          where: { id: existing.id },
          data: {
            title: typeof body.title === "string" ? body.title.trim() : undefined,
            price: price === undefined ? undefined : Math.round(price),
            condition:
              body.condition === undefined
                ? undefined
                : toDbCondition(nextListingState),
            description:
              typeof body.description === "string"
                ? body.description.trim()
                : undefined,
            item_id: nextItemId,
            tech_grade: nextTechState?.grade ?? null,
            tech_battery_health: nextTechState?.batteryHealthPercent ?? null,
            tech_defects: nextTechState?.defects ?? null,
            tech_included: nextTechState?.included ?? null,
            photo_count: nextImages?.length ?? existing.images.length,
            photo_front_present: false,
            photo_back_present: false,
            photo_left_present: false,
            photo_right_present: false,
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

        const shouldReplaceAttributes =
          nextAttributes !== undefined || incomingListingState !== undefined;
        if (shouldReplaceAttributes) {
          const baseAttributes =
            nextAttributes ??
            existingAttributeInputs;
          const mergedAttributes = mergeListingStateAttributes({
            attributes: baseAttributes,
            listingState: nextListingState,
          });
          await tx.listingAttribute.deleteMany({
            where: { listing_id: listing.id },
          });
          if (mergedAttributes.length > 0) {
            await tx.listingAttribute.createMany({
              data: mergedAttributes.map((attribute, index) => ({
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

      if (catalogSelection && nextAttributes) {
        await createCatalogSuggestionsForListing({
          type: existing.type as ListingTypeValue,
          sellerId: session.user.id,
          attributes:
            (catalogSelection as PartnerCatalogSelection & {
              suggestionAttributes?: ListingAttributeInput[];
            }).suggestionAttributes ?? nextAttributes,
          selection: catalogSelection,
          listingPublicId: updated.public_id,
          title: updated.title,
        }).catch((error) => {
          console.error("Error saving catalog suggestion:", error);
        });
      }

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
        imageModerationSignals,
      });

      await writeListingModerationEvent({
        listingId: reloaded.id,
        actorUserId: null,
        actorType: "SYSTEM",
        decision: "QUEUED",
        reasonCode: "QUEUED_FOR_BACKGROUND_MODERATION",
        reasonNote: "Listing re-queued after partner update",
        metadata: {
          source: "partner.update",
          imageModerationSignals,
        },
      });

      res.json({
        id: reloaded.public_id,
        title: reloaded.title,
        price: reloaded.price,
        condition: toClientListingState({
          condition: reloaded.condition as ListingConditionValue,
          attributes: reloaded.attributes,
        }),
        status: toPartnerListingStatus(reloaded.status),
        moderationStatus: reloaded.moderation_status.toLowerCase(),
        views: reloaded.views,
        created_at: reloaded.created_at,
        image: listingImageUrl(reloaded.images),
        images: reloaded.images.map((listingImage) => listingImage.url),
        description: reloaded.description,
        category: listingCategoryNameForClient(reloaded.item, reloaded.attributes),
        city: extractSellerCity(reloaded.seller),
        techState: toClientTechState({
          grade: reloaded.tech_grade,
          batteryHealth: reloaded.tech_battery_health,
          defects: reloaded.tech_defects,
          included: reloaded.tech_included,
        }),
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

partnerListingsRouter.post(
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

partnerListingsRouter.patch(
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

partnerListingsRouter.delete(
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
export { partnerListingsRouter };
