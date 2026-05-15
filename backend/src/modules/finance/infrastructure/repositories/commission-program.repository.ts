import type { CommissionTier, Prisma, PrismaClient } from "@prisma/client";
import {
  buildEmptyQuarterSnapshot,
  getQuarterWindow,
  getQuarterWindowByKey,
  getYearQuarterWindows,
  getYearQuarterWindowsForYear,
  isCurrentQuarterWindow,
  isFutureQuarterWindow,
  resolveCommissionTierSnapshot,
  shouldFinalizeQuarter,
  type QuarterFinanceSummary,
  type QuarterWindow,
  type SellerCommissionSnapshot,
  type SellerQuarterFinanceSnapshot,
  toMoscowDateParts,
} from "../../domain/commission-program";

async function getCommissionTiers(
  prismaClient: PrismaClient | Prisma.TransactionClient,
): Promise<CommissionTier[]> {
  return prismaClient.commissionTier.findMany({
    orderBy: [{ min_sales: "asc" }, { id: "asc" }],
  });
}

async function computeQuarterSnapshot(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient;
  sellerId: number;
  window: QuarterWindow;
  tiers: CommissionTier[];
  referenceDate?: Date;
  persist: boolean;
}): Promise<SellerQuarterFinanceSnapshot> {
  const transactions = await params.prismaClient.platformTransaction.findMany({
    where: {
      seller_id: params.sellerId,
      created_at: {
        gte: params.window.periodStart,
        lt: params.window.resetsAt,
      },
    },
    select: {
      id: true,
      amount: true,
      commission: true,
      status: true,
      created_at: true,
      order: {
        select: {
          public_id: true,
          status: true,
        },
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
  });

  const successfulCompletedOrders = new Map<
    string,
    { amount: number; createdAt: Date; id: number }
  >();
  let gross = 0;
  let commission = 0;
  let sellerProfit = 0;
  let payable = 0;
  let held = 0;
  let refundedCancelled = 0;
  let successfulTransactions = 0;

  for (const transaction of transactions) {
    gross += transaction.amount;
    commission += transaction.commission;
    const sellerPayout = transaction.amount - transaction.commission;
    if (transaction.status === "SUCCESS") {
      sellerProfit += sellerPayout;
      successfulTransactions += 1;
      if (transaction.order.status === "COMPLETED") {
        payable += sellerPayout;
        const existing = successfulCompletedOrders.get(transaction.order.public_id);
        if (
          !existing ||
          transaction.created_at.getTime() > existing.createdAt.getTime() ||
          (transaction.created_at.getTime() === existing.createdAt.getTime() &&
            transaction.id > existing.id)
        ) {
          successfulCompletedOrders.set(transaction.order.public_id, {
            amount: transaction.amount,
            createdAt: transaction.created_at,
            id: transaction.id,
          });
        }
      }
    }

    if (transaction.status === "HELD") {
      held += sellerPayout;
    }
    if (
      transaction.status === "REFUNDED" ||
      transaction.status === "CANCELLED"
    ) {
      refundedCancelled += transaction.amount;
    }
  }

  const qualifiedGmv = Array.from(successfulCompletedOrders.values()).reduce(
    (sum, entry) => sum + entry.amount,
    0,
  );
  const completedOrders = successfulCompletedOrders.size;
  const tierSnapshot = resolveCommissionTierSnapshot(params.tiers, qualifiedGmv);
  const finalizedAt = shouldFinalizeQuarter(
    params.window,
    params.referenceDate ?? new Date(),
  )
    ? new Date()
    : null;

  if (params.persist) {
    await params.prismaClient.sellerCommissionPeriodStat.upsert({
      where: {
        seller_id_period_key: {
          seller_id: params.sellerId,
          period_key: params.window.periodKey,
        },
      },
      create: {
        public_id: `SCPS-${params.sellerId}-${params.window.periodKey}`,
        seller_id: params.sellerId,
        period_key: params.window.periodKey,
        period_start: params.window.periodStart,
        period_end: params.window.periodEnd,
        gross,
        commission_total: commission,
        seller_profit: sellerProfit,
        payable,
        held,
        refunded_cancelled: refundedCancelled,
        qualified_gmv: qualifiedGmv,
        completed_orders: completedOrders,
        successful_transactions: successfulTransactions,
        total_transactions: transactions.length,
        current_tier_id: tierSnapshot.currentTier.id,
        next_tier_id: tierSnapshot.nextTier?.id ?? null,
        sales_to_next_tier: tierSnapshot.salesToNextTier,
        percent_to_next_tier: tierSnapshot.percentToNextTier,
        commission_rate_at_period_end:
          tierSnapshot.currentTier.commission_rate,
        snapshot_finalized_at: finalizedAt,
      },
      update: {
        period_start: params.window.periodStart,
        period_end: params.window.periodEnd,
        gross,
        commission_total: commission,
        seller_profit: sellerProfit,
        payable,
        held,
        refunded_cancelled: refundedCancelled,
        qualified_gmv: qualifiedGmv,
        completed_orders: completedOrders,
        successful_transactions: successfulTransactions,
        total_transactions: transactions.length,
        current_tier_id: tierSnapshot.currentTier.id,
        next_tier_id: tierSnapshot.nextTier?.id ?? null,
        sales_to_next_tier: tierSnapshot.salesToNextTier,
        percent_to_next_tier: tierSnapshot.percentToNextTier,
        commission_rate_at_period_end:
          tierSnapshot.currentTier.commission_rate,
        snapshot_finalized_at: finalizedAt,
      },
    });
  }

  return {
    summary: {
      periodKey: params.window.periodKey,
      periodLabel: params.window.periodLabel,
      periodStart: params.window.periodStart,
      periodEnd: params.window.periodEnd,
      gross,
      sellerProfit,
      commission,
      held,
      refundedCancelled,
      payable,
      completedOrders,
      qualifiedGmv,
      currentTierId: tierSnapshot.currentTier.id,
      nextTierId: tierSnapshot.nextTier?.id ?? null,
      salesToNextTier: tierSnapshot.salesToNextTier,
      percentToNextTier: tierSnapshot.percentToNextTier,
      commissionRateAtPeriodEnd: tierSnapshot.currentTier.commission_rate,
      snapshotFinalizedAt: finalizedAt,
    },
    currentTier: tierSnapshot.currentTier,
    nextTier: tierSnapshot.nextTier,
  };
}

async function readQuarterSnapshotFromStat(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient;
  sellerId: number;
  window: QuarterWindow;
  tiers: CommissionTier[];
  referenceDate?: Date;
}): Promise<SellerQuarterFinanceSnapshot> {
  const existing = await params.prismaClient.sellerCommissionPeriodStat.findUnique({
    where: {
      seller_id_period_key: {
        seller_id: params.sellerId,
        period_key: params.window.periodKey,
      },
    },
    include: {
      current_tier: true,
      next_tier: true,
    },
  });

  const referenceDate = params.referenceDate ?? new Date();
  if (isFutureQuarterWindow(params.window, referenceDate)) {
    return buildEmptyQuarterSnapshot(params.window, params.tiers);
  }

  if (
    existing &&
    !isCurrentQuarterWindow(params.window, referenceDate) &&
    existing.snapshot_finalized_at
  ) {
    const currentTier =
      existing.current_tier ??
      params.tiers.find((tier) => tier.id === existing.current_tier_id) ??
      params.tiers[0];
    if (!currentTier) {
      throw new Error("Commission tiers are not configured");
    }
    const nextTier =
      existing.next_tier ??
      params.tiers.find((tier) => tier.id === existing.next_tier_id) ??
      null;
    return {
      summary: {
        periodKey: existing.period_key,
        periodLabel: params.window.periodLabel,
        periodStart: existing.period_start,
        periodEnd: existing.period_end,
        gross: existing.gross,
        sellerProfit: existing.seller_profit,
        commission: existing.commission_total,
        held: existing.held,
        refundedCancelled: existing.refunded_cancelled,
        payable: existing.payable,
        completedOrders: existing.completed_orders,
        qualifiedGmv: existing.qualified_gmv,
        currentTierId: existing.current_tier_id,
        nextTierId: existing.next_tier_id,
        salesToNextTier: existing.sales_to_next_tier,
        percentToNextTier: existing.percent_to_next_tier,
        commissionRateAtPeriodEnd: existing.commission_rate_at_period_end,
        snapshotFinalizedAt: existing.snapshot_finalized_at,
      },
      currentTier,
      nextTier,
    };
  }

  return computeQuarterSnapshot({
    prismaClient: params.prismaClient,
    sellerId: params.sellerId,
    window: params.window,
    tiers: params.tiers,
    referenceDate,
    persist: true,
  });
}

export async function recomputeSellerCommissionSnapshot(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient;
  sellerId: number;
  referenceDate?: Date;
}): Promise<SellerCommissionSnapshot> {
  const window = getQuarterWindow(params.referenceDate);
  const tiers = await getCommissionTiers(params.prismaClient);
  const snapshot = await computeQuarterSnapshot({
    prismaClient: params.prismaClient,
    sellerId: params.sellerId,
    window,
    tiers,
    referenceDate: params.referenceDate,
    persist: true,
  });

  await params.prismaClient.sellerProfile.upsert({
    where: { user_id: params.sellerId },
    create: {
      user_id: params.sellerId,
      commission_tier_id: snapshot.currentTier.id,
    },
    update: {
      commission_tier_id: snapshot.currentTier.id,
    },
  });

  return {
    qualifiedGmv: snapshot.summary.qualifiedGmv,
    completedOrders: snapshot.summary.completedOrders,
    currentTier: snapshot.currentTier,
    nextTier: snapshot.nextTier,
    salesToNextTier: snapshot.summary.salesToNextTier,
    window,
    tiers,
  };
}

export async function getSellerQuarterFinanceSnapshot(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient;
  sellerId: number;
  periodKey: string;
  referenceDate?: Date;
}): Promise<SellerQuarterFinanceSnapshot | null> {
  const window = getQuarterWindowByKey(params.periodKey);
  if (!window) return null;
  const tiers = await getCommissionTiers(params.prismaClient);
  return readQuarterSnapshotFromStat({
    prismaClient: params.prismaClient,
    sellerId: params.sellerId,
    window,
    tiers,
    referenceDate: params.referenceDate,
  });
}

export async function getSellerQuarterFinanceSummaries(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient;
  sellerId: number;
  referenceDate?: Date;
  year?: number;
}): Promise<QuarterFinanceSummary[]> {
  const windows =
    typeof params.year === "number"
      ? getYearQuarterWindowsForYear(params.year)
      : getYearQuarterWindows(params.referenceDate);
  if (windows.length === 0) return [];
  const tiers = await getCommissionTiers(params.prismaClient);
  const snapshots = await Promise.all(
    windows.map((window) =>
      readQuarterSnapshotFromStat({
        prismaClient: params.prismaClient,
        sellerId: params.sellerId,
        window,
        tiers,
        referenceDate: params.referenceDate,
      }),
    ),
  );

  return snapshots.map((snapshot) => snapshot.summary);
}

export async function getSellerFinanceHistoryYears(params: {
  prismaClient: PrismaClient | Prisma.TransactionClient;
  sellerId: number;
  referenceDate?: Date;
}): Promise<number[]> {
  const [firstTransaction, lastTransaction] = await Promise.all([
    params.prismaClient.platformTransaction.findFirst({
      where: { seller_id: params.sellerId },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
      select: { created_at: true },
    }),
    params.prismaClient.platformTransaction.findFirst({
      where: { seller_id: params.sellerId },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      select: { created_at: true },
    }),
  ]);

  const currentYear = toMoscowDateParts(params.referenceDate ?? new Date()).year;
  const firstYear = firstTransaction
    ? toMoscowDateParts(firstTransaction.created_at).year
    : currentYear;
  const lastYear = lastTransaction
    ? toMoscowDateParts(lastTransaction.created_at).year
    : currentYear;
  const startYear = Math.min(firstYear, currentYear);
  const endYear = Math.max(lastYear, currentYear);
  const years: number[] = [];
  for (let year = endYear; year >= startYear; year -= 1) {
    years.push(year);
  }
  return years;
}
