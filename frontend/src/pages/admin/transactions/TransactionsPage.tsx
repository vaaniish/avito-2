import { useEffect, useMemo, useState, type UIEvent } from "react";
import { Download, RefreshCw, Search } from "lucide-react";
import { apiGet } from "../../../shared/lib/api";
import { notifyError } from "../../../shared/ui/notifications";

type FinanceGroupBy = "day" | "week" | "month";
type FinanceTransactionStatus =
  | "all"
  | "pending"
  | "held"
  | "success"
  | "failed"
  | "cancelled"
  | "refunded";
type FinanceOrderStatus =
  | "all"
  | "created"
  | "paid"
  | "processing"
  | "prepared"
  | "shipped"
  | "delivered"
  | "completed"
  | "cancelled";

type FinanceSummary = {
  gross: number;
  earned: number;
  payable: number;
  commissions: number;
  held: number;
  refundedCancelled: number;
  sellerPayout: number;
  transactions: number;
  ordersTotal: number;
  activeOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  avgCheck: number;
  avgCommission: number;
  successRate: number;
};

type FinancePoint = {
  period: string;
  gross: number;
  commissions: number;
  sellerPayout: number;
  transactions: number;
  orders: number;
};

type BreakdownItem = {
  key: string;
  label: string;
  count: number;
  amount: number;
};

type SettlementBucket = {
  key: "pendingPayment" | "inProgress" | "readyToPayout" | "problem";
  label: string;
  description: string;
  count: number;
  amount: number;
  commissions: number;
  sellerPayout: number;
};

type TopSeller = {
  id: string;
  name: string;
  email: string;
  transactions: number;
  orders: number;
  gross: number;
  commissions: number;
  sellerPayout: number;
  cancelled: number;
  refunded: number;
};

type FinanceReportRow = {
  id: string;
  orderId: string;
  orderStatus: string;
  transactionStatus: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  listingTitle: string;
  listingIds: string[];
  itemsCount: number;
  itemsTotalQuantity: number;
  deliveryType: string;
  deliveryAddress: string | null;
  amount: number;
  commission: number;
  commissionRate: number;
  sellerPayout: number;
  paymentProvider: string;
  paymentIntentId: string;
  createdAt: string;
};

type FinanceReportMeta = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
};

type AdminFinanceAnalytics = {
  filters: {
    from: string;
    to: string;
    groupBy: FinanceGroupBy;
    transactionStatus: FinanceTransactionStatus;
    orderStatus: FinanceOrderStatus;
    search: string;
  };
  summary: FinanceSummary;
  timeSeries: FinancePoint[];
  transactionStatusBreakdown: BreakdownItem[];
  orderStatusBreakdown: BreakdownItem[];
  settlementBuckets: SettlementBucket[];
  topSellers: TopSeller[];
  reportMeta: FinanceReportMeta;
  reportRows: FinanceReportRow[];
};

const TRANSACTION_OPTIONS: Array<{ value: FinanceTransactionStatus; label: string }> = [
  { value: "all", label: "Все платежи" },
  { value: "pending", label: "Ожидают" },
  { value: "held", label: "Удержание" },
  { value: "success", label: "Успешные" },
  { value: "failed", label: "Ошибки" },
  { value: "cancelled", label: "Отмененные" },
  { value: "refunded", label: "Возвраты" },
];

const ORDER_OPTIONS: Array<{ value: FinanceOrderStatus; label: string }> = [
  { value: "all", label: "Все заказы" },
  { value: "created", label: "Создан" },
  { value: "paid", label: "Оплачен" },
  { value: "processing", label: "В обработке" },
  { value: "prepared", label: "Подготовлен" },
  { value: "shipped", label: "Отправлен" },
  { value: "delivered", label: "Доставлен" },
  { value: "completed", label: "Завершен" },
  { value: "cancelled", label: "Отменен" },
];
const FINANCE_REPORT_PAGE_SIZE = 40;
const FINANCE_EXPORT_PAGE_SIZE = 200;

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDefaultFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return toDateInputValue(date);
}

function csvEscape(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPeriodLabel(period: string): string {
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function estimateFinanceTooltipTextWidth(value: string): number {
  return Array.from(value).reduce((width, char) => {
    if (/[0-9]/.test(char)) return width + 6.2;
    if (/[.,: ₽]/.test(char)) return width + 3.6;
    if (/[A-ZА-ЯЁ]/.test(char)) return width + 7.2;
    return width + 6.6;
  }, 0);
}

function LineChart({ points }: { points: FinancePoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 860;
  const height = 300;
  const padding = { top: 28, right: 30, bottom: 48, left: 84 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const grossValues = points.map((point) => point.gross).filter((value) => value > 0);
  const minGross = Math.min(...grossValues, 0);
  const maxGross = Math.max(...grossValues, 1);
  const yPadding = Math.max(1, Math.round((maxGross - minGross) * 0.12));
  const minValue = Math.max(0, minGross - yPadding);
  const maxValue = Math.max(minValue + 1, maxGross + yPadding);
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = maxValue - (index / 3) * (maxValue - minValue);
    return Math.round(value);
  });
  const xLabelIndexes = points.length <= 1
    ? [0]
    : Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));
  const activePoint = activeIndex === null ? null : points[activeIndex] ?? null;
  const activeX =
    activeIndex === null || points.length === 0
      ? 0
      : points.length <= 1
        ? padding.left + chartWidth / 2
        : padding.left + (activeIndex / (points.length - 1)) * chartWidth;
  const activeY = activePoint
    ? padding.top + ((maxValue - activePoint.gross) / (maxValue - minValue)) * chartHeight
    : 0;
  const tooltipRows = activePoint
    ? [
        formatPeriodLabel(activePoint.period),
        `GMV: ${formatCurrency(activePoint.gross)}`,
        `Комиссия: ${formatCurrency(activePoint.commissions)}`,
        `Выплаты: ${formatCurrency(activePoint.sellerPayout)}`,
        `Заказы: ${activePoint.orders} · операций ${activePoint.transactions}`,
      ]
    : [];
  const tooltipPaddingX = 7;
  const tooltipPaddingTop = 8;
  const tooltipPaddingBottom = 7;
  const tooltipRowHeight = 14;
  const tooltipPointerHeight = 8;
  const tooltipRadius = 5;
  const tooltipSideInset = 6;
  const tooltipWidth =
    tooltipRows.length > 0
      ? Math.ceil(Math.max(...tooltipRows.map(estimateFinanceTooltipTextWidth)) + tooltipPaddingX * 2)
      : 0;
  const tooltipHeight =
    tooltipRows.length > 0
      ? tooltipPaddingTop + tooltipPaddingBottom + tooltipRows.length * tooltipRowHeight
      : 0;
  const tooltipX = activePoint
    ? Math.min(width - tooltipWidth - tooltipSideInset, Math.max(tooltipSideInset, activeX - tooltipWidth / 2))
    : 0;
  const tooltipY = activePoint
    ? Math.max(tooltipSideInset, activeY - tooltipHeight - tooltipPointerHeight - 7)
    : 0;
  const tooltipPointerX = activePoint
    ? Math.min(tooltipWidth - 14, Math.max(14, activeX - tooltipX))
    : 0;
  const path = points
    .map((point, index) => {
      const x =
        points.length <= 1
          ? padding.left + chartWidth / 2
          : padding.left + (index / (points.length - 1)) * chartWidth;
      const y = padding.top + ((maxValue - point.gross) / (maxValue - minValue)) * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <div className="finance-chart" aria-label="Динамика оборота платформы">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        {yTicks.map((tick, index) => {
          const y = padding.top + (index / (yTicks.length - 1)) * chartHeight;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="finance-chart__grid" />
              <text x={padding.left - 12} y={y + 5} textAnchor="end" className="finance-chart__tick">
                {formatCurrency(tick)}
              </text>
            </g>
          );
        })}
        {xLabelIndexes.map((index) => {
          const x =
            points.length <= 1
              ? padding.left + chartWidth / 2
              : padding.left + (index / (points.length - 1)) * chartWidth;
          return (
            <text key={`${points[index]?.period}-${index}`} x={x} y={height - 14} textAnchor="middle" className="finance-chart__tick">
              {formatPeriodLabel(points[index]?.period ?? "")}
            </text>
          );
        })}
        <path d={`M ${padding.left} ${height - padding.bottom} H ${width - padding.right}`} className="finance-chart__axis" />
        <path d={`M ${padding.left} ${padding.top} V ${height - padding.bottom}`} className="finance-chart__axis" />
        <path d={path} className="finance-chart__line" />
        {points.map((point, index) => {
          const x =
            points.length <= 1
              ? padding.left + chartWidth / 2
              : padding.left + (index / (points.length - 1)) * chartWidth;
          const y = padding.top + ((maxValue - point.gross) / (maxValue - minValue)) * chartHeight;
          return (
            <g
              key={`${point.period}-${index}`}
              className="finance-chart__point"
              onPointerEnter={() => setActiveIndex(index)}
              onPointerLeave={() => setActiveIndex(null)}
            >
              <circle cx={x} cy={y} r="10" className="finance-chart__dot-hit" />
              <circle cx={x} cy={y} r={activeIndex === index ? 5 : 3.5} className="finance-chart__dot" />
            </g>
          );
        })}
        {activePoint ? (
          <line
            x1={activeX}
            x2={activeX}
            y1={padding.top}
            y2={height - padding.bottom}
            className="finance-chart__hover-line"
            pointerEvents="none"
          />
        ) : null}
        {activePoint ? (
          <g className="finance-chart__tooltip" transform={`translate(${tooltipX} ${tooltipY})`} pointerEvents="none">
            <path
              d={`M 0 0 H ${tooltipWidth} Q ${tooltipWidth + tooltipRadius} 0 ${tooltipWidth + tooltipRadius} ${tooltipRadius} V ${tooltipHeight - tooltipRadius} Q ${tooltipWidth + tooltipRadius} ${tooltipHeight} ${tooltipWidth} ${tooltipHeight} H ${tooltipPointerX + 7} L ${tooltipPointerX} ${tooltipHeight + tooltipPointerHeight} L ${tooltipPointerX - 7} ${tooltipHeight} H 0 Q ${-tooltipRadius} ${tooltipHeight} ${-tooltipRadius} ${tooltipHeight - tooltipRadius} V ${tooltipRadius} Q ${-tooltipRadius} 0 0 0 Z`}
            />
            {tooltipRows.map((row, index) => (
              <text key={row} x={tooltipPaddingX} y={tooltipPaddingTop + 10 + index * tooltipRowHeight}>
                {row}
              </text>
            ))}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function BreakdownBars({ items }: { items: BreakdownItem[] }) {
  const total = Math.max(items.reduce((sum, item) => sum + item.amount, 0), 1);
  return (
    <div className="finance-breakdown">
      {items.map((item) => (
        <div key={item.key} className="finance-breakdown__row">
          <div className="finance-breakdown__meta">
            <span>{item.label}</span>
            <span>{formatCurrency(item.amount)} · {item.count}</span>
          </div>
          <div className="finance-breakdown__track">
            <span style={{ width: `${Math.max(4, (item.amount / total) * 100)}%` }} />
          </div>
        </div>
      ))}
      {items.length === 0 ? <div className="dashboard-empty">Нет данных для разбивки</div> : null}
    </div>
  );
}

function SettlementBucketRows({ items }: { items: SettlementBucket[] }) {
  return (
    <div className="finance-table finance-settlement-list">
      {items.map((item) => (
        <div key={item.key} className="finance-table__row finance-table__row--settlement">
          <div className="finance-table__main">
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </div>
          <div className="finance-table__status">
            <span>{item.count} сделок</span>
            <span>комиссия {formatCurrency(item.commissions)}</span>
          </div>
          <div className="finance-table__money">
            <strong>{formatCurrency(item.sellerPayout)}</strong>
            <span>оборот {formatCurrency(item.amount)}</span>
          </div>
        </div>
      ))}
      {items.length === 0 ? <div className="dashboard-empty">Нет сделок для сверки выплат</div> : null}
    </div>
  );
}

export function TransactionsPage() {
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(() => toDateInputValue(new Date()));
  const [groupBy, setGroupBy] = useState<FinanceGroupBy>("day");
  const [transactionStatus, setTransactionStatus] = useState<FinanceTransactionStatus>("all");
  const [orderStatus, setOrderStatus] = useState<FinanceOrderStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [analytics, setAnalytics] = useState<AdminFinanceAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    params.set("groupBy", groupBy);
    params.set("transactionStatus", transactionStatus);
    params.set("orderStatus", orderStatus);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    return params.toString();
  }, [from, groupBy, orderStatus, searchQuery, to, transactionStatus]);

  const loadAnalytics = async (options?: { offset?: number; append?: boolean }) => {
    const offset = options?.offset ?? 0;
    const append = options?.append ?? false;
    if (append) {
      setIsReportLoading(true);
    } else {
      setIsLoading(true);
    }
    try {
      const params = new URLSearchParams(queryString);
      params.set("reportLimit", String(FINANCE_REPORT_PAGE_SIZE));
      params.set("reportOffset", String(offset));
      const result = await apiGet<AdminFinanceAnalytics>(`/admin/finance/analytics?${params.toString()}`);
      setAnalytics((previous) =>
        append && previous
          ? {
              ...result,
              reportRows: [...previous.reportRows, ...result.reportRows],
            }
          : result,
      );
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить финансы");
    } finally {
      if (append) {
        setIsReportLoading(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadAnalytics({ offset: 0 });
  }, [queryString]);

  const fetchAllReportRows = async (): Promise<FinanceReportRow[]> => {
    if (!analytics) return [];
    const rows: FinanceReportRow[] = [];
    let offset = 0;

    while (true) {
      const params = new URLSearchParams(queryString);
      params.set("reportLimit", String(FINANCE_EXPORT_PAGE_SIZE));
      params.set("reportOffset", String(offset));
      const result = await apiGet<AdminFinanceAnalytics>(`/admin/finance/analytics?${params.toString()}`);
      rows.push(...result.reportRows);
      if (!result.reportMeta.hasMore || result.reportRows.length === 0) break;
      offset += result.reportRows.length;
    }

    return rows;
  };

  const handleExport = async () => {
    if (!analytics) return;
    setIsReportLoading(true);
    try {
      const reportRows = await fetchAllReportRows();
      const headers = [
        "Сделка",
        "Заказ",
        "Статус денег",
        "Статус заказа",
        "Покупатель ID",
        "Покупатель",
        "Покупатель email",
        "Продавец ID",
        "Продавец",
        "Продавец email",
        "Объявление / товар",
        "ID объявлений",
        "Позиций",
        "Единиц",
        "Доставка",
        "Адрес",
        "Оборот",
        "Комиссия",
        "Ставка комиссии",
        "Выплата продавцу",
        "Провайдер",
        "Payment intent",
        "Дата",
      ];
      const lines = reportRows.map((row) =>
        [
          row.id,
          row.orderId,
          row.transactionStatus,
          row.orderStatus,
          row.buyerId,
          row.buyerName,
          row.buyerEmail,
          row.sellerId,
          row.sellerName,
          row.sellerEmail,
          row.listingTitle,
          row.listingIds.join("|"),
          row.itemsCount,
          row.itemsTotalQuantity,
          row.deliveryType,
          row.deliveryAddress ?? "",
          row.amount,
          row.commission,
          row.commissionRate,
          row.sellerPayout,
          row.paymentProvider,
          row.paymentIntentId,
          new Date(row.createdAt).toLocaleString("ru-RU"),
        ]
          .map((value) => csvEscape(value))
          .join(","),
      );
      const csv = [headers.map((value) => csvEscape(value)).join(","), ...lines].join("\n");
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `admin_finance_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось выгрузить реестр сделок");
    } finally {
      setIsReportLoading(false);
    }
  };

  const handleReportScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!analytics || isLoading || isReportLoading || !analytics.reportMeta.hasMore) return;
    const target = event.currentTarget;
    const remaining = target.scrollHeight - target.scrollTop - target.clientHeight;
    if (remaining <= 96) {
      void loadAnalytics({ offset: analytics.reportRows.length, append: true });
    }
  };

  const summary = analytics?.summary;

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="dashboard-title">Финансы</h1>
          <p className="dashboard-subtitle">
            GMV, комиссии, выплаты продавцам, статусы платежей и операционные отчеты
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadAnalytics({ offset: 0 })}
            className="btn-secondary flex items-center justify-center gap-2 px-4 py-2 text-sm"
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" /> Обновить
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm"
            disabled={!analytics || analytics.reportRows.length === 0}
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      <div className="dashboard-toolbar finance-toolbar">
        <input className="dashboard-select" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className="dashboard-select" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select className="dashboard-select" value={groupBy} onChange={(event) => setGroupBy(event.target.value as FinanceGroupBy)}>
          <option value="day">По дням</option>
          <option value="week">По неделям</option>
          <option value="month">По месяцам</option>
        </select>
        <select
          className="dashboard-select"
          value={transactionStatus}
          onChange={(event) => setTransactionStatus(event.target.value as FinanceTransactionStatus)}
        >
          {TRANSACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select className="dashboard-select" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value as FinanceOrderStatus)}>
          {ORDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <div className="dashboard-search finance-toolbar__search">
          <Search className="dashboard-search__icon" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Продавец, покупатель, товар, заказ"
            className="dashboard-search__input"
          />
        </div>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--5">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">GMV / оборот</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.gross ?? 0)}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Комиссии платформы</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.commissions ?? 0)}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">Выплаты продавцам</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.earned ?? 0)}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">К выплате</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.payable ?? 0)}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Возвраты / отмены</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.refundedCancelled ?? 0)}</div>
        </div>
      </div>

      <div className="finance-grid finance-grid--stacked">
        <section className="dashboard-card finance-panel">
          <div className="finance-panel__header">
            <div>
              <h3>Динамика GMV</h3>
              <p>{summary?.transactions ?? 0} операций · средний чек {formatCurrency(summary?.avgCheck ?? 0)}</p>
            </div>
            <strong>{formatNumber(summary?.successRate ?? 0)}%</strong>
          </div>
          <LineChart points={analytics?.timeSeries ?? []} />
        </section>

        <section className="dashboard-card finance-panel">
          <div className="finance-panel__header">
            <div>
              <h3>Статусы платежей</h3>
              <p>Средняя комиссия {formatCurrency(summary?.avgCommission ?? 0)}</p>
            </div>
          </div>
          <BreakdownBars items={analytics?.transactionStatusBreakdown ?? []} />
        </section>
      </div>

      <div className="finance-grid finance-grid--stacked">
        <section className="dashboard-card finance-panel">
          <div className="finance-panel__header">
            <div>
              <h3>Топ продавцов</h3>
              <p>Оборот, комиссии и проблемные операции</p>
            </div>
          </div>
          <div className="finance-table">
            {(analytics?.topSellers ?? []).map((seller) => (
              <div key={seller.id} className="finance-table__row">
                <div className="finance-table__main">
                  <strong>{seller.name}</strong>
                  <span>{seller.id} · {seller.email} · заказов {seller.orders}</span>
                </div>
                <div className="finance-table__money">
                  <strong>{formatCurrency(seller.gross)}</strong>
                  <span>комиссия {formatCurrency(seller.commissions)} · возвраты {seller.refunded + seller.cancelled}</span>
                </div>
              </div>
            ))}
            {analytics?.topSellers.length === 0 ? <div className="dashboard-empty">Нет продавцов в периоде</div> : null}
          </div>
        </section>

        <section className="dashboard-card finance-panel">
          <div className="finance-panel__header">
            <div>
              <h3>Сверка выплат по платформе</h3>
              <p>Деньги по стадиям сделок без рейтинга единичных объявлений</p>
            </div>
          </div>
          <SettlementBucketRows items={analytics?.settlementBuckets ?? []} />
        </section>
      </div>

      <section className="dashboard-card finance-panel">
        <div className="finance-panel__header">
          <div>
            <h3>Реестр сделок</h3>
            <p>
              Загружено {analytics?.reportRows.length ?? 0} из {analytics?.reportMeta.total ?? 0} · прокрутите список для догрузки
            </p>
          </div>
          <span>{summary?.ordersTotal ?? 0} заказов</span>
        </div>
        <div className="finance-table finance-report-scroll" onScroll={handleReportScroll}>
          {(analytics?.reportRows ?? []).map((row) => (
            <div key={row.id} className="finance-table__row finance-table__row--dense">
              <div className="finance-table__main">
                <strong>{row.listingTitle}</strong>
                <span>{row.id} · заказ {row.orderId} · {new Date(row.createdAt).toLocaleString("ru-RU")}</span>
                <span>{row.buyerName} → {row.sellerName}</span>
              </div>
              <div className="finance-table__status">
                <span>{row.transactionStatus}</span>
                <span>{row.orderStatus}</span>
              </div>
              <div className="finance-table__money">
                <strong>{formatCurrency(row.amount)}</strong>
                <span>комиссия {formatCurrency(row.commission)} · выплата {formatCurrency(row.sellerPayout)}</span>
              </div>
            </div>
          ))}
          {analytics && analytics.reportRows.length === 0 ? <div className="dashboard-empty">Операции не найдены</div> : null}
          {isLoading ? <div className="dashboard-empty">Загрузка финансов...</div> : null}
          {isReportLoading ? <div className="dashboard-empty">Догружаем сделки...</div> : null}
        </div>
      </section>
    </div>
  );
}
