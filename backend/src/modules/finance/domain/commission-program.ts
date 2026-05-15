import type { CommissionTier } from "@prisma/client";

const MSK_OFFSET_MINUTES = 180;

export type QuarterWindow = {
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  periodLabel: string;
  resetsAt: Date;
};

export type SellerCommissionSnapshot = {
  qualifiedGmv: number;
  completedOrders: number;
  currentTier: CommissionTier;
  nextTier: CommissionTier | null;
  salesToNextTier: number;
  window: QuarterWindow;
  tiers: CommissionTier[];
};

export type QuarterFinanceSummary = {
  periodKey: string;
  periodLabel: string;
  periodStart: Date;
  periodEnd: Date;
  gross: number;
  sellerProfit: number;
  commission: number;
  held: number;
  refundedCancelled: number;
  payable: number;
  completedOrders: number;
  qualifiedGmv: number;
  currentTierId: number | null;
  nextTierId: number | null;
  salesToNextTier: number;
  percentToNextTier: number;
  commissionRateAtPeriodEnd: number;
  snapshotFinalizedAt: Date | null;
};

export type QuarterTierSnapshot = {
  currentTier: CommissionTier;
  nextTier: CommissionTier | null;
  salesToNextTier: number;
  qualifiedGmv: number;
  percentToNextTier: number;
};

export type SellerQuarterFinanceSnapshot = {
  summary: QuarterFinanceSummary;
  currentTier: CommissionTier;
  nextTier: CommissionTier | null;
};

export function toMoscowDateParts(date: Date): {
  year: number;
  monthIndex: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const shifted = new Date(date.getTime() + MSK_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

export function fromMoscowDateParts(
  year: number,
  monthIndex: number,
  day: number,
  hour = 0,
): Date {
  return new Date(
    Date.UTC(year, monthIndex, day, hour) - MSK_OFFSET_MINUTES * 60_000,
  );
}

export function getQuarterWindow(referenceDate = new Date()): QuarterWindow {
  const parts = toMoscowDateParts(referenceDate);
  const quarterIndex = Math.floor(parts.monthIndex / 3);
  const quarterStartMonth = quarterIndex * 3;
  const nextQuarterMonth = quarterStartMonth + 3;
  const nextQuarterYear = nextQuarterMonth >= 12 ? parts.year + 1 : parts.year;
  const normalizedNextQuarterMonth =
    nextQuarterMonth >= 12 ? nextQuarterMonth - 12 : nextQuarterMonth;
  const periodStart = fromMoscowDateParts(parts.year, quarterStartMonth, 1);
  const resetsAt = fromMoscowDateParts(
    nextQuarterYear,
    normalizedNextQuarterMonth,
    1,
  );
  const periodEnd = new Date(resetsAt.getTime() - 1);
  const quarterNumber = quarterIndex + 1;

  return {
    periodKey: `${parts.year}-Q${quarterNumber}`,
    periodStart,
    periodEnd,
    periodLabel: `${quarterNumber} квартал ${parts.year}`,
    resetsAt,
  };
}

export function getQuarterWindowByKey(periodKey: string): QuarterWindow | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(periodKey.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const quarterNumber = Number(match[2]);
  const quarterStartMonth = (quarterNumber - 1) * 3;
  const nextQuarterMonth = quarterStartMonth + 3;
  const nextQuarterYear = nextQuarterMonth >= 12 ? year + 1 : year;
  const normalizedNextQuarterMonth =
    nextQuarterMonth >= 12 ? nextQuarterMonth - 12 : nextQuarterMonth;
  const periodStart = fromMoscowDateParts(year, quarterStartMonth, 1);
  const resetsAt = fromMoscowDateParts(
    nextQuarterYear,
    normalizedNextQuarterMonth,
    1,
  );
  return {
    periodKey,
    periodStart,
    periodEnd: new Date(resetsAt.getTime() - 1),
    periodLabel: `${quarterNumber} квартал ${year}`,
    resetsAt,
  };
}

export function getYearQuarterWindows(referenceDate = new Date()): QuarterWindow[] {
  const parts = toMoscowDateParts(referenceDate);
  return getYearQuarterWindowsForYear(parts.year);
}

export function getYearQuarterWindowsForYear(year: number): QuarterWindow[] {
  return [1, 2, 3, 4]
    .map((quarterNumber) => getQuarterWindowByKey(`${year}-Q${quarterNumber}`))
    .filter((item): item is QuarterWindow => Boolean(item));
}

function chooseCommissionTier(tiers: CommissionTier[], qualifiedGmv: number): {
  currentTier: CommissionTier;
  nextTier: CommissionTier | null;
  salesToNextTier: number;
} {
  const baseTier = tiers[0];
  if (!baseTier) {
    throw new Error("Commission tiers are not configured");
  }

  let currentTier = baseTier;
  for (const tier of tiers) {
    const withinLowerBound = qualifiedGmv >= tier.min_sales;
    const withinUpperBound =
      tier.max_sales === null || qualifiedGmv <= tier.max_sales;
    if (withinLowerBound && withinUpperBound) {
      currentTier = tier;
      break;
    }
    if (qualifiedGmv >= tier.min_sales) {
      currentTier = tier;
    }
  }

  const currentIndex = tiers.findIndex((tier) => tier.id === currentTier.id);
  const nextTier = currentIndex >= 0 ? tiers[currentIndex + 1] ?? null : null;
  const salesToNextTier = nextTier
    ? Math.max(0, nextTier.min_sales - qualifiedGmv)
    : 0;

  return {
    currentTier,
    nextTier,
    salesToNextTier,
  };
}

export function resolveCommissionTierSnapshot(
  tiers: CommissionTier[],
  qualifiedGmv: number,
): QuarterTierSnapshot {
  const { currentTier, nextTier, salesToNextTier } = chooseCommissionTier(
    tiers,
    qualifiedGmv,
  );
  const percentToNextTier = nextTier
    ? Math.max(
        0,
        Math.min(
          100,
          ((qualifiedGmv - currentTier.min_sales) /
            Math.max(1, nextTier.min_sales - currentTier.min_sales)) *
            100,
        ),
      )
    : 100;

  return {
    currentTier,
    nextTier,
    salesToNextTier,
    qualifiedGmv,
    percentToNextTier,
  };
}

export function isCurrentQuarterWindow(
  window: QuarterWindow,
  referenceDate = new Date(),
): boolean {
  return window.periodKey === getQuarterWindow(referenceDate).periodKey;
}

export function isFutureQuarterWindow(
  window: QuarterWindow,
  referenceDate = new Date(),
): boolean {
  return window.periodStart.getTime() > referenceDate.getTime();
}

export function shouldFinalizeQuarter(
  window: QuarterWindow,
  referenceDate = new Date(),
): boolean {
  return window.resetsAt.getTime() <= referenceDate.getTime();
}

export function buildEmptyQuarterSnapshot(
  window: QuarterWindow,
  tiers: CommissionTier[],
): SellerQuarterFinanceSnapshot {
  const tierSnapshot = resolveCommissionTierSnapshot(tiers, 0);
  return {
    summary: {
      periodKey: window.periodKey,
      periodLabel: window.periodLabel,
      periodStart: window.periodStart,
      periodEnd: window.periodEnd,
      gross: 0,
      sellerProfit: 0,
      commission: 0,
      held: 0,
      refundedCancelled: 0,
      payable: 0,
      completedOrders: 0,
      qualifiedGmv: 0,
      currentTierId: tierSnapshot.currentTier.id,
      nextTierId: tierSnapshot.nextTier?.id ?? null,
      salesToNextTier: tierSnapshot.salesToNextTier,
      percentToNextTier: tierSnapshot.percentToNextTier,
      commissionRateAtPeriodEnd: tierSnapshot.currentTier.commission_rate,
      snapshotFinalizedAt: null,
    },
    currentTier: tierSnapshot.currentTier,
    nextTier: tierSnapshot.nextTier,
  };
}
