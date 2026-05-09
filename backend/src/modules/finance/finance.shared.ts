import type { Request } from "express";

export type FinanceGroupBy = "day" | "week" | "month";
export type FinanceTransactionStatus =
  | "PENDING"
  | "HELD"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";
export type FinanceOrderStatus =
  | "CREATED"
  | "PAID"
  | "PROCESSING"
  | "PREPARED"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";
export type FinanceSettlementBucketKey = "pendingPayment" | "inProgress" | "readyToPayout" | "problem";
export type FinanceSettlementBucket = {
  key: FinanceSettlementBucketKey;
  label: string;
  description: string;
  count: number;
  amount: number;
  commissions: number;
  sellerPayout: number;
};

export const FINANCE_TRANSACTION_STATUSES: FinanceTransactionStatus[] = [
  "PENDING",
  "HELD",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
];

export const FINANCE_ORDER_STATUSES: FinanceOrderStatus[] = [
  "CREATED",
  "PAID",
  "PROCESSING",
  "PREPARED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

export const FINANCE_TRANSACTION_LABELS: Record<FinanceTransactionStatus, string> = {
  PENDING: "Ожидает",
  HELD: "Удержание",
  SUCCESS: "Успешно",
  FAILED: "Ошибка",
  CANCELLED: "Отменено",
  REFUNDED: "Возврат",
};

export const FINANCE_ORDER_LABELS: Record<FinanceOrderStatus, string> = {
  CREATED: "Создан",
  PAID: "Оплачен",
  PROCESSING: "В обработке",
  PREPARED: "Подготовлен",
  SHIPPED: "Отправлен",
  DELIVERED: "Доставлен",
  COMPLETED: "Завершен",
  CANCELLED: "Отменен",
};

export const FINANCE_REPORT_DEFAULT_LIMIT = 40;
export const FINANCE_REPORT_MAX_LIMIT = 200;

export const FINANCE_SETTLEMENT_BUCKETS: Record<
  FinanceSettlementBucketKey,
  Omit<FinanceSettlementBucket, "count" | "amount" | "commissions" | "sellerPayout">
> = {
  pendingPayment: {
    key: "pendingPayment",
    label: "Платеж ожидает",
    description: "Деньги еще проходят оплату или удержание",
  },
  inProgress: {
    key: "inProgress",
    label: "Ожидают завершения",
    description: "Заказ оплачен, но сделка еще не закрыта",
  },
  readyToPayout: {
    key: "readyToPayout",
    label: "Готово к выплате",
    description: "Сделка завершена, сумма готова к расчету",
  },
  problem: {
    key: "problem",
    label: "Проблемные операции",
    description: "Отмены, возвраты и ошибки платежей",
  },
};

export function parseFinanceGroupBy(value: unknown): FinanceGroupBy {
  return value === "week" || value === "month" ? value : "day";
}

export function parseFinanceDateRange(req: Request): {
  from: Date;
  to: Date;
  groupBy: FinanceGroupBy;
} {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const rawFrom = typeof req.query.from === "string" ? req.query.from : "";
  const rawTo = typeof req.query.to === "string" ? req.query.to : "";
  const from = rawFrom ? new Date(rawFrom) : defaultFrom;
  const to = rawTo ? new Date(rawTo) : now;

  if (rawFrom.length === 10) from.setHours(0, 0, 0, 0);
  if (rawTo.length === 10) to.setHours(23, 59, 59, 999);

  return {
    from: Number.isNaN(from.getTime()) ? defaultFrom : from,
    to: Number.isNaN(to.getTime()) ? now : to,
    groupBy: parseFinanceGroupBy(req.query.groupBy),
  };
}

export function parseFinanceTransactionStatus(value: unknown): FinanceTransactionStatus | null {
  if (typeof value !== "string" || value === "all") return null;
  const normalized = value.toUpperCase();
  return FINANCE_TRANSACTION_STATUSES.includes(normalized as FinanceTransactionStatus)
    ? (normalized as FinanceTransactionStatus)
    : null;
}

export function parseFinanceOrderStatus(value: unknown): FinanceOrderStatus | null {
  if (typeof value !== "string" || value === "all") return null;
  const normalized = value.toUpperCase();
  return FINANCE_ORDER_STATUSES.includes(normalized as FinanceOrderStatus)
    ? (normalized as FinanceOrderStatus)
    : null;
}

export function parseFinanceReportLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return FINANCE_REPORT_DEFAULT_LIMIT;
  return Math.min(FINANCE_REPORT_MAX_LIMIT, parsed);
}

export function parseFinanceReportOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

export function financePeriodKey(date: Date, groupBy: FinanceGroupBy): string {
  const target = new Date(date);
  if (groupBy === "month") {
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}`;
  }

  if (groupBy === "week") {
    const day = target.getDay() || 7;
    target.setDate(target.getDate() - day + 1);
  }

  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(
    target.getDate(),
  ).padStart(2, "0")}`;
}

export function isFinanceEarnedStatus(status: FinanceTransactionStatus): boolean {
  return status === "SUCCESS";
}

export function isFinancePayableStatus(
  transactionStatus: FinanceTransactionStatus,
  orderStatus: FinanceOrderStatus,
): boolean {
  return transactionStatus === "SUCCESS" && orderStatus === "COMPLETED";
}

export function isFinanceActiveOrder(status: FinanceOrderStatus): boolean {
  return status !== "CANCELLED" && status !== "COMPLETED";
}

export function getFinanceSettlementBucket(
  transactionStatus: FinanceTransactionStatus,
  orderStatus: FinanceOrderStatus,
): FinanceSettlementBucketKey {
  if (
    transactionStatus === "FAILED" ||
    transactionStatus === "CANCELLED" ||
    transactionStatus === "REFUNDED" ||
    orderStatus === "CANCELLED"
  ) {
    return "problem";
  }

  if (transactionStatus === "PENDING" || transactionStatus === "HELD") {
    return "pendingPayment";
  }

  if (transactionStatus === "SUCCESS" && orderStatus === "COMPLETED") {
    return "readyToPayout";
  }

  return "inProgress";
}
