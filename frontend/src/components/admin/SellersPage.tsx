import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, Search, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { matchesSearch } from "../../lib/search";

type KYCStatus = "all" | "pending" | "approved" | "rejected";

type KYCRequest = {
  id: string;
  createdAt: string;
  status: "pending" | "approved" | "rejected";
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string | null;
  sellerStatus: "active" | "blocked";
  sellerJoinedAt: string;
  sellerVerified: boolean;
  sellerResponseMinutes: number | null;
  sellerListingsCount: number;
  sellerOrdersCount: number;
  sellerComplaintsCount: number;
  sellerCommissionTier: { id: string; name: string; rate: number } | null;
  email: string;
  phone: string;
  companyName: string;
  inn: string;
  address: string;
  documents: string | null;
  documentFiles: string[];
  notes?: string | null;
  rejectionReason?: string | null;
  reviewedBy?: { id: string; name: string; email: string } | null;
  reviewedAt?: string | null;
  evaluation: {
    completenessScore: number;
    riskLevel: "low" | "medium" | "high";
    recommendation: "approve" | "request_more_documents" | "reject";
    checklist: Array<{ key: string; passed: boolean }>;
  };
};

function riskLabel(value: KYCRequest["evaluation"]["riskLevel"]): string {
  if (value === "low") return "Низкий";
  if (value === "medium") return "Средний";
  return "Высокий";
}

function recommendationLabel(
  value: KYCRequest["evaluation"]["recommendation"],
): string {
  if (value === "approve") return "Рекомендуется одобрить";
  if (value === "reject") return "Рекомендуется отклонить";
  return "Нужно запросить доп. документы";
}

export function SellersPage() {
  const [statusFilter, setStatusFilter] = useState<KYCStatus>("all");
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [requests, setRequests] = useState<KYCRequest[]>([]);

  const loadRequests = async () => {
    try {
      const result = await apiGet<KYCRequest[]>("/admin/kyc-requests");
      setRequests(result);
      setSelectedRequest((prev) => prev ?? result[0]?.id ?? null);
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
        const matchesStatus =
          statusFilter === "all" || request.status === statusFilter;
        const matchesQuery = matchesSearch(request, searchQuery);
        return matchesStatus && matchesQuery;
      }),
    [requests, searchQuery, statusFilter],
  );

  const stats = {
    total: requests.length,
    pending: requests.filter((item) => item.status === "pending").length,
    approved: requests.filter((item) => item.status === "approved").length,
    rejected: requests.filter((item) => item.status === "rejected").length,
  };

  const selectedRequestData =
    requests.find((request) => request.id === selectedRequest) ?? null;

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

    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}
      >
        {labels[status]}
      </span>
    );
  };

  const updateStatus = async (status: "approved" | "rejected") => {
    if (!selectedRequestData) return;

    try {
      await apiPatch<{ success: boolean }>(
        `/admin/kyc-requests/${selectedRequestData.id}`,
        {
          status,
          rejectionReason:
            status === "rejected"
              ? "Недостаточно подтверждающих документов для верификации"
              : null,
        },
      );
      await loadRequests();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить статус KYC");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Продавцы и KYC</h1>
        <p className="dashboard-subtitle">Проверка документов, оснований и рисков продавца</p>
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
            placeholder="Поиск по любому полю KYC"
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
                selectedRequest === request.id
                  ? "border-[rgb(38,83,141)]"
                  : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{request.id}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(request.createdAt).toLocaleString("ru-RU")}
                  </div>
                  <div className="text-sm text-gray-900 mt-1 break-words">{request.companyName}</div>
                  <div className="text-xs text-gray-600 break-words">
                    Продавец: {request.sellerName} ({request.sellerId})
                  </div>
                </div>
                {getStatusBadge(request.status)}
              </div>
            </button>
          ))}

          {filteredRequests.length === 0 && (
            <div className="dashboard-empty">Заявки не найдены</div>
          )}
        </div>

        <div className="dashboard-card">
          {!selectedRequestData ? (
            <div className="text-sm text-gray-500">
              Выберите заявку для просмотра деталей
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-semibold break-words">
                {selectedRequestData.companyName}
              </div>
              <div className="text-xs text-gray-600 break-words">
                Продавец: {selectedRequestData.sellerName} ({selectedRequestData.sellerEmail})
              </div>
              <div className="text-xs text-gray-600">Телефон: {selectedRequestData.phone}</div>
              <div className="text-xs text-gray-600">ИНН: {selectedRequestData.inn}</div>
              <div className="text-sm text-gray-700 break-words">{selectedRequestData.address}</div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
                <div className="text-xs text-gray-700">
                  Полнота документов: {selectedRequestData.evaluation.completenessScore}%
                </div>
                <div className="text-xs text-gray-700">
                  Риск: {riskLabel(selectedRequestData.evaluation.riskLevel)}
                </div>
                <div className="text-xs text-gray-700">
                  {recommendationLabel(selectedRequestData.evaluation.recommendation)}
                </div>
                <div className="text-xs text-gray-600">
                  Чек-лист:{" "}
                  {selectedRequestData.evaluation.checklist
                    .map((item) => `${item.key}:${item.passed ? "ok" : "fail"}`)
                    .join(", ")}
                </div>
              </div>

              <div className="text-xs text-gray-600">
                Активных объявлений: {selectedRequestData.sellerListingsCount}
              </div>
              <div className="text-xs text-gray-600">
                Жалоб на продавца: {selectedRequestData.sellerComplaintsCount}
              </div>
              <div className="text-xs text-gray-600 break-words">
                Тариф комиссии:{" "}
                {selectedRequestData.sellerCommissionTier
                  ? `${selectedRequestData.sellerCommissionTier.name} (${selectedRequestData.sellerCommissionTier.rate}%)`
                  : "не назначен"}
              </div>

              {selectedRequestData.documentFiles.length > 0 && (
                <div className="text-xs text-gray-600 break-words">
                  Документы: {selectedRequestData.documentFiles.join(", ")}
                </div>
              )}

              {selectedRequestData.notes && (
                <div className="text-sm text-gray-700 break-words">
                  Примечание: {selectedRequestData.notes}
                </div>
              )}

              {selectedRequestData.rejectionReason && (
                <div className="text-sm text-red-600 break-words">
                  Причина отклонения: {selectedRequestData.rejectionReason}
                </div>
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
                Последнее обновление:{" "}
                {new Date(
                  selectedRequestData.reviewedAt ?? selectedRequestData.createdAt,
                ).toLocaleString("ru-RU")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

