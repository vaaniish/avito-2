import type { PrismaClient } from "@prisma/client";
import type { FinanceAggregationTransaction } from "../../../../finance/finance-analytics.service";
import type {
  FinanceOrderStatus,
  FinanceTransactionStatus,
} from "../../../../finance/domain/finance.helpers";
import type { PartnerFinanceTransactionsRepositoryPort } from "../../domain/partner-finance.types";

export class PartnerFinanceTransactionsRepository
  implements PartnerFinanceTransactionsRepositoryPort
{
  constructor(private readonly prisma: PrismaClient) {}

  findTransactionsForAnalytics(params: {
    sellerId: number;
    from: Date;
    to: Date;
    transactionStatus: FinanceTransactionStatus | null;
    orderStatus: FinanceOrderStatus | null;
  }): Promise<FinanceAggregationTransaction[]> {
    return this.prisma.platformTransaction.findMany({
      where: {
        seller_id: params.sellerId,
        created_at: {
          gte: params.from,
          lte: params.to,
        },
        ...(params.transactionStatus ? { status: params.transactionStatus } : {}),
        ...(params.orderStatus ? { order: { status: params.orderStatus } } : {}),
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
    }) as Promise<FinanceAggregationTransaction[]>;
  }

  getPayoutProfileStatus(sellerId: number) {
    return this.prisma.sellerPayoutProfile.findUnique({
      where: { seller_id: sellerId },
      select: {
        status: true,
        updated_at: true,
      },
    });
  }

  listCommissionTiers() {
    return this.prisma.commissionTier.findMany({
      orderBy: [{ min_sales: "asc" }, { id: "asc" }],
    });
  }
}
