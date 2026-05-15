import {
  aggregateFinanceTransactions,
  buildFinanceSearchHaystack,
} from "../../../../finance/finance-analytics.service";
import {
  getQuarterWindow,
  getQuarterWindowByKey,
} from "../../../../finance/domain/commission-program";
import type {
  PartnerFinanceCommissionRepositoryPort,
  PartnerFinanceTransactionsRepositoryPort,
} from "../../domain/partner-finance.types";

export class GetPartnerFinanceAnalyticsService {
  constructor(
    private readonly transactionsRepository: PartnerFinanceTransactionsRepositoryPort,
    private readonly commissionRepository: PartnerFinanceCommissionRepositoryPort,
  ) {}

  async execute(input: {
    sellerId: number;
    from: Date;
    to: Date;
    groupBy: "day" | "week" | "month";
    transactionStatus: any;
    orderStatus: any;
    search: string;
    requestedQuarterKey: string;
    reportLimit: number;
    reportOffset: number;
  }) {
    const transactions = await this.transactionsRepository.findTransactionsForAnalytics({
      sellerId: input.sellerId,
      from: input.from,
      to: input.to,
      transactionStatus: input.transactionStatus,
      orderStatus: input.orderStatus,
    });

    const filteredTransactions = input.search
      ? transactions.filter((transaction) =>
          buildFinanceSearchHaystack(transaction).includes(input.search),
        )
      : transactions;

    const aggregation = aggregateFinanceTransactions({
      transactions: filteredTransactions,
      groupBy: input.groupBy,
    });

    const [commissionSnapshot, payoutProfile, quarterSummaries] =
      await Promise.all([
        this.commissionRepository.recomputeSellerCommissionSnapshot({
          sellerId: input.sellerId,
        }),
        this.transactionsRepository.getPayoutProfileStatus(input.sellerId),
        this.commissionRepository.getSellerQuarterFinanceSummaries({
          sellerId: input.sellerId,
        }),
      ]);

    const selectedQuarterWindow =
      getQuarterWindowByKey(input.requestedQuarterKey) ?? getQuarterWindow();
    const selectedQuarterSummary =
      quarterSummaries.find(
        (summary) => summary.periodKey === selectedQuarterWindow.periodKey,
      ) ??
      quarterSummaries[quarterSummaries.length - 1] ??
      null;

    return {
      filters: {
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        groupBy: input.groupBy,
        transactionStatus: input.transactionStatus?.toLowerCase() ?? "all",
        orderStatus: input.orderStatus?.toLowerCase() ?? "all",
        search: input.search,
      },
      summary: aggregation.summary,
      timeSeries: aggregation.timeSeries,
      transactionStatusBreakdown: aggregation.transactionStatusBreakdown,
      orderStatusBreakdown: aggregation.orderStatusBreakdown,
      settlementBuckets: aggregation.settlementBuckets,
      commissionProgram: {
        periodKey: commissionSnapshot.window.periodKey,
        periodLabel: commissionSnapshot.window.periodLabel,
        qualifiedGmv: commissionSnapshot.qualifiedGmv,
        completedOrders: commissionSnapshot.completedOrders,
        currentTier: {
          id: commissionSnapshot.currentTier.public_id,
          name: commissionSnapshot.currentTier.name,
          rate: commissionSnapshot.currentTier.commission_rate,
          minSales: commissionSnapshot.currentTier.min_sales,
          maxSales: commissionSnapshot.currentTier.max_sales,
        },
        nextTier: commissionSnapshot.nextTier
          ? {
              id: commissionSnapshot.nextTier.public_id,
              name: commissionSnapshot.nextTier.name,
              rate: commissionSnapshot.nextTier.commission_rate,
              minSales: commissionSnapshot.nextTier.min_sales,
              maxSales: commissionSnapshot.nextTier.max_sales,
            }
          : null,
        salesToNextTier: commissionSnapshot.salesToNextTier,
        tiers: commissionSnapshot.tiers.map((tier) => ({
          id: tier.public_id,
          name: tier.name,
          rate: tier.commission_rate,
          minSales: tier.min_sales,
          maxSales: tier.max_sales,
        })),
        progress: {
          currentSales: commissionSnapshot.qualifiedGmv,
          currentFloor: commissionSnapshot.currentTier.min_sales,
          nextFloor: commissionSnapshot.nextTier?.min_sales ?? null,
          salesToNextTier: commissionSnapshot.salesToNextTier,
          percentToNextTier: commissionSnapshot.nextTier
            ? Math.max(
                0,
                Math.min(
                  100,
                  ((commissionSnapshot.qualifiedGmv -
                    commissionSnapshot.currentTier.min_sales) /
                    Math.max(
                      1,
                      commissionSnapshot.nextTier.min_sales -
                        commissionSnapshot.currentTier.min_sales,
                    )) *
                    100,
                ),
              )
            : 100,
        },
        resetsAt: commissionSnapshot.window.resetsAt.toISOString(),
        payoutProfileStatus: payoutProfile?.status.toLowerCase() ?? "missing",
        payoutProfileUpdatedAt: payoutProfile?.updated_at ?? null,
      },
      availableQuarterKeys: quarterSummaries.map((summary) => summary.periodKey),
      selectedQuarterKey:
        selectedQuarterSummary?.periodKey ?? selectedQuarterWindow.periodKey,
      quarterSummaries: quarterSummaries.map((summary) => ({
        periodKey: summary.periodKey,
        periodLabel: summary.periodLabel,
        periodStart: summary.periodStart.toISOString(),
        periodEnd: summary.periodEnd.toISOString(),
        gross: summary.gross,
        sellerProfit: summary.sellerProfit,
        commission: summary.commission,
        held: summary.held,
        refundedCancelled: summary.refundedCancelled,
        payable: summary.payable,
        completedOrders: summary.completedOrders,
        qualifiedGmv: summary.qualifiedGmv,
        currentTierId: summary.currentTierId,
        nextTierId: summary.nextTierId,
        salesToNextTier: summary.salesToNextTier,
        percentToNextTier: summary.percentToNextTier,
        commissionRateAtPeriodEnd: summary.commissionRateAtPeriodEnd,
        snapshotFinalizedAt: summary.snapshotFinalizedAt?.toISOString() ?? null,
      })),
      reportMeta: {
        total: filteredTransactions.length,
        limit: input.reportLimit,
        offset: input.reportOffset,
        hasMore: input.reportOffset + input.reportLimit < filteredTransactions.length,
      },
      reportRows: aggregation.reportRows.slice(
        input.reportOffset,
        input.reportOffset + input.reportLimit,
      ),
    };
  }
}
