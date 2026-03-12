import React, { useEffect, useMemo, useState } from "react";
import { Ban, Search, Shield, ShieldOff } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { matchesSearch } from "../../lib/search";

type UserRoleFilter = "all" | "regular" | "partner" | "admin";
type UserStatusFilter = "all" | "active" | "blocked";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "regular" | "partner" | "admin";
  status: "active" | "blocked";
  joinedAt: string;
  city?: string | null;
  phone?: string | null;
  blockReason?: string | null;
  blockedUntil?: string | null;
  buyerOrders: number;
  sellerOrders: number;
  buyerSpent: number;
  sellerRevenue: number;
  avgBuyerCheck: number;
  avgSellerCheck: number;
  activeListings: number;
  pendingListings: number;
  totalListings: number;
  complaintsMade: number;
  complaintsAgainst: number;
  approvedViolations: number;
  sanctionsTotal: number;
  sanctionsActive: number;
  latestSanction: {
    id: string;
    level: "warning" | "temp_3_days" | "temp_30_days" | "permanent";
    status: "active" | "completed";
    startsAt: string;
    endsAt: string | null;
    reason: string;
    createdAt: string;
  } | null;
  isSellerVerified: boolean;
  sellerResponseMinutes: number | null;
  lastBuyerOrderDate: string | null;
  lastSellerOrderDate: string | null;
  kycLatest: {
    id: string;
    status: "pending" | "approved" | "rejected";
    createdAt: string;
    reviewedAt: string | null;
  } | null;
};

export function UsersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);

  const loadUsers = async () => {
    try {
      const result = await apiGet<AdminUser[]>("/admin/users");
      setUsers(result);
      setSelectedUser((prev) => prev ?? result[0]?.id ?? null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить пользователей");
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        const matchesText = matchesSearch(user, searchQuery);
        const matchesRole = roleFilter === "all" || user.role === roleFilter;
        const matchesStatus = statusFilter === "all" || user.status === statusFilter;
        return matchesText && matchesRole && matchesStatus;
      }),
    [roleFilter, searchQuery, statusFilter, users],
  );

  const stats = {
    total: users.length,
    buyers: users.filter((user) => user.role === "regular").length,
    sellers: users.filter((user) => user.role === "partner").length,
    active: users.filter((user) => user.status === "active").length,
    blocked: users.filter((user) => user.status === "blocked").length,
  };

  const selectedUserData = users.find((user) => user.id === selectedUser) ?? null;

  const toggleUserStatus = async (user: AdminUser, shouldBlock: boolean) => {
    try {
      await apiPatch<{ success: boolean }>(`/admin/users/${user.id}/status`, {
        status: shouldBlock ? "blocked" : "active",
        blockReason: shouldBlock ? "Нарушение правил платформы" : null,
      });
      await loadUsers();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить статус пользователя");
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: 0,
    }).format(amount);

  const roleLabel = (role: AdminUser["role"]) => {
    if (role === "regular") return "Покупатель";
    if (role === "partner") return "Продавец";
    return "Администратор";
  };

  const sanctionLabel = (
    level: "warning" | "temp_3_days" | "temp_30_days" | "permanent",
  ) => {
    if (level === "warning") return "Предупреждение";
    if (level === "temp_3_days") return "Блок на 3 дня";
    if (level === "temp_30_days") return "Блок на 30 дней";
    return "Перманент";
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Пользователи</h1>
        <p className="dashboard-subtitle">
          Управление аккаунтами, активностью, рисками и коммерческими метриками
        </p>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--5">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">Покупатели</div>
          <div className="dashboard-stat__value">{stats.buyers}</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Продавцы</div>
          <div className="dashboard-stat__value">{stats.sellers}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Активные</div>
          <div className="dashboard-stat__value">{stats.active}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Заблокированы</div>
          <div className="dashboard-stat__value">{stats.blocked}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            type="text"
            placeholder="Поиск по пользователям"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="dashboard-search__input"
          />
        </div>

        <div className="dashboard-chip-row">
          {[
            { value: "all", label: "Все роли" },
            { value: "regular", label: "Покупатели" },
            { value: "partner", label: "Продавцы" },
            { value: "admin", label: "Админы" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setRoleFilter(option.value as UserRoleFilter)}
              className={`dashboard-chip ${roleFilter === option.value ? "dashboard-chip--active" : ""}`}
            >
              {option.label}
            </button>
          ))}

          {[
            { value: "all", label: "Все статусы" },
            { value: "active", label: "Активные" },
            { value: "blocked", label: "Заблокированные" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setStatusFilter(option.value as UserStatusFilter)}
              className={`dashboard-chip ${statusFilter === option.value ? "dashboard-chip--active" : ""}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => setSelectedUser(user.id)}
              className={`dashboard-card w-full text-left ${
                selectedUser === user.id ? "border-[rgb(38,83,141)]" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{user.name}</div>
                  <div className="break-words text-xs text-gray-500">{user.email}</div>
                  <div className="mt-1 break-words text-xs text-gray-500">
                    {user.id} · {roleLabel(user.role)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs ${
                    user.status === "active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {user.status === "active" ? "Активен" : "Заблокирован"}
                </span>
              </div>
            </button>
          ))}
          {filteredUsers.length === 0 && (
            <div className="dashboard-empty">Пользователи не найдены</div>
          )}
        </div>

        <div className="dashboard-card">
          {!selectedUserData ? (
            <div className="text-sm text-gray-500">Выберите пользователя</div>
          ) : (
            <div className="space-y-3">
              <div className="break-words font-semibold">{selectedUserData.name}</div>
              <div className="break-words text-sm text-gray-600">{selectedUserData.email}</div>
              <div className="text-sm text-gray-600">Роль: {roleLabel(selectedUserData.role)}</div>
              <div className="text-sm text-gray-600">Город: {selectedUserData.city ?? "не указан"}</div>
              <div className="text-sm text-gray-600">
                Покупок: {selectedUserData.buyerOrders} · Потрачено: {formatCurrency(selectedUserData.buyerSpent)} ·
                Средний чек: {formatCurrency(selectedUserData.avgBuyerCheck)}
              </div>
              <div className="text-sm text-gray-600">
                Продаж: {selectedUserData.sellerOrders} · Выручка: {formatCurrency(selectedUserData.sellerRevenue)} ·
                Средний чек: {formatCurrency(selectedUserData.avgSellerCheck)}
              </div>
              <div className="text-sm text-gray-600">
                Объявления: {selectedUserData.totalListings} (активных: {selectedUserData.activeListings}, на модерации: {selectedUserData.pendingListings})
              </div>
              <div className="text-sm text-gray-600">
                Жалобы: подал {selectedUserData.complaintsMade}, на него {selectedUserData.complaintsAgainst}
              </div>
              <div className="text-sm text-gray-600">
                Подтвержденные нарушения: {selectedUserData.approvedViolations}
              </div>
              <div className="text-sm text-gray-600">
                Санкции: всего {selectedUserData.sanctionsTotal}, активных {selectedUserData.sanctionsActive}
              </div>
              {selectedUserData.latestSanction && (
                <div className="break-words text-sm text-gray-600">
                  Последняя санкция: {sanctionLabel(selectedUserData.latestSanction.level)} ({selectedUserData.latestSanction.status}) · до {selectedUserData.latestSanction.endsAt
                    ? new Date(selectedUserData.latestSanction.endsAt).toLocaleString("ru-RU")
                    : "бессрочно"}
                </div>
              )}
              <div className="text-sm text-gray-600">
                KYC: {selectedUserData.kycLatest
                  ? `${selectedUserData.kycLatest.id} (${selectedUserData.kycLatest.status})`
                  : "нет заявок"}
              </div>
              {selectedUserData.blockReason && (
                <div className="break-words text-sm text-red-600">
                  Причина блокировки: {selectedUserData.blockReason}
                </div>
              )}
              {selectedUserData.blockedUntil && (
                <div className="break-words text-sm text-red-600">
                  Блокировка до: {new Date(selectedUserData.blockedUntil).toLocaleString("ru-RU")}
                </div>
              )}

              {selectedUserData.status === "active" ? (
                <button
                  onClick={() => void toggleUserStatus(selectedUserData, true)}
                  className="btn-danger-soft flex w-full items-center justify-center gap-2 py-2"
                  disabled={selectedUserData.role === "admin"}
                >
                  <Ban className="h-4 w-4" /> Заблокировать
                </button>
              ) : (
                <button
                  onClick={() => void toggleUserStatus(selectedUserData, false)}
                  className="btn-success-soft flex w-full items-center justify-center gap-2 py-2"
                >
                  <Shield className="h-4 w-4" /> Разблокировать
                </button>
              )}

              <div className="flex items-center gap-1 text-xs text-gray-500">
                {selectedUserData.status === "active" ? (
                  <Shield className="h-3 w-3" />
                ) : (
                  <ShieldOff className="h-3 w-3" />
                )}
                Статус обновляется в реальном времени
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
