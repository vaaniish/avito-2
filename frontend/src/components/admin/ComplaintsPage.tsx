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

type ComplaintStatus = "all" | "new" | "approved" | "rejected";

type Complaint = {
  id: string;
  createdAt: string;
  status: "new" | "approved" | "rejected";
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
  evaluation: {
    score: number;
    recommendation: "approve" | "reject" | "manual_review";
    reasons: string[];
  };
};

function recommendationLabel(value: Complaint["evaluation"]["recommendation"]): string {
  if (value === "approve") return "Рекомендуется подтвердить";
  if (value === "reject") return "Рекомендуется отклонить";
  return "Нужна ручная проверка";
}

export function ComplaintsPage() {
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus>("all");
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
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
        const matchesStatus =
          statusFilter === "all" || complaint.status === statusFilter;
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
    approved: complaints.filter((item) => item.status === "approved").length,
    rejected: complaints.filter((item) => item.status === "rejected").length,
  };

  const selectedComplaintData =
    complaints.find((complaint) => complaint.id === selectedComplaint) ?? null;

  const getStatusBadge = (status: Complaint["status"]) => {
    const styles = {
      new: "bg-orange-100 text-orange-700 border-orange-300",
      approved: "bg-red-100 text-red-700 border-red-300",
      rejected: "bg-green-100 text-green-700 border-green-300",
    };
    const labels = {
      new: "Новая",
      approved: "Подтверждена",
      rejected: "Отклонена",
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  const updateComplaintStatus = async (status: "approved" | "rejected") => {
    if (!selectedComplaintData) return;

    try {
      await apiPatch<{ success: boolean }>(
        `/admin/complaints/${selectedComplaintData.id}`,
        {
          status,
          actionTaken:
            status === "approved"
              ? "Нарушение подтверждено, применены меры к объявлению и продавцу"
              : "Нарушение не подтвердилось по результатам проверки",
        },
      );
      await loadComplaints();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить жалобу");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Жалобы</h1>
        <p className="dashboard-subtitle">Жалобы только на объявления и карточки товаров/услуг</p>
      </div>

      <div className="dashboard-grid-stats">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего жалоб</div>
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
            type="text"
            placeholder="Поиск по любому полю жалобы"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="dashboard-search__input"
          />
        </div>

        <div className="dashboard-chip-row">
          {[
            { value: "all", label: "Все" },
            { value: "new", label: "Новые" },
            { value: "approved", label: "Подтверждены" },
            { value: "rejected", label: "Отклонены" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as ComplaintStatus)}
              className={`dashboard-chip ${
                statusFilter === option.value ? "dashboard-chip--active" : ""
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {filteredComplaints.map((complaint) => (
            <button
              key={complaint.id}
              onClick={() => setSelectedComplaint(complaint.id)}
              className={`w-full text-left dashboard-card transition-colors ${
                selectedComplaint === complaint.id
                  ? "border-[rgb(38,83,141)]"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{complaint.id}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(complaint.createdAt).toLocaleString("ru-RU")}
                  </div>
                  <div className="text-sm text-gray-900 mt-1 break-words">
                    {complaint.listingTitle}
                  </div>
                  <div className="text-xs text-gray-600 break-words">
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
            <div className="text-sm text-gray-500">
              Выберите жалобу для просмотра деталей
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <span className="font-semibold">{selectedComplaintData.complaintType}</span>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="text-sm font-medium text-gray-900 break-words">
                  {selectedComplaintData.listingTitle}
                </div>
                <div className="text-xs text-gray-600">
                  {selectedComplaintData.listingId} ·{" "}
                  {selectedComplaintData.listingPrice.toLocaleString("ru-RU")} ₽
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
              <div className="text-xs text-gray-600 break-words">
                Репортер: {selectedComplaintData.reporterName} ({selectedComplaintData.reporterEmail})
              </div>
              <div className="text-xs text-gray-600">
                Нарушений у продавца: {selectedComplaintData.sellerViolationsCount}
              </div>
              <div className="text-xs text-gray-600">
                Жалоб на это объявление: {selectedComplaintData.listingComplaintsCount}
              </div>
              <div className="text-xs text-gray-600">
                Риск-скор: {selectedComplaintData.evaluation.score} ·{" "}
                {recommendationLabel(selectedComplaintData.evaluation.recommendation)}
              </div>
              <div className="text-xs text-gray-600 break-words">
                Причины оценки: {selectedComplaintData.evaluation.reasons.join(", ") || "—"}
              </div>

              {selectedComplaintData.evidenceFiles.length > 0 && (
                <div className="text-xs text-gray-600 break-words">
                  Доказательства: {selectedComplaintData.evidenceFiles.join(", ")}
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <button
                  onClick={() => void updateComplaintStatus("approved")}
                  className="btn-danger-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                >
                  <CheckCircle className="w-4 h-4" /> Подтвердить
                </button>
                <button
                  onClick={() => void updateComplaintStatus("rejected")}
                  className="btn-success-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                >
                  <XCircle className="w-4 h-4" /> Отклонить
                </button>
              </div>

              {selectedComplaintData.actionTaken && (
                <div className="text-xs text-gray-500 border-t pt-2">
                  Действие: {selectedComplaintData.actionTaken}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

