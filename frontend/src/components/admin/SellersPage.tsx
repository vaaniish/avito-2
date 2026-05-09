import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { matchesSearch } from "../../lib/search";
import { notifyError, notifySuccess } from "../ui/notifications";
import { fetchPartnershipRequests, updatePartnershipRequestStatus } from "./sellers/sellers.api";
import { REVIEW_STATUSES, SELLER_STATUS_FILTERS } from "./sellers/sellers.constants";
import { SellerReviewModal } from "./sellers/SellerReviewModal";
import { SellerStatusBadge } from "./sellers/SellerStatusBadge";
import type { PartnershipRequest, ReviewAction, StatusFilter } from "./sellers/sellers.types";
import {
  legalTypeLabel,
  recommendationLabel,
  requestInn,
  requestLocation,
  requestTitle,
  statusMatchesFilter,
} from "./sellers/sellers.utils";

export function SellersPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedRequest, setSelectedRequest] = useState<PartnershipRequest | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState<PartnershipRequest[]>([]);
  const [saving, setSaving] = useState(false);

  const loadRequests = async () => {
    try {
      const result = await fetchPartnershipRequests();
      setRequests(result);
      setSelectedRequest((prev) => {
        if (!prev) return null;
        return result.find((item) => item.id === prev.id) ?? null;
      });
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить партнёрские заявки");
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const matchesStatus = statusMatchesFilter(request.status, statusFilter);
        const matchesQuery = matchesSearch(request, searchQuery);
        return matchesStatus && matchesQuery;
      }),
    [requests, searchQuery, statusFilter],
  );

  const stats = useMemo(
    () => ({
      total: requests.length,
      review: requests.filter((item) => REVIEW_STATUSES.has(item.status)).length,
      needsMoreInfo: requests.filter((item) => item.status === "needs_more_info").length,
      approved: requests.filter((item) => item.status === "approved" || item.status === "approved_limited").length,
      rejected: requests.filter((item) => item.status === "rejected").length,
    }),
    [requests],
  );

  const updateStatus = async (request: PartnershipRequest, status: ReviewAction, note: string) => {
    setSaving(true);
    try {
      await updatePartnershipRequestStatus(request.id, status, note);
      notifySuccess("Статус партнёрской заявки обновлён.");
      setSelectedRequest(null);
      await loadRequests();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось обновить партнёрскую заявку");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Партнёрские заявки</h1>
        <p className="dashboard-subtitle">Проверка юрлица, представителя, качества и условий продавца</p>
      </div>

      <div className="dashboard-grid-stats">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего заявок</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">На проверке</div>
          <div className="dashboard-stat__value">{stats.review}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">Нужны данные</div>
          <div className="dashboard-stat__value">{stats.needsMoreInfo}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Одобрено</div>
          <div className="dashboard-stat__value">{stats.approved}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Отклонено</div>
          <div className="dashboard-stat__value">{stats.rejected}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            type="text"
            placeholder="Поиск по партнёрским заявкам"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="dashboard-search__input"
          />
        </div>

        <div className="dashboard-chip-row">
          {SELLER_STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              className={`dashboard-chip ${statusFilter === option.value ? "dashboard-chip--active" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {filteredRequests.map((request) => (
          <button
            key={request.id}
            onClick={() => setSelectedRequest(request)}
            className="dashboard-card w-full text-left transition-colors hover:border-[rgb(38,83,141)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{request.id}</span>
                  <SellerStatusBadge status={request.status} />
                </div>
                <div className="mt-1 text-xs text-gray-500">{new Date(request.createdAt).toLocaleString("ru-RU")}</div>
                <div className="mt-2 break-words text-base font-semibold text-gray-950">{requestTitle(request)}</div>
                <div className="mt-1 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                  <span>ИНН: {requestInn(request)}</span>
                  <span>Тип: {legalTypeLabel(request.onboardingProfile?.legalType || request.sellerType)}</span>
                  <span>География: {requestLocation(request)}</span>
                  <span>Заявитель: {request.applicant.name}</span>
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-gray-600">
                <div className="font-medium text-gray-900">Score: {request.evaluation?.totalScore ?? "-"}</div>
                <div className="mt-1 max-w-44">{recommendationLabel(request.evaluation?.recommendation)}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {filteredRequests.length === 0 && <div className="dashboard-empty">Партнёрские заявки не найдены</div>}

      {selectedRequest && (
        <SellerReviewModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onAction={(action, note) => void updateStatus(selectedRequest, action, note)}
          busy={saving}
        />
      )}
    </div>
  );
}
