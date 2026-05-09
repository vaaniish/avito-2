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
  createCdekDeliveryForPreparedOrder,
  fetchTrackingStatus,
  type DeliveryExternalStatus,
  type DeliveryProviderCode,
  validateTrackingNumber,
} from "./order-delivery";
import {
  toPartnerListingStatus,
  toQuestionStatus,
} from "../../utils/format";
import { detectCircumventionSignals } from "../moderation/anti-circumvention";
import { enforceCircumventionViolation } from "../moderation/circumvention-enforcement";
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
  createNotifications,
  listingModerationNotification,
  notifyAdmins,
} from "../notifications/notification.service";
import {
  FINANCE_ORDER_LABELS,
  FINANCE_SETTLEMENT_BUCKETS,
  FINANCE_TRANSACTION_LABELS,
  financePeriodKey,
  getFinanceSettlementBucket,
  isFinanceActiveOrder,
  isFinancePayableStatus,
  parseFinanceDateRange,
  parseFinanceOrderStatus,
  parseFinanceReportLimit,
  parseFinanceReportOffset,
  parseFinanceTransactionStatus,
  type FinanceOrderStatus,
  type FinanceSettlementBucket,
  type FinanceSettlementBucketKey,
  type FinanceTransactionStatus,
} from "../finance/finance.shared";

const partnerRouter = Router();
type ListingTypeValue = "PRODUCT";
type ListingConditionValue = "NEW" | "USED";
type ListingStateValue = "new" | "restored" | "used";
type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";
type OrderStatusValue = FinanceOrderStatus;
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
const MVP_PRODUCT_ITEM_PUBLIC_IDS = new Set([
  "ITM-001",
  "ITM-003",
  "ITM-037",
  "ITM-042",
  "ITM-047",
  "ITM-065",
  "ITM-013",
  "ITM-066",
  "ITM-005",
  "ITM-006",
]);
const PUBLIC_ATTR_DEFECTS = "Дефекты";
const AVITO_ATTR_CONDITION = "Состояние";
const REFERENCE_ATTR_BRAND_KEY = "brand";
const REFERENCE_ATTR_MODEL_KEY = "model";
const REFERENCE_ATTR_BRAND_LABEL = "Бренд";
const REFERENCE_ATTR_MODEL_LABEL = "Модель";
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
  if (value === "cdek") return "cdek";
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

async function validateSellerOnboardingForListing(params: {
  sellerId: number;
  category: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
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

  let request = await prisma.partnershipRequest.findFirst({
    where: {
      user_id: params.sellerId,
      status: "APPROVED",
    },
    orderBy: [{ reviewed_at: "desc" }, { created_at: "desc" }],
    include: {
      onboarding_profile: true,
    },
  }).catch(async () => {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: { user_id: params.sellerId },
      select: { is_verified: true },
    });
    return sellerProfile?.is_verified ? null : undefined;
  });

  if (!request) {
    const limitedRows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id
      FROM "PartnershipRequest"
      WHERE user_id = ${params.sellerId}
        AND status::text = 'APPROVED_LIMITED'
      ORDER BY reviewed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `.catch(() => []);
    const limitedId = limitedRows[0]?.id;
    if (limitedId) {
      request = await prisma.partnershipRequest.findUnique({
        where: { id: limitedId },
        include: { onboarding_profile: true },
      }).catch(() => null);
    }
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

function makePublicId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
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

function normalizeCategory(category: string): string {
  const normalized = category.trim();
  return normalized || "No category";
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

partnerRouter.get("/listings/create-suggestions", async (req: Request, res: Response) => {
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

partnerRouter.post("/listings/catalog-requests", async (req: Request, res: Response) => {
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

partnerRouter.get("/listings/catalog-reference", async (req: Request, res: Response) => {
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

partnerRouter.get("/listing-drafts", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }
    const type = parseListingType(req.query.type);
    const drafts = await prisma.listingDraft.findMany({
      where: {
        seller_id: session.user.id,
        type,
      },
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
      take: 3,
    });
    res.json(drafts.map(draftToClient));
  } catch (error) {
    console.error("Error fetching listing drafts:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.post("/listing-drafts", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as {
      type?: unknown;
      title?: unknown;
      categoryId?: unknown;
      subcategoryId?: unknown;
      itemId?: unknown;
      payload?: unknown;
      currentScreen?: unknown;
    };
    const draftType = parseListingType(body.type);
    const created = await prisma.$transaction(async (tx) => {
      const draft = await tx.listingDraft.create({
        data: {
          public_id: makePublicId("DRFTMP"),
          seller_id: session.user.id,
          type: draftType,
          title: typeof body.title === "string" ? body.title.trim().slice(0, 160) : null,
          category_id: Number.isInteger(Number(body.categoryId)) ? Number(body.categoryId) : null,
          subcategory_id: Number.isInteger(Number(body.subcategoryId)) ? Number(body.subcategoryId) : null,
          item_id: Number.isInteger(Number(body.itemId)) ? Number(body.itemId) : null,
          payload: safeJsonPayload(body.payload),
          current_screen:
            typeof body.currentScreen === "string"
              ? body.currentScreen.trim().slice(0, 40) || "start"
              : "start",
        },
      });
      const updated = await tx.listingDraft.update({
        where: { id: draft.id },
        data: {
          public_id: formatDraftPublicId(draft.id),
        },
      });
      const staleDrafts = await tx.listingDraft.findMany({
        where: {
          seller_id: session.user.id,
          type: draftType,
          id: { not: updated.id },
        },
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        skip: 2,
        select: { id: true },
      });
      if (staleDrafts.length > 0) {
        await tx.listingDraft.deleteMany({
          where: { id: { in: staleDrafts.map((draft) => draft.id) } },
        });
      }
      return updated;
    });
    res.status(201).json(draftToClient(created));
  } catch (error) {
    console.error("Error creating listing draft:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.patch("/listing-drafts/:publicId", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as {
      type?: unknown;
      title?: unknown;
      categoryId?: unknown;
      subcategoryId?: unknown;
      itemId?: unknown;
      payload?: unknown;
      currentScreen?: unknown;
    };
    const publicId = String(req.params.publicId);
    const existing = await prisma.listingDraft.findFirst({
      where: {
        public_id: publicId,
        seller_id: session.user.id,
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    const updated = await prisma.listingDraft.update({
      where: { id: existing.id },
      data: {
        type: body.type === undefined ? undefined : parseListingType(body.type),
        title:
          body.title === undefined
            ? undefined
            : typeof body.title === "string"
              ? body.title.trim().slice(0, 160)
              : null,
        category_id:
          body.categoryId === undefined
            ? undefined
            : Number.isInteger(Number(body.categoryId))
              ? Number(body.categoryId)
              : null,
        subcategory_id:
          body.subcategoryId === undefined
            ? undefined
            : Number.isInteger(Number(body.subcategoryId))
              ? Number(body.subcategoryId)
              : null,
        item_id:
          body.itemId === undefined
            ? undefined
            : Number.isInteger(Number(body.itemId))
              ? Number(body.itemId)
              : null,
        payload: body.payload === undefined ? undefined : safeJsonPayload(body.payload),
        current_screen:
          body.currentScreen === undefined
            ? undefined
            : typeof body.currentScreen === "string"
              ? body.currentScreen.trim().slice(0, 40) || "start"
              : "start",
      },
    });
    res.json(draftToClient(updated));
  } catch (error) {
    console.error("Error updating listing draft:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

partnerRouter.delete("/listing-drafts/:publicId", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }
    const publicId = String(req.params.publicId);
    const existing = await prisma.listingDraft.findFirst({
      where: {
        public_id: publicId,
        seller_id: session.user.id,
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    await prisma.listingDraft.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting listing draft:", error);
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

partnerRouter.get("/finance/analytics", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const { from, to, groupBy } = parseFinanceDateRange(req);
    const transactionStatus = parseFinanceTransactionStatus(req.query.transactionStatus);
    const orderStatus = parseFinanceOrderStatus(req.query.orderStatus);
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const reportLimit = parseFinanceReportLimit(req.query.reportLimit);
    const reportOffset = parseFinanceReportOffset(req.query.reportOffset);

    const transactions = await prisma.platformTransaction.findMany({
      where: {
        seller_id: session.user.id,
        created_at: {
          gte: from,
          lte: to,
        },
        ...(transactionStatus ? { status: transactionStatus } : {}),
        ...(orderStatus ? { order: { status: orderStatus } } : {}),
      },
      include: {
        buyer: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        order: {
          include: {
            items: {
              orderBy: [{ id: "asc" }],
              include: {
                listing: {
                  select: {
                    public_id: true,
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    const filteredTransactions = search
      ? transactions.filter((transaction) => {
          const haystack = [
            transaction.public_id,
            transaction.order.public_id,
            transaction.buyer.public_id,
            transaction.buyer.name,
            transaction.buyer.email,
            transaction.payment_intent_id,
            ...transaction.order.items.map((item) => item.name),
            ...transaction.order.items.map((item) => item.listing?.public_id ?? ""),
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(search);
        })
      : transactions;

    const statusBreakdown = new Map<
      FinanceTransactionStatus,
      { key: string; label: string; count: number; amount: number }
    >();
    const orderBreakdown = new Map<
      OrderStatusValue,
      { key: string; label: string; count: number; amount: number }
    >();
    const timeSeries = new Map<
      string,
      {
        period: string;
        gross: number;
        commissions: number;
        sellerPayout: number;
        transactions: number;
        orders: number;
        itemsSold: number;
        itemPrices: number[];
      }
    >();
    const settlementBuckets = new Map<FinanceSettlementBucketKey, FinanceSettlementBucket>();
    const orderIds = new Set<string>();
    let gross = 0;
    let earned = 0;
    let payable = 0;
    let commissions = 0;
    let held = 0;
    let refundedCancelled = 0;
    let activeOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;
    let successfulTransactions = 0;

    filteredTransactions.forEach((transaction) => {
      const transactionStatusValue = transaction.status as FinanceTransactionStatus;
      const orderStatusValue = transaction.order.status as OrderStatusValue;
      const sellerPayout = transaction.amount - transaction.commission;
      const period = financePeriodKey(transaction.created_at, groupBy);
      const existingStatus = statusBreakdown.get(transactionStatusValue) ?? {
        key: transactionStatusValue.toLowerCase(),
        label: FINANCE_TRANSACTION_LABELS[transactionStatusValue],
        count: 0,
        amount: 0,
      };
      existingStatus.count += 1;
      existingStatus.amount += transaction.amount;
      statusBreakdown.set(transactionStatusValue, existingStatus);

      const existingOrderStatus = orderBreakdown.get(orderStatusValue) ?? {
        key: orderStatusValue.toLowerCase(),
        label: FINANCE_ORDER_LABELS[orderStatusValue],
        count: 0,
        amount: 0,
      };
      existingOrderStatus.count += 1;
      existingOrderStatus.amount += transaction.amount;
      orderBreakdown.set(orderStatusValue, existingOrderStatus);

      const existingPeriod = timeSeries.get(period) ?? {
        period,
        gross: 0,
        commissions: 0,
        sellerPayout: 0,
        transactions: 0,
        orders: 0,
        itemsSold: 0,
        itemPrices: [],
      };
      const transactionItemsSold = transaction.order.items.reduce((sum, item) => sum + item.quantity, 0);
      const transactionItemPrices = transaction.order.items.flatMap((item) =>
        Array.from({ length: item.quantity }, () => item.price),
      );
      existingPeriod.gross += transaction.amount;
      existingPeriod.commissions += transaction.commission;
      existingPeriod.sellerPayout += sellerPayout;
      existingPeriod.transactions += 1;
      existingPeriod.orders += orderIds.has(transaction.order.public_id) ? 0 : 1;
      existingPeriod.itemsSold += transactionItemsSold;
      existingPeriod.itemPrices.push(...transactionItemPrices);
      timeSeries.set(period, existingPeriod);

      const bucketKey = getFinanceSettlementBucket(transactionStatusValue, orderStatusValue);
      const bucketMeta = FINANCE_SETTLEMENT_BUCKETS[bucketKey];
      const bucketSellerPayout = bucketKey === "problem" ? 0 : sellerPayout;
      const settlementBucket = settlementBuckets.get(bucketKey) ?? {
        ...bucketMeta,
        count: 0,
        amount: 0,
        commissions: 0,
        sellerPayout: 0,
      };
      settlementBucket.count += 1;
      settlementBucket.amount += transaction.amount;
      settlementBucket.commissions += transaction.commission;
      settlementBucket.sellerPayout += bucketSellerPayout;
      settlementBuckets.set(bucketKey, settlementBucket);

      orderIds.add(transaction.order.public_id);
      gross += transaction.amount;
      commissions += transaction.commission;
      earned += transactionStatusValue === "SUCCESS" ? sellerPayout : 0;
      payable += isFinancePayableStatus(transactionStatusValue, orderStatusValue) ? sellerPayout : 0;
      held += transactionStatusValue === "HELD" ? sellerPayout : 0;
      refundedCancelled += transactionStatusValue === "REFUNDED" || transactionStatusValue === "CANCELLED" ? transaction.amount : 0;
      activeOrders += isFinanceActiveOrder(orderStatusValue) ? 1 : 0;
      completedOrders += orderStatusValue === "COMPLETED" ? 1 : 0;
      cancelledOrders += orderStatusValue === "CANCELLED" ? 1 : 0;
      successfulTransactions += transactionStatusValue === "SUCCESS" ? 1 : 0;
    });

    res.json({
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        groupBy,
        transactionStatus: transactionStatus?.toLowerCase() ?? "all",
        orderStatus: orderStatus?.toLowerCase() ?? "all",
        search,
      },
      summary: {
        gross,
        earned,
        payable,
        commissions,
        held,
        refundedCancelled,
        sellerPayout: earned,
        transactions: filteredTransactions.length,
        ordersTotal: orderIds.size,
        activeOrders,
        completedOrders,
        cancelledOrders,
        avgCheck: filteredTransactions.length > 0 ? Math.round(gross / filteredTransactions.length) : 0,
        avgCommission: filteredTransactions.length > 0 ? Math.round(commissions / filteredTransactions.length) : 0,
        successRate:
          filteredTransactions.length > 0
            ? Math.round((successfulTransactions / filteredTransactions.length) * 1000) / 10
            : 0,
      },
      timeSeries: Array.from(timeSeries.values())
        .map(({ itemPrices, ...point }) => ({
          ...point,
          medianPrice: medianNumber(itemPrices),
        }))
        .sort((left, right) => left.period.localeCompare(right.period)),
      transactionStatusBreakdown: Array.from(statusBreakdown.values()),
      orderStatusBreakdown: Array.from(orderBreakdown.values()),
      settlementBuckets: (["pendingPayment", "inProgress", "readyToPayout", "problem"] as FinanceSettlementBucketKey[]).map(
        (key) =>
          settlementBuckets.get(key) ?? {
            ...FINANCE_SETTLEMENT_BUCKETS[key],
            count: 0,
            amount: 0,
            commissions: 0,
            sellerPayout: 0,
          },
      ),
      reportMeta: {
        total: filteredTransactions.length,
        limit: reportLimit,
        offset: reportOffset,
        hasMore: reportOffset + reportLimit < filteredTransactions.length,
      },
      reportRows: filteredTransactions.slice(reportOffset, reportOffset + reportLimit).map((transaction) => ({
        id: transaction.public_id,
        orderId: transaction.order.public_id,
        orderStatus: transaction.order.status.toLowerCase(),
        transactionStatus: transaction.status.toLowerCase(),
        buyerId: transaction.buyer.public_id,
        buyerName: transaction.buyer.name,
        buyerEmail: transaction.buyer.email,
        listingTitle: transaction.order.items[0]?.name ?? "Без названия",
        listingIds: transaction.order.items
          .map((item) => item.listing?.public_id)
          .filter((item): item is string => Boolean(item)),
        itemsCount: transaction.order.items.length,
        itemsTotalQuantity: transaction.order.items.reduce((sum, item) => sum + item.quantity, 0),
        deliveryType: transaction.order.delivery_type.toLowerCase(),
        deliveryAddress: transaction.order.delivery_address,
        amount: transaction.amount,
        commission: transaction.commission,
        commissionRate: transaction.commission_rate,
        sellerPayout: transaction.amount - transaction.commission,
        paymentProvider: transaction.payment_provider.toLowerCase(),
        paymentIntentId: transaction.payment_intent_id,
        createdAt: transaction.created_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching partner finance analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

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
        items: {
          include: {
            listing: {
              select: {
                public_id: true,
              },
            },
          },
        },
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
          items: {
            include: {
              listing: {
                select: {
                  public_id: true,
                },
              },
            },
          },
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
          items: order.items.map((item) => ({
            id: String(item.id),
            listing_public_id: item.listing?.public_id ?? "",
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
          delivery_type: true,
          delivery_address: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          total_price: true,
          buyer_id: true,
          buyer: {
            select: {
              name: true,
              email: true,
              phone: true,
            },
          },
          items: {
            select: {
              name: true,
              price: true,
              quantity: true,
            },
          },
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

      await createNotification({
        userId: existing.buyer_id,
        type: "ORDER_STATUS",
        message: `Заказ ${existing.public_id} подготовлен продавцом.`,
        targetUrl: buildTargetUrl("orders"),
      });

      const provider = normalizeTrackingProvider(existing.tracking_provider);
      let deliveryTracking:
        | {
            trackingNumber: string;
            trackingUrl: string;
          }
        | null = null;
      let deliveryError: string | null = null;
      if (
        nextStatus === "PREPARED" &&
        existing.delivery_type === "DELIVERY" &&
        provider === "cdek" &&
        !existing.tracking_number
      ) {
        try {
          const createdDelivery = await createCdekDeliveryForPreparedOrder({
            orderPublicId: existing.public_id,
            deliveryAddress: existing.delivery_address,
            totalPrice: existing.total_price,
            buyerName: existing.buyer.name,
            buyerPhone: existing.buyer.phone,
            buyerEmail: existing.buyer.email,
            items: existing.items,
          });

          if (createdDelivery) {
            await prisma.marketOrder.update({
              where: { id: existing.id },
              data: {
                tracking_provider: "cdek",
                tracking_number: createdDelivery.normalizedTrackingNumber,
                tracking_url: createdDelivery.trackingUrl || null,
                delivery_ext_status: "CREATED",
                delivery_checked_at: new Date(),
              },
            });
            deliveryTracking = {
              trackingNumber: createdDelivery.normalizedTrackingNumber,
              trackingUrl: createdDelivery.trackingUrl,
            };
          }
        } catch (deliveryCreateError) {
          deliveryError =
            deliveryCreateError instanceof Error
              ? deliveryCreateError.message
              : "Не удалось создать заявку СДЭК";
          console.warn(`Unable to create CDEK delivery for ${existing.public_id}:`, deliveryCreateError);
        }
      }

      res.json({
        success: true,
        status: nextStatus,
        tracking: deliveryTracking,
        deliveryError,
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
          buyer_id: true,
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

      await createNotification({
        userId: existing.buyer_id,
        type: "ORDER_STATUS",
        message: `Заказ ${existing.public_id} отправлен. Трек-номер: ${validation.normalizedTrackingNumber}.`,
        targetUrl: buildTargetUrl("orders"),
      });

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
              title: true,
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

      await createNotification({
        userId: existing.buyer_id,
        type: "INFO",
        message: `Продавец ответил на ваш вопрос по товару «${existing.listing.title}».`,
        targetUrl: buildTargetUrl("listing", existing.listing.public_id),
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
