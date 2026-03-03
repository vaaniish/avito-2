import React, { useEffect, useMemo, useState } from "react";
import { Ban, Search, Shield, ShieldOff } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

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
  buyerOrders: number;
  sellerOrders: number;
  buyerSpent: number;
  sellerRevenue: number;
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
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.id.toLowerCase().includes(query);

        const matchesRole = roleFilter === "all" || user.role === roleFilter;
        const matchesStatus = statusFilter === "all" || user.status === statusFilter;
        return matchesSearch && matchesRole && matchesStatus;
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

  const selectedUserData = users.find((user) => user.id === selectedUser);

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
    new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(amount);

  const roleLabel = (role: AdminUser["role"]) => {
    if (role === "regular") return "Покупатель";
    if (role === "partner") return "Продавец";
    return "Админ";
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1 md:mb-2">Пользователи</h1>
        <p className="text-xs md:text-sm lg:text-base text-gray-600">Управление аккаунтами</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 md:gap-3 lg:gap-4">
        <div className="p-3 md:p-4 bg-white rounded-xl border-2 border-gray-200">
          <div className="text-xs md:text-sm text-gray-600 mb-1">Всего</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="p-3 md:p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
          <div className="text-xs md:text-sm text-blue-700 mb-1">Покупатели</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-blue-700">{stats.buyers}</div>
        </div>
        <div className="p-3 md:p-4 bg-purple-50 rounded-xl border-2 border-purple-200">
          <div className="text-xs md:text-sm text-purple-700 mb-1">Продавцы</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-purple-700">{stats.sellers}</div>
        </div>
        <div className="p-3 md:p-4 bg-green-50 rounded-xl border-2 border-green-200">
          <div className="text-xs md:text-sm text-green-700 mb-1">Активные</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-green-700">{stats.active}</div>
        </div>
        <div className="p-3 md:p-4 bg-red-50 rounded-xl border-2 border-red-200">
          <div className="text-xs md:text-sm text-red-700 mb-1">Заблокированы</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-red-700">{stats.blocked}</div>
        </div>
      </div>

      <div className="p-3 md:p-4 lg:p-6 bg-white rounded-xl md:rounded-2xl border-2 border-gray-200 space-y-3">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по имени, email или ID..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { value: "all", label: "Все роли" },
            { value: "regular", label: "Покупатели" },
            { value: "partner", label: "Продавцы" },
            { value: "admin", label: "Админы" },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setRoleFilter(option.value as UserRoleFilter)}
              className={`px-3 py-2 rounded-xl text-sm ${
                roleFilter === option.value ? "bg-[rgb(38,83,141)] text-white" : "bg-gray-100 text-gray-700"
              }`}
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
              className={`px-3 py-2 rounded-xl text-sm ${
                statusFilter === option.value ? "bg-black text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => setSelectedUser(user.id)}
              className={`w-full text-left bg-white rounded-xl p-4 border ${
                selectedUser === user.id ? "border-[rgb(38,83,141)]" : "border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                  <div className="text-xs text-gray-500 mt-1">{user.id} • {roleLabel(user.role)}</div>
                </div>
                <span
                  className={`px-2 py-1 rounded-full text-xs ${
                    user.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                  }`}
                >
                  {user.status === "active" ? "Активен" : "Заблокирован"}
                </span>
              </div>
            </button>
          ))}
          {filteredUsers.length === 0 && <div className="text-sm text-gray-500">Пользователи не найдены</div>}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4">
          {!selectedUserData ? (
            <div className="text-sm text-gray-500">Выберите пользователя</div>
          ) : (
            <div className="space-y-3">
              <div className="font-semibold">{selectedUserData.name}</div>
              <div className="text-sm text-gray-600">{selectedUserData.email}</div>
              <div className="text-sm text-gray-600">Роль: {roleLabel(selectedUserData.role)}</div>
              <div className="text-sm text-gray-600">Покупок: {selectedUserData.buyerOrders}</div>
              <div className="text-sm text-gray-600">Заказов как продавец: {selectedUserData.sellerOrders}</div>
              <div className="text-sm text-gray-600">Потрачено: {formatCurrency(selectedUserData.buyerSpent)}</div>
              <div className="text-sm text-gray-600">Выручка: {formatCurrency(selectedUserData.sellerRevenue)}</div>
              {selectedUserData.blockReason && <div className="text-sm text-red-600">Причина блокировки: {selectedUserData.blockReason}</div>}

              {selectedUserData.status === "active" ? (
                <button
                  onClick={() => void toggleUserStatus(selectedUserData, true)}
                  className="w-full py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center justify-center gap-2"
                  disabled={selectedUserData.role === "admin"}
                >
                  <Ban className="w-4 h-4" /> Заблокировать
                </button>
              ) : (
                <button
                  onClick={() => void toggleUserStatus(selectedUserData, false)}
                  className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <Shield className="w-4 h-4" /> Разблокировать
                </button>
              )}

              <div className="text-xs text-gray-500 flex items-center gap-1">
                {selectedUserData.status === "active" ? <Shield className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
                Статус обновляется в реальном времени
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
