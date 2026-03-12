import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Search,
  XCircle,
} from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { matchesSearch } from "../../lib/search";

type ComplaintStatus = "all" | "new" | "pending" | "approved" | "rejected";
type SanctionLevel = "warning" | "temp_3_days" | "temp_30_days" | "permanent";

type Complaint = {
  id: string;
  createdAt: string;
  status: "new" | "pending" | "approved" | "rejected";
  targetType: "listing";
  complaintType: string;
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  listingPrice: number;
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
  sellerVerified: boolean;
  sellerViolationsCount: number;
  sellerListingsCount: number;
  sellerOrdersCount: number;
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  description: string;
  evidence: string | null;
  evidenceFiles: string[];
  checkedAt?: string | null;
  checkedBy?: { id: string; name: string; email: string } | null;
  actionTaken?: string | null;
  sanction?: {
    id: string;
    level: SanctionLevel;
    status: "active" | "completed";
    startsAt: string | null;
    endsAt: string | null;
    reason: string | null;
    createdAt: string | null;
  } | null;
  activeSellerSanction?: {
    id: string;
    level: SanctionLevel;
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
};

type ComplaintUpdateResponse = {
  success: boolean;
  status: "new" | "pending" | "approved" | "rejected";
  enforcement: {
    applied: true;
    approvedViolationsCount: number;
    level: SanctionLevel;
    sanctionId: string;
    sellerStatus: "active" | "blocked";
    blockedUntil: string | null;
    listingStatus: "inactive";
    listingModerationStatus: "rejected";
    message: string;
  } | null;
};

function recommendationLabel(value: Complaint["evaluation"]["recommendation"]): string {
  if (value === "approve") return "Рекомендация: подтвердить";
  if (value === "reject") return "Рекомендация: отклонить";
  return "Рекомендация: ручная проверка";
}

function sanctionLevelLabel(level: SanctionLevel): string {
  if (level === "warning") return "Предупреждение";
  if (level === "temp_3_days") return "Блок на 3 дня";
  if (level === "temp_30_days") return "Блок на 30 дней";
  return "Перманентная блокировка";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function ComplaintsPage() {
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus>("all");
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionTakenInput, setActionTakenInput] = useState("");
  const [complaints, setComplaints] = useState<Complaint[]>([]);

  const loadComplaints = async () => {
    try {
      const result = await apiGet<Complaint[]>("/admin/complaints");
      setComplaints(result);
      setSelectedComplaint((prev) => prev ?? result[0]?.id ?? null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить жалобы");
    }
  };

  useEffect(() => {
    void loadComplaints();
  }, []);

  const filteredComplaints = useMemo(
    () =>
      complaints.filter((complaint) => {
        const matchesStatus = statusFilter === "all" || complaint.status === statusFilter;
        const matchesQuery = matchesSearch(
          {
            ...complaint,
            checkedBy: complaint.checkedBy ? complaint.checkedBy : "",
          },
          searchQuery,
        );
        return matchesStatus && matchesQuery;
      }),
    [complaints, searchQuery, statusFilter],
  );

  const stats = {
    total: complaints.length,
    new: complaints.filter((item) => item.status === "new").length,
    pending: complaints.filter((item) => item.status === "pending").length,
    approved: complaints.filter((item) => item.status === "approved").length,
    rejected: complaints.filter((item) => item.status === "rejected").length,
  };

  const selectedComplaintData =
    complaints.find((complaint) => complaint.id === selectedComplaint) ?? null;

  useEffect(() => {
    setActionTakenInput(selectedComplaintData?.actionTaken ?? "");
  }, [selectedComplaintData?.id, selectedComplaintData?.actionTaken]);

  const getStatusBadge = (status: Complaint["status"]) => {
    const styles = {
      new: "bg-orange-100 text-orange-700 border-orange-300",
      pending: "bg-blue-100 text-blue-700 border-blue-300",
      approved: "bg-red-100 text-red-700 border-red-300",
      rejected: "bg-green-100 text-green-700 border-green-300",
    };
    const labels = {
      new: "Новая",
      pending: "В работе",
      approved: "Подтверждена",
      rejected: "Отклонена",
    };

    return (
      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const updateComplaintStatus = async (
    status: "approved" | "rejected" | "pending",
  ) => {
    if (!selectedComplaintData) return;

    try {
      const result = await apiPatch<ComplaintUpdateResponse>(
        `/admin/complaints/${selectedComplaintData.id}`,
        {
          status,
          actionTaken: actionTakenInput.trim() || null,
        },
      );

      if (result.enforcement?.applied) {
        alert(
          `Применена санкция: ${sanctionLevelLabel(result.enforcement.level)}\n${result.enforcement.message}`,
        );
      }
      await loadComplaints();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить статус жалобы");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Модерация жалоб</h1>
        <p className="dashboard-subtitle">
          Проверка нарушений, принятие решений и применение лестницы санкций.
        </p>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--5">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">Новые</div>
          <div className="dashboard-stat__value">{stats.new}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">В работе</div>
          <div className="dashboard-stat__value">{stats.pending}</div>
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
            type="text"
            placeholder="Поиск по жалобам"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="dashboard-search__input"
          />
        </div>

        <div className="dashboard-chip-row">
          {[
            { value: "all", label: "Все" },
            { value: "new", label: "Новые" },
            { value: "pending", label: "В работе" },
            { value: "approved", label: "Подтверждены" },
            { value: "rejected", label: "Отклонены" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as ComplaintStatus)}
              className={`dashboard-chip ${statusFilter === option.value ? "dashboard-chip--active" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {filteredComplaints.map((complaint) => (
            <button
              key={complaint.id}
              onClick={() => setSelectedComplaint(complaint.id)}
              className={`dashboard-card w-full text-left transition-colors ${
                selectedComplaint === complaint.id ? "border-[rgb(38,83,141)]" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{complaint.id}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(complaint.createdAt).toLocaleString("ru-RU")}
                  </div>
                  <div className="mt-1 break-words text-sm text-gray-900">{complaint.listingTitle}</div>
                  <div className="break-words text-xs text-gray-600">
                    Продавец: {complaint.sellerName} ({complaint.sellerId})
                  </div>
                </div>
                {getStatusBadge(complaint.status)}
              </div>
            </button>
          ))}
          {filteredComplaints.length === 0 && (
            <div className="dashboard-empty">Жалобы не найдены</div>
          )}
        </div>

        <div className="dashboard-card">
          {!selectedComplaintData ? (
            <div className="text-sm text-gray-500">Выберите жалобу для просмотра деталей</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="font-semibold">{selectedComplaintData.complaintType}</span>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="break-words text-sm font-medium text-gray-900">
                  {selectedComplaintData.listingTitle}
                </div>
                <div className="text-xs text-gray-600">
                  {selectedComplaintData.listingId} · {selectedComplaintData.listingPrice.toLocaleString("ru-RU")} ₽
                </div>
                <div className="text-xs text-gray-600">
                  {selectedComplaintData.listingCity}, {selectedComplaintData.listingRegion}
                </div>
                <a
                  href={selectedComplaintData.listingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-[rgb(38,83,141)] hover:underline"
                >
                  Открыть объявление <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <div className="text-sm text-gray-700">{selectedComplaintData.description}</div>
              <div className="break-words text-xs text-gray-600">
                Заявитель: {selectedComplaintData.reporterName} ({selectedComplaintData.reporterEmail})
              </div>
              <div className="text-xs text-gray-600">
                Подтвержденные нарушения продавца: {selectedComplaintData.sellerViolationsCount}
              </div>
              <div className="text-xs text-gray-600">
                Жалоб на это объявление: {selectedComplaintData.listingComplaintsCount}
              </div>
              <div className="text-xs text-gray-600">
                Оценка риска: {selectedComplaintData.evaluation.score} · {recommendationLabel(selectedComplaintData.evaluation.recommendation)}
              </div>
              <div className="break-words text-xs text-gray-600">
                Причины автооценки: {selectedComplaintData.evaluation.reasons.join(", ") || "—"}
              </div>

              <div className="rounded-lg border border-gray-200 p-3 text-xs text-gray-700">
                <div>Статус продавца: {selectedComplaintData.sellerStatus}</div>
                <div>Блокировка до: {formatDateTime(selectedComplaintData.sellerBlockedUntil)}</div>
                {selectedComplaintData.sellerBlockReason && (
                  <div className="break-words">Причина блокировки: {selectedComplaintData.sellerBlockReason}</div>
                )}
                {selectedComplaintData.activeSellerSanction && (
                  <div className="mt-2">
                    Активная санкция: {sanctionLevelLabel(selectedComplaintData.activeSellerSanction.level)} ({selectedComplaintData.activeSellerSanction.status})
                  </div>
                )}
                {selectedComplaintData.sanction && (
                  <div className="mt-1">
                    Санкция по жалобе: {sanctionLevelLabel(selectedComplaintData.sanction.level)} ({selectedComplaintData.sanction.status})
                  </div>
                )}
              </div>

              {selectedComplaintData.evidenceFiles.length > 0 && (
                <div className="break-words text-xs text-gray-600">
                  Файлы доказательств: {selectedComplaintData.evidenceFiles.join(", ")}
                </div>
              )}

              <textarea
                className="field-control"
                rows={3}
                value={actionTakenInput}
                onChange={(event) => setActionTakenInput(event.target.value)}
                placeholder="Действие модератора / комментарий"
              />

              <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:flex-wrap">
                <button
                  onClick={() => void updateComplaintStatus("approved")}
                  className="btn-danger-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                  disabled={selectedComplaintData.status === "approved"}
                >
                  <CheckCircle className="h-4 w-4" /> Подтвердить нарушение
                </button>
                <button
                  onClick={() => void updateComplaintStatus("pending")}
                  className="btn-secondary flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                  disabled={selectedComplaintData.status === "approved"}
                >
                  <AlertTriangle className="h-4 w-4" /> Вернуть в работу
                </button>
                <button
                  onClick={() => void updateComplaintStatus("rejected")}
                  className="btn-success-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                  disabled={selectedComplaintData.status === "approved"}
                >
                  <XCircle className="h-4 w-4" /> Отклонить жалобу
                </button>
              </div>

              {selectedComplaintData.status === "approved" && (
                <div className="text-xs text-amber-700">
                  Подтвержденная жалоба фиксируется и не переводится назад, чтобы не ломать историю санкций.
                </div>
              )}

              {selectedComplaintData.actionTaken && (
                <div className="border-t pt-2 text-xs text-gray-500">
                  Последнее действие: {selectedComplaintData.actionTaken}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
