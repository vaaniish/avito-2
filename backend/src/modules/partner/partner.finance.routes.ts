import type { Request, Response, Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
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

const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";

function medianNumber(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

export function registerPartnerFinanceRoutes(router: Router): void {
  router.get("/finance/analytics", async (req: Request, res: Response) => {
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
        FinanceOrderStatus,
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
}
