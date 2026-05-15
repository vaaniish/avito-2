import type { CommissionTier } from "@prisma/client";
import type {
  QuarterFinanceSummary,
  SellerCommissionSnapshot,
  SellerQuarterFinanceSnapshot,
} from "../../../finance/domain/commission-program";
import type { FinanceAggregationTransaction } from "../../../finance/finance-analytics.service";
import type {
  FinanceOrderStatus,
  FinanceTransactionStatus,
} from "../../../finance/domain/finance.helpers";

export interface PartnerFinanceTransactionsRepositoryPort {
  findTransactionsForAnalytics(params: {
    sellerId: number;
    from: Date;
    to: Date;
    transactionStatus: FinanceTransactionStatus | null;
    orderStatus: FinanceOrderStatus | null;
  }): Promise<FinanceAggregationTransaction[]>;
  getPayoutProfileStatus(sellerId: number): Promise<{
    status: string;
    updated_at: Date;
  } | null>;
  listCommissionTiers(): Promise<CommissionTier[]>;
}

export interface PartnerFinanceCommissionRepositoryPort {
  recomputeSellerCommissionSnapshot(params: {
    sellerId: number;
  }): Promise<SellerCommissionSnapshot>;
  getSellerQuarterFinanceSummaries(params: {
    sellerId: number;
    year?: number;
  }): Promise<QuarterFinanceSummary[]>;
  getSellerFinanceHistoryYears(params: { sellerId: number }): Promise<number[]>;
  getSellerQuarterFinanceSnapshot(params: {
    sellerId: number;
    periodKey: string;
  }): Promise<SellerQuarterFinanceSnapshot | null>;
}
