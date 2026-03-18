import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle,
  CircleX,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

type ComplaintStatus = "new" | "pending" | "approved" | "rejected";
type ComplaintStatusFilter = ComplaintStatus | "all";
type ComplaintPriority = "low" | "medium" | "high";
type ComplaintSortBy = "queueScore" | "riskScore" | "createdAt";
type ComplaintSortOrder = "asc" | "desc";
type DetailTab = "overview" | "evidence" | "history" | "sanctions";
type StatusAction = "approved" | "rejected";

type ComplaintHistoryItem = {
  id: string;
  type: string;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus | null;
  note: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type ComplaintItem = {
  id: string;
  createdAt: string;
  status: ComplaintStatus;
  targetType: "listing";
  complaintType: string;
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  listingPrice: number;
  listingCreatedAt: string;
  listingStatus: string;
  listingModerationStatus: string;
  listingCity: string;
  listingRegion: string;
  listingComplaintsCount: number;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string | null;
  sellerStatus: "active" | "blocked";
  sellerBlockedUntil: string | null;
  sellerBlockReason: string | null;
  sellerJoinedAt: string;
  sellerVerified: boolean;
  sellerResponseMinutes: number | null;
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  sellerViolationsCount: number;
  sellerListingsCount: number;
  sellerOrdersCount: number;
  description: string;
  evidence: string | null;
  evidenceFiles: string[];
  checkedAt: string | null;
  checkedBy: { id: string; name: string; email: string } | null;
  actionTaken: string | null;
  sanction: {
    id: string;
    level: string;
    status: "active" | "completed";
    startsAt: string | null;
    endsAt: string | null;
    reason: string | null;
    createdAt: string | null;
  } | null;
  activeSellerSanction: {
    id: string;
    level: string;
    status: "active" | "completed";
    startsAt: string | null;
    endsAt: string | null;
    reason: string | null;
    createdAt: string | null;
  } | null;
  evaluation: {
    score: number;
    recommendation: "approve" | "reject" | "manual_review";
    reasons: string[];
  };
  riskScore: number;
  queueScore: number;
  priority: ComplaintPriority;
  ageHours: number;
};

type ComplaintDetail = ComplaintItem & {
  history: ComplaintHistoryItem[];
};

type ComplaintListResponse = {
  items: ComplaintItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ComplaintStatsResponse = {
  total: number;
  new: number;
  pending: number;
  approved: number;
  rejected: number;
  highPriority?: number;
  mediumPriority?: number;
  lowPriority?: number;
};

type RelatedListingComplaint = {
  id: string;
  createdAt: string;
  status: ComplaintStatus;
  complaintType: string;
  reporterName: string;
  priority: ComplaintPriority;
  queueScore: number;
  isCurrent: boolean;
};

type SellerSummaryResponse = {
  seller: {
    id: string;
    name: string;
    email: string;
    status: "active" | "blocked";
    blockedUntil: string | null;
    blockReason: string | null;
    verified: boolean;
    listingsCount: number;
    ordersCount: number;
  };
  complaints: {
    total: number;
    approved: number;
    pending: number;
    new: number;
    rejected: number;
  };
  activeSanctionsCount: number;
  recentCases: Array<{
    id: string;
    status: ComplaintStatus;
    complaintType: string;
    listingId: string;
    listingTitle: string;
    createdAt: string;
  }>;
};

type ComplaintStatusUpdateResponse = {
  success: boolean;
  status: ComplaintStatus;
  enforcement: {
    applied: true;
    approvedViolationsCount: number;
    level: string;
    sanctionId: string;
    sellerStatus: "active" | "blocked";
    blockedUntil: string | null;
    listingStatus: "inactive";
    listingModerationStatus: "rejected";
    message: string;
  } | null;
};

type FiltersState = {
  status: ComplaintStatusFilter;
  search: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  sortBy: ComplaintSortBy;
  sortOrder: ComplaintSortOrder;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

function getStatusLabel(status: ComplaintStatus): string {
  if (status === "new") return "Новая";
  if (status === "pending") return "В работе";
  if (status === "approved") return "Подтверждена";
  return "Отклонена";
}

function getStatusClass(status: ComplaintStatus): string {
  if (status === "new") return "bg-orange-100 text-orange-700 border-orange-300";
  if (status === "pending") return "bg-blue-100 text-blue-700 border-blue-300";
  if (status === "approved") return "bg-red-100 text-red-700 border-red-300";
  return "bg-green-100 text-green-700 border-green-300";
}

function getPriorityLabel(priority: ComplaintPriority): string {
  if (priority === "high") return "Высокий";
  if (priority === "medium") return "Средний";
  return "Низкий";
}

function getPriorityClass(priority: ComplaintPriority): string {
  if (priority === "high") return "bg-red-100 text-red-700 border-red-300";
  if (priority === "medium") return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-slate-100 text-slate-700 border-slate-300";
}

function getSortLabel(sortBy: ComplaintSortBy): string {
  if (sortBy === "queueScore") return "Приоритет";
  if (sortBy === "riskScore") return "Риск";
  return "Дата";
}

function makeIdempotencyKey(complaintId: string, status: StatusAction): string {
  return `cmp-${complaintId}-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const defaultPagination: ComplaintListResponse["pagination"] = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

export function ComplaintsPage() {
  const [filters, setFilters] = useState<FiltersState>({
    status: "new",
    search: "",
    from: "",
    to: "",
    page: 1,
    pageSize: 20,
    sortBy: "queueScore",
    sortOrder: "desc",
  });

  const [stats, setStats] = useState<ComplaintStatsResponse>({
    total: 0,
    new: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  const [listData, setListData] = useState<ComplaintListResponse>({
    items: [],
    pagination: defaultPagination,
  });

  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintDetail | null>(null);
  const [relatedListingComplaints, setRelatedListingComplaints] = useState<RelatedListingComplaint[]>([]);
  const [sellerSummary, setSellerSummary] = useState<SellerSummaryResponse | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [moderatorComment, setModeratorComment] = useState("");
  const [isActionLoading, setIsActionLoading] = useState<StatusAction | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const listQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.search.trim()) params.set("q", filters.search.trim());
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    params.set("page", String(filters.page));
    params.set("pageSize", String(filters.pageSize));
    params.set("sortBy", filters.sortBy);
    params.set("sortOrder", filters.sortOrder);
    return params.toString();
  }, [filters]);

  const statsQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set("q", filters.search.trim());
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    return params.toString();
  }, [filters.from, filters.search, filters.to]);

  const loadComplaints = useCallback(async () => {
    const response = await apiGet<ComplaintListResponse>(`/admin/complaints?${listQueryString}`);
    setListData(response);

    setSelectedComplaintId((previous) => {
      if (response.items.length === 0) {
        setIsDetailOpen(false);
        return null;
      }
      if (previous && response.items.some((item) => item.id === previous)) {
        return previous;
      }
      return response.items[0].id;
    });
  }, [listQueryString]);

  const loadStats = useCallback(async () => {
    const response = await apiGet<ComplaintStatsResponse>(`/admin/complaints/stats?${statsQueryString}`);
    setStats(response);
  }, [statsQueryString]);

  const loadComplaintDetails = useCallback(async (complaintId: string) => {
    const [detail, related, seller] = await Promise.all([
      apiGet<ComplaintDetail>(`/admin/complaints/${complaintId}`),
      apiGet<{ items: RelatedListingComplaint[] }>(`/admin/complaints/${complaintId}/related-listing`),
      apiGet<SellerSummaryResponse>(`/admin/complaints/${complaintId}/seller-summary`),
    ]);

    setSelectedComplaint(detail);
    setRelatedListingComplaints(related.items);
    setSellerSummary(seller);
    setModeratorComment(detail.actionTaken ?? "");
  }, []);

  useEffect(() => {
    Promise.all([loadComplaints(), loadStats()]).catch((error) => {
      alert(error instanceof Error ? error.message : "Не удалось загрузить жалобы");
    });
  }, [loadComplaints, loadStats]);

  useEffect(() => {
    if (!selectedComplaintId) {
      setSelectedComplaint(null);
      setRelatedListingComplaints([]);
      setSellerSummary(null);
      return;
    }

    loadComplaintDetails(selectedComplaintId).catch((error) => {
      alert(error instanceof Error ? error.message : "Не удалось загрузить детали жалобы");
    });
  }, [loadComplaintDetails, selectedComplaintId]);

  useEffect(() => {
    if (!isDetailOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isDetailOpen]);

  const setStatusFilter = (status: ComplaintStatusFilter) => {
    setFilters((previous) => ({ ...previous, status, page: 1 }));
  };

  const toggleSort = (sortBy: ComplaintSortBy) => {
    setFilters((previous) => {
      if (previous.sortBy === sortBy) {
        return {
          ...previous,
          sortOrder: previous.sortOrder === "desc" ? "asc" : "desc",
          page: 1,
        };
      }

      return {
        ...previous,
        sortBy,
        sortOrder: "desc",
        page: 1,
      };
    });
  };

  const handleOpenDetail = (complaintId: string) => {
    setSelectedComplaintId(complaintId);
    setActiveTab("overview");
    setIsDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setIsDetailOpen(false);
  };

  const handleSelectRelatedComplaint = (complaintId: string) => {
    setSelectedComplaintId(complaintId);
    setActiveTab("overview");
  };

  const handleUpdateStatus = async (nextStatus: StatusAction) => {
    if (!selectedComplaint || isActionLoading) return;

    const confirmationMessage =
      nextStatus === "approved"
        ? "Подтвердить нарушение? Это необратимое действие."
        : "Отклонить жалобу?";

    if (!window.confirm(confirmationMessage)) {
      return;
    }

    setIsActionLoading(nextStatus);
    try {
      await apiPatch<ComplaintStatusUpdateResponse>(
        `/admin/complaints/${selectedComplaint.id}/status`,
        {
          status: nextStatus,
          actionTaken: moderatorComment.trim() || null,
        },
        {
          "Idempotency-Key": makeIdempotencyKey(selectedComplaint.id, nextStatus),
        },
      );

      await Promise.all([
        loadComplaints(),
        loadStats(),
        loadComplaintDetails(selectedComplaint.id),
      ]);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить жалобу");
    } finally {
      setIsActionLoading(null);
    }
  };

  const statusTabs: Array<{ id: ComplaintStatusFilter; label: string }> = [
    { id: "new", label: "Новые" },
    { id: "approved", label: "Подтвержденные" },
    { id: "rejected", label: "Отклоненные" },
    { id: "all", label: "Все" },
  ];

  const detailTabs: Array<{ id: DetailTab; label: string }> = [
    { id: "overview", label: "Обзор" },
    { id: "evidence", label: "Доказательства" },
    { id: "history", label: "История" },
    { id: "sanctions", label: "Санкции" },
  ];

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Жалобы</h1>
        <p className="dashboard-subtitle">
          Очередь кейсов: сначала новые, затем подтверждение или отклонение.
        </p>
      </div>

      <div className="dashboard-grid-stats">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">Новые</div>
          <div className="dashboard-stat__value">{stats.new}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Подтверждены</div>
          <div className="dashboard-stat__value">{stats.approved}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Отклонены</div>
          <div className="dashboard-stat__value">{stats.rejected}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            className="dashboard-search__input"
            placeholder="Поиск по жалобам"
            value={filters.search}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                search: event.target.value,
                page: 1,
              }))
            }
          />
        </div>

        <div className="dashboard-chip-row">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              className={`dashboard-chip ${filters.status === tab.id ? "dashboard-chip--active" : ""}`}
              onClick={() => setStatusFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              className="field-control"
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  from: event.target.value,
                  page: 1,
                }))
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <input
              className="field-control"
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((previous) => ({
                  ...previous,
                  to: event.target.value,
                  page: 1,
                }))
              }
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["queueScore", "riskScore", "createdAt"] as ComplaintSortBy[]).map(
            (sortBy) => {
              const isActive = filters.sortBy === sortBy;
              return (
                <button
                  key={sortBy}
                  className={`dashboard-chip ${isActive ? "dashboard-chip--active" : ""}`}
                  onClick={() => toggleSort(sortBy)}
                >
                  {getSortLabel(sortBy)}{" "}
                  {isActive ? (
                    filters.sortOrder === "desc" ? (
                      <ArrowDown className="inline h-3.5 w-3.5" />
                    ) : (
                      <ArrowUp className="inline h-3.5 w-3.5" />
                    )
                  ) : null}
                </button>
              );
            },
          )}
          <span className="text-xs text-gray-500">
            Текущая сортировка: {getSortLabel(filters.sortBy)}{" "}
            {filters.sortOrder === "desc" ? "по убыванию" : "по возрастанию"}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {listData.items.map((complaint) => (
          <button
            key={complaint.id}
            type="button"
            onClick={() => handleOpenDetail(complaint.id)}
            className={`dashboard-card w-full text-left ${selectedComplaintId === complaint.id ? "border-[rgb(38,83,141)]" : ""}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{complaint.id}</div>
                <div className="text-xs text-gray-500">{formatDateTime(complaint.createdAt)}</div>
                <div className="mt-1 text-sm">{complaint.listingTitle}</div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  <span
                    className={`rounded-full border px-2 py-0.5 ${getPriorityClass(complaint.priority)}`}
                  >
                    {getPriorityLabel(complaint.priority)}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                    Queue {complaint.queueScore}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                    Риск {complaint.riskScore}
                  </span>
                </div>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs ${getStatusClass(complaint.status)}`}>
                {getStatusLabel(complaint.status)}
              </span>
            </div>
          </button>
        ))}

        {listData.items.length === 0 ? (
          <div className="dashboard-empty">Жалобы не найдены</div>
        ) : null}

        {listData.pagination.total > 0 ? (
          <div className="dashboard-card flex items-center justify-between gap-2 text-xs text-gray-600">
            <div>
              Страница {listData.pagination.page}
              {listData.pagination.totalPages > 0 ? ` из ${listData.pagination.totalPages}` : ""} · Всего{" "}
              {listData.pagination.total}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() =>
                  setFilters((previous) => ({
                    ...previous,
                    page: Math.max(1, previous.page - 1),
                  }))
                }
                disabled={listData.pagination.page <= 1}
              >
                Назад
              </button>
              <button
                className="btn-secondary px-2 py-1 text-xs"
                onClick={() =>
                  setFilters((previous) => ({
                    ...previous,
                    page: previous.page + 1,
                  }))
                }
                disabled={
                  listData.pagination.totalPages > 0 &&
                  listData.pagination.page >= listData.pagination.totalPages
                }
              >
                Вперед
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {isDetailOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4"
          onClick={handleCloseDetail}
        >
          <div
            className="w-full max-h-[92vh] overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.6)] md:w-[min(980px,95vw)] md:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {!selectedComplaint ? (
              <div className="p-5 text-sm text-gray-500">Загрузка деталей жалобы...</div>
            ) : (
              <div className="flex max-h-[92vh] flex-col">
                <div className="border-b border-gray-200 px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{selectedComplaint.id}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {selectedComplaint.listingTitle}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-1 text-xs ${getStatusClass(selectedComplaint.status)}`}
                      >
                        {getStatusLabel(selectedComplaint.status)}
                      </span>
                      <button
                        type="button"
                        className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                        onClick={handleCloseDetail}
                        aria-label="Закрыть"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="dashboard-chip-row mt-3">
                    {detailTabs.map((tab) => (
                      <button
                        key={tab.id}
                        className={`dashboard-chip ${activeTab === tab.id ? "dashboard-chip--active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                  {activeTab === "overview" ? (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="font-medium">{selectedComplaint.listingTitle}</div>
                        <div className="text-xs text-gray-600">
                          {selectedComplaint.listingPrice.toLocaleString("ru-RU")} ₽ · {selectedComplaint.listingCity},{" "}
                          {selectedComplaint.listingRegion}
                        </div>
                        <a
                          href={selectedComplaint.listingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-[rgb(38,83,141)] hover:underline"
                        >
                          Открыть объявление <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>

                      <div className="text-xs text-gray-700">
                        Заявитель: {selectedComplaint.reporterName} ({selectedComplaint.reporterEmail})
                      </div>
                      <div className="text-xs text-gray-700">
                        Оценка риска: {selectedComplaint.riskScore} · Queue {selectedComplaint.queueScore}
                      </div>

                      <div className="rounded-lg border border-gray-200 p-3">
                        <div className="mb-1 text-xs font-semibold text-gray-500">
                          Связанные жалобы по этому объявлению
                        </div>
                        <div className="space-y-1">
                          {relatedListingComplaints.map((relatedItem) => (
                            <button
                              key={relatedItem.id}
                              className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs ${
                                relatedItem.isCurrent
                                  ? "border-[rgb(38,83,141)] bg-blue-50/40"
                                  : "border-gray-200"
                              }`}
                              onClick={() => handleSelectRelatedComplaint(relatedItem.id)}
                            >
                              {relatedItem.id} · {relatedItem.complaintType} · {relatedItem.reporterName}
                            </button>
                          ))}
                          {relatedListingComplaints.length === 0 ? (
                            <div className="text-xs text-gray-500">Нет связанных жалоб</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === "evidence" ? (
                    <div className="space-y-2 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        {selectedComplaint.description}
                      </div>
                      <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-600">
                        Файлы: {selectedComplaint.evidenceFiles.length ? selectedComplaint.evidenceFiles.join(", ") : "—"}
                      </div>
                    </div>
                  ) : null}

                  {activeTab === "history" ? (
                    <div className="space-y-2">
                      {selectedComplaint.history.map((event) => (
                        <div key={event.id} className="rounded-lg border border-gray-200 p-3 text-xs">
                          <div className="font-semibold">{event.type}</div>
                          <div className="text-gray-600">{formatDateTime(event.createdAt)}</div>
                          <div className="text-gray-600">
                            {event.fromStatus ? getStatusLabel(event.fromStatus) : "—"} →{" "}
                            {event.toStatus ? getStatusLabel(event.toStatus) : "—"}
                          </div>
                          {event.note ? <div className="text-gray-700">{event.note}</div> : null}
                        </div>
                      ))}
                      {selectedComplaint.history.length === 0 ? (
                        <div className="dashboard-empty">История пуста</div>
                      ) : null}
                    </div>
                  ) : null}

                  {activeTab === "sanctions" ? (
                    <div className="space-y-2 text-sm">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs">
                        <div>Статус продавца: {selectedComplaint.sellerStatus}</div>
                        <div>Блокировка до: {formatDateTime(selectedComplaint.sellerBlockedUntil)}</div>
                        <div>Причина: {selectedComplaint.sellerBlockReason || "—"}</div>
                        <div>
                          Санкция по жалобе: {selectedComplaint.sanction ? `${selectedComplaint.sanction.level} (${selectedComplaint.sanction.status})` : "нет"}
                        </div>
                      </div>

                      {sellerSummary ? (
                        <div className="rounded-lg border border-gray-200 p-3 text-xs">
                          <div className="font-semibold">
                            {sellerSummary.seller.name} ({sellerSummary.seller.email})
                          </div>
                          <div>
                            Жалобы: {sellerSummary.complaints.total}, подтверждено: {sellerSummary.complaints.approved}
                          </div>
                          <div>Активные санкции: {sellerSummary.activeSanctionsCount}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-gray-200 bg-white/95 px-5 py-4 backdrop-blur">
                  <textarea
                    className="field-control"
                    rows={3}
                    placeholder="Комментарий модератора"
                    value={moderatorComment}
                    onChange={(event) => setModeratorComment(event.target.value)}
                  />
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <button
                      onClick={() => {
                        void handleUpdateStatus("approved");
                      }}
                      className="btn-danger-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                      disabled={isActionLoading !== null || selectedComplaint.status === "approved"}
                    >
                      <CheckCircle className="h-4 w-4" /> Подтвердить
                    </button>
                    <button
                      onClick={() => {
                        void handleUpdateStatus("rejected");
                      }}
                      className="btn-success-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                      disabled={isActionLoading !== null || selectedComplaint.status === "approved"}
                    >
                      <CircleX className="h-4 w-4" /> Отклонить
                    </button>
                  </div>
                  {selectedComplaint.status === "approved" ? (
                    <div className="mt-2 text-xs text-amber-700">
                      Подтвержденная жалоба фиксируется и не переводится назад.
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

