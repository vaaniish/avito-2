import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Search, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

type KYCStatus = "all" | "pending" | "approved" | "rejected";

type KYCRequest = {
  id: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  sellerId: string;
  sellerName: string;
  email: string;
  phone: string;
  companyName: string;
  inn: string;
  address: string;
  documents: string | null;
  notes?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
};

export function SellersPage() {
  const [statusFilter, setStatusFilter] = useState<KYCStatus>("all");
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState<KYCRequest[]>([]);

  const loadRequests = async () => {
    try {
      const result = await apiGet<KYCRequest[]>("/admin/kyc-requests");
      setRequests(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить KYC");
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const filteredRequests = useMemo(
    () =>
      requests.filter((request) => {
        const query = searchQuery.toLowerCase();
        const matchesStatus = statusFilter === "all" || request.status === statusFilter;
        const matchesSearch =
          request.id.toLowerCase().includes(query) ||
          request.sellerName.toLowerCase().includes(query) ||
          request.companyName.toLowerCase().includes(query) ||
          request.email.toLowerCase().includes(query) ||
          request.inn.includes(searchQuery);
        return matchesStatus && matchesSearch;
      }),
    [requests, searchQuery, statusFilter],
  );

  const stats = {
    total: requests.length,
    pending: requests.filter((item) => item.status === "pending").length,
    approved: requests.filter((item) => item.status === "approved").length,
    rejected: requests.filter((item) => item.status === "rejected").length,
  };

  const selectedRequestData = requests.find((request) => request.id === selectedRequest);

  const getStatusBadge = (status: KYCRequest["status"]) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-700 border-yellow-300",
      approved: "bg-green-100 text-green-700 border-green-300",
      rejected: "bg-red-100 text-red-700 border-red-300",
    };
    const labels = {
      pending: "Ожидает",
      approved: "Одобрено",
      rejected: "Отклонено",
    };

    return <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>{labels[status]}</span>;
  };

  const updateStatus = async (status: "approved" | "rejected") => {
    if (!selectedRequestData) return;

    try {
      await apiPatch<{ success: boolean }>(`/admin/kyc-requests/${selectedRequestData.id}`, {
        status,
        rejectionReason: status === "rejected" ? "Документы не прошли проверку" : null,
      });
      await loadRequests();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить статус KYC");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Продавцы и KYC</h1>
        <p className="dashboard-subtitle">Проверка документов и допуск к продажам</p>
      </div>

      <div className="dashboard-grid-stats">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего заявок</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">Ожидают проверки</div>
          <div className="dashboard-stat__value">{stats.pending}</div>
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
            placeholder="Поиск по ID, названию, компании, email, ИНН..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="dashboard-search__input"
          />
        </div>

        <div className="dashboard-chip-row">
          {[
            { value: "all", label: "Все" },
            { value: "pending", label: "Ожидают" },
            { value: "approved", label: "Одобрено" },
            { value: "rejected", label: "Отклонено" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as KYCStatus)}
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
          {filteredRequests.map((request) => (
            <button
              key={request.id}
              onClick={() => setSelectedRequest(request.id)}
              className={`w-full text-left dashboard-card transition-colors ${
                selectedRequest === request.id ? "border-[rgb(38,83,141)]" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{request.id}</div>
                  <div className="text-xs text-gray-500">{new Date(request.createdAt).toLocaleString("ru-RU")}</div>
                  <div className="text-sm text-gray-900 mt-1">{request.sellerName}</div>
                  <div className="text-xs text-gray-600">{request.companyName}</div>
                </div>
                {getStatusBadge(request.status)}
              </div>
            </button>
          ))}

          {filteredRequests.length === 0 && <div className="dashboard-empty">Заявки не найдены</div>}
        </div>

        <div className="dashboard-card">
          {!selectedRequestData ? (
            <div className="text-sm text-gray-500">Выберите заявку для просмотра деталей</div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-semibold">{selectedRequestData.companyName}</div>
              <div className="text-xs text-gray-600">Продавец: {selectedRequestData.sellerName}</div>
              <div className="text-xs text-gray-600">Email: {selectedRequestData.email}</div>
              <div className="text-xs text-gray-600">Телефон: {selectedRequestData.phone}</div>
              <div className="text-xs text-gray-600">ИНН: {selectedRequestData.inn}</div>
              <div className="text-sm text-gray-700">{selectedRequestData.address}</div>
              {selectedRequestData.notes && <div className="text-sm text-gray-700">Примечание: {selectedRequestData.notes}</div>}
              {selectedRequestData.rejectionReason && (
                <div className="text-sm text-red-600">Причина отклонения: {selectedRequestData.rejectionReason}</div>
              )}

              <div className="flex flex-col gap-2 pt-2 sm:flex-row">
                <button
                  onClick={() => void updateStatus("approved")}
                  className="btn-success-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                >
                  <CheckCircle className="w-4 h-4" /> Одобрить
                </button>
                <button
                  onClick={() => void updateStatus("rejected")}
                  className="btn-danger-soft flex items-center justify-center gap-1 py-2 text-sm sm:flex-1"
                >
                  <XCircle className="w-4 h-4" /> Отклонить
                </button>
              </div>

              <div className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Последнее обновление: {new Date(selectedRequestData.createdAt).toLocaleString("ru-RU")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
