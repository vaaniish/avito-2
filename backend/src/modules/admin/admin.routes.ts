import { CatalogSuggestionStatus, ListingModerationDecision, Prisma } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { toAdminListingStatus, toClientRole } from "../../utils/format";
import { toClientSanctionLevel } from "./complaint-sanctions";
import { complaintsRouter } from "./admin.complaints.routes";
import {
  buildListingPublicUrl,
  extractPrimaryAddressInfo,
  parseLimit,
  requireAdmin,
  toClientComplaintSanctionStatus,
  type AuditAction,
  type AuditEntityType,
  writeAudit,
} from "./admin.shared";
import {
  defaultListingModerationReasonCode,
  makeListingModerationEventPublicId,
  parseListingModerationReasonCode,
} from "../moderation/listing-moderation.shared";
import {
  evaluateOnboardingProfile,
  jsonStringArray,
  parsePartnershipStatus as parseOnboardingPartnershipStatus,
  toClientPartnershipStatus,
} from "../partnership/onboarding";
import {
  buildTargetUrl,
  createNotification,
  createNotifications,
  listingModerationNotification,
} from "../notifications/notification.service";
import {
  FINANCE_ORDER_LABELS,
  FINANCE_SETTLEMENT_BUCKETS,
  FINANCE_TRANSACTION_LABELS,
  financePeriodKey,
  getFinanceSettlementBucket,
  isFinanceActiveOrder,
  isFinanceEarnedStatus,
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


const adminRouter = Router();
const MAX_BLOCK_REASON_LENGTH = 500;

type KycStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type ModerationStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type UserStatusValue = "ACTIVE" | "BLOCKED";
type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";
type PartnershipStatusValue =
  | "DRAFT"
  | "SUBMITTED"
  | "LEGAL_REVIEW"
  | "REPRESENTATIVE_REVIEW"
  | "PAYOUT_REVIEW"
  | "QUALITY_REVIEW"
  | "APPROVED_LIMITED"
  | "NEEDS_MORE_INFO"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";
type PayoutStatusValue = "PENDING" | "VERIFIED" | "REJECTED";
type CatalogSuggestionClientStatus =
  | "pending"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "merged";

const AUDIT_ENTITY_TYPES: AuditEntityType[] = [
  "complaint",
  "kyc_request",
  "partnership_request",
  "listing",
  "user",
  "seller_payout_profile",
  "commission_tier",
  "moderation",
];

const AUDIT_ACTIONS: AuditAction[] = [
  "complaint.status_changed",
  "kyc.status_changed",
  "partnership_request.status_changed",
  "seller.payout_profile.status_changed",
  "listing.moderation_changed",
  "user.status_changed",
  "commission_tier.rate_changed",
  "anti_circumvention.violation_detected",
  "anti_circumvention.sanction_applied",
];

function parseKycStatus(status: unknown): KycStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function parseModerationStatus(status: unknown): ModerationStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function toModerationDecision(
  status: ModerationStatusValue,
): ListingModerationDecision {
  if (status === "APPROVED") return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  return "QUEUED";
}

function parseUserStatus(status: unknown): UserStatusValue | null {
  if (status === "active") return "ACTIVE";
  if (status === "blocked") return "BLOCKED";
  return null;
}

function parsePartnershipStatus(status: unknown): PartnershipStatusValue | null {
  return parseOnboardingPartnershipStatus(status) as PartnershipStatusValue | null;
}

function parsePayoutStatus(status: unknown): PayoutStatusValue | null {
  if (status === "verified") return "VERIFIED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function parseCatalogSuggestionStatus(
  status: unknown,
): CatalogSuggestionStatus | null {
  if (status === "pending") return "PENDING";
  if (status === "auto_approved") return "AUTO_APPROVED";
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "merged") return "MERGED";
  return null;
}

function toClientCatalogSuggestionStatus(
  status: CatalogSuggestionStatus,
): CatalogSuggestionClientStatus {
  return status.toLowerCase() as CatalogSuggestionClientStatus;
}

function buildDefaultItemAttributeDefinitions(params: {
  itemId: number;
  itemPublicId: string;
  type: "PRODUCT";
}): Prisma.CatalogAttributeDefinitionCreateManyInput[] {
  return [
    {
      public_id: `${params.itemPublicId}-CAD-01`,
      type: params.type,
      item_id: params.itemId,
      key: "manufacturer",
      label: "Производитель / бренд",
      input_type: "text",
      required: true,
      order_index: 1,
    },
    {
      public_id: `${params.itemPublicId}-CAD-02`,
      type: params.type,
      item_id: params.itemId,
      key: "model",
      label: "Модель",
      input_type: "text",
      required: true,
      order_index: 2,
    },
    {
      public_id: `${params.itemPublicId}-CAD-03`,
      type: params.type,
      item_id: params.itemId,
      key: "included",
      label: "Комплект",
      input_type: "textarea",
      required: true,
      order_index: 3,
    },
    {
      public_id: `${params.itemPublicId}-CAD-04`,
      type: params.type,
      item_id: params.itemId,
      key: "defects_description",
      label: "Дефекты",
      input_type: "textarea",
      required: true,
      order_index: 4,
    },
  ];
}

function makePublicId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    Math.random() * 10_000,
  )
    .toString(36)
    .toUpperCase()}`;
}

function parseCatalogListingType(value: unknown): "PRODUCT" | null {
  if (value === "products" || value === "product" || value === "PRODUCT") return "PRODUCT";
  return null;
}

function catalogTypeToClient(_type: "PRODUCT"): "products" {
  return "products";
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCatalogName(value: unknown, fieldName: string): string {
  const text = readTrimmedString(value);
  if (text.length < 2) {
    throw new Error(`${fieldName}: минимум 2 символа`);
  }
  if (text.length > 120) {
    throw new Error(`${fieldName}: максимум 120 символов`);
  }
  return text;
}

function normalizeCatalogIconKey(value: unknown): string {
  const text = readTrimmedString(value);
  return text.length > 0 ? text.slice(0, 40) : "monitor";
}

function normalizeCatalogReferenceText(value: unknown, fieldName: string): string {
  const text = readTrimmedString(value);
  if (text.length < 1) {
    throw new Error(`${fieldName}: заполните значение`);
  }
  if (text.length > 160) {
    throw new Error(`${fieldName}: максимум 160 символов`);
  }
  return text;
}

function makeCharacteristicKey(label: string): string {
  const normalized = label
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/giu, "")
    .slice(0, 60);
  return normalized || "characteristic";
}

function duplicateCatalogReferenceCharacteristicLabel(
  characteristics: Array<{ label: string }>,
): string | null {
  const seen = new Set<string>();
  for (const characteristic of characteristics) {
    const key = makeCharacteristicKey(characteristic.label);
    if (seen.has(key)) return characteristic.label;
    seen.add(key);
  }
  return null;
}

function clientCatalogCategory(category: {
  public_id: string;
  type: "PRODUCT";
  name: string;
  icon_key: string;
  order_index: number;
  subcategories: Array<{
    public_id: string;
    name: string;
    order_index: number;
    items: Array<{
      public_id: string;
      name: string;
      order_index: number;
      _count?: { listings: number };
    }>;
    _count?: { items: number };
  }>;
}) {
  return {
    id: category.public_id,
    type: catalogTypeToClient(category.type),
    name: category.name,
    iconKey: category.icon_key,
    orderIndex: category.order_index,
    subcategories: category.subcategories.map((subcategory) => ({
      id: subcategory.public_id,
      name: subcategory.name,
      orderIndex: subcategory.order_index,
      itemCount: subcategory._count?.items ?? subcategory.items.length,
      items: subcategory.items.map((item) => ({
        id: item.public_id,
        name: item.name,
        orderIndex: item.order_index,
        listingCount: item._count?.listings ?? 0,
      })),
    })),
  };
}

async function nextOrderIndex(
  tx: Prisma.TransactionClient,
  scope: "category" | "subcategory" | "item",
  params: { type?: "PRODUCT"; categoryId?: number; subcategoryId?: number },
): Promise<number> {
  if (scope === "category" && params.type) {
    const result = await tx.catalogCategory.aggregate({
      where: { type: params.type },
      _max: { order_index: true },
    });
    return (result._max.order_index ?? 0) + 1;
  }

  if (scope === "subcategory" && params.categoryId) {
    const result = await tx.catalogSubcategory.aggregate({
      where: { category_id: params.categoryId },
      _max: { order_index: true },
    });
    return (result._max.order_index ?? 0) + 1;
  }

  if (scope === "item" && params.subcategoryId) {
    const result = await tx.catalogItem.aggregate({
      where: { subcategory_id: params.subcategoryId },
      _max: { order_index: true },
    });
    return (result._max.order_index ?? 0) + 1;
  }

  return 1;
}

async function loadAdminCatalog(type: "PRODUCT") {
  const categories = await prisma.catalogCategory.findMany({
    where: { type },
    orderBy: [{ order_index: "asc" }, { id: "asc" }],
    include: {
      subcategories: {
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        include: {
          _count: { select: { items: true } },
          items: {
            orderBy: [{ order_index: "asc" }, { id: "asc" }],
            include: {
              _count: { select: { listings: true } },
            },
          },
        },
      },
    },
  });

  return categories.map(clientCatalogCategory);
}

async function writeListingModerationEvent(params: {
  listingId: number;
  actorUserId: number;
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
      actor_type: "ADMIN",
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

function parseAuditAction(value: unknown): AuditAction | undefined {
  if (typeof value !== "string") return undefined;
  return AUDIT_ACTIONS.find((action) => action === value);
}

function parseAuditEntityType(value: unknown): AuditEntityType | undefined {
  if (typeof value !== "string") return undefined;
  return AUDIT_ENTITY_TYPES.find((entity) => entity === value);
}

function buildAutoFlags(listing: {
  description: string | null;
  seller: { joined_at: Date };
  complaints_count: number;
}): string[] {
  const flags: string[] = [];

  const joinedDays = Math.floor(
    (Date.now() - listing.seller.joined_at.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (joinedDays <= 30) {
    flags.push("new_seller");
  }

  const description = (listing.description ?? "").toLowerCase();
  if (/\b(telegram|whatsapp|prepayment|transfer)\b/.test(description)) {
    flags.push("forbidden_words");
  }

  if (/\+\d|@|\.ru|\.com/.test(description)) {
    flags.push("contacts_in_description");
  }

  if (
    (listing.description ?? "").length > 200 &&
    /(!!!|\bcheap\b|\burgent\b)/i.test(listing.description ?? "")
  ) {
    flags.push("spam_text");
  }

  if (listing.complaints_count > 0) {
    flags.push("seller_with_complaints");
  }

  if (listing.complaints_count > 1) {
    flags.push("multiple_reports");
  }

  return flags;
}

async function hasBlockingOrderForListing(listingId: number): Promise<boolean> {
  const linkedOrderItem = await prisma.marketOrderItem.findFirst({
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

  return Boolean(linkedOrderItem);
}

function splitEvidenceFiles(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\n;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSearchText(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input.toLowerCase();
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input).toLowerCase();
  }
  if (input instanceof Date) return input.toISOString().toLowerCase();
  if (Array.isArray(input)) {
    return input.map((item) => toSearchText(item)).join(" ");
  }
  if (typeof input === "object") {
    return Object.values(input as Record<string, unknown>)
      .map((value) => toSearchText(value))
      .join(" ");
  }
  return "";
}

function matchesFullText(input: unknown, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return toSearchText(input).includes(normalized);
}

function buildKycEvaluation(params: {
  documentsCount: number;
  hasInn: boolean;
  hasAddress: boolean;
  sellerComplaintsCount: number;
  sellerStatus: "ACTIVE" | "BLOCKED";
}): {
  completenessScore: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: "approve" | "request_more_documents" | "reject";
  checklist: Array<{ key: string; passed: boolean }>;
} {
  const checklist = [
    { key: "documents_attached", passed: params.documentsCount > 0 },
    { key: "inn_provided", passed: params.hasInn },
    { key: "address_provided", passed: params.hasAddress },
    { key: "seller_not_blocked", passed: params.sellerStatus !== "BLOCKED" },
  ];

  const completenessScore = Math.round(
    (checklist.filter((item) => item.passed).length / checklist.length) * 100,
  );

  const riskPoints =
    (params.sellerStatus === "BLOCKED" ? 40 : 0) +
    (params.sellerComplaintsCount >= 5
      ? 35
      : params.sellerComplaintsCount >= 2
        ? 20
        : 5) +
    (params.documentsCount === 0 ? 35 : params.documentsCount < 2 ? 15 : 0);

  const riskLevel: "low" | "medium" | "high" =
    riskPoints >= 65 ? "high" : riskPoints >= 35 ? "medium" : "low";

  const recommendation =
    riskLevel === "high"
      ? "reject"
      : completenessScore < 75
        ? "request_more_documents"
        : "approve";

  return {
    completenessScore,
    riskLevel,
    recommendation,
    checklist,
  };
}

adminRouter.get("/transactions", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const transactions = await prisma.platformTransaction.findMany({
      include: {
        buyer: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        order: {
          include: {
            buyer: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            seller: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            items: {
              orderBy: [{ id: "asc" }],
              include: {
                listing: {
                  select: {
                    public_id: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      transactions.map((transaction) => ({
        id: transaction.public_id,
        orderId: transaction.order.public_id,
        orderStatus: transaction.order.status.toLowerCase(),
        buyerId: transaction.buyer.public_id,
        buyerName: transaction.buyer.name,
        buyerEmail: transaction.buyer.email,
        sellerId: transaction.seller.public_id,
        sellerName: transaction.seller.name,
        sellerEmail: transaction.seller.email,
        listingTitle: transaction.order.items[0]?.name ?? "Unnamed item",
        listingIds: transaction.order.items
          .map((item) => item.listing?.public_id)
          .filter((item): item is string => Boolean(item)),
        itemsCount: transaction.order.items.length,
        itemsTotalQuantity: transaction.order.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        deliveryType: transaction.order.delivery_type.toLowerCase(),
        deliveryAddress: transaction.order.delivery_address,
        amount: transaction.amount,
        commission: transaction.commission,
        commissionRate: transaction.commission_rate,
        sellerPayout: transaction.amount - transaction.commission,
        status: transaction.status.toLowerCase(),
        paymentProvider: transaction.payment_provider.toLowerCase(),
        paymentIntentId: transaction.payment_intent_id,
        createdAt: transaction.created_at,
      })),
    );
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/finance/analytics", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { from, to, groupBy } = parseFinanceDateRange(req);
    const transactionStatus = parseFinanceTransactionStatus(req.query.transactionStatus);
    const orderStatus = parseFinanceOrderStatus(req.query.orderStatus);
    const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
    const reportLimit = parseFinanceReportLimit(req.query.reportLimit);
    const reportOffset = parseFinanceReportOffset(req.query.reportOffset);

    const transactions = await prisma.platformTransaction.findMany({
      where: {
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
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        order: {
          include: {
            buyer: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            seller: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
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
            transaction.seller.public_id,
            transaction.seller.name,
            transaction.seller.email,
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
      FinanceOrderStatus,
      { key: string; label: string; count: number; amount: number }
    >();
    const timeSeries = new Map<
      string,
      { period: string; gross: number; commissions: number; sellerPayout: number; transactions: number; orders: number }
    >();
    const settlementBuckets = new Map<FinanceSettlementBucketKey, FinanceSettlementBucket>();
    const topSellers = new Map<
      string,
      { id: string; name: string; email: string; transactions: number; orders: Set<string>; gross: number; commissions: number; sellerPayout: number; cancelled: number; refunded: number }
    >();
    const orderIds = new Set<string>();
    let gross = 0;
    let earned = 0;
    let payable = 0;
    let commissions = 0;
    let held = 0;
    let refundedCancelled = 0;
    let successfulTransactions = 0;
    let activeOrders = 0;
    let completedOrders = 0;
    let cancelledOrders = 0;

    filteredTransactions.forEach((transaction) => {
      const transactionStatusValue = transaction.status as FinanceTransactionStatus;
      const orderStatusValue = transaction.order.status as FinanceOrderStatus;
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
      };
      existingPeriod.gross += transaction.amount;
      existingPeriod.commissions += transaction.commission;
      existingPeriod.sellerPayout += sellerPayout;
      existingPeriod.transactions += 1;
      existingPeriod.orders += orderIds.has(transaction.order.public_id) ? 0 : 1;
      timeSeries.set(period, existingPeriod);

      const seller = topSellers.get(transaction.seller.public_id) ?? {
        id: transaction.seller.public_id,
        name: transaction.seller.name,
        email: transaction.seller.email,
        transactions: 0,
        orders: new Set<string>(),
        gross: 0,
        commissions: 0,
        sellerPayout: 0,
        cancelled: 0,
        refunded: 0,
      };
      seller.transactions += 1;
      seller.orders.add(transaction.order.public_id);
      seller.gross += transaction.amount;
      seller.commissions += transaction.commission;
      seller.sellerPayout += sellerPayout;
      seller.cancelled += transactionStatusValue === "CANCELLED" ? 1 : 0;
      seller.refunded += transactionStatusValue === "REFUNDED" ? 1 : 0;
      topSellers.set(transaction.seller.public_id, seller);

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
      earned += isFinanceEarnedStatus(transactionStatusValue) ? sellerPayout : 0;
      payable += isFinancePayableStatus(transactionStatusValue, orderStatusValue) ? sellerPayout : 0;
      held += transactionStatusValue === "HELD" ? sellerPayout : 0;
      refundedCancelled += transactionStatusValue === "REFUNDED" || transactionStatusValue === "CANCELLED" ? transaction.amount : 0;
      successfulTransactions += transactionStatusValue === "SUCCESS" ? 1 : 0;
      activeOrders += isFinanceActiveOrder(orderStatusValue) ? 1 : 0;
      completedOrders += orderStatusValue === "COMPLETED" ? 1 : 0;
      cancelledOrders += orderStatusValue === "CANCELLED" ? 1 : 0;
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
      timeSeries: Array.from(timeSeries.values()).sort((left, right) => left.period.localeCompare(right.period)),
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
      topSellers: Array.from(topSellers.values())
        .map((item) => ({ ...item, orders: item.orders.size }))
        .sort((left, right) => right.gross - left.gross)
        .slice(0, 8),
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
        sellerId: transaction.seller.public_id,
        sellerName: transaction.seller.name,
        sellerEmail: transaction.seller.email,
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
    console.error("Error fetching admin finance analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/catalog", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const type = parseCatalogListingType(req.query.type) ?? "PRODUCT";
    res.json(await loadAdminCatalog(type));
  } catch (error) {
    console.error("Error fetching admin catalog:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/catalog/search", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const type = parseCatalogListingType(req.query.type) ?? "PRODUCT";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const scope =
      req.query.scope === "categories" ||
      req.query.scope === "subcategories" ||
      req.query.scope === "items"
        ? req.query.scope
        : "all";
    const categoryPublicId =
      typeof req.query.categoryId === "string" ? req.query.categoryId.trim() : "";
    const subcategoryPublicId =
      typeof req.query.subcategoryId === "string"
        ? req.query.subcategoryId.trim()
        : "";
    const parsedLimit = Number(req.query.limit ?? 50);
    const take = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 80)
      : 50;
    const nameFilter = q
      ? { contains: q, mode: "insensitive" as const }
      : undefined;

    const nodes: Array<{
      kind: "category" | "subcategory" | "item";
      id: string;
      name: string;
      type: "products";
      path: string;
      orderIndex: number;
      categoryId?: string;
      categoryName?: string;
      iconKey?: string;
      subcategoryId?: string;
      subcategoryName?: string;
      childCount?: number;
      listingCount?: number;
    }> = [];

    if (scope === "all" || scope === "categories") {
      const categories = await prisma.catalogCategory.findMany({
        where: {
          type,
          ...(nameFilter ? { name: nameFilter } : {}),
        },
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        take: scope === "all" ? Math.min(take, 30) : take,
        include: {
          _count: { select: { subcategories: true } },
        },
      });

      nodes.push(
        ...categories.map((category) => ({
          kind: "category" as const,
          id: category.public_id,
          name: category.name,
          type: catalogTypeToClient(category.type),
          path: category.name,
          iconKey: category.icon_key,
          orderIndex: category.order_index,
          childCount: category._count.subcategories,
        })),
      );
    }

    if (scope === "all" || scope === "subcategories") {
      const category = categoryPublicId
        ? await prisma.catalogCategory.findFirst({
            where: { public_id: categoryPublicId, type },
            select: { id: true },
          })
        : null;
      const subcategories = await prisma.catalogSubcategory.findMany({
        where: {
          ...(category ? { category_id: category.id } : {}),
          category: { type },
          ...(nameFilter ? { name: nameFilter } : {}),
        },
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        take: scope === "all" ? Math.min(take, 30) : take,
        include: {
          category: { select: { public_id: true, name: true, type: true } },
          _count: { select: { items: true } },
        },
      });

      nodes.push(
        ...subcategories.map((subcategory) => ({
          kind: "subcategory" as const,
          id: subcategory.public_id,
          name: subcategory.name,
          type: catalogTypeToClient(subcategory.category.type),
          path: `${subcategory.category.name} / ${subcategory.name}`,
          orderIndex: subcategory.order_index,
          categoryId: subcategory.category.public_id,
          categoryName: subcategory.category.name,
          childCount: subcategory._count.items,
        })),
      );
    }

    if (scope === "all" || scope === "items") {
      const subcategory = subcategoryPublicId
        ? await prisma.catalogSubcategory.findFirst({
            where: {
              public_id: subcategoryPublicId,
              category: { type },
            },
            select: { id: true },
          })
        : null;
      const items = await prisma.catalogItem.findMany({
        where: {
          ...(subcategory ? { subcategory_id: subcategory.id } : {}),
          subcategory: { category: { type } },
          ...(nameFilter ? { name: nameFilter } : {}),
        },
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        take: scope === "all" ? Math.min(take, 30) : take,
        include: {
          subcategory: {
            select: {
              public_id: true,
              name: true,
              category: { select: { public_id: true, name: true, type: true } },
            },
          },
          _count: { select: { listings: true } },
        },
      });

      nodes.push(
        ...items.map((item) => ({
          kind: "item" as const,
          id: item.public_id,
          name: item.name,
          type: catalogTypeToClient(item.subcategory.category.type),
          path: `${item.subcategory.category.name} / ${item.subcategory.name} / ${item.name}`,
          orderIndex: item.order_index,
          categoryId: item.subcategory.category.public_id,
          categoryName: item.subcategory.category.name,
          subcategoryId: item.subcategory.public_id,
          subcategoryName: item.subcategory.name,
          listingCount: item._count.listings,
        })),
      );
    }

    res.json({
      items: nodes.slice(0, take),
      limit: take,
      query: q,
      scope,
    });
  } catch (error) {
    console.error("Error searching admin catalog:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/catalog/reorder", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const kind = body.kind === "category" || body.kind === "subcategory" || body.kind === "item"
      ? body.kind
      : null;
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds
          .map((value) => readTrimmedString(value))
          .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index)
      : [];

    if (!kind || orderedIds.length === 0) {
      res.status(400).json({ error: "Некорректные параметры сортировки" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      if (kind === "category") {
        const categories = await tx.catalogCategory.findMany({
          where: { public_id: { in: orderedIds }, type: "PRODUCT" },
          select: { id: true, public_id: true },
        });
        if (categories.length !== orderedIds.length) throw new Error("Категории не найдены");
        await Promise.all(
          orderedIds.map((publicId, index) =>
            tx.catalogCategory.update({
              where: { public_id: publicId },
              data: { order_index: index + 1 },
            }),
          ),
        );
        return;
      }

      if (kind === "subcategory") {
        const subcategories = await tx.catalogSubcategory.findMany({
          where: { public_id: { in: orderedIds }, category: { type: "PRODUCT" } },
          select: { id: true, public_id: true, category_id: true },
        });
        const parentIds = new Set(subcategories.map((subcategory) => subcategory.category_id));
        if (subcategories.length !== orderedIds.length || parentIds.size !== 1) {
          throw new Error("Подкатегории должны быть внутри одной категории");
        }
        await Promise.all(
          orderedIds.map((publicId, index) =>
            tx.catalogSubcategory.update({
              where: { public_id: publicId },
              data: { order_index: index + 1 },
            }),
          ),
        );
        return;
      }

      const items = await tx.catalogItem.findMany({
        where: { public_id: { in: orderedIds }, subcategory: { category: { type: "PRODUCT" } } },
        select: { id: true, public_id: true, subcategory_id: true },
      });
      const parentIds = new Set(items.map((item) => item.subcategory_id));
      if (items.length !== orderedIds.length || parentIds.size !== 1) {
        throw new Error("Виды товаров должны быть внутри одной подкатегории");
      }
      await Promise.all(
        orderedIds.map((publicId, index) =>
          tx.catalogItem.update({
            where: { public_id: publicId },
            data: { order_index: index + 1 },
          }),
        ),
      );
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error reordering catalog:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось изменить порядок",
    });
  }
});

adminRouter.post("/catalog/categories", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const type = parseCatalogListingType(body.type);
    if (!type) {
      res.status(400).json({ error: "Некорректный тип каталога" });
      return;
    }

    const name = normalizeCatalogName(body.name, "Категория");
    const iconKey = normalizeCatalogIconKey(body.iconKey);

    const category = await prisma.$transaction(async (tx) =>
      tx.catalogCategory.create({
        data: {
          public_id: makePublicId("CAT"),
          type,
          name,
          icon_key: iconKey,
          order_index: await nextOrderIndex(tx, "category", { type }),
        },
        include: { subcategories: { include: { items: true } } },
      }),
    );

    res.status(201).json(clientCatalogCategory(category));
  } catch (error) {
    console.error("Error creating catalog category:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось создать категорию",
    });
  }
});

adminRouter.patch("/catalog/categories/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.CatalogCategoryUpdateInput = {};
    if (body.name !== undefined) data.name = normalizeCatalogName(body.name, "Категория");
    if (body.iconKey !== undefined) data.icon_key = normalizeCatalogIconKey(body.iconKey);
    if (body.orderIndex !== undefined) {
      const orderIndex = Number(body.orderIndex);
      if (Number.isInteger(orderIndex) && orderIndex >= 0) data.order_index = orderIndex;
    }

    const updated = await prisma.catalogCategory.update({
      where: { public_id: String(req.params.publicId) },
      data,
      include: {
        subcategories: {
          include: {
            _count: { select: { items: true } },
            items: { include: { _count: { select: { listings: true } } } },
          },
        },
      },
    });
    res.json(clientCatalogCategory(updated));
  } catch (error) {
    console.error("Error updating catalog category:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось обновить категорию",
    });
  }
});

adminRouter.delete("/catalog/categories/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    await prisma.catalogCategory.delete({ where: { public_id: String(req.params.publicId) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting catalog category:", error);
    res.status(400).json({ error: "Не удалось удалить категорию" });
  }
});

adminRouter.post("/catalog/subcategories", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const categoryPublicId = readTrimmedString(body.categoryId);
    const name = normalizeCatalogName(body.name, "Подкатегория");
    if (!categoryPublicId) {
      res.status(400).json({ error: "Выберите категорию" });
      return;
    }

    const subcategory = await prisma.$transaction(async (tx) => {
      const category = await tx.catalogCategory.findUnique({
        where: { public_id: categoryPublicId },
        select: { id: true },
      });
      if (!category) throw new Error("Категория не найдена");

      return tx.catalogSubcategory.create({
        data: {
          public_id: makePublicId("SUB"),
          category_id: category.id,
          name,
          order_index: await nextOrderIndex(tx, "subcategory", { categoryId: category.id }),
        },
        include: { items: true },
      });
    });

    res.status(201).json({
      id: subcategory.public_id,
      name: subcategory.name,
      orderIndex: subcategory.order_index,
      itemCount: subcategory.items.length,
      items: [],
    });
  } catch (error) {
    console.error("Error creating catalog subcategory:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось создать подкатегорию",
    });
  }
});

adminRouter.patch("/catalog/subcategories/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.CatalogSubcategoryUpdateInput = {};
    if (body.name !== undefined) data.name = normalizeCatalogName(body.name, "Подкатегория");
    if (body.categoryId !== undefined) {
      const categoryPublicId = readTrimmedString(body.categoryId);
      const category = await prisma.catalogCategory.findUnique({
        where: { public_id: categoryPublicId },
        select: { id: true },
      });
      if (!category) {
        res.status(400).json({ error: "Категория не найдена" });
        return;
      }
      data.category = { connect: { id: category.id } };
    }

    const updated = await prisma.catalogSubcategory.update({
      where: { public_id: String(req.params.publicId) },
      data,
      include: { items: { include: { _count: { select: { listings: true } } } } },
    });

    res.json({
      id: updated.public_id,
      name: updated.name,
      orderIndex: updated.order_index,
      itemCount: updated.items.length,
      items: updated.items.map((item) => ({
        id: item.public_id,
        name: item.name,
        orderIndex: item.order_index,
        listingCount: item._count.listings,
      })),
    });
  } catch (error) {
    console.error("Error updating catalog subcategory:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось обновить подкатегорию",
    });
  }
});

adminRouter.delete("/catalog/subcategories/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    await prisma.catalogSubcategory.delete({ where: { public_id: String(req.params.publicId) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting catalog subcategory:", error);
    res.status(400).json({ error: "Не удалось удалить подкатегорию" });
  }
});

adminRouter.post("/catalog/items", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const subcategoryPublicId = readTrimmedString(body.subcategoryId);
    const name = normalizeCatalogName(body.name, "Вид товара");
    if (!subcategoryPublicId) {
      res.status(400).json({ error: "Выберите подкатегорию" });
      return;
    }

    const item = await prisma.$transaction(async (tx) => {
      const subcategory = await tx.catalogSubcategory.findUnique({
        where: { public_id: subcategoryPublicId },
        include: { category: { select: { type: true } } },
      });
      if (!subcategory) throw new Error("Подкатегория не найдена");

      const created = await tx.catalogItem.create({
        data: {
          public_id: makePublicId("ITM"),
          subcategory_id: subcategory.id,
          name,
          order_index: await nextOrderIndex(tx, "item", { subcategoryId: subcategory.id }),
        },
        select: { id: true, public_id: true, name: true, order_index: true },
      });

      await tx.catalogAttributeDefinition.createMany({
        data: buildDefaultItemAttributeDefinitions({
          itemId: created.id,
          itemPublicId: created.public_id,
          type: subcategory.category.type,
        }),
      });

      return created;
    });

    res.status(201).json({
      id: item.public_id,
      name: item.name,
      orderIndex: item.order_index,
      listingCount: 0,
    });
  } catch (error) {
    console.error("Error creating catalog item:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось создать вид товара",
    });
  }
});

adminRouter.patch("/catalog/items/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: Prisma.CatalogItemUpdateInput = {};
    if (body.name !== undefined) data.name = normalizeCatalogName(body.name, "Вид товара");
    if (body.subcategoryId !== undefined) {
      const subcategoryPublicId = readTrimmedString(body.subcategoryId);
      const subcategory = await prisma.catalogSubcategory.findUnique({
        where: { public_id: subcategoryPublicId },
        select: { id: true },
      });
      if (!subcategory) {
        res.status(400).json({ error: "Подкатегория не найдена" });
        return;
      }
      data.subcategory = { connect: { id: subcategory.id } };
    }

    const updated = await prisma.catalogItem.update({
      where: { public_id: String(req.params.publicId) },
      data,
      include: { _count: { select: { listings: true } } },
    });

    res.json({
      id: updated.public_id,
      name: updated.name,
      orderIndex: updated.order_index,
      listingCount: updated._count.listings,
    });
  } catch (error) {
    console.error("Error updating catalog item:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось обновить вид товара",
    });
  }
});

adminRouter.delete("/catalog/items/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    await prisma.catalogItem.delete({ where: { public_id: String(req.params.publicId) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting catalog item:", error);
    res.status(400).json({ error: "Не удалось удалить вид товара" });
  }
});

adminRouter.get("/catalog/items/:publicId/reference", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const item = await prisma.catalogItem.findUnique({
      where: { public_id: String(req.params.publicId) },
      select: { public_id: true, name: true },
    });
    if (!item) {
      res.status(404).json({ error: "Вид товара не найден" });
      return;
    }

    const brands = await prisma.catalogReferenceBrand.findMany({
      where: { item: { public_id: item.public_id } },
      orderBy: [{ order_index: "asc" }, { name: "asc" }, { id: "asc" }],
      include: {
        models: {
          orderBy: [{ order_index: "asc" }, { name: "asc" }, { id: "asc" }],
          include: {
            variants: {
              orderBy: [{ order_index: "asc" }, { title: "asc" }, { id: "asc" }],
              include: {
                characteristics: {
                  orderBy: [{ order_index: "asc" }, { id: "asc" }],
                },
              },
            },
          },
        },
      },
    });

    res.json({
      item: { id: item.public_id, name: item.name },
      brands: brands.map((brand) => ({
        id: brand.public_id,
        name: brand.name,
        models: brand.models.map((model) => ({
          id: model.public_id,
          name: model.name,
          products: model.variants.map((variant) => ({
            id: variant.public_id,
            title: variant.title,
            characteristics: variant.characteristics.map((characteristic) => ({
              id: characteristic.id,
              label: characteristic.label,
              value: characteristic.value,
            })),
          })),
        })),
      })),
    });
  } catch (error) {
    console.error("Error fetching catalog item reference:", error);
    res.status(500).json({ error: "Не удалось загрузить справочник товара" });
  }
});

adminRouter.post("/catalog/items/:publicId/reference/brands", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = normalizeCatalogReferenceText(body.name, "Бренд");

    const brand = await prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.findUnique({
        where: { public_id: String(req.params.publicId) },
        select: { id: true },
      });
      if (!item) throw new Error("Вид товара не найден");

      return tx.catalogReferenceBrand.create({
        data: {
          public_id: makePublicId("CRB"),
          item_id: item.id,
          name,
          order_index: await tx.catalogReferenceBrand.count({ where: { item_id: item.id } }) + 1,
        },
      });
    });

    res.status(201).json({ id: brand.public_id, name: brand.name, models: [] });
  } catch (error) {
    console.error("Error creating catalog reference brand:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось создать бренд",
    });
  }
});

adminRouter.post(
  "/catalog-suggestions/:publicId/approve-reference",
  async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as {
        approval?: {
          type?: unknown;
          categoryId?: unknown;
          categoryName?: unknown;
          subcategoryId?: unknown;
          subcategoryName?: unknown;
          itemName?: unknown;
        };
        reference?: {
          brandName?: unknown;
          modelName?: unknown;
          productTitle?: unknown;
          characteristics?: unknown;
        };
        adminNote?: unknown;
      };

      const approval = body.approval && typeof body.approval === "object" ? body.approval : {};
      const reference = body.reference && typeof body.reference === "object" ? body.reference : {};
      const adminNote = readTrimmedString(body.adminNote);
      const targetType = parseCatalogListingType(approval.type) ?? "PRODUCT";
      const categoryPublicId = readTrimmedString(approval.categoryId);
      const categoryName = readTrimmedString(approval.categoryName);
      const subcategoryPublicId = readTrimmedString(approval.subcategoryId);
      const subcategoryName = readTrimmedString(approval.subcategoryName);
      const itemName = normalizeCatalogName(approval.itemName, "Вид товара");
      const brandName = normalizeCatalogReferenceText(reference.brandName, "Бренд");
      const modelName = normalizeCatalogReferenceText(reference.modelName, "Модель");
      const productTitle = normalizeCatalogReferenceText(
        reference.productTitle,
        "Конкретный товар",
      );
      const rawCharacteristics = Array.isArray(reference.characteristics)
        ? reference.characteristics
        : [];
      const characteristics = rawCharacteristics
        .map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
          const label = readTrimmedString((entry as Record<string, unknown>).label);
          const value = readTrimmedString((entry as Record<string, unknown>).value);
          if (!label || !value) return null;
          return {
            label: label.slice(0, 120),
            value: value.slice(0, 300),
          };
        })
        .filter((entry): entry is { label: string; value: string } => Boolean(entry))
        .slice(0, 60);
      const duplicateCharacteristicLabel =
        duplicateCatalogReferenceCharacteristicLabel(characteristics);
      if (duplicateCharacteristicLabel) {
        res.status(400).json({
          error: `Характеристика «${duplicateCharacteristicLabel}» уже добавлена`,
        });
        return;
      }

      if (!categoryPublicId && categoryName.length < 2) {
        res.status(400).json({ error: "Выберите категорию или укажите новую" });
        return;
      }
      if (!subcategoryPublicId && subcategoryName.length < 2) {
        res.status(400).json({ error: "Выберите подкатегорию или укажите новую" });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const suggestion = await tx.catalogSuggestion.findUnique({
          where: { public_id: String(req.params.publicId) },
          select: { id: true, public_id: true },
        });
        if (!suggestion) throw new Error("Catalog suggestion not found");

        let category:
          | { id: number; public_id: string; name: string }
          | null = null;
        if (categoryPublicId) {
          category = await tx.catalogCategory.findFirst({
            where: { public_id: categoryPublicId, type: targetType },
            select: { id: true, public_id: true, name: true },
          });
          if (!category) throw new Error("Категория не найдена");
        } else {
          category = await tx.catalogCategory.findFirst({
            where: { type: targetType, name: { equals: categoryName, mode: "insensitive" } },
            select: { id: true, public_id: true, name: true },
          });
          if (!category) {
            category = await tx.catalogCategory.create({
              data: {
                public_id: makePublicId("CAT"),
                type: targetType,
                name: normalizeCatalogName(categoryName, "Категория"),
                icon_key: "monitor",
                order_index: await nextOrderIndex(tx, "category", { type: targetType }),
              },
              select: { id: true, public_id: true, name: true },
            });
          }
        }

        let subcategory:
          | { id: number; public_id: string; name: string }
          | null = null;
        if (subcategoryPublicId) {
          subcategory = await tx.catalogSubcategory.findFirst({
            where: { public_id: subcategoryPublicId, category_id: category.id },
            select: { id: true, public_id: true, name: true },
          });
          if (!subcategory) throw new Error("Подкатегория не найдена");
        } else {
          const validSubcategoryName = normalizeCatalogName(subcategoryName, "Подкатегория");
          subcategory = await tx.catalogSubcategory.findFirst({
            where: {
              category_id: category.id,
              name: { equals: validSubcategoryName, mode: "insensitive" },
            },
            select: { id: true, public_id: true, name: true },
          });
          if (!subcategory) {
            subcategory = await tx.catalogSubcategory.create({
              data: {
                public_id: makePublicId("SUB"),
                category_id: category.id,
                name: validSubcategoryName,
                order_index: await nextOrderIndex(tx, "subcategory", {
                  categoryId: category.id,
                }),
              },
              select: { id: true, public_id: true, name: true },
            });
          }
        }

        let item = await tx.catalogItem.findFirst({
          where: {
            subcategory_id: subcategory.id,
            name: { equals: itemName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        });
        if (!item) {
          item = await tx.catalogItem.create({
            data: {
              public_id: makePublicId("ITM"),
              subcategory_id: subcategory.id,
              name: itemName,
              order_index: await nextOrderIndex(tx, "item", {
                subcategoryId: subcategory.id,
              }),
            },
            select: { id: true, public_id: true, name: true },
          });
          await tx.catalogAttributeDefinition.createMany({
            data: buildDefaultItemAttributeDefinitions({
              itemId: item.id,
              itemPublicId: item.public_id,
              type: targetType,
            }),
          });
        }

        let brand = await tx.catalogReferenceBrand.findFirst({
          where: {
            item_id: item.id,
            name: { equals: brandName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        });
        if (!brand) {
          brand = await tx.catalogReferenceBrand.create({
            data: {
              public_id: makePublicId("CRB"),
              item_id: item.id,
              name: brandName,
              order_index:
                (await tx.catalogReferenceBrand.count({ where: { item_id: item.id } })) + 1,
            },
            select: { id: true, public_id: true, name: true },
          });
        }

        let model = await tx.catalogReferenceModel.findFirst({
          where: {
            brand_id: brand.id,
            name: { equals: modelName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        });
        if (!model) {
          model = await tx.catalogReferenceModel.create({
            data: {
              public_id: makePublicId("CRM"),
              brand_id: brand.id,
              name: modelName,
              order_index:
                (await tx.catalogReferenceModel.count({ where: { brand_id: brand.id } })) + 1,
            },
            select: { id: true, public_id: true, name: true },
          });
        }

        if (characteristics.length > 0) {
          const existingCharacteristics = await tx.catalogReferenceCharacteristic.findMany({
            where: { variant: { model_id: model.id } },
            select: { label: true },
          });
          const existingKeys = new Set(
            existingCharacteristics.map((characteristic) =>
              makeCharacteristicKey(characteristic.label),
            ),
          );
          const duplicateExistingCharacteristic = characteristics.find((characteristic) =>
            existingKeys.has(makeCharacteristicKey(characteristic.label)),
          );
          if (duplicateExistingCharacteristic) {
            throw new Error(
              `Характеристика «${duplicateExistingCharacteristic.label}» уже добавлена`,
            );
          }
        }

        const product = await tx.catalogReferenceVariant.create({
          data: {
            public_id: makePublicId("CRV"),
            model_id: model.id,
            title: productTitle,
            order_index:
              (await tx.catalogReferenceVariant.count({ where: { model_id: model.id } })) + 1,
          },
          select: { id: true, public_id: true, title: true },
        });

        if (characteristics.length > 0) {
          await tx.catalogReferenceCharacteristic.createMany({
            data: characteristics.map((characteristic, index) => ({
              variant_id: product.id,
              key: makeCharacteristicKey(characteristic.label),
              label: characteristic.label,
              value: characteristic.value,
              raw_value: characteristic.value,
              source_group_index: index,
              source: "admin",
              order_index: index + 1,
            })),
          });
        }

        const updated = await tx.catalogSuggestion.update({
          where: { id: suggestion.id },
          data: {
            status: "APPROVED",
            admin_note: adminNote || null,
            reviewed_by_id: access.user.id,
            reviewed_at: new Date(),
            merged_target_public_id: item.public_id,
          },
          select: { status: true },
        });

        return { updated, item, brand, model, product };
      });

      res.status(201).json({
        success: true,
        suggestionStatus: toClientCatalogSuggestionStatus(result.updated.status),
        item: { id: result.item.public_id, name: result.item.name },
        brand: { id: result.brand.public_id, name: result.brand.name },
        model: { id: result.model.public_id, name: result.model.name },
        product: { id: result.product.public_id, title: result.product.title },
      });
    } catch (error) {
      console.error("Error approving catalog suggestion reference:", error);
      res.status(400).json({
        error:
          error instanceof Error
            ? error.message
            : "Не удалось одобрить заявку и добавить справочник",
      });
    }
  },
);

adminRouter.patch("/catalog/reference/brands/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = normalizeCatalogReferenceText(body.name, "Бренд");
    const brand = await prisma.catalogReferenceBrand.update({
      where: { public_id: String(req.params.publicId) },
      data: { name },
    });
    res.json({ id: brand.public_id, name: brand.name });
  } catch (error) {
    console.error("Error updating catalog reference brand:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось обновить бренд",
    });
  }
});

adminRouter.delete("/catalog/reference/brands/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    await prisma.catalogReferenceBrand.delete({ where: { public_id: String(req.params.publicId) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting catalog reference brand:", error);
    res.status(400).json({ error: "Не удалось удалить бренд" });
  }
});

adminRouter.post("/catalog/reference/brands/:publicId/models", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = normalizeCatalogReferenceText(body.name, "Модель");
    const model = await prisma.$transaction(async (tx) => {
      const brand = await tx.catalogReferenceBrand.findUnique({
        where: { public_id: String(req.params.publicId) },
        select: { id: true },
      });
      if (!brand) throw new Error("Бренд не найден");

      return tx.catalogReferenceModel.create({
        data: {
          public_id: makePublicId("CRM"),
          brand_id: brand.id,
          name,
          order_index: await tx.catalogReferenceModel.count({ where: { brand_id: brand.id } }) + 1,
        },
      });
    });

    res.status(201).json({ id: model.public_id, name: model.name, products: [] });
  } catch (error) {
    console.error("Error creating catalog reference model:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось создать модель",
    });
  }
});

adminRouter.patch("/catalog/reference/models/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = normalizeCatalogReferenceText(body.name, "Модель");
    const model = await prisma.catalogReferenceModel.update({
      where: { public_id: String(req.params.publicId) },
      data: { name },
    });
    res.json({ id: model.public_id, name: model.name });
  } catch (error) {
    console.error("Error updating catalog reference model:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось обновить модель",
    });
  }
});

adminRouter.delete("/catalog/reference/models/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    await prisma.catalogReferenceModel.delete({ where: { public_id: String(req.params.publicId) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting catalog reference model:", error);
    res.status(400).json({ error: "Не удалось удалить модель" });
  }
});

adminRouter.post("/catalog/reference/models/:publicId/products", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawCharacteristics = Array.isArray(body.characteristics) ? body.characteristics : [];
    const characteristics = rawCharacteristics
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const label = readTrimmedString((entry as Record<string, unknown>).label);
        const value = readTrimmedString((entry as Record<string, unknown>).value);
        if (!label || !value) return null;
        return { label, value };
      })
      .filter((entry): entry is { label: string; value: string } => Boolean(entry));
    const duplicateCharacteristicLabel =
      duplicateCatalogReferenceCharacteristicLabel(characteristics);
    if (duplicateCharacteristicLabel) {
      res.status(400).json({
        error: `Характеристика «${duplicateCharacteristicLabel}» уже добавлена`,
      });
      return;
    }

    const product = await prisma.$transaction(async (tx) => {
      const model = await tx.catalogReferenceModel.findUnique({
        where: { public_id: String(req.params.publicId) },
        select: { id: true, name: true },
      });
      if (!model) throw new Error("Модель не найдена");

      const variant =
        (await tx.catalogReferenceVariant.findFirst({
          where: { model_id: model.id },
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
        })) ??
        (await tx.catalogReferenceVariant.create({
          data: {
            public_id: makePublicId("CRV"),
            model_id: model.id,
            title: model.name,
            order_index:
              (await tx.catalogReferenceVariant.count({ where: { model_id: model.id } })) + 1,
          },
        }));

      if (characteristics.length > 0) {
        const existingCharacteristics = await tx.catalogReferenceCharacteristic.findMany({
          where: { variant: { model_id: model.id } },
          select: { label: true },
        });
        const existingKeys = new Set(
          existingCharacteristics.map((characteristic) =>
            makeCharacteristicKey(characteristic.label),
          ),
        );
        const duplicateExistingCharacteristic = characteristics.find((characteristic) =>
          existingKeys.has(makeCharacteristicKey(characteristic.label)),
        );
        if (duplicateExistingCharacteristic) {
          throw new Error(
            `Характеристика «${duplicateExistingCharacteristic.label}» уже добавлена`,
          );
        }

        const currentCount = await tx.catalogReferenceCharacteristic.count({
          where: { variant_id: variant.id },
        });
        await tx.catalogReferenceCharacteristic.createMany({
          data: characteristics.map((characteristic, index) => ({
            variant_id: variant.id,
            key: makeCharacteristicKey(characteristic.label),
            label: characteristic.label,
            value: characteristic.value,
            raw_value: characteristic.value,
            source_group_index: index,
            source: "admin",
            order_index: currentCount + index + 1,
          })),
        });
      }

      return variant;
    });

    res.status(201).json({
      id: product.public_id,
      title: product.title,
      characteristics,
    });
  } catch (error) {
    console.error("Error creating catalog reference product:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось добавить характеристики",
    });
  }
});

adminRouter.patch("/catalog/reference/products/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const title = normalizeCatalogReferenceText(body.title, "Конкретный товар");
    const product = await prisma.catalogReferenceVariant.update({
      where: { public_id: String(req.params.publicId) },
      data: { title },
    });
    res.json({ id: product.public_id, title: product.title });
  } catch (error) {
    console.error("Error updating catalog reference product:", error);
    res.status(400).json({
      error: error instanceof Error ? error.message : "Не удалось обновить конкретный товар",
    });
  }
});

adminRouter.delete("/catalog/reference/characteristics/:id", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: "Некорректная характеристика" });
      return;
    }

    await prisma.catalogReferenceCharacteristic.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting catalog reference characteristic:", error);
    res.status(400).json({ error: "Не удалось удалить характеристику" });
  }
});

adminRouter.delete("/catalog/reference/products/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    await prisma.catalogReferenceVariant.delete({ where: { public_id: String(req.params.publicId) } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting catalog reference product:", error);
    res.status(400).json({ error: "Не удалось удалить конкретный товар" });
  }
});

adminRouter.get("/catalog-suggestions", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const suggestions = await prisma.catalogSuggestion.findMany({
      include: {
        category: { select: { public_id: true, name: true, type: true } },
        subcategory: { select: { public_id: true, name: true } },
        item: { select: { public_id: true, name: true } },
        proposed_by: {
          select: { public_id: true, name: true, email: true },
        },
      },
      orderBy: [{ status: "asc" }, { created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      suggestions.map((suggestion) => ({
        id: suggestion.public_id,
        entityType: suggestion.entity_type.toLowerCase(),
        status: toClientCatalogSuggestionStatus(suggestion.status),
        type: suggestion.type.toLowerCase(),
        rawValue: suggestion.raw_value,
        normalizedValue: suggestion.normalized_value,
        reason: suggestion.reason,
        payload: suggestion.payload,
        adminNote: suggestion.admin_note,
        usageCount: suggestion.usage_count,
        mergedTargetPublicId: suggestion.merged_target_public_id,
        createdAt: suggestion.created_at,
        reviewedAt: suggestion.reviewed_at,
        category: suggestion.category
          ? {
              id: suggestion.category.public_id,
              name: suggestion.category.name,
              type: suggestion.category.type.toLowerCase(),
            }
          : null,
        subcategory: suggestion.subcategory
          ? {
              id: suggestion.subcategory.public_id,
              name: suggestion.subcategory.name,
            }
          : null,
        item: suggestion.item
          ? { id: suggestion.item.public_id, name: suggestion.item.name }
          : null,
        proposedBy: suggestion.proposed_by
          ? {
              id: suggestion.proposed_by.public_id,
              name: suggestion.proposed_by.name,
              email: suggestion.proposed_by.email,
            }
          : null,
      })),
    );
  } catch (error) {
    console.error("Error fetching catalog suggestions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch(
  "/catalog-suggestions/:publicId",
  async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as {
        status?: unknown;
        adminNote?: unknown;
        mergedTargetPublicId?: unknown;
        approval?: {
          type?: unknown;
          categoryId?: unknown;
          categoryName?: unknown;
          subcategoryId?: unknown;
          subcategoryName?: unknown;
          itemName?: unknown;
          iconKey?: unknown;
        };
      };
      const nextStatus = parseCatalogSuggestionStatus(body.status);
      if (!nextStatus) {
        res.status(400).json({ error: "Invalid catalog suggestion status" });
        return;
      }

      const adminNote =
        typeof body.adminNote === "string" ? body.adminNote.trim() : "";
      const mergedTargetPublicId =
        typeof body.mergedTargetPublicId === "string"
          ? body.mergedTargetPublicId.trim()
          : "";
      const approval = body.approval && typeof body.approval === "object" ? body.approval : {};

      if (nextStatus === "REJECTED" && adminNote.length < 3) {
        res.status(400).json({ error: "Укажите причину отклонения" });
        return;
      }

      const existing = await prisma.catalogSuggestion.findUnique({
        where: { public_id: String(publicId) },
        include: {
          subcategory: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Catalog suggestion not found" });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        let statusToSave = nextStatus;
        let mergedTargetToSave = mergedTargetPublicId || null;
        let createdCatalogEntity: { public_id: string; name: string } | null = null;

        if (nextStatus === "APPROVED") {
          const targetType = parseCatalogListingType(approval.type) ?? existing.type;
          const categoryPublicId = readTrimmedString(approval.categoryId);
          const categoryName = readTrimmedString(approval.categoryName);
          const subcategoryPublicId = readTrimmedString(approval.subcategoryId);
          const subcategoryName = readTrimmedString(approval.subcategoryName);
          const itemName = readTrimmedString(approval.itemName) || existing.raw_value.trim();

          let categoryId = existing.category_id ?? null;
          let subcategoryId = existing.subcategory_id ?? null;

          if (categoryPublicId) {
            const selectedCategory = await tx.catalogCategory.findFirst({
              where: { public_id: categoryPublicId, type: targetType },
              select: { id: true, public_id: true, name: true },
            });
            if (!selectedCategory) throw new Error("Категория не найдена");
            categoryId = selectedCategory.id;
            if (existing.entity_type === "CATEGORY") {
              createdCatalogEntity = selectedCategory;
              mergedTargetToSave = selectedCategory.public_id;
            }
          } else if (categoryName) {
            const duplicateCategory = await tx.catalogCategory.findFirst({
              where: { type: targetType, name: { equals: categoryName, mode: "insensitive" } },
              select: { id: true, public_id: true, name: true },
            });
            if (duplicateCategory) {
              categoryId = duplicateCategory.id;
              createdCatalogEntity = duplicateCategory;
              mergedTargetToSave = duplicateCategory.public_id;
              if (existing.entity_type === "CATEGORY") statusToSave = "MERGED";
            } else {
              const createdCategory = await tx.catalogCategory.create({
                data: {
                  public_id: makePublicId("CAT"),
                  type: targetType,
                  name: categoryName,
                  icon_key: normalizeCatalogIconKey(approval.iconKey),
                  order_index: await nextOrderIndex(tx, "category", { type: targetType }),
                },
                select: { id: true, public_id: true, name: true },
              });
              categoryId = createdCategory.id;
              createdCatalogEntity = createdCategory;
              mergedTargetToSave = createdCategory.public_id;
            }
          }

          if (existing.entity_type === "SUBCATEGORY" || existing.entity_type === "ITEM") {
            if (!categoryId) throw new Error("Выберите категорию для подкатегории");

            if (subcategoryPublicId) {
              const selectedSubcategory = await tx.catalogSubcategory.findFirst({
                where: { public_id: subcategoryPublicId, category_id: categoryId },
                select: { id: true, public_id: true, name: true },
              });
              if (!selectedSubcategory) throw new Error("Подкатегория не найдена");
              subcategoryId = selectedSubcategory.id;
              if (existing.entity_type === "SUBCATEGORY") {
                createdCatalogEntity = selectedSubcategory;
                mergedTargetToSave = selectedSubcategory.public_id;
              }
            } else {
              const resolvedSubcategoryName =
                subcategoryName || existing.subcategory?.name || existing.raw_value.trim();
              const validSubcategoryName = normalizeCatalogName(
                resolvedSubcategoryName,
                "Подкатегория",
              );
              const duplicateSubcategory = await tx.catalogSubcategory.findFirst({
                where: {
                  category_id: categoryId,
                  name: { equals: validSubcategoryName, mode: "insensitive" },
                },
                select: { id: true, public_id: true, name: true },
              });
              if (duplicateSubcategory) {
                subcategoryId = duplicateSubcategory.id;
                createdCatalogEntity = duplicateSubcategory;
                mergedTargetToSave = duplicateSubcategory.public_id;
                if (existing.entity_type === "SUBCATEGORY") statusToSave = "MERGED";
              } else {
                const createdSubcategory = await tx.catalogSubcategory.create({
                  data: {
                    public_id: makePublicId("SUB"),
                    category_id: categoryId,
                    name: validSubcategoryName,
                    order_index: await nextOrderIndex(tx, "subcategory", { categoryId }),
                  },
                  select: { id: true, public_id: true, name: true },
                });
                subcategoryId = createdSubcategory.id;
                createdCatalogEntity = createdSubcategory;
                mergedTargetToSave = createdSubcategory.public_id;
              }
            }
          }

          if (existing.entity_type === "ITEM") {
            if (!subcategoryId) throw new Error("Выберите подкатегорию для вида товара");
            const validItemName = normalizeCatalogName(itemName, "Вид товара");
            const duplicate = await tx.catalogItem.findFirst({
              where: {
                subcategory_id: subcategoryId,
                name: { equals: validItemName, mode: "insensitive" },
              },
              select: { public_id: true, name: true },
            });

            if (duplicate) {
              statusToSave = "MERGED";
              mergedTargetToSave = duplicate.public_id;
              createdCatalogEntity = duplicate;
            } else {
              const item = await tx.catalogItem.create({
                data: {
                  public_id: makePublicId("ITM"),
                  subcategory_id: subcategoryId,
                  name: validItemName,
                  order_index: await nextOrderIndex(tx, "item", { subcategoryId }),
                },
                select: { id: true, public_id: true, name: true },
              });

              await tx.catalogAttributeDefinition.createMany({
                data: buildDefaultItemAttributeDefinitions({
                  itemId: item.id,
                  itemPublicId: item.public_id,
                  type: targetType,
                }),
              });

              createdCatalogEntity = item;
              mergedTargetToSave = item.public_id;
            }
          }
        }

        const updated = await tx.catalogSuggestion.update({
          where: { id: existing.id },
          data: {
            status: statusToSave,
            admin_note: adminNote || null,
            reviewed_by_id: access.user.id,
            reviewed_at: new Date(),
            merged_target_public_id: mergedTargetToSave,
          },
        });

        return { updated, createdCatalogEntity };
      });

      res.json({
        success: true,
        status: toClientCatalogSuggestionStatus(result.updated.status),
        createdItem: result.createdCatalogEntity,
      });
    } catch (error) {
      console.error("Error updating catalog suggestion:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
);

adminRouter.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const action = parseAuditAction(req.query.action);
    const entityType = parseAuditEntityType(req.query.entityType);
    const limit = parseLimit(req.query.limit, 200);

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entity_type = entityType;
    }

    const fetchedLogs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 1000,
    });

    const normalizedQuery = q.trim().toLowerCase();
    const logs = normalizedQuery
      ? fetchedLogs.filter((log) =>
          matchesFullText(
            {
              id: log.public_id,
              action: log.action,
              entityType: log.entity_type,
              entityId: log.entity_public_id,
              ipAddress: log.ip_address,
              details: log.details,
              createdAt: log.created_at.toISOString(),
              actor: log.actor
                ? {
                    id: log.actor.public_id,
                    name: log.actor.name,
                    email: log.actor.email,
                  }
                : null,
            },
            normalizedQuery,
          ),
        )
      : fetchedLogs;

    res.json({
      logs: logs.slice(0, limit).map((log) => ({
          id: log.public_id,
          createdAt: log.created_at,
          action: log.action,
          entityType: log.entity_type,
          entityId: log.entity_public_id,
          ipAddress: log.ip_address,
          details: log.details,
          actor: log.actor
            ? {
                id: log.actor.public_id,
                name: log.actor.name,
                email: log.actor.email,
              }
            : null,
        })),
      availableActions: AUDIT_ACTIONS,
      availableEntities: AUDIT_ENTITY_TYPES,
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.use("/", complaintsRouter);

adminRouter.get("/partnership-requests", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const requests = await prisma.partnershipRequest.findMany({
      include: {
        user: {
          select: {
            public_id: true,
            role: true,
            status: true,
            email: true,
            name: true,
          },
        },
        reviewed_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        onboarding_profile: true,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      requests.map((requestItem) => {
        const onboardingProfile = requestItem.onboarding_profile;
        const evaluation = onboardingProfile
          ? evaluateOnboardingProfile(onboardingProfile)
          : null;
        return {
          id: requestItem.public_id,
          status: toClientPartnershipStatus(requestItem.status),
          sellerType: requestItem.seller_type,
          name: requestItem.name,
          email: requestItem.email,
          contact: requestItem.contact,
          link: requestItem.link,
          category: requestItem.category,
          inn: requestItem.inn,
          geography: requestItem.geography,
          socialProfile: requestItem.social_profile,
          credibility: requestItem.credibility,
          whyUs: requestItem.why_us,
          createdAt: requestItem.created_at,
          reviewedAt: requestItem.reviewed_at,
          rejectionReason: requestItem.rejection_reason,
          adminNote: requestItem.admin_note,
          onboardingProfile: onboardingProfile
            ? {
                id: onboardingProfile.public_id,
                legalType: onboardingProfile.legal_type,
                inn: onboardingProfile.inn,
                ogrn: onboardingProfile.ogrn,
                kpp: onboardingProfile.kpp,
                legalName: onboardingProfile.legal_name,
                registrationStatus: onboardingProfile.registration_status,
                registeredAddress: onboardingProfile.registered_address,
                taxRegion: onboardingProfile.tax_region,
                representativeFullName: onboardingProfile.representative_full_name,
                representativeRole: onboardingProfile.representative_role,
                representativePhone: onboardingProfile.representative_phone,
                representativeEmail: onboardingProfile.representative_email,
                authorityType: onboardingProfile.authority_type,
                authorityDocument: onboardingProfile.authority_document,
                websiteUrl: onboardingProfile.website_url,
                businessEmail: onboardingProfile.business_email,
                domainOwnershipMethod: onboardingProfile.domain_ownership_method,
                publicProfileUrls: jsonStringArray(onboardingProfile.public_profile_urls),
                businessRole: onboardingProfile.business_role,
                categories: jsonStringArray(onboardingProfile.categories),
                fulfillmentModel: onboardingProfile.fulfillment_model,
                country: onboardingProfile.country,
                region: onboardingProfile.region,
                city: onboardingProfile.city,
                warehouseAddress: onboardingProfile.warehouse_address,
                serviceCenterAddress: onboardingProfile.service_center_address,
                deliveryCoverageRegions: jsonStringArray(onboardingProfile.delivery_coverage_regions),
                pickupAvailable: onboardingProfile.pickup_available,
                returnAddress: onboardingProfile.return_address,
                supportPhone: onboardingProfile.support_phone,
                supportEmail: onboardingProfile.support_email,
                serviceHours: onboardingProfile.service_hours,
                monthlyCapacity: onboardingProfile.monthly_capacity,
                productSourceType: onboardingProfile.product_source_type,
                supplierDocuments: onboardingProfile.supplier_documents,
                diagnosticProcess: onboardingProfile.diagnostic_process,
                gradingStandard: onboardingProfile.grading_standard,
                warrantyDays: onboardingProfile.warranty_days,
                returnDays: onboardingProfile.return_days,
                serialCheckPolicy: onboardingProfile.serial_check_policy,
                qualityCharterAccepted: onboardingProfile.quality_charter_accepted,
                legalLookupVerified: onboardingProfile.legal_lookup_verified,
                emailVerified: onboardingProfile.email_verified,
                domainVerified: onboardingProfile.domain_verified,
                representativeVerified: onboardingProfile.representative_verified,
                payoutVerified: onboardingProfile.payout_verified,
                allowedCategories: jsonStringArray(onboardingProfile.allowed_categories),
                listingLimit: onboardingProfile.listing_limit,
              }
            : null,
          evaluation,
          applicant: {
            id: requestItem.user.public_id,
            role: requestItem.user.role.toLowerCase(),
            status: requestItem.user.status.toLowerCase(),
            email: requestItem.user.email,
            name: requestItem.user.name,
          },
          reviewedBy: requestItem.reviewed_by
            ? {
                id: requestItem.reviewed_by.public_id,
                name: requestItem.reviewed_by.name,
                email: requestItem.reviewed_by.email,
              }
            : null,
        };
      }),
    );
  } catch (error) {
    console.error("Error fetching partnership requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/partnership-requests/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as {
      status?: unknown;
      rejectionReason?: unknown;
      adminNote?: unknown;
    };
    const nextStatus = parsePartnershipStatus(body.status);
    if (!nextStatus) {
      res.status(400).json({ error: "Invalid partnership request status" });
      return;
    }

      const existing = await prisma.partnershipRequest.findUnique({
      where: { public_id: String(publicId) },
      select: {
        id: true,
        status: true,
        user_id: true,
        rejection_reason: true,
        admin_note: true,
        onboarding_profile: true,
        user: {
          select: {
            payout_profile: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Partnership request not found" });
      return;
    }

    const rejectionReason =
      nextStatus === "REJECTED" && typeof body.rejectionReason === "string"
        ? body.rejectionReason.trim()
        : null;
    const adminNote =
      typeof body.adminNote === "string" ? body.adminNote.trim() : null;
    const requiresAdminNote =
      nextStatus === "REJECTED" || nextStatus === "NEEDS_MORE_INFO";
    if (requiresAdminNote && !rejectionReason && !adminNote) {
      res.status(400).json({
        error: "Admin note or rejection reason is required for rejected/needs_more_info.",
      });
      return;
    }

    const payoutVerified = existing.user.payout_profile?.status === "VERIFIED";
    if (nextStatus === "APPROVED" && !payoutVerified && !adminNote) {
      res.status(400).json({
        error: "Verified payout profile or explicit admin override note is required for full approval.",
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.partnershipRequest.update({
        where: { id: existing.id },
        data: {
          status: nextStatus,
          reviewed_by_id: access.user.id,
          reviewed_at: new Date(),
          rejection_reason: rejectionReason,
          admin_note: adminNote,
        },
      });

      if (existing.onboarding_profile) {
        await tx.partnerOnboardingProfile.update({
          where: { request_id: existing.id },
          data: {
            payout_verified: payoutVerified,
            allowed_categories: jsonStringArray(
              existing.onboarding_profile.categories,
            ) as Prisma.InputJsonValue,
            listing_limit: nextStatus === "APPROVED_LIMITED" ? 20 : existing.onboarding_profile.listing_limit,
          },
        });
      }

      if (nextStatus === "APPROVED" || nextStatus === "APPROVED_LIMITED") {
        await tx.appUser.update({
          where: { id: existing.user_id },
          data: {
            role: "SELLER",
            status: "ACTIVE",
          },
        });

        await tx.sellerProfile.upsert({
          where: { user_id: existing.user_id },
          create: {
            user_id: existing.user_id,
            is_verified: nextStatus === "APPROVED",
          },
          update: {
            is_verified: nextStatus === "APPROVED",
          },
        });
      }

      return next;
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "partnership_request.status_changed",
      entityType: "partnership_request",
      entityPublicId: String(publicId),
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeRejectionReason: existing.rejection_reason,
        afterRejectionReason: updated.rejection_reason,
        beforeAdminNote: existing.admin_note,
        afterAdminNote: updated.admin_note,
      },
    });

    await createNotification({
      userId: existing.user_id,
      type: nextStatus === "REJECTED" ? "SYSTEM" : "INFO",
      message:
        nextStatus === "REJECTED"
          ? `Партнёрская заявка отклонена.${updated.rejection_reason ? ` Причина: ${updated.rejection_reason}` : ""}`
          : nextStatus === "APPROVED" || nextStatus === "APPROVED_LIMITED"
            ? "Партнёрская заявка одобрена."
            : "Статус партнёрской заявки обновлён.",
      targetUrl: buildTargetUrl("partner"),
    });

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
    });
  } catch (error) {
    console.error("Error updating partnership request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/kyc-requests", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const requests = await prisma.kycRequest.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            joined_at: true,
            seller_profile: {
              select: {
                is_verified: true,
                average_response_minutes: true,
                commission_tier: {
                  select: {
                    public_id: true,
                    name: true,
                    commission_rate: true,
                  },
                },
              },
            },
            _count: {
              select: {
                listings: true,
                orders_as_seller: true,
                complaints_against: true,
              },
            },
          },
        },
        reviewed_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      requests.map((requestItem) => ({
        id: requestItem.public_id,
        createdAt: requestItem.created_at,
        status: requestItem.status.toLowerCase(),
        sellerId: requestItem.seller.public_id,
        sellerName: requestItem.seller.name,
        sellerEmail: requestItem.seller.email,
        sellerPhone: requestItem.seller.phone,
        sellerStatus: requestItem.seller.status.toLowerCase(),
        sellerJoinedAt: requestItem.seller.joined_at,
        sellerVerified: Boolean(requestItem.seller.seller_profile?.is_verified),
        sellerResponseMinutes:
          requestItem.seller.seller_profile?.average_response_minutes ?? null,
        sellerCommissionTier:
          requestItem.seller.seller_profile?.commission_tier
            ? {
                id: requestItem.seller.seller_profile.commission_tier.public_id,
                name: requestItem.seller.seller_profile.commission_tier.name,
                rate: requestItem.seller.seller_profile.commission_tier.commission_rate,
              }
            : null,
        sellerListingsCount: requestItem.seller._count.listings,
        sellerOrdersCount: requestItem.seller._count.orders_as_seller,
        sellerComplaintsCount: requestItem.seller._count.complaints_against,
        email: requestItem.email,
        phone: requestItem.phone,
        companyName: requestItem.company_name,
        inn: requestItem.inn,
        address: requestItem.address,
        documents: requestItem.documents,
        documentFiles: splitEvidenceFiles(requestItem.documents),
        notes: requestItem.notes,
        reviewedAt: requestItem.reviewed_at,
        reviewedBy: requestItem.reviewed_by
          ? {
              id: requestItem.reviewed_by.public_id,
              name: requestItem.reviewed_by.name,
              email: requestItem.reviewed_by.email,
            }
          : null,
        rejectionReason: requestItem.rejection_reason,
        evaluation: buildKycEvaluation({
          documentsCount: splitEvidenceFiles(requestItem.documents).length,
          hasInn: requestItem.inn.trim().length > 0,
          hasAddress: requestItem.address.trim().length > 0,
          sellerComplaintsCount: requestItem.seller._count.complaints_against,
          sellerStatus: requestItem.seller.status,
        }),
      })),
    );
  } catch (error) {
    console.error("Error fetching KYC requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/kyc-requests/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as {
      status?: unknown;
      rejectionReason?: unknown;
    };

    const parsedStatus = parseKycStatus(body.status);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid KYC status" });
      return;
    }

    const existing = await prisma.kycRequest.findUnique({
      where: { public_id: String(publicId) },
      select: { id: true, status: true, rejection_reason: true, seller_id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "KYC request not found" });
      return;
    }

    const updated = await prisma.kycRequest.update({
      where: { id: existing.id },
      data: {
        status: parsedStatus,
        reviewed_at: new Date(),
        reviewed_by_id: access.user.id,
        rejection_reason:
          parsedStatus === "REJECTED" && typeof body.rejectionReason === "string"
            ? body.rejectionReason.trim()
            : null,
      },
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "kyc.status_changed",
      entityType: "kyc_request",
      entityPublicId: String(publicId),
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeRejectionReason: existing.rejection_reason,
        afterRejectionReason: updated.rejection_reason,
      },
    });

    await createNotification({
      userId: updated.seller_id,
      type: parsedStatus === "REJECTED" ? "SYSTEM" : "INFO",
      message:
        parsedStatus === "REJECTED"
          ? `KYC-проверка отклонена.${updated.rejection_reason ? ` Причина: ${updated.rejection_reason}` : ""}`
          : parsedStatus === "APPROVED"
            ? "KYC-проверка одобрена."
            : "KYC-проверка снова ожидает рассмотрения.",
      targetUrl: buildTargetUrl("partner"),
    });

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
    });
  } catch (error) {
    console.error("Error updating KYC request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/payout-profiles", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const profiles = await prisma.sellerPayoutProfile.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        verified_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    });

    res.json(
      profiles.map((profile) => ({
        id: profile.public_id,
        status: profile.status.toLowerCase(),
        legalType: profile.legal_type,
        legalName: profile.legal_name,
        taxId: profile.tax_id,
        bankAccount: profile.bank_account,
        bankBic: profile.bank_bic,
        correspondentAccount: profile.correspondent_account,
        bankName: profile.bank_name,
        recipientName: profile.recipient_name,
        rejectionReason: profile.rejection_reason,
        verifiedAt: profile.verified_at,
        updatedAt: profile.updated_at,
        seller: {
          id: profile.seller.public_id,
          name: profile.seller.name,
          email: profile.seller.email,
          status: profile.seller.status.toLowerCase(),
        },
        verifiedBy: profile.verified_by
          ? {
              id: profile.verified_by.public_id,
              name: profile.verified_by.name,
              email: profile.verified_by.email,
            }
          : null,
      })),
    );
  } catch (error) {
    console.error("Error fetching payout profiles:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/payout-profiles/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as { status?: unknown; rejectionReason?: unknown };
    const nextStatus = parsePayoutStatus(body.status);
    if (!nextStatus) {
      res.status(400).json({ error: "Invalid payout profile status" });
      return;
    }

    const existing = await prisma.sellerPayoutProfile.findUnique({
      where: { public_id: String(publicId) },
      select: {
        id: true,
        status: true,
        rejection_reason: true,
        seller_id: true,
      },
    });
    if (!existing) {
      res.status(404).json({ error: "Payout profile not found" });
      return;
    }

    const rejectionReason =
      nextStatus === "REJECTED" && typeof body.rejectionReason === "string"
        ? body.rejectionReason.trim()
        : null;

    const updated = await prisma.sellerPayoutProfile.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        verified_by_id: nextStatus === "PENDING" ? null : access.user.id,
        verified_at: nextStatus === "PENDING" ? null : new Date(),
        rejection_reason: rejectionReason,
      },
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "seller.payout_profile.status_changed",
      entityType: "seller_payout_profile",
      entityPublicId: String(publicId),
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeRejectionReason: existing.rejection_reason,
        afterRejectionReason: updated.rejection_reason,
      },
    });

    await createNotification({
      userId: updated.seller_id,
      type: nextStatus === "REJECTED" ? "SYSTEM" : "INFO",
      message:
        nextStatus === "REJECTED"
          ? `Платёжный профиль отклонён.${updated.rejection_reason ? ` Причина: ${updated.rejection_reason}` : ""}`
          : nextStatus === "VERIFIED"
            ? "Платёжный профиль подтверждён."
            : "Платёжный профиль снова ожидает проверки.",
      targetUrl: buildTargetUrl("partner"),
    });

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
    });
  } catch (error) {
    console.error("Error updating payout profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/listings", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const listings = await prisma.marketplaceListing.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            joined_at: true,
            status: true,
            addresses: {
              select: {
                city: true,
                region: true,
              },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        _count: {
          select: {
            complaints: true,
            order_items: true,
            wishlist_items: true,
            questions: true,
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
        moderation_events: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
        images: {
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      listings.map((listing) => {
        const addressInfo = extractPrimaryAddressInfo(listing.seller.addresses);
        return {
        id: listing.public_id,
        listingUrl: buildListingPublicUrl(listing.public_id),
        title: listing.title,
        description: listing.description,
        images: listing.images.map((image) => image.url),
        sellerId: listing.seller.public_id,
        sellerName: listing.seller.name,
        sellerStatus: listing.seller.status.toLowerCase(),
        sellerJoinedAt: listing.seller.joined_at,
        status: toAdminListingStatus(listing.moderation_status),
        listingStatus: listing.status.toLowerCase(),
        createdAt: listing.created_at,
        category: listing.item?.name ?? "No category",
        city: addressInfo.city,
        region: addressInfo.region,
        price: listing.price,
        salePrice: listing.sale_price,
        views: listing.views,
        rating: listing.rating,
        complaintsCount: listing._count.complaints,
        ordersCount: listing._count.order_items,
        wishlistCount: listing._count.wishlist_items,
        questionsCount: listing._count.questions,
        autoFlags: buildAutoFlags({
          description: listing.description,
          seller: listing.seller,
          complaints_count: listing._count.complaints,
        }),
        latestModeration: listing.moderation_events[0]
          ? {
              id: listing.moderation_events[0].public_id,
              decision: listing.moderation_events[0].decision.toLowerCase(),
              reasonCode: listing.moderation_events[0].reason_code,
              reasonNote: listing.moderation_events[0].reason_note,
              riskScore: listing.moderation_events[0].risk_score,
              signals: Array.isArray(listing.moderation_events[0].signals)
                ? (listing.moderation_events[0].signals as string[])
                : [],
              createdAt: listing.moderation_events[0].created_at,
            }
          : null,
      }}),
    );
  } catch (error) {
    console.error("Error fetching listings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch(
  "/listings/:publicId/moderation",
  async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as {
        status?: unknown;
        reasonCode?: unknown;
        reasonNote?: unknown;
      };
      const parsedStatus = parseModerationStatus(body.status);

      if (!parsedStatus) {
        res.status(400).json({ error: "Invalid moderation status" });
        return;
      }
      const parsedReasonCode = parseListingModerationReasonCode(body.reasonCode);
      const reasonCode =
        parsedReasonCode ?? defaultListingModerationReasonCode({ moderationStatus: parsedStatus });
      const reasonNote =
        typeof body.reasonNote === "string" ? body.reasonNote.trim().slice(0, 2000) : null;

      const existing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(publicId) },
        select: {
          id: true,
          public_id: true,
          seller_id: true,
          title: true,
          moderation_status: true,
          status: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const activationBlockedByOrder =
        parsedStatus === "APPROVED" ? await hasBlockingOrderForListing(existing.id) : false;
      const nextListingStatus: ListingStatusValue =
        parsedStatus === "APPROVED"
          ? activationBlockedByOrder
            ? "INACTIVE"
            : "ACTIVE"
          : parsedStatus === "REJECTED"
            ? "INACTIVE"
            : "MODERATION";

      const updated = await prisma.marketplaceListing.update({
        where: { id: existing.id },
        data: {
          moderation_status: parsedStatus,
          status: nextListingStatus,
        },
      });

      await writeListingModerationEvent({
        listingId: existing.id,
        actorUserId: access.user.id,
        decision: toModerationDecision(parsedStatus),
        reasonCode,
        reasonNote,
        metadata: {
          source: "admin.patch_moderation",
          activationBlockedByOrder,
        },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "listing.moderation_changed",
        entityType: "listing",
        entityPublicId: String(publicId),
        details: {
          beforeModerationStatus: existing.moderation_status,
          afterModerationStatus: updated.moderation_status,
          beforeListingStatus: existing.status,
          afterListingStatus: updated.status,
          activationBlockedByOrder,
          reasonCode,
          reasonNote,
        },
      });

      await createNotification(
        listingModerationNotification({
          sellerId: existing.seller_id,
          listingPublicId: existing.public_id,
          title: existing.title,
          moderationStatus: parsedStatus,
          reasonNote,
          reasonCode,
        }),
      );

      res.json({
        success: true,
        status: toAdminListingStatus(updated.moderation_status),
        listingStatus: updated.status.toLowerCase(),
        activationBlockedByOrder,
        reasonCode,
        reasonNote,
      });
    } catch (error) {
      console.error("Error moderating listing:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

adminRouter.get("/listings/:publicId/moderation-events", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const listing = await prisma.marketplaceListing.findUnique({
      where: { public_id: String(publicId) },
      select: { id: true },
    });
    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const events = await prisma.listingModerationEvent.findMany({
      where: {
        listing_id: listing.id,
      },
      include: {
        actor: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 200,
    });

    res.json({
      events: events.map((event) => ({
        id: event.public_id,
        actorType: event.actor_type.toLowerCase(),
        actor: event.actor
          ? {
              id: event.actor.public_id,
              name: event.actor.name,
              email: event.actor.email,
            }
          : null,
        decision: event.decision.toLowerCase(),
        reasonCode: event.reason_code,
        reasonNote: event.reason_note,
        riskScore: event.risk_score,
        signals: Array.isArray(event.signals) ? (event.signals as string[]) : [],
        metadata: event.metadata,
        createdAt: event.created_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching listing moderation events:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.post("/listings/moderation/batch", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as {
      listingIds?: unknown;
      status?: unknown;
      reasonCode?: unknown;
      reasonNote?: unknown;
    };
    const listingIds = Array.isArray(body.listingIds)
      ? body.listingIds
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
    if (listingIds.length === 0) {
      res.status(400).json({ error: "listingIds are required" });
      return;
    }

    const parsedStatus = parseModerationStatus(body.status);
    if (!parsedStatus || parsedStatus === "PENDING") {
      res.status(400).json({ error: "Batch supports only approved or rejected status" });
      return;
    }

    const parsedReasonCode = parseListingModerationReasonCode(body.reasonCode);
    const reasonCode =
      parsedReasonCode ?? defaultListingModerationReasonCode({ moderationStatus: parsedStatus });
    const reasonNote =
      typeof body.reasonNote === "string" ? body.reasonNote.trim().slice(0, 2000) : null;

    const existing = await prisma.marketplaceListing.findMany({
      where: {
        public_id: {
          in: Array.from(new Set(listingIds)),
        },
      },
      select: {
        id: true,
        public_id: true,
        seller_id: true,
        title: true,
        moderation_status: true,
        status: true,
      },
    });
    if (existing.length === 0) {
      res.status(404).json({ error: "No listings found for provided ids" });
      return;
    }

    const results = await prisma.$transaction(async (tx) => {
      const rows: Array<{
        id: string;
        status: string;
        listingStatus: string;
        activationBlockedByOrder: boolean;
      }> = [];

      for (const listing of existing) {
        const activationBlockedByOrder =
          parsedStatus === "APPROVED"
            ? Boolean(
                await tx.marketOrderItem.findFirst({
                  where: {
                    listing_id: listing.id,
                    order: {
                      status: {
                        not: "CANCELLED",
                      },
                    },
                  },
                  select: { id: true },
                }),
              )
            : false;
        const nextListingStatus: ListingStatusValue =
          parsedStatus === "APPROVED"
            ? activationBlockedByOrder
              ? "INACTIVE"
              : "ACTIVE"
            : "INACTIVE";

        const updated = await tx.marketplaceListing.update({
          where: { id: listing.id },
          data: {
            moderation_status: parsedStatus,
            status: nextListingStatus,
          },
        });

        await tx.listingModerationEvent.create({
          data: {
            public_id: makeListingModerationEventPublicId(),
            listing_id: listing.id,
            actor_user_id: access.user.id,
            actor_type: "ADMIN",
            decision: toModerationDecision(parsedStatus),
            reason_code: reasonCode,
            reason_note: reasonNote,
            metadata: {
              source: "admin.batch_moderation",
              activationBlockedByOrder,
            },
          },
        });

        const sellerNotification = listingModerationNotification({
          sellerId: listing.seller_id,
          listingPublicId: listing.public_id,
          title: listing.title,
          moderationStatus: parsedStatus,
          reasonNote,
          reasonCode,
        });
        await tx.notification.create({
          data: {
            user_id: sellerNotification.userId,
            type: sellerNotification.type ?? "SYSTEM",
            message: sellerNotification.message,
            target_url: sellerNotification.targetUrl,
          },
        });

        rows.push({
          id: listing.public_id,
          status: toAdminListingStatus(updated.moderation_status),
          listingStatus: updated.status.toLowerCase(),
          activationBlockedByOrder,
        });
      }
      return rows;
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "listing.moderation_changed",
      entityType: "listing",
      entityPublicId: null,
      details: {
        mode: "batch",
        listingIds: existing.map((item) => item.public_id),
        status: parsedStatus,
        reasonCode,
        reasonNote,
      },
    });

    res.json({
      success: true,
      updated: results.length,
      reasonCode,
      reasonNote,
      items: results,
    });
  } catch (error) {
    console.error("Error batch moderating listings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/users", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const users = await prisma.appUser.findMany({
      include: {
        addresses: {
          select: {
            city: true,
            region: true,
          },
          orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
          take: 1,
        },
        seller_profile: {
          select: {
            is_verified: true,
            average_response_minutes: true,
          },
        },
        orders_as_buyer: {
          orderBy: [{ created_at: "desc" }],
          select: {
            public_id: true,
            status: true,
            total_price: true,
            created_at: true,
          },
        },
        orders_as_seller: {
          orderBy: [{ created_at: "desc" }],
          select: {
            public_id: true,
            status: true,
            total_price: true,
            created_at: true,
          },
        },
        listings: {
          select: {
            public_id: true,
            status: true,
            moderation_status: true,
            created_at: true,
          },
        },
        complaints_reported: {
          select: {
            id: true,
          },
        },
        complaints_against: {
          select: {
            id: true,
          },
        },
        kyc_requests: {
          orderBy: [{ created_at: "desc" }],
          take: 1,
          select: {
            public_id: true,
            status: true,
            created_at: true,
            reviewed_at: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
    const userIds = users.map((user) => user.id);
    const [
      approvedViolationsRaw,
      sanctionsTotalRaw,
      activeSanctionsRaw,
      latestSanctionsRaw,
    ] = await Promise.all([
      userIds.length > 0
        ? prisma.complaint.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
              status: "APPROVED",
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.complaintSanction.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.complaintSanction.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
              status: "ACTIVE",
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.complaintSanction.findMany({
            where: {
              seller_id: { in: userIds },
            },
            select: {
              seller_id: true,
              public_id: true,
              level: true,
              status: true,
              starts_at: true,
              ends_at: true,
              reason: true,
              created_at: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
          })
        : Promise.resolve([]),
    ]);

    const approvedViolationsByUser = new Map<number, number>();
    for (const item of approvedViolationsRaw) {
      approvedViolationsByUser.set(item.seller_id, item._count._all);
    }

    const sanctionsTotalByUser = new Map<number, number>();
    for (const item of sanctionsTotalRaw) {
      sanctionsTotalByUser.set(item.seller_id, item._count._all);
    }

    const activeSanctionsByUser = new Map<number, number>();
    for (const item of activeSanctionsRaw) {
      activeSanctionsByUser.set(item.seller_id, item._count._all);
    }

    const latestSanctionByUser = new Map<number, (typeof latestSanctionsRaw)[number]>();
    for (const sanction of latestSanctionsRaw) {
      if (!latestSanctionByUser.has(sanction.seller_id)) {
        latestSanctionByUser.set(sanction.seller_id, sanction);
      }
    }

    res.json(
      users.map((user) => {
        const buyerSpent = user.orders_as_buyer.reduce(
          (sum, order) => sum + order.total_price,
          0,
        );
        const sellerRevenue = user.orders_as_seller.reduce(
          (sum, order) => sum + order.total_price,
          0,
        );
        const activeListings = user.listings.filter(
          (listing) =>
            listing.status === "ACTIVE" &&
            listing.moderation_status === "APPROVED",
        ).length;
        const pendingListings = user.listings.filter(
          (listing) => listing.moderation_status === "PENDING",
        ).length;
        const lastBuyerOrderDate = user.orders_as_buyer[0]?.created_at ?? null;
        const lastSellerOrderDate = user.orders_as_seller[0]?.created_at ?? null;
        const kycLatest = user.kyc_requests[0] ?? null;
        const latestSanction = latestSanctionByUser.get(user.id) ?? null;

        return {
          id: user.public_id,
          name: user.name,
          email: user.email,
          role: toClientRole(user.role),
          status: user.status.toLowerCase(),
          joinedAt: user.joined_at,
          city: extractPrimaryAddressInfo(user.addresses).city || null,
          phone: user.phone,
          blockReason: user.block_reason,
          blockedUntil: user.blocked_until,
          buyerOrders: user.orders_as_buyer.length,
          sellerOrders: user.orders_as_seller.length,
          buyerSpent,
          sellerRevenue,
          avgBuyerCheck:
            user.orders_as_buyer.length > 0
              ? Math.round(buyerSpent / user.orders_as_buyer.length)
              : 0,
          avgSellerCheck:
            user.orders_as_seller.length > 0
              ? Math.round(sellerRevenue / user.orders_as_seller.length)
              : 0,
          activeListings,
          pendingListings,
          totalListings: user.listings.length,
          complaintsMade: user.complaints_reported.length,
          complaintsAgainst: user.complaints_against.length,
          approvedViolations: approvedViolationsByUser.get(user.id) ?? 0,
          sanctionsTotal: sanctionsTotalByUser.get(user.id) ?? 0,
          sanctionsActive: activeSanctionsByUser.get(user.id) ?? 0,
          latestSanction: latestSanction
            ? {
                id: latestSanction.public_id,
                level: toClientSanctionLevel(latestSanction.level),
                status: toClientComplaintSanctionStatus(latestSanction.status),
                startsAt: latestSanction.starts_at,
                endsAt: latestSanction.ends_at,
                reason: latestSanction.reason,
                createdAt: latestSanction.created_at,
              }
            : null,
          isSellerVerified: Boolean(user.seller_profile?.is_verified),
          sellerResponseMinutes:
            user.seller_profile?.average_response_minutes ?? null,
          lastBuyerOrderDate,
          lastSellerOrderDate,
          kycLatest: kycLatest
            ? {
                id: kycLatest.public_id,
                status: kycLatest.status.toLowerCase(),
                createdAt: kycLatest.created_at,
                reviewedAt: kycLatest.reviewed_at,
              }
            : null,
        };
      }),
    );
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/users/:publicId/status", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as {
      status?: unknown;
      blockReason?: unknown;
    };

    const parsedStatus = parseUserStatus(body.status);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid user status" });
      return;
    }

    const existing = await prisma.appUser.findUnique({
      where: { public_id: String(publicId) },
      select: {
        id: true,
        role: true,
        status: true,
        block_reason: true,
        blocked_until: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (existing.role === "ADMIN") {
      res.status(400).json({ error: "Cannot update admin status" });
      return;
    }

    const rawBlockReason =
      parsedStatus === "BLOCKED" && typeof body.blockReason === "string"
        ? body.blockReason.trim()
        : "";
    if (rawBlockReason.length > MAX_BLOCK_REASON_LENGTH) {
      res.status(400).json({
        error: `Причина блокировки не должна превышать ${MAX_BLOCK_REASON_LENGTH} символов`,
      });
      return;
    }

    const updated = await prisma.appUser.update({
      where: { id: existing.id },
      data: {
        status: parsedStatus,
        block_reason:
          parsedStatus === "BLOCKED"
            ? rawBlockReason || "Нарушение правил платформы"
            : null,
        blocked_until: null,
      },
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "user.status_changed",
      entityType: "user",
      entityPublicId: String(publicId),
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeBlockReason: existing.block_reason,
        afterBlockReason: updated.block_reason,
        beforeBlockedUntil: existing.blocked_until,
        afterBlockedUntil: updated.blocked_until,
      },
    });

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
      blockedUntil: updated.blocked_until,
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/commission-tiers", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const tiers = await prisma.commissionTier.findMany({
      include: {
        _count: {
          select: {
            seller_profiles: true,
          },
        },
      },
      orderBy: [{ min_sales: "asc" }, { id: "asc" }],
    });

    res.json(
      tiers.map((tier) => ({
        id: tier.public_id,
        name: tier.name,
        minSales: tier.min_sales,
        maxSales: tier.max_sales,
        commissionRate: tier.commission_rate,
        description: tier.description,
        sellersCount: tier._count.seller_profiles,
      })),
    );
  } catch (error) {
    console.error("Error fetching commission tiers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/commission-tiers", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as {
      tiers?: unknown;
    };
    const requestedTiers = Array.isArray(body.tiers) ? body.tiers : [];
    if (requestedTiers.length === 0) {
      res.status(400).json({ error: "No commission tiers provided" });
      return;
    }

    const existingTiers = await prisma.commissionTier.findMany({
      orderBy: [{ min_sales: "asc" }, { id: "asc" }],
      select: {
        id: true,
        public_id: true,
        min_sales: true,
        max_sales: true,
        commission_rate: true,
      },
    });
    const existingByPublicId = new Map(
      existingTiers.map((tier) => [tier.public_id, tier]),
    );

    const nextByPublicId = new Map<
      string,
      { minSales: number; maxSales: number | null; commissionRate: number }
    >();

    for (const rawTier of requestedTiers) {
      if (!rawTier || typeof rawTier !== "object") {
        res.status(400).json({ error: "Invalid commission tier payload" });
        return;
      }

      const item = rawTier as {
        id?: unknown;
        minSales?: unknown;
        maxSales?: unknown;
        commissionRate?: unknown;
      };
      const publicId = typeof item.id === "string" ? item.id.trim() : "";
      const existing = existingByPublicId.get(publicId);
      if (!existing) {
        res.status(404).json({ error: "Commission tier not found" });
        return;
      }

      const minSales = Number(item.minSales);
      const maxSales = item.maxSales === null ? null : Number(item.maxSales);
      const commissionRate = Number(item.commissionRate);
      if (
        !Number.isInteger(minSales) ||
        minSales < 0 ||
        (maxSales !== null && (!Number.isInteger(maxSales) || maxSales < 0)) ||
        !Number.isFinite(commissionRate) ||
        commissionRate <= 0 ||
        commissionRate > 100
      ) {
        res.status(400).json({ error: "Invalid commission tier values" });
        return;
      }

      nextByPublicId.set(publicId, {
        minSales,
        maxSales,
        commissionRate,
      });
    }

    const finalTiers = existingTiers.map((tier) => {
      const next = nextByPublicId.get(tier.public_id);
      return {
        ...tier,
        min_sales: next?.minSales ?? tier.min_sales,
        max_sales: next?.maxSales ?? tier.max_sales,
        commission_rate: next?.commissionRate ?? tier.commission_rate,
      };
    });

    for (let index = 0; index < finalTiers.length; index += 1) {
      const tier = finalTiers[index];
      const previous = finalTiers[index - 1];
      const next = finalTiers[index + 1];

      if (tier.max_sales !== null && tier.min_sales > tier.max_sales) {
        res.status(400).json({
          error: `Минимальные продажи уровня ${tier.public_id} не должны быть больше максимальных`,
        });
        return;
      }

      if (previous?.max_sales !== null && previous && tier.min_sales < previous.max_sales) {
        res.status(400).json({
          error: `Минимальные продажи уровня ${tier.public_id} не должны быть меньше максимума предыдущего уровня`,
        });
        return;
      }

      if (next && tier.max_sales !== null && tier.max_sales > next.min_sales) {
        res.status(400).json({
          error: `Максимальные продажи уровня ${tier.public_id} не должны быть больше минимума следующего уровня`,
        });
        return;
      }
    }

    const changedTiers = finalTiers.filter((tier) => {
      const existing = existingByPublicId.get(tier.public_id);
      return (
        existing &&
        (existing.min_sales !== tier.min_sales ||
          existing.max_sales !== tier.max_sales ||
          existing.commission_rate !== tier.commission_rate)
      );
    });

    await prisma.$transaction(async (tx) => {
      for (const tier of changedTiers) {
        await tx.commissionTier.update({
          where: { id: tier.id },
          data: {
            min_sales: tier.min_sales,
            max_sales: tier.max_sales,
            commission_rate: tier.commission_rate,
          },
        });
      }
    });

    for (const tier of changedTiers) {
      const existing = existingByPublicId.get(tier.public_id);
      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "commission_tier.rate_changed",
        entityType: "commission_tier",
        entityPublicId: tier.public_id,
        details: {
          beforeMinSales: existing?.min_sales,
          afterMinSales: tier.min_sales,
          beforeMaxSales: existing?.max_sales,
          afterMaxSales: tier.max_sales,
          beforeCommissionRate: existing?.commission_rate,
          afterCommissionRate: tier.commission_rate,
        },
      });
    }

    res.json({
      success: true,
      updated: changedTiers.length,
    });
  } catch (error) {
    console.error("Error batch updating commission tiers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch(
  "/commission-tiers/:publicId",
  async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { commissionRate?: unknown };
      const nextRate = Number(body.commissionRate);

      if (!Number.isFinite(nextRate) || nextRate <= 0 || nextRate > 100) {
        res.status(400).json({ error: "Invalid commission rate" });
        return;
      }

      const existing = await prisma.commissionTier.findUnique({
        where: { public_id: String(publicId) },
        select: { id: true, commission_rate: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Commission tier not found" });
        return;
      }

      const updated = await prisma.commissionTier.update({
        where: { id: existing.id },
        data: { commission_rate: nextRate },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "commission_tier.rate_changed",
        entityType: "commission_tier",
        entityPublicId: String(publicId),
        details: {
          beforeCommissionRate: existing.commission_rate,
          afterCommissionRate: updated.commission_rate,
        },
      });

      res.json({
        success: true,
        commissionRate: updated.commission_rate,
      });
    } catch (error) {
      console.error("Error updating commission tier:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export { adminRouter };
