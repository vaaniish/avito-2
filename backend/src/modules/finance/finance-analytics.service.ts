import type { Prisma } from "@prisma/client";
import {
  FINANCE_ORDER_LABELS,
  FINANCE_SETTLEMENT_BUCKETS,
  FINANCE_TRANSACTION_LABELS,
  financePeriodKey,
  getFinanceSettlementBucket,
  isFinanceActiveOrder,
  isFinanceEarnedStatus,
  isFinancePayableStatus,
  type FinanceGroupBy,
  type FinanceOrderStatus,
  type FinanceSettlementBucket,
  type FinanceSettlementBucketKey,
  type FinanceTransactionStatus,
} from "./finance.shared";

type AggregationItem = {
  name: string;
  price: number;
  quantity: number;
  listing: {
    public_id: string;
    title?: string | null;
  } | null;
};

type AggregationOrder = {
  public_id: string;
  status: string;
  delivery_type: string;
  delivery_address: string | null;
  items: AggregationItem[];
};

type AggregationActor = {
  public_id: string;
  name: string;
  email: string;
};

export type FinanceAggregationTransaction = {
  id: number;
  public_id: string;
  amount: number;
  status: string;
  commission: number;
  commission_rate: number;
  payment_provider: string;
  payment_intent_id: string;
  created_at: Date;
  buyer: AggregationActor;
  seller: AggregationActor;
  order: AggregationOrder;
};

export type FinanceAnalyticsSummary = {
  gross: number;
  earned: number;
  payable: number;
  commissions: number;
  held: number;
  refundedCancelled: number;
  sellerPayout: number;
  transactions: number;
  ordersTotal: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgCheck: number;
  avgCommission: number;
  successRate: number;
};

export type FinanceAnalyticsPoint = {
  period: string;
  gross: number;
  commissions: number;
  sellerPayout: number;
  transactions: number;
  orders: number;
  itemsSold: number;
  medianPrice: number;
};

export type FinanceBreakdownItem = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

export type FinanceReportRow = {
  id: string;
  orderId: string;
  orderStatus: string;
  transactionStatus: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  listingTitle: string;
  listingIds: string[];
  itemsCount: number;
  itemsTotalQuantity: number;
  deliveryType: string;
  deliveryAddress: string | null;
  amount: number;
  commission: number;
  commissionRate: number;
  sellerPayout: number;
  paymentProvider: string;
  paymentIntentId: string;
  createdAt: Date;
};

export type FinanceAnalyticsAggregation = {
  summary: FinanceAnalyticsSummary;
  timeSeries: FinanceAnalyticsPoint[];
  transactionStatusBreakdown: FinanceBreakdownItem[];
  orderStatusBreakdown: FinanceBreakdownItem[];
  settlementBuckets: FinanceSettlementBucket[];
  reportRows: FinanceReportRow[];
};

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

function buildReportListingTitle(items: AggregationItem[]): string {
  if (items.length === 0) return "Без названия";
  const first = items[0]?.name?.trim() || "Без названия";
  if (items.length === 1) return first;
  return `${first} +${items.length - 1} поз.`;
}

export function buildFinanceSearchHaystack(
  transaction: FinanceAggregationTransaction,
  extraParts: string[] = [],
): string {
  return [
    transaction.public_id,
    transaction.order.public_id,
    transaction.buyer.public_id,
    transaction.buyer.name,
    transaction.buyer.email,
    transaction.payment_intent_id,
    ...transaction.order.items.map((item) => item.name),
    ...transaction.order.items.map((item) => item.listing?.public_id ?? ""),
    ...extraParts,
  ]
    .join(" ")
    .toLowerCase();
}

export function aggregateFinanceTransactions(params: {
  transactions: FinanceAggregationTransaction[];
  groupBy: FinanceGroupBy;
}): FinanceAnalyticsAggregation {
  const statusBreakdown = new Map<
    FinanceTransactionStatus,
    { key: string; label: string; count: number; amount: number }
  >();
  const orderRecords = new Map<
    string,
    {
      status: FinanceOrderStatus;
      amount: number;
    }
  >();
  const timeSeries = new Map<
    string,
    {
      period: string;
      gross: number;
      commissions: number;
      sellerPayout: number;
      transactions: number;
      orderIds: Set<string>;
      itemsSold: number;
      itemPrices: number[];
    }
  >();
  const settlementBuckets = new Map<FinanceSettlementBucketKey, FinanceSettlementBucket>();

  let gross = 0;
  let earned = 0;
  let payable = 0;
  let commissions = 0;
  let held = 0;
  let refundedCancelled = 0;
  let successfulTransactions = 0;

  for (const transaction of params.transactions) {
    const transactionStatusValue = transaction.status as FinanceTransactionStatus;
    const orderStatusValue = transaction.order.status as FinanceOrderStatus;
    const sellerPayout = transaction.amount - transaction.commission;
    const period = financePeriodKey(transaction.created_at, params.groupBy);

    const existingStatus = statusBreakdown.get(transactionStatusValue) ?? {
      key: transactionStatusValue.toLowerCase(),
      label: FINANCE_TRANSACTION_LABELS[transactionStatusValue],
      count: 0,
      amount: 0,
    };
    existingStatus.count += 1;
    existingStatus.amount += transaction.amount;
    statusBreakdown.set(transactionStatusValue, existingStatus);

    const existingOrder = orderRecords.get(transaction.order.public_id);
    if (!existingOrder) {
      orderRecords.set(transaction.order.public_id, {
        status: orderStatusValue,
        amount: transaction.amount,
      });
    }

    const existingPeriod = timeSeries.get(period) ?? {
      period,
      gross: 0,
      commissions: 0,
      sellerPayout: 0,
      transactions: 0,
      orderIds: new Set<string>(),
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
    existingPeriod.orderIds.add(transaction.order.public_id);
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

    gross += transaction.amount;
    commissions += transaction.commission;
    earned += isFinanceEarnedStatus(transactionStatusValue) ? sellerPayout : 0;
    payable += isFinancePayableStatus(transactionStatusValue, orderStatusValue) ? sellerPayout : 0;
    held += transactionStatusValue === "HELD" ? sellerPayout : 0;
    refundedCancelled +=
      transactionStatusValue === "REFUNDED" || transactionStatusValue === "CANCELLED"
        ? transaction.amount
        : 0;
    successfulTransactions += transactionStatusValue === "SUCCESS" ? 1 : 0;
  }

  const orderStatusBreakdown = new Map<
    FinanceOrderStatus,
    { key: string; label: string; count: number; amount: number }
  >();
  let activeOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;

  for (const orderRecord of orderRecords.values()) {
    const existing = orderStatusBreakdown.get(orderRecord.status) ?? {
      key: orderRecord.status.toLowerCase(),
      label: FINANCE_ORDER_LABELS[orderRecord.status],
      count: 0,
      amount: 0,
    };
    existing.count += 1;
    existing.amount += orderRecord.amount;
    orderStatusBreakdown.set(orderRecord.status, existing);

    activeOrders += isFinanceActiveOrder(orderRecord.status) ? 1 : 0;
    completedOrders += orderRecord.status === "COMPLETED" ? 1 : 0;
    cancelledOrders += orderRecord.status === "CANCELLED" ? 1 : 0;
  }

  return {
    summary: {
      gross,
      earned,
      payable,
      commissions,
      held,
      refundedCancelled,
      sellerPayout: earned,
      transactions: params.transactions.length,
      ordersTotal: orderRecords.size,
      activeOrders,
      completedOrders,
      cancelledOrders,
      avgCheck: params.transactions.length > 0 ? Math.round(gross / params.transactions.length) : 0,
      avgCommission: params.transactions.length > 0 ? Math.round(commissions / params.transactions.length) : 0,
      successRate:
        params.transactions.length > 0
          ? Math.round((successfulTransactions / params.transactions.length) * 1000) / 10
          : 0,
    },
    timeSeries: Array.from(timeSeries.values())
      .map(({ itemPrices, orderIds, ...point }) => ({
        ...point,
        orders: orderIds.size,
        medianPrice: medianNumber(itemPrices),
      }))
      .sort((left, right) => left.period.localeCompare(right.period)),
    transactionStatusBreakdown: Array.from(statusBreakdown.values()),
    orderStatusBreakdown: Array.from(orderStatusBreakdown.values()),
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
    reportRows: params.transactions.map((transaction) => ({
      id: transaction.public_id,
      orderId: transaction.order.public_id,
      orderStatus: transaction.order.status.toLowerCase(),
      transactionStatus: transaction.status.toLowerCase(),
      buyerId: transaction.buyer.public_id,
      buyerName: transaction.buyer.name,
      buyerEmail: transaction.buyer.email,
      listingTitle: buildReportListingTitle(transaction.order.items),
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
  };
}

export type PartnerFinanceTransactionRow = Prisma.PlatformTransactionGetPayload<{
  include: {
    buyer: {
      select: {
        public_id: true;
        name: true;
        email: true;
      };
    };
    order: {
      include: {
        items: {
          orderBy: [{ id: "asc" }];
          include: {
            listing: {
              select: {
                public_id: true;
                title: true;
              };
            };
          };
        };
      };
    };
  };
}>;
