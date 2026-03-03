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
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1 md:mb-2">Жалобы</h1>
        <p className="text-xs md:text-sm lg:text-base text-gray-600">Жалобы на объявления и продавцов</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
        <div className="p-3 md:p-4 bg-white rounded-xl border-2 border-gray-200">
          <div className="text-xs md:text-sm text-gray-600 mb-1">Всего жалоб</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="p-3 md:p-4 bg-orange-50 rounded-xl border-2 border-orange-200">
          <div className="text-xs md:text-sm text-orange-700 mb-1">Новые</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-orange-700">{stats.new}</div>
        </div>
        <div className="p-3 md:p-4 bg-red-50 rounded-xl border-2 border-red-200">
          <div className="text-xs md:text-sm text-red-700 mb-1">Одобрены</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-red-700">{stats.approved}</div>
        </div>
        <div className="p-3 md:p-4 bg-green-50 rounded-xl border-2 border-green-200">
          <div className="text-xs md:text-sm text-green-700 mb-1">Отклонены</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-green-700">{stats.rejected}</div>
        </div>
      </div>

      <div className="p-3 md:p-4 lg:p-6 bg-white rounded-xl md:rounded-2xl border-2 border-gray-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по ID, товару, продавцу..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {[
            { value: "all", label: "Все" },
            { value: "new", label: "Новые" },
            { value: "approved", label: "Одобрены" },
            { value: "rejected", label: "Отклонены" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as ComplaintStatus)}
              className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap ${
                statusFilter === option.value
                  ? "bg-[rgb(38,83,141)] text-white"
                  : "bg-gray-100 text-gray-700"
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
              className={`w-full text-left bg-white rounded-xl p-4 border transition-colors ${
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
          {filteredComplaints.length === 0 && <div className="text-sm text-gray-500">Жалобы не найдены</div>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
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

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => void updateComplaintStatus("approved")}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" /> Подтвердить
                </button>
                <button
                  onClick={() => void updateComplaintStatus("rejected")}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center justify-center gap-1"
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
