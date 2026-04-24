import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
import { confirmDialog, notifyError } from "../ui/notifications";

type ComplaintStatus = "new" | "pending" | "approved" | "rejected";
type ComplaintStatusFilter = ComplaintStatus | "all";
type ComplaintPriority = "low" | "medium" | "high";
type ComplaintSortBy = "queueScore" | "riskScore" | "createdAt";
type ComplaintSortOrder = "asc" | "desc";
type ListingStatus = "active" | "inactive" | "moderation";
type ListingModerationStatus = "approved" | "rejected" | "pending";
type SellerStatus = "active" | "blocked";
type ComplaintSanctionStatus = "active" | "completed";
type ComplaintSanctionLevel = "warning" | "temp_3_days" | "temp_30_days" | "permanent";
type DetailTab = "overview" | "sanctions";
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
  listingStatus: ListingStatus;
  listingModerationStatus: ListingModerationStatus;
  listingCity: string;
  listingRegion: string;
  listingComplaintsCount: number;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string | null;
  sellerStatus: SellerStatus;
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
  checkedAt: string | null;
  checkedBy: { id: string; name: string; email: string } | null;
  actionTaken: string | null;
  sanction: {
    id: string;
    level: ComplaintSanctionLevel;
    status: ComplaintSanctionStatus;
    startsAt: string | null;
    endsAt: string | null;
    reason: string | null;
    createdAt: string | null;
  } | null;
  activeSellerSanction: {
    id: string;
    level: ComplaintSanctionLevel;
    status: ComplaintSanctionStatus;
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
  sort: {
    by: ComplaintSortBy;
    order: ComplaintSortOrder;
  };
  filters: {
    status: ComplaintStatus[];
    priority: ComplaintPriority[];
    moderator: string | null;
    from: string | null;
    to: string | null;
    q: string;
  };
  options: {
    moderators: Array<{
      id: string;
      name: string;
      email: string;
    }>;
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
    status: SellerStatus;
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
  cases: {
    total: number;
    approved: number;
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
    level: ComplaintSanctionLevel;
    sanctionId: string;
    sellerStatus: SellerStatus;
    blockedUntil: string | null;
    listingStatus: "inactive";
    listingModerationStatus: "rejected";
    message: string;
  } | null;
  cascade: {
    updatedCount: number;
    cascadedComplaintIds: string[];
  };
};

type RelatedListingResponse = {
  items: RelatedListingComplaint[];
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

function getSortLabel(sortBy: ComplaintSortBy): string {
  if (sortBy === "queueScore") return "Балл очереди";
  if (sortBy === "riskScore") return "Риск";
  return "Дата";
}

function getComplaintTypeLabel(type: string): string {
  const normalized = type.trim().toLowerCase();
  if (normalized === "suspicious_listing") return "Подозрительное объявление";
  if (normalized === "fraud") return "Мошенничество";
  if (normalized === "other") return "Другая причина";
  if (normalized === "payment_off_platform") return "Оплата вне платформы";
  return type;
}

function buildComplaintListingHref(listingId: string, fallbackUrl: string): string {
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

function makeIdempotencyKey(complaintId: string, status: StatusAction): string {
  return `cmp-${complaintId}-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const defaultPagination: ComplaintListResponse["pagination"] = {
  page: 1,
  pageSize: 20,
  total: 0,
  totalPages: 0,
};

const defaultListSort: ComplaintListResponse["sort"] = {
  by: "queueScore",
  order: "desc",
};

const defaultListFilters: ComplaintListResponse["filters"] = {
  status: [],
  priority: [],
  moderator: null,
  from: null,
  to: null,
  q: "",
};

const defaultListOptions: ComplaintListResponse["options"] = {
  moderators: [],
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
    sort: defaultListSort,
    filters: defaultListFilters,
    options: defaultListOptions,
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
      apiGet<RelatedListingResponse>(`/admin/complaints/${complaintId}/related-listing`),
      apiGet<SellerSummaryResponse>(`/admin/complaints/${complaintId}/seller-summary`),
    ]);

    setSelectedComplaint(detail);
    setRelatedListingComplaints(related.items);
    setSellerSummary(seller);
    setModeratorComment(detail.actionTaken ?? "");
  }, []);

  useEffect(() => {
    Promise.all([loadComplaints(), loadStats()]).catch((error) => {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить жалобы");
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
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить детали жалобы");
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
    if (!selectedComplaint || isActionLoading || isComplaintDecisionLocked) return;

    const confirmationMessage =
      nextStatus === "approved"
        ? "Подтвердить нарушение? Это необратимое действие."
        : "Отклонить жалобу?";

    const isConfirmed = await confirmDialog({
      title: "Подтвердите действие",
      description: confirmationMessage,
      confirmLabel: "Подтвердить",
      cancelLabel: "Отмена",
      confirmTone: nextStatus === "approved" ? "danger" : "default",
    });

    if (!isConfirmed) {
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
      notifyError(error instanceof Error ? error.message : "Не удалось обновить жалобу");
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
    { id: "overview", label: "Жалоба" },
    { id: "sanctions", label: "Заявитель и санкции" },
  ];
  const isComplaintDecisionLocked =
    selectedComplaint?.status === "approved" || selectedComplaint?.status === "rejected";
  const sellerApprovalRate =
    sellerSummary && sellerSummary.cases.total > 0
      ? Math.round((sellerSummary.cases.approved / sellerSummary.cases.total) * 100)
      : 0;
  const sellerStatusValue =
    sellerSummary?.seller.status ?? (selectedComplaint?.sellerStatus ?? "active");
  const sellerBlockedUntilValue =
    sellerSummary?.seller.blockedUntil ?? selectedComplaint?.sellerBlockedUntil ?? null;
  const sellerBlockReasonValue =
    sellerSummary?.seller.blockReason ?? selectedComplaint?.sellerBlockReason ?? null;
  const hasSellerRestrictions =
    sellerStatusValue === "blocked" ||
    Boolean(sellerBlockedUntilValue) ||
    Boolean(sellerBlockReasonValue) ||
    (sellerSummary?.activeSanctionsCount ?? 0) > 0;

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
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-700">
                    Балл очереди {complaint.queueScore}
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

      {isDetailOpen && typeof document !== "undefined"
        ? createPortal(
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center"
          style={{
            backgroundColor: "rgba(15, 23, 42, 0.45)",
            padding: "24px",
          }}
          onClick={handleCloseDetail}
        >
          <div
            className="w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_28px_80px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-300/60"
            style={{
              maxWidth: "760px",
              maxHeight: "80vh",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            {!selectedComplaint ? (
              <div className="p-8 text-center text-sm text-slate-500">Загрузка деталей жалобы...</div>
            ) : (
              <div className="flex flex-col" style={{ maxHeight: "80vh" }}>
                <div className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-5 py-4 md:px-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{selectedComplaint.id}</div>
                      <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                        <span className="truncate">{selectedComplaint.listingTitle}</span>
                        <span className="shrink-0 text-slate-400">·</span>
                        <a
                          href={buildComplaintListingHref(
                            selectedComplaint.listingId,
                            selectedComplaint.listingUrl,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 font-medium text-[rgb(38,83,141)] hover:underline"
                        >
                          Открыть объявление <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50"
                        onClick={handleCloseDetail}
                        aria-label="Закрыть"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`rounded-full border px-2.5 py-1 font-medium ${getStatusClass(selectedComplaint.status)}`}
                    >
                      {getStatusLabel(selectedComplaint.status)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                      Риск {selectedComplaint.riskScore}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
                      Балл очереди {selectedComplaint.queueScore}
                    </span>
                  </div>

                  <div className="dashboard-chip-row mt-4">
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

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6 md:py-5">
                  {activeTab === "overview" ? (
                    <div className="space-y-4 text-sm">
                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Суть жалобы
                        </div>
                        <div className="mt-2 text-sm text-slate-800">
                          Тип: {getComplaintTypeLabel(selectedComplaint.complaintType)}
                        </div>
                        <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                          {selectedComplaint.description || "Описание не указано."}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Связанные жалобы по объявлению
                          </div>
                          <div className="text-xs text-slate-400">
                            {relatedListingComplaints.length}
                          </div>
                        </div>
                        <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
                          {relatedListingComplaints.map((relatedItem) => (
                            <button
                              key={relatedItem.id}
                              className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                                relatedItem.isCurrent
                                  ? "border-[rgb(38,83,141)] bg-blue-50/50 text-[rgb(25,58,101)]"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                              }`}
                              onClick={() => handleSelectRelatedComplaint(relatedItem.id)}
                            >
                              {relatedItem.id} · {getComplaintTypeLabel(relatedItem.complaintType)} ·{" "}
                              {relatedItem.reporterName}
                            </button>
                          ))}
                          {relatedListingComplaints.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                              Нет связанных жалоб
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === "sanctions" ? (
                    <div className="space-y-3 text-sm">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Заявитель
                        </div>
                        <div className="mt-2 text-sm font-medium text-slate-900">
                          {selectedComplaint.reporterName}
                        </div>
                        <div className="text-xs text-slate-600">{selectedComplaint.reporterEmail}</div>
                        <div className="mt-3 text-xs text-slate-500">
                          Жалоба создана: {formatDateTime(selectedComplaint.createdAt)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-xs">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          Продавец
                        </div>
                        <div className="mt-2 font-semibold text-slate-900">
                          {sellerSummary
                            ? `${sellerSummary.seller.name} (${sellerSummary.seller.email})`
                            : `${selectedComplaint.sellerName} (${selectedComplaint.sellerEmail})`}
                        </div>
                        {sellerSummary ? (
                          <>
                            <div className="mt-1 text-slate-700">
                              Жалобы: {sellerSummary.complaints.total} · Подтверждено:{" "}
                              {sellerSummary.complaints.approved} · Отклонено:{" "}
                              {sellerSummary.complaints.rejected}
                            </div>
                            <div className="text-slate-700">
                              Кейсы (уникальные объявления): {sellerSummary.cases.total} · Подтверждено:{" "}
                              {sellerSummary.cases.approved} · Отклонено: {sellerSummary.cases.rejected}
                            </div>
                            <div className="text-slate-700">
                              Доля подтвержденных (по кейсам): {sellerApprovalRate}%
                            </div>
                            {sellerSummary.activeSanctionsCount > 0 ? (
                              <div className="text-slate-700">
                                Активные санкции: {sellerSummary.activeSanctionsCount}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="mt-1 text-slate-700">Статистика по продавцу недоступна.</div>
                        )}
                        {hasSellerRestrictions ? (
                          <div className="mt-2 border-t border-slate-200 pt-2 text-slate-700">
                            <div>
                              Статус продавца:{" "}
                              {sellerStatusValue === "blocked" ? "заблокирован" : "активен"}
                            </div>
                            {sellerBlockedUntilValue ? (
                              <div>Блокировка до: {formatDateTime(sellerBlockedUntilValue)}</div>
                            ) : null}
                            {sellerBlockReasonValue ? <div>Причина: {sellerBlockReasonValue}</div> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-6">
                  <div className="text-xs font-medium text-slate-500">Комментарий модератора</div>
                  <textarea
                    className="field-control mt-2 min-h-[88px] rounded-xl border-slate-200 bg-slate-50/40 focus:bg-white"
                    rows={3}
                    placeholder={
                      isComplaintDecisionLocked
                        ? "Жалоба закрыта, редактирование недоступно"
                        : "Добавьте комментарий к решению"
                    }
                    value={moderatorComment}
                    onChange={(event) => setModeratorComment(event.target.value)}
                    disabled={isComplaintDecisionLocked}
                  />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        void handleUpdateStatus("rejected");
                      }}
                      className={
                        isComplaintDecisionLocked
                          ? "flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-slate-300 bg-slate-100 py-2 text-sm text-slate-400"
                          : "btn-success-soft flex w-full items-center justify-center gap-1 py-2 text-sm"
                      }
                      disabled={isActionLoading !== null || isComplaintDecisionLocked}
                    >
                      <CircleX className="h-4 w-4" /> Отклонить
                    </button>
                    <button
                      onClick={() => {
                        void handleUpdateStatus("approved");
                      }}
                      className={
                        isComplaintDecisionLocked
                          ? "flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-slate-300 bg-slate-100 py-2 text-sm text-slate-400"
                          : "btn-danger-soft flex w-full items-center justify-center gap-1 py-2 text-sm"
                      }
                      disabled={isActionLoading !== null || isComplaintDecisionLocked}
                    >
                      <CheckCircle className="h-4 w-4" /> Подтвердить
                    </button>
                  </div>
                  {isComplaintDecisionLocked ? (
                    <div className="mt-2 text-xs text-amber-700">
                      Жалоба зафиксирована со статусом «{getStatusLabel(selectedComplaint.status)}».
                      Изменение решения недоступно.
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}
