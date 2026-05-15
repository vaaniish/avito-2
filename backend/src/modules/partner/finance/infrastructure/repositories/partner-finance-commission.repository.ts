import type { PrismaClient } from "@prisma/client";
import {
  getSellerFinanceHistoryYears,
  getSellerQuarterFinanceSnapshot,
  getSellerQuarterFinanceSummaries,
  recomputeSellerCommissionSnapshot,
} from "../../../../finance/infrastructure/repositories/commission-program.repository";
import type { PartnerFinanceCommissionRepositoryPort } from "../../domain/partner-finance.types";

export class PartnerFinanceCommissionRepository
  implements PartnerFinanceCommissionRepositoryPort
{
  constructor(private readonly prisma: PrismaClient) {}

  recomputeSellerCommissionSnapshot(params: { sellerId: number }) {
    return recomputeSellerCommissionSnapshot({
      prismaClient: this.prisma,
      sellerId: params.sellerId,
    });
  }

  getSellerQuarterFinanceSummaries(params: { sellerId: number; year?: number }) {
    return getSellerQuarterFinanceSummaries({
      prismaClient: this.prisma,
      sellerId: params.sellerId,
      year: params.year,
    });
  }

  getSellerFinanceHistoryYears(params: { sellerId: number }) {
    return getSellerFinanceHistoryYears({
      prismaClient: this.prisma,
      sellerId: params.sellerId,
    });
  }

  getSellerQuarterFinanceSnapshot(params: {
    sellerId: number;
    periodKey: string;
  }) {
    return getSellerQuarterFinanceSnapshot({
      prismaClient: this.prisma,
      sellerId: params.sellerId,
      periodKey: params.periodKey,
    });
  }
}
