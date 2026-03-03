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
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1 md:mb-2">Продавцы и KYC</h1>
        <p className="text-xs md:text-sm lg:text-base text-gray-600">Проверка документов и допуск к продажам</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
        <div className="p-3 md:p-4 bg-white rounded-xl border-2 border-gray-200">
          <div className="text-xs md:text-sm text-gray-600 mb-1">Всего заявок</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="p-3 md:p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200">
          <div className="text-xs md:text-sm text-yellow-700 mb-1">Ожидают проверки</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-yellow-700">{stats.pending}</div>
        </div>
        <div className="p-3 md:p-4 bg-green-50 rounded-xl border-2 border-green-200">
          <div className="text-xs md:text-sm text-green-700 mb-1">Одобрено</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-green-700">{stats.approved}</div>
        </div>
        <div className="p-3 md:p-4 bg-red-50 rounded-xl border-2 border-red-200">
          <div className="text-xs md:text-sm text-red-700 mb-1">Отклонено</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-red-700">{stats.rejected}</div>
        </div>
      </div>

      <div className="p-4 md:p-6 bg-white rounded-2xl border-2 border-gray-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по ID, названию, компании, email, ИНН..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto">
          {[
            { value: "all", label: "Все" },
            { value: "pending", label: "Ожидают" },
            { value: "approved", label: "Одобрено" },
            { value: "rejected", label: "Отклонено" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as KYCStatus)}
              className={`px-3 py-2 rounded-xl text-sm whitespace-nowrap ${
                statusFilter === option.value ? "bg-[rgb(38,83,141)] text-white" : "bg-gray-100 text-gray-700"
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
              className={`w-full text-left bg-white rounded-xl p-4 border transition-colors ${
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

          {filteredRequests.length === 0 && <div className="text-sm text-gray-500">Заявки не найдены</div>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
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

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => void updateStatus("approved")}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" /> Одобрить
                </button>
                <button
                  onClick={() => void updateStatus("rejected")}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm flex items-center justify-center gap-1"
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
