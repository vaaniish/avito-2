import { ArrowDown, ArrowUp, Calendar, Search } from "lucide-react";
import { ScoreExplanation } from "../../../shared/ui/ScoreExplanation";
import type { ComplaintItem, ComplaintSortBy, ComplaintStatusFilter } from "./complaints.types";
import {
  buildComplaintQueueRows,
  buildComplaintRiskRows,
  complaintQueueNotes,
  complaintRiskNotes,
  complaintStatusTabs,
  formatDateTime,
  getSortLabel,
  getStatusClass,
  getStatusLabel,
} from "./complaints.utils";

export function ComplaintsStatsSection({
  total,
  next,
  approved,
  rejected,
}: {
  total: number;
  next: number;
  approved: number;
  rejected: number;
}) {
  return (
    <div className="dashboard-grid-stats">
      <div className="dashboard-stat">
        <div className="dashboard-stat__label">Всего</div>
        <div className="dashboard-stat__value">{total}</div>
      </div>
      <div className="dashboard-stat dashboard-stat--warn">
        <div className="dashboard-stat__label">Новые</div>
        <div className="dashboard-stat__value">{next}</div>
      </div>
      <div className="dashboard-stat dashboard-stat--danger">
        <div className="dashboard-stat__label">Подтверждены</div>
        <div className="dashboard-stat__value">{approved}</div>
      </div>
      <div className="dashboard-stat dashboard-stat--ok">
        <div className="dashboard-stat__label">Отклонены</div>
        <div className="dashboard-stat__value">{rejected}</div>
      </div>
    </div>
  );
}

export function ComplaintsToolbarSection({
  filters,
  onSearchChange,
  onStatusChange,
  onFromChange,
  onToChange,
  onToggleSort,
}: {
  filters: {
    status: ComplaintStatusFilter;
    search: string;
    from: string;
    to: string;
    sortBy: ComplaintSortBy;
    sortOrder: "asc" | "desc";
  };
  onSearchChange: (value: string) => void;
  onStatusChange: (status: ComplaintStatusFilter) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onToggleSort: (sortBy: ComplaintSortBy) => void;
}) {
  return (
    <div className="dashboard-toolbar space-y-3">
      <div className="dashboard-search">
        <Search className="dashboard-search__icon" />
        <input
          className="dashboard-search__input"
          placeholder="Поиск по жалобам"
          value={filters.search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <div className="dashboard-chip-row">
        {complaintStatusTabs.map((tab) => (
          <button
            key={tab.id}
            className={`dashboard-chip ${filters.status === tab.id ? "dashboard-chip--active" : ""}`}
            onClick={() => onStatusChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <label className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input
            className="field-control"
            type="date"
            value={filters.from}
            onChange={(event) => onFromChange(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" />
          <input
            className="field-control"
            type="date"
            value={filters.to}
            onChange={(event) => onToChange(event.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["queueScore", "riskScore", "createdAt"] as ComplaintSortBy[]).map((sortBy) => {
          const isActive = filters.sortBy === sortBy;
          return (
            <button
              key={sortBy}
              className={`dashboard-chip ${isActive ? "dashboard-chip--active" : ""}`}
              onClick={() => onToggleSort(sortBy)}
            >
              {getSortLabel(sortBy)}{" "}
              {isActive ? (
                filters.sortOrder === "desc" ? (
                  <ArrowDown className="inline h-3.5 w-3.5" />
                ) : (
                  <ArrowUp className="inline h-3.5 w-3.5" />
                )
              ) : null}
            </button>
          );
        })}
        <span className="text-xs text-gray-500">
          Текущая сортировка: {getSortLabel(filters.sortBy)}{" "}
          {filters.sortOrder === "desc" ? "по убыванию" : "по возрастанию"}
        </span>
      </div>
    </div>
  );
}

function ComplaintCard({
  complaint,
  isSelected,
  onOpen,
}: {
  complaint: ComplaintItem;
  isSelected: boolean;
  onOpen: (complaintId: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(complaint.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(complaint.id);
        }
      }}
      className={`dashboard-card w-full text-left ${isSelected ? "border-[rgb(38,83,141)]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{complaint.id}</div>
          <div className="text-xs text-gray-500">{formatDateTime(complaint.createdAt)}</div>
          <div className="mt-1 text-sm">{complaint.listingTitle}</div>
          <div className="mt-1 flex flex-wrap gap-1 text-xs">
            <ScoreExplanation
              label="Балл очереди"
              value={complaint.queueScore}
              title="Как рассчитан балл очереди"
              formula="queueScore = riskScore + ageBoost + repeatBoost + listingBoost"
              rows={buildComplaintQueueRows(complaint)}
              notes={complaintQueueNotes(complaint)}
              tone={complaint.queueScore >= 50 ? "warning" : "neutral"}
            />
            <ScoreExplanation
              label="Риск"
              value={complaint.riskScore}
              title="Как рассчитан риск жалобы"
              formula="riskScore = round(rawScore / 70 * 100)"
              rows={buildComplaintRiskRows(complaint)}
              notes={complaintRiskNotes(complaint)}
              tone={complaint.riskScore >= 60 ? "warning" : "neutral"}
            />
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-xs ${getStatusClass(complaint.status)}`}>
          {getStatusLabel(complaint.status)}
        </span>
      </div>
    </div>
  );
}

export function ComplaintsListSection({
  items,
  selectedComplaintId,
  pagination,
  onOpenDetail,
  onPreviousPage,
  onNextPage,
}: {
  items: ComplaintItem[];
  selectedComplaintId: string | null;
  pagination: {
    page: number;
    total: number;
    totalPages: number;
  };
  onOpenDetail: (complaintId: string) => void;
  onPreviousPage: () => void;
  onNextPage: () => void;
}) {
  return (
    <div className="space-y-3">
      {items.map((complaint) => (
        <ComplaintCard
          key={complaint.id}
          complaint={complaint}
          isSelected={selectedComplaintId === complaint.id}
          onOpen={onOpenDetail}
        />
      ))}

      {items.length === 0 ? <div className="dashboard-empty">Жалобы не найдены</div> : null}

      {pagination.total > 0 ? (
        <div className="dashboard-card flex items-center justify-between gap-2 text-xs text-gray-600">
          <div>
            Страница {pagination.page}
            {pagination.totalPages > 0 ? ` из ${pagination.totalPages}` : ""} · Всего {pagination.total}
          </div>
          <div className="flex items-center gap-1">
            <button
              className="btn-secondary px-2 py-1 text-xs"
              onClick={onPreviousPage}
              disabled={pagination.page <= 1}
            >
              Назад
            </button>
            <button
              className="btn-secondary px-2 py-1 text-xs"
              onClick={onNextPage}
              disabled={pagination.totalPages > 0 && pagination.page >= pagination.totalPages}
            >
              Вперед
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
