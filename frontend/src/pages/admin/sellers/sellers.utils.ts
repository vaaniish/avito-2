import { REVIEW_STATUSES } from "./sellers.constants";
import type { PartnerEvaluation, PartnershipRequest, PartnershipStatus, StatusFilter } from "./sellers.types";
import type { ReviewAction } from "./sellers.types";

export function statusLabel(status: PartnershipStatus): string {
  const labels: Record<PartnershipStatus, string> = {
    draft: "Черновик",
    submitted: "Отправлена",
    legal_review: "Юр. проверка",
    representative_review: "Представитель",
    payout_review: "Выплаты",
    quality_review: "Качество",
    approved_limited: "Ограниченно",
    needs_more_info: "Нужны данные",
    pending: "Ожидает",
    approved: "Одобрено",
    rejected: "Отклонено",
  };
  return labels[status] ?? status;
}

export function statusBadgeClass(status: PartnershipStatus): string {
  if (status === "approved") return "border-green-300 bg-green-100 text-green-700";
  if (status === "approved_limited") return "border-blue-300 bg-blue-100 text-blue-700";
  if (status === "rejected") return "border-red-300 bg-red-100 text-red-700";
  if (status === "needs_more_info") return "border-orange-300 bg-orange-100 text-orange-700";
  if (status === "draft") return "border-gray-300 bg-gray-100 text-gray-700";
  return "border-yellow-300 bg-yellow-100 text-yellow-700";
}

export function recommendationLabel(value?: PartnerEvaluation["recommendation"]): string {
  if (value === "approve") return "Рекомендуется одобрить";
  if (value === "approve_limited") return "Рекомендуется ограниченное одобрение";
  if (value === "reject") return "Рекомендуется отклонить";
  if (value === "request_more_documents") return "Нужно запросить документы";
  return "Нет рекомендации";
}

export function categoryRiskLabel(value?: PartnerEvaluation["categoryRisk"]): string {
  if (value === "low") return "Низкий";
  if (value === "medium") return "Средний";
  if (value === "high") return "Высокий";
  return "Не рассчитан";
}

export function legalTypeLabel(value?: string): string {
  if (value === "COMPANY") return "Юрлицо";
  if (value === "IP") return "ИП";
  if (value === "BRAND") return "Бренд / реселлер";
  return value || "Не указано";
}

export function boolLabel(value?: boolean): string {
  return value ? "Да" : "Нет";
}

export function valueOrEmpty(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Не указано";
  if (typeof value === "boolean") return boolLabel(value);
  if (typeof value !== "string") return "Не указано";
  const normalized = value.trim();
  return normalized || "Не указано";
}

export function joinList(value?: string[]): string {
  return value && value.length > 0 ? value.join(", ") : "Не указано";
}

export function requestTitle(request: PartnershipRequest): string {
  return request.onboardingProfile?.legalName || request.name || request.applicant.name || request.id;
}

export function requestLocation(request: PartnershipRequest): string {
  const profile = request.onboardingProfile;
  if (profile) return [profile.region, profile.city].filter(Boolean).join(", ") || "Не указано";
  return request.geography || "Не указано";
}

export function requestInn(request: PartnershipRequest): string {
  return request.onboardingProfile?.inn || request.inn || "Не указано";
}

export function statusMatchesFilter(status: PartnershipStatus, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "review") return REVIEW_STATUSES.has(status);
  return status === filter;
}

export function deriveAllowedActions(status: PartnershipStatus): ReviewAction[] {
  if (REVIEW_STATUSES.has(status)) {
    return ["approved_limited", "approved", "needs_more_info", "rejected"];
  }

  if (status === "approved") {
    return ["rejected"];
  }

  if (status === "approved_limited") {
    return ["approved", "needs_more_info", "rejected"];
  }

  if (status === "needs_more_info") {
    return ["approved_limited", "approved", "rejected"];
  }

  return [];
}

export function normalizePartnershipRequest<T extends PartnershipRequest>(
  request: T,
): T & { allowedActions: ReviewAction[] } {
  return {
    ...request,
    allowedActions: request.allowedActions ?? deriveAllowedActions(request.status),
  };
}
