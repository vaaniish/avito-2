import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle, Search, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

type ComplaintStatus = "all" | "new" | "approved" | "rejected";

type Complaint = {
  id: string;
  createdAt: string;
  status: "new" | "approved" | "rejected";
  complaintType: string;
  listingId: string;
  listingTitle: string;
  sellerId: string;
  sellerName: string;
  reporterName: string;
  sellerViolationsCount: number;
  description: string;
  evidence: string | null;
  checkedAt?: string | null;
  checkedBy?: string | null;
  actionTaken?: string | null;
};

export function ComplaintsPage() {
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus>("all");
  const [selectedComplaint, setSelectedComplaint] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [complaints, setComplaints] = useState<Complaint[]>([]);

  const loadComplaints = async () => {
    try {
      const result = await apiGet<Complaint[]>("/admin/complaints");
      setComplaints(result);
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
        const query = searchQuery.toLowerCase();
        const matchesStatus = statusFilter === "all" || complaint.status === statusFilter;
        const matchesSearch =
          complaint.id.toLowerCase().includes(query) ||
          complaint.listingTitle.toLowerCase().includes(query) ||
          complaint.sellerName.toLowerCase().includes(query) ||
          complaint.complaintType.toLowerCase().includes(query) ||
          complaint.reporterName.toLowerCase().includes(query);
        return matchesStatus && matchesSearch;
      }),
    [complaints, searchQuery, statusFilter],
  );

  const stats = {
    total: complaints.length,
    new: complaints.filter((item) => item.status === "new").length,
    approved: complaints.filter((item) => item.status === "approved").length,
    rejected: complaints.filter((item) => item.status === "rejected").length,
  };

  const selectedComplaintData = complaints.find((complaint) => complaint.id === selectedComplaint);

  const getStatusBadge = (status: Complaint["status"]) => {
    const styles = {
      new: "bg-orange-100 text-orange-700 border-orange-300",
      approved: "bg-red-100 text-red-700 border-red-300",
      rejected: "bg-green-100 text-green-700 border-green-300",
    };
    const labels = {
      new: "Новая",
      approved: "Одобрена",
      rejected: "Отклонена",
    };

    return <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>{labels[status]}</span>;
  };

  const updateComplaintStatus = async (status: "approved" | "rejected") => {
    if (!selectedComplaintData) return;

    try {
      await apiPatch<{ success: boolean }>(`/admin/complaints/${selectedComplaintData.id}`, {
        status,
        actionTaken:
          status === "approved"
            ? "Подтверждено нарушение, применены санкции"
            : "Жалоба отклонена после проверки",
      });
      await loadComplaints();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить жалобу");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Жалобы</h1>
        <p className="dashboard-subtitle">Жалобы на объявления и продавцов</p>
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
          <div className="dashboard-stat__label">Одобрены</div>
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
            placeholder="Поиск по ID, товару, продавцу..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="dashboard-search__input"
          />
        </div>

        <div className="dashboard-chip-row">
          {[
            { value: "all", label: "Все" },
            { value: "new", label: "Новые" },
            { value: "approved", label: "Одобрены" },
            { value: "rejected", label: "Отклонены" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as ComplaintStatus)}
              className={`dashboard-chip ${
                statusFilter === option.value
                  ? "dashboard-chip--active"
                  : ""
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
                selectedComplaint === complaint.id ? "border-[rgb(38,83,141)]" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{complaint.id}</div>
                  <div className="text-xs text-gray-500">{new Date(complaint.createdAt).toLocaleString("ru-RU")}</div>
                  <div className="text-sm text-gray-900 mt-1">{complaint.listingTitle}</div>
                  <div className="text-xs text-gray-600">Продавец: {complaint.sellerName}</div>
                </div>
                {getStatusBadge(complaint.status)}
              </div>
            </button>
          ))}
          {filteredComplaints.length === 0 && <div className="dashboard-empty">Жалобы не найдены</div>}
        </div>

        <div className="dashboard-card">
          {!selectedComplaintData ? (
            <div className="text-sm text-gray-500">Выберите жалобу для просмотра деталей</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <span className="font-semibold">{selectedComplaintData.complaintType}</span>
              </div>
              <div className="text-sm text-gray-700">{selectedComplaintData.description}</div>
              <div className="text-xs text-gray-600">Репортер: {selectedComplaintData.reporterName}</div>
              <div className="text-xs text-gray-600">Нарушений у продавца: {selectedComplaintData.sellerViolationsCount}</div>

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
                <div className="text-xs text-gray-500 border-t pt-2">Действие: {selectedComplaintData.actionTaken}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
