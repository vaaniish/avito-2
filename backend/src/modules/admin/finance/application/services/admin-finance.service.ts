import {
  aggregateFinanceTransactions,
  buildFinanceSearchHaystack,
  type FinanceAggregationTransaction,
} from "../../../../finance/finance-analytics.service";
import {
  FINANCE_SETTLEMENT_BUCKETS,
  parseFinanceDateRangeInput,
  parseFinanceOrderStatus,
  parseFinanceReportLimit,
  parseFinanceReportOffset,
  parseFinanceTransactionStatus,
  type FinanceOrderStatus,
  type FinanceSettlementBucketKey,
  type FinanceTransactionStatus,
} from "../../../../finance/domain/finance.helpers";
import type { AdminFinanceRepository } from "../../infrastructure/repositories/admin-finance.repository";

export class ListAdminTransactionsService {
  constructor(private readonly repository: AdminFinanceRepository) {}

  async execute() {
    const transactions = await this.repository.findTransactions();
    return transactions.map((transaction) => ({
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
    }));
  }
}

export class GetAdminFinanceAnalyticsService {
  constructor(private readonly repository: AdminFinanceRepository) {}

  async execute(query: Record<string, unknown>) {
    const { from, to, groupBy } = parseFinanceDateRangeInput({
      from: query.from,
      to: query.to,
      groupBy: query.groupBy,
    });
    const transactionStatus = parseFinanceTransactionStatus(
      query.transactionStatus,
    );
    const orderStatus = parseFinanceOrderStatus(query.orderStatus);
    const search =
      typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
    const reportLimit = parseFinanceReportLimit(query.reportLimit);
    const reportOffset = parseFinanceReportOffset(query.reportOffset);

    const transactions =
      (await this.repository.findTransactionsForAnalytics({
        from,
        to,
        transactionStatus,
        orderStatus,
      })) as FinanceAggregationTransaction[];

    const filteredTransactions = search
      ? transactions.filter((transaction) =>
          buildFinanceSearchHaystack(transaction, [
            transaction.seller.public_id,
            transaction.seller.name,
            transaction.seller.email,
          ]).includes(search),
        )
      : transactions;

    const aggregation = aggregateFinanceTransactions({
      transactions: filteredTransactions,
      groupBy,
    });

    const topSellers = new Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        transactions: number;
        orders: Set<string>;
        gross: number;
        commissions: number;
        sellerPayout: number;
        cancelled: number;
        refunded: number;
      }
    >();

    filteredTransactions.forEach((transaction) => {
      const transactionStatusValue =
        transaction.status as FinanceTransactionStatus;
      const sellerPayout = transaction.amount - transaction.commission;
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
    });

    const orderIds = new Set(filteredTransactions.map((item) => item.order.public_id));
    const orderStatuses = new Set(
      filteredTransactions.map((item) => item.order.status as FinanceOrderStatus),
    );
    const settlementBuckets = (
      [
        "pendingPayment",
        "inProgress",
        "readyToPayout",
        "problem",
      ] as FinanceSettlementBucketKey[]
    ).map((key) => {
      return (
        aggregation.settlementBuckets.find((bucket) => bucket.key === key) ?? {
          ...FINANCE_SETTLEMENT_BUCKETS[key],
          count: 0,
          amount: 0,
          commissions: 0,
          sellerPayout: 0,
        }
      );
    });

    return {
      filters: {
        from: from.toISOString(),
        to: to.toISOString(),
        groupBy,
        transactionStatus: transactionStatus?.toLowerCase() ?? "all",
        orderStatus: orderStatus?.toLowerCase() ?? "all",
        search,
      },
      summary: aggregation.summary,
      timeSeries: aggregation.timeSeries,
      transactionStatusBreakdown: aggregation.transactionStatusBreakdown,
      orderStatusBreakdown: aggregation.orderStatusBreakdown,
      settlementBuckets,
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
      reportRows: aggregation.reportRows.slice(
        reportOffset,
        reportOffset + reportLimit,
      ),
      orderStatuses: Array.from(orderStatuses),
      ordersTotal: orderIds.size,
    };
  }
}
