import type { PartnershipStatus, ReviewTab, StatusFilter } from "./sellers.types";

export const REVIEW_STATUSES = new Set<PartnershipStatus>([
  "submitted",
  "legal_review",
  "representative_review",
  "payout_review",
  "quality_review",
  "pending",
]);

export const SELLER_STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "review", label: "На проверке" },
  { value: "needs_more_info", label: "Нужны данные" },
  { value: "approved_limited", label: "Ограниченно одобрено" },
  { value: "approved", label: "Одобрено" },
  { value: "rejected", label: "Отклонено" },
];

export const REVIEW_TABS: Array<{ value: ReviewTab; label: string }> = [
  { value: "business", label: "1. Бизнес" },
  { value: "contacts", label: "2. Контакты" },
  { value: "sales", label: "3. Продажи" },
  { value: "quality", label: "4. Качество" },
];
