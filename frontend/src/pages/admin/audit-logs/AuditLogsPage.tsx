import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { apiGet } from "../../../shared/lib/api";

type AuditActor = {
  id: string;
  name: string;
  email: string;
};

type AuditLog = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  ipAddress: string | null;
  details: unknown;
  riskType: AuditRiskType;
  summary: string;
  target: AuditActor | null;
  reason: string | null;
  actor: AuditActor | null;
};

type AuditLogsResponse = {
  logs: AuditLog[];
  availableActions: string[];
  availableEntities: string[];
  availableRiskTypes?: AuditRiskType[];
};

type AuditRiskType =
  | "user_blocked"
  | "user_unblocked"
  | "role_changed"
  | "commission_changed";

type RiskFilter = "all" | AuditRiskType;

const RISK_FILTERS: Array<{ value: RiskFilter; label: string }> = [
  { value: "all", label: "Все рискованные" },
  { value: "user_blocked", label: "Блокировки" },
  { value: "user_unblocked", label: "Разблокировки" },
  { value: "role_changed", label: "Смена роли" },
  { value: "commission_changed", label: "Комиссии" },
];

function stringifyDetails(details: unknown): string {
  if (details === null || details === undefined) {
    return "-";
  }

  if (typeof details === "string") {
    return details;
  }

  if (typeof details === "number" || typeof details === "boolean") {
    return String(details);
  }

  try {
    return JSON.stringify(details, null, 2);
  } catch (_error) {
    return "[не удалось сериализовать details]";
  }
}

function formatTarget(log: AuditLog): string {
  if (log.target) {
    return `${log.target.name || "Пользователь"} (${log.target.email || log.target.id})`;
  }

  if (log.entityType === "commission_tier") {
    return `Уровень комиссии ${log.entityId ?? "-"}`;
  }

  return log.entityId ?? "-";
}

function formatActor(actor: AuditActor | null): string {
  return actor ? `${actor.name} (${actor.email})` : "-";
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadAuditLogs = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "300");

      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery) {
        params.set("q", trimmedQuery);
      }

      if (riskFilter !== "all") {
        params.set("riskType", riskFilter);
      }

      const query = params.toString();
      const result = await apiGet<AuditLogsResponse>(query ? `/admin/audit-logs?${query}` : "/admin/audit-logs");

      setLogs(result.logs);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить журнал рискованных действий");
    } finally {
      setIsLoading(false);
    }
  }, [riskFilter, searchQuery]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  const stats = useMemo(
    () => ({
      total: logs.length,
      blocks: logs.filter((item) => item.riskType === "user_blocked").length,
      roleChanges: logs.filter((item) => item.riskType === "role_changed").length,
      moneyChanges: logs.filter((item) => item.riskType === "commission_changed").length,
    }),
    [logs],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Контроль администраторов</h1>
        <p className="dashboard-subtitle">
          Рискованные действия сотрудников: блокировки, разблокировки, смена ролей и комиссии.
        </p>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--3">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Рискованных действий</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Блокировок</div>
          <div className="dashboard-stat__value">{stats.blocks}</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Роли / комиссии</div>
          <div className="dashboard-stat__value">{stats.roleChanges + stats.moneyChanges}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по админу, пользователю, причине, IP или id записи"
            className="dashboard-search__input"
          />
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}
            className="dashboard-select"
          >
            {RISK_FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => void loadAuditLogs()}
            disabled={isLoading}
            className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-50 md:w-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Обновить
          </button>
        </div>

        {errorMessage && <div className="text-sm text-red-700">{errorMessage}</div>}
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading && logs.length === 0
          ? Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="dashboard-card space-y-3">
                <div className="h-3 w-32 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-52 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
              </div>
            ))
          : null}
        {logs.map((log) => (
          <article key={log.id} className="dashboard-card space-y-2">
            <div className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString("ru-RU")}</div>
            <div className="text-sm font-semibold text-gray-900">{log.summary}</div>
            <div className="text-xs text-gray-600">
              Цель: {formatTarget(log)}
            </div>
            <div className="text-xs text-gray-600">
              Админ: {formatActor(log.actor)}
            </div>
            <div className="text-xs text-gray-600">Причина/изменение: {log.reason ?? "-"}</div>
            <div className="text-xs text-gray-600">IP: {log.ipAddress ?? "-"}</div>
            <details className="rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-600">
              <summary className="cursor-pointer font-medium text-gray-700">Технические детали</summary>
              <pre className="mt-2 w-full overflow-x-auto whitespace-pre-wrap break-words leading-5">
                {stringifyDetails(log.details)}
              </pre>
            </details>
          </article>
        ))}
      </div>

      <div className="hidden w-full overflow-hidden rounded-xl border border-gray-200 bg-white md:block">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Дата</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Действие</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Администратор</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Цель</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Причина / изменение</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">IP</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Детали</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && logs.length === 0
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      {Array.from({ length: 6 }).map((__, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-4">
                          <div className="h-3 w-full animate-pulse rounded bg-gray-100" />
                        </td>
                      ))}
                    </tr>
                  ))
                : null}
              {logs.map((log) => (
                <tr key={log.id} className="align-top border-b border-gray-100">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{new Date(log.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{log.summary}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {log.actor ? (
                      <div>
                        <div className="font-medium text-gray-900">{log.actor.name}</div>
                        <div className="text-xs text-gray-500">{log.actor.email}</div>
                        <div className="text-xs text-gray-500">{log.actor.id}</div>
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="font-medium text-gray-900">{formatTarget(log)}</div>
                    <div className="text-xs text-gray-500">{log.entityId ?? log.id}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{log.reason ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-700">{log.ipAddress ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <details className="max-w-[280px] rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
                      <summary className="cursor-pointer font-medium text-gray-700">Открыть</summary>
                      <pre className="mt-2 w-full max-w-none whitespace-pre-wrap break-words leading-5">
                        {stringifyDetails(log.details)}
                      </pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && logs.length === 0 && (
        <div className="dashboard-empty">
          Рискованные действия администраторов по текущим фильтрам не найдены.
        </div>
      )}
    </div>
  );
}
