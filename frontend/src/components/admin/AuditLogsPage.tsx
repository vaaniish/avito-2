import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { apiGet } from "../../lib/api";

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
  actor: AuditActor | null;
};

type AuditLogsResponse = {
  logs: AuditLog[];
  availableActions: string[];
  availableEntities: string[];
};

const ACTION_LABELS: Record<string, string> = {
  "complaint.status_changed": "Изменен статус жалобы",
  "kyc.status_changed": "Изменен статус KYC",
  "listing.moderation_changed": "Изменен статус модерации объявления",
  "user.status_changed": "Изменен статус пользователя",
  "commission_tier.rate_changed": "Изменена ставка комиссии",
};

const ENTITY_LABELS: Record<string, string> = {
  complaint: "Жалоба",
  kyc_request: "Запрос KYC",
  listing: "Объявление",
  user: "Пользователь",
  commission_tier: "Уровень комиссии",
};

function formatActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatEntityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

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

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityFilter, setEntityFilter] = useState<string>("all");
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

      if (actionFilter !== "all") {
        params.set("action", actionFilter);
      }

      if (entityFilter !== "all") {
        params.set("entityType", entityFilter);
      }

      const query = params.toString();
      const result = await apiGet<AuditLogsResponse>(query ? `/admin/audit-logs?${query}` : "/admin/audit-logs");

      setLogs(result.logs);
      setAvailableActions(result.availableActions);
      setAvailableEntities(result.availableEntities);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить аудит-логи");
    } finally {
      setIsLoading(false);
    }
  }, [actionFilter, entityFilter, searchQuery]);

  useEffect(() => {
    void loadAuditLogs();
  }, [loadAuditLogs]);

  const stats = useMemo(
    () => ({
      total: logs.length,
      withActor: logs.filter((item) => item.actor !== null).length,
      withIp: logs.filter((item) => Boolean(item.ipAddress)).length,
    }),
    [logs],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="dashboard-title">Журнал аудита</h1>
        <p className="dashboard-subtitle">
          Действия администраторов по жалобам, KYC, объявлениям, пользователям и комиссиям.
        </p>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--3">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего записей</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">С указанным админом</div>
          <div className="dashboard-stat__value">{stats.withActor}</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">С IP-адресом</div>
          <div className="dashboard-stat__value">{stats.withIp}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по id лога, действию, сущности, имени или email администратора"
            className="dashboard-search__input"
          />
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,300px)_auto]">
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="dashboard-select"
          >
            <option value="all">Все действия</option>
            {availableActions.map((action) => (
              <option key={action} value={action}>
                {formatActionLabel(action)}
              </option>
            ))}
          </select>

          <select
            value={entityFilter}
            onChange={(event) => setEntityFilter(event.target.value)}
            className="dashboard-select"
          >
            <option value="all">Все сущности</option>
            {availableEntities.map((entity) => (
              <option key={entity} value={entity}>
                {formatEntityLabel(entity)}
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
        {logs.map((log) => (
          <article key={log.id} className="dashboard-card space-y-2">
            <div className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString("ru-RU")}</div>
            <div className="text-sm font-semibold text-gray-900">{formatActionLabel(log.action)}</div>
            <div className="text-xs text-gray-600">
              {formatEntityLabel(log.entityType)}: {log.entityId ?? "-"}
            </div>
            <div className="text-xs text-gray-600">
              Админ: {log.actor ? `${log.actor.name} (${log.actor.email})` : "-"}
            </div>
            <div className="text-xs text-gray-600">IP: {log.ipAddress ?? "-"}</div>
            <pre className="w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 p-2 text-xs leading-5 text-gray-700">
              {stringifyDetails(log.details)}
            </pre>
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
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Сущность</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Администратор</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">IP</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700">Детали</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="align-top border-b border-gray-100">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{new Date(log.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-3 text-gray-900">{formatActionLabel(log.action)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div>{formatEntityLabel(log.entityType)}</div>
                    <div className="text-xs text-gray-500">{log.entityId ?? "-"}</div>
                  </td>
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
                  <td className="px-4 py-3 text-gray-700">{log.ipAddress ?? "-"}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <pre className="w-full max-w-none whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 p-2 text-xs leading-5">
                      {stringifyDetails(log.details)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!isLoading && logs.length === 0 && (
        <div className="dashboard-empty">
          По текущим фильтрам записи не найдены.
        </div>
      )}
    </div>
  );
}
