
import React, { useEffect, useMemo, useState } from "react";
import { apiGet } from "../../lib/api";
import { Search, SlidersHorizontal } from "lucide-react";

type AuditLog = {
  id: string;
  timestamp: string;
  admin: string;
  action: string;
  targetId: string;
  targetType: string;
  details: string;
  ipAddress: string;
};

type ActionFilter =
  | "all"
  | "block_user"
  | "approve_listing"
  | "reject_listing"
  | "approve_kyc"
  | "reject_kyc"
  | "update_commission_tier"
  | "approve_complaint"
  | "reject_complaint"
  | "user_login"
  | "user_signup"
  | "create_question"
  | "add_to_wishlist"
  | "remove_from_wishlist"
  | "create_order";

const ADMIN_ACTION_TYPES: ActionFilter[] = ["block_user", "approve_listing", "reject_listing", "approve_kyc", "reject_kyc", "update_commission_tier", "approve_complaint", "reject_complaint"];
const USER_ACTION_TYPES: ActionFilter[] = ["user_login", "user_signup", "create_question", "add_to_wishlist", "remove_from_wishlist", "create_order"];
const ACTION_TYPES = [...ADMIN_ACTION_TYPES, ...USER_ACTION_TYPES].sort();

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const loadLogs = async () => {
    try {
      const result = await apiGet<AuditLog[]>("/admin/audit-logs");
      setLogs(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить журнал аудита");
    }
  };

  useEffect(() => {
    void loadLogs();
  }, []);

  const targetTypes = useMemo(() => {
    const types = new Set(logs.map(log => log.targetType));
    return ["all", ...Array.from(types)].sort();
  }, [logs]);

  const filteredAndSortedLogs = useMemo(() => {
    let filtered = logs.filter(log => {
      const query = searchQuery.toLowerCase();
      const matchesAction = actionFilter === "all" || log.action === actionFilter;
      const matchesTargetType = targetTypeFilter === "all" || log.targetType === targetTypeFilter;
      const matchesSearch =
        log.admin.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query) ||
        log.targetId.toLowerCase().includes(query) ||
        log.details.toLowerCase().includes(query) ||
        log.ipAddress.toLowerCase().includes(query);
      return matchesAction && matchesTargetType && matchesSearch;
    });

    return filtered.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - a.timestamp;
    });
  }, [logs, searchQuery, actionFilter, targetTypeFilter, sortOrder]);

  const stats = useMemo(() => {
    return {
      total: logs.length,
      admin: logs.filter(log => ADMIN_ACTION_TYPES.includes(log.action as ActionFilter)).length,
      user: logs.filter(log => USER_ACTION_TYPES.includes(log.action as ActionFilter)).length,
    }
  }, [logs]);
  
  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1 md:mb-2">Журнал аудита</h1>
        <p className="text-xs md:text-sm lg:text-base text-gray-600">
          История ключевых действий пользователей и администраторов
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
        <div className="p-3 md:p-4 bg-white rounded-xl border-2 border-gray-200">
            <div className="text-xs md:text-sm text-gray-600 mb-1">Всего записей</div>
            <div className="text-lg md:text-xl lg:text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="p-3 md:p-4 bg-red-50 rounded-xl border-2 border-red-200">
            <div className="text-xs md:text-sm text-red-700 mb-1">Действия админов</div>
            <div className="text-lg md:text-xl lg:text-2xl font-bold text-red-700">{stats.admin}</div>
        </div>
        <div className="p-3 md:p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
            <div className="text-xs md:text-sm text-blue-700 mb-1">Действия юзеров</div>
            <div className="text-lg md:text-xl lg:text-2xl font-bold text-blue-700">{stats.user}</div>
        </div>
      </div>

      <div className="p-3 md:p-4 lg:p-6 bg-white rounded-xl md:rounded-2xl border-2 border-gray-200 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по администратору, действию, цели, деталям..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-300"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">Действие</label>
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value as ActionFilter)}
              className="w-full p-2 mt-1 rounded-xl border border-gray-300 bg-white"
            >
              <option value="all">Все действия</option>
              {ACTION_TYPES.map(action => <option key={action} value={action}>{action}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Тип цели</label>
            <select
              value={targetTypeFilter}
              onChange={e => setTargetTypeFilter(e.target.value)}
              className="w-full p-2 mt-1 rounded-xl border border-gray-300 bg-white"
            >
              {targetTypes.map(type => <option key={type} value={type}>{type === "all" ? "Все типы" : type}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Сортировка</label>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as "asc" | "desc")}
              className="w-full p-2 mt-1 rounded-xl border border-gray-300 bg-white"
            >
              <option value="desc">Сначала новые</option>
              <option value="asc">Сначала старые</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead className="bg-gray-50">
                <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Время</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Администратор</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Действие</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Цель</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Детали</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">IP</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
                {filteredAndSortedLogs.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{new Date(log.timestamp).toLocaleString("ru-RU")}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{log.admin}</td>
                    <td className="px-4 py-3">
                    <span className="px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-800">{log.action}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono text-xs">{log.targetId}</div>
                        <div className="text-gray-500 text-xs">{log.targetType}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-800 max-w-xs truncate">{log.details}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.ipAddress}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
        {filteredAndSortedLogs.length === 0 && <div className="p-4 text-sm text-center text-gray-500">Записи не найдены</div>}
      </div>
    </div>
  );
}
