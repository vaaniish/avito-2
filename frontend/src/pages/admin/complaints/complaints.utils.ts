import type {
  ComplaintItem,
  ComplaintListResponse,
  ComplaintSortBy,
  ComplaintStatus,
  ComplaintStatusFilter,
  DetailTab,
  FiltersState,
  SellerSummaryResponse,
  StatusAction,
} from "./complaints.types";
import type { ScoreExplanationRow } from "../../../shared/ui/ScoreExplanation";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function getStatusLabel(status: ComplaintStatus): string {
  if (status === "new") return "Новая";
  if (status === "pending") return "В работе";
  if (status === "approved") return "Подтверждена";
  return "Отклонена";
}

export function getStatusClass(status: ComplaintStatus): string {
  if (status === "new") return "bg-orange-100 text-orange-700 border-orange-300";
  if (status === "pending") return "bg-blue-100 text-blue-700 border-blue-300";
  if (status === "approved") return "bg-red-100 text-red-700 border-red-300";
  return "bg-green-100 text-green-700 border-green-300";
}

export function getSortLabel(sortBy: ComplaintSortBy): string {
  if (sortBy === "queueScore") return "Балл очереди";
  if (sortBy === "riskScore") return "Риск";
  return "Дата";
}

export function getComplaintTypeLabel(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === "suspicious_listing") return "Подозрительное объявление";
  if (normalized === "fraud") return "Мошенничество";
  if (normalized === "other") return "Другая причина";
  if (normalized === "payment_off_platform") return "Оплата вне платформы";
  return type;
}

export function isOffPlatformComplaintType(type: string): boolean {
  const normalized = type.trim().toLowerCase();
  return (
    normalized.includes("вне") ||
    normalized.includes("platform") ||
    normalized.includes("payment")
  );
}

export function buildComplaintRiskRows(complaint: ComplaintItem): ScoreExplanationRow[] {
  const rows: ScoreExplanationRow[] = [];

  if (complaint.sellerComplaintsCount >= 5) {
    rows.push({
      label: "Много жалоб на продавца",
      points: 30,
      reason: "История продавца считается сильным объективным сигналом повторного риска.",
    });
  } else if (complaint.sellerComplaintsCount >= 2) {
    rows.push({
      label: "Повторные жалобы на продавца",
      points: 15,
      reason: "Сигнал слабее, чем массовые жалобы, но уже показывает повторяемость.",
    });
  }

  if (complaint.listingComplaintsCount >= 3) {
    rows.push({
      label: "3+ жалобы на объявление",
      points: 20,
      reason: "Несколько независимых репортов повышают доверие к жалобе.",
    });
  } else if (complaint.listingComplaintsCount >= 2) {
    rows.push({
      label: "2 жалобы на объявление",
      points: 10,
      reason: "Умеренный повторный сигнал: одного репорта уже недостаточно, но массовости нет.",
    });
  }

  if (isOffPlatformComplaintType(complaint.complaintType)) {
    rows.push({
      label: "Тип жалобы про оплату вне платформы",
      points: 20,
      reason: "Высокий риск обхода сделки и мошенничества.",
    });
  }

  return rows;
}

export function complaintRiskNotes(complaint: ComplaintItem): string[] {
  const rawScore = buildComplaintRiskRows(complaint).reduce((sum, row) => sum + row.points, 0);
  return [
    `Сырой балл: ${rawScore}. Риск = round(${rawScore} / 70 * 100) = ${complaint.riskScore}.`,
    "70 — текущий максимум базовой шкалы объективных сигналов.",
    "60+ рекомендует подтвердить, 20 и ниже — отклонить, середина остается на ручную проверку.",
    complaint.evaluation.reasons.includes("insufficient_objective_signals")
      ? "Объективных сигналов мало, поэтому система не поднимает риск без проверки модератором."
      : "Сработали объективные признаки: история жалоб, повторяемость или тип высокого риска.",
  ];
}

export function buildComplaintQueueRows(complaint: ComplaintItem): ScoreExplanationRow[] {
  const ageBoost = Math.min(30, Math.floor(complaint.ageHours / 12) * 2);
  const repeatBoost = Math.min(36, complaint.sellerViolationsCount * 9);
  const listingBoost = Math.min(20, Math.max(0, complaint.listingComplaintsCount - 1) * 7);

  return [
    {
      label: "Риск жалобы",
      points: complaint.riskScore,
      reason: "Базовая серьезность кейса: чем выше риск, тем раньше он нужен модератору.",
    },
    {
      label: "Возраст жалобы",
      points: ageBoost,
      reason: "Добавляет до +30, чтобы старые жалобы не зависали внизу очереди.",
    },
    {
      label: "Подтвержденные нарушения продавца",
      points: repeatBoost,
      reason: "Добавляет до +36: подтвержденные кейсы важнее неподтвержденных жалоб.",
    },
    {
      label: "Повторные жалобы на это объявление",
      points: listingBoost,
      reason: "Добавляет до +20, чтобы массово репортимые объявления поднимались выше.",
    },
  ];
}

export function complaintQueueNotes(complaint: ComplaintItem): string[] {
  const ageBoost = Math.min(30, Math.floor(complaint.ageHours / 12) * 2);
  const repeatBoost = Math.min(36, complaint.sellerViolationsCount * 9);
  const listingBoost = Math.min(20, Math.max(0, complaint.listingComplaintsCount - 1) * 7);
  return [
    `Формула: ${complaint.riskScore} + ${ageBoost} + ${repeatBoost} + ${listingBoost} = ${complaint.queueScore}.`,
    "85+ — высокий приоритет, 50+ — средний, ниже — низкий.",
    `Возраст жалобы: ${complaint.ageHours} ч. Подтвержденных нарушений продавца: ${complaint.sellerViolationsCount}. Жалоб на объявление: ${complaint.listingComplaintsCount}.`,
  ];
}

export function buildComplaintListingHref(listingId: string, fallbackUrl: string): string {
  const normalizedId = listingId.trim();
  if (normalizedId) {
    return `/products/${encodeURIComponent(normalizedId)}`;
  }

  const normalizedFallback = fallbackUrl.trim();
  if (!normalizedFallback) return "/";

  const queryIndex = normalizedFallback.indexOf("?");
  if (queryIndex >= 0) {
    const query = normalizedFallback.slice(queryIndex + 1);
    const listingIdFromQuery = new URLSearchParams(query).get("listingId")?.trim();
    if (listingIdFromQuery) {
      return `/products/${encodeURIComponent(listingIdFromQuery)}`;
    }
  }

  return normalizedFallback;
}

export function makeIdempotencyKey(complaintId: string, status: StatusAction): string {
  return `cmp-${complaintId}-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const defaultPagination: ComplaintListResponse["pagination"] = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

export const defaultListSort: ComplaintListResponse["sort"] = {
  by: "queueScore",
  order: "desc",
};

export const defaultListFilters: ComplaintListResponse["filters"] = {
  status: [],
  priority: [],
  moderator: null,
  from: null,
  to: null,
  q: "",
};

export const defaultListOptions: ComplaintListResponse["options"] = {
  moderators: [],
};

export const defaultComplaintFilters: FiltersState = {
  status: "new",
  search: "",
  from: "",
  to: "",
  page: 1,
  pageSize: 20,
  sortBy: "queueScore",
  sortOrder: "desc",
};

export const complaintStatusTabs: Array<{ id: ComplaintStatusFilter; label: string }> = [
  { id: "new", label: "Новые" },
  { id: "approved", label: "Подтвержденные" },
  { id: "rejected", label: "Отклоненные" },
  { id: "all", label: "Все" },
];

export const complaintDetailTabs: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Жалоба" },
  { id: "sanctions", label: "Заявитель и санкции" },
];

export function getComplaintDecisionLocked(status: ComplaintStatus | undefined): boolean {
  return status === "approved" || status === "rejected";
}

export function getSellerSummaryView(
  sellerSummary: SellerSummaryResponse | null,
  complaint: ComplaintItem | null,
) {
  const sellerApprovalRate =
    sellerSummary && sellerSummary.cases.total > 0
      ? Math.round((sellerSummary.cases.approved / sellerSummary.cases.total) * 100)
      : 0;
  const sellerStatusValue = sellerSummary?.seller.status ?? (complaint?.sellerStatus ?? "active");
  const sellerBlockedUntilValue =
    sellerSummary?.seller.blockedUntil ?? complaint?.sellerBlockedUntil ?? null;
  const sellerBlockReasonValue =
    sellerSummary?.seller.blockReason ?? complaint?.sellerBlockReason ?? null;
  const hasSellerRestrictions =
    sellerStatusValue === "blocked" ||
    Boolean(sellerBlockedUntilValue) ||
    Boolean(sellerBlockReasonValue) ||
    (sellerSummary?.activeSanctionsCount ?? 0) > 0;

  return {
    sellerApprovalRate,
    sellerStatusValue,
    sellerBlockedUntilValue,
    sellerBlockReasonValue,
    hasSellerRestrictions,
  };
}
