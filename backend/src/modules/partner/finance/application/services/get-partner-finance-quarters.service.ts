import {
  getQuarterWindow,
  getQuarterWindowByKey,
  getYearQuarterWindowsForYear,
} from "../../../../finance/domain/commission-program";
import { formatQuarterLabel } from "../../domain/partner-finance.helpers";
import type {
  PartnerFinanceCommissionRepositoryPort,
  PartnerFinanceTransactionsRepositoryPort,
} from "../../domain/partner-finance.types";

export class GetPartnerFinanceQuartersService {
  constructor(
    private readonly transactionsRepository: PartnerFinanceTransactionsRepositoryPort,
    private readonly commissionRepository: PartnerFinanceCommissionRepositoryPort,
  ) {}

  async execute(input: {
    sellerId: number;
    selectedYear: number;
    requestedQuarterKey: string;
    currentYear: number;
  }) {
    const [years, quarterSummaries, tiers, payoutProfile] = await Promise.all([
      this.commissionRepository.getSellerFinanceHistoryYears({
        sellerId: input.sellerId,
      }),
      this.commissionRepository.getSellerQuarterFinanceSummaries({
        sellerId: input.sellerId,
        year: input.selectedYear,
      }),
      this.transactionsRepository.listCommissionTiers(),
      this.transactionsRepository.getPayoutProfileStatus(input.sellerId),
    ]);

    const windows = getYearQuarterWindowsForYear(input.selectedYear);
    const mergedQuarterSummaries = windows.map((window) => {
      const summary = quarterSummaries.find(
        (item) => item.periodKey === window.periodKey,
      );
      return {
        periodKey: window.periodKey,
        periodLabel: window.periodLabel,
        periodStart: summary?.periodStart ?? window.periodStart,
        periodEnd: summary?.periodEnd ?? window.periodEnd,
        gross: summary?.gross ?? 0,
        sellerProfit: summary?.sellerProfit ?? 0,
        commission: summary?.commission ?? 0,
        held: summary?.held ?? 0,
        refundedCancelled: summary?.refundedCancelled ?? 0,
        payable: summary?.payable ?? 0,
        completedOrders: summary?.completedOrders ?? 0,
        qualifiedGmv: summary?.qualifiedGmv ?? 0,
        currentTierId: summary?.currentTierId ?? null,
        nextTierId: summary?.nextTierId ?? null,
        salesToNextTier: summary?.salesToNextTier ?? 0,
        percentToNextTier: summary?.percentToNextTier ?? 0,
        commissionRateAtPeriodEnd: summary?.commissionRateAtPeriodEnd ?? 0,
        snapshotFinalizedAt: summary?.snapshotFinalizedAt ?? null,
      };
    });
    const availableYears = Array.from(new Set([input.currentYear, ...years])).sort(
      (left, right) => right - left,
    );
    const selectedQuarterKey = mergedQuarterSummaries.some(
      (summary) => summary.periodKey === input.requestedQuarterKey,
    )
      ? input.requestedQuarterKey
      : windows.find((window) => window.periodKey === getQuarterWindow().periodKey)
            ?.periodKey ??
        windows[0]?.periodKey ??
        `${input.selectedYear}-Q1`;
    const selectedQuarterSnapshot =
      await this.commissionRepository.getSellerQuarterFinanceSnapshot({
        sellerId: input.sellerId,
        periodKey: selectedQuarterKey,
      });

    if (!selectedQuarterSnapshot) {
      throw new Error("Quarter snapshot is not available");
    }

    return {
      availableYears,
      selectedYear: input.selectedYear,
      selectedQuarterKey,
      commissionProgram: {
        periodKey: selectedQuarterKey,
        periodLabel:
          selectedQuarterSnapshot.summary.periodLabel ??
          formatQuarterLabel(selectedQuarterKey),
        qualifiedGmv: selectedQuarterSnapshot.summary.qualifiedGmv,
        completedOrders: selectedQuarterSnapshot.summary.completedOrders,
        currentTier: {
          id: selectedQuarterSnapshot.currentTier.public_id,
          name: selectedQuarterSnapshot.currentTier.name,
          rate: selectedQuarterSnapshot.currentTier.commission_rate,
          minSales: selectedQuarterSnapshot.currentTier.min_sales,
          maxSales: selectedQuarterSnapshot.currentTier.max_sales,
        },
        nextTier: selectedQuarterSnapshot.nextTier
          ? {
              id: selectedQuarterSnapshot.nextTier.public_id,
              name: selectedQuarterSnapshot.nextTier.name,
              rate: selectedQuarterSnapshot.nextTier.commission_rate,
              minSales: selectedQuarterSnapshot.nextTier.min_sales,
              maxSales: selectedQuarterSnapshot.nextTier.max_sales,
            }
          : null,
        salesToNextTier: selectedQuarterSnapshot.summary.salesToNextTier,
        tiers: tiers.map((tier) => ({
          id: tier.public_id,
          name: tier.name,
          rate: tier.commission_rate,
          minSales: tier.min_sales,
          maxSales: tier.max_sales,
        })),
        progress: {
          currentSales: selectedQuarterSnapshot.summary.qualifiedGmv,
          currentFloor: selectedQuarterSnapshot.currentTier.min_sales,
          nextFloor: selectedQuarterSnapshot.nextTier?.min_sales ?? null,
          salesToNextTier: selectedQuarterSnapshot.summary.salesToNextTier,
          percentToNextTier: selectedQuarterSnapshot.summary.percentToNextTier,
        },
        resetsAt:
          getQuarterWindowByKey(selectedQuarterKey)?.resetsAt.toISOString() ??
          getQuarterWindow().resetsAt.toISOString(),
        payoutProfileStatus: payoutProfile?.status.toLowerCase() ?? "missing",
        payoutProfileUpdatedAt: payoutProfile?.updated_at ?? null,
      },
      quarterSummaries: mergedQuarterSummaries.map((summary) => ({
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
    };
  }
}
