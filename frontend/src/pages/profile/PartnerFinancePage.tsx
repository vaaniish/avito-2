import { useEffect, useMemo, useState, type UIEvent } from "react";
import { Download, Search } from "lucide-react";
import { apiGet } from "../../shared/lib/api";
import { notifyError } from "../../shared/ui/notifications";

type FinanceDashboardTab = "overview" | "quarters" | "ledger";
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
  itemsSold: number;
  medianPrice: number;
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

type FinanceReportRow = {
  id: string;
  orderId: string;
  orderStatus: string;
  transactionStatus: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
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

type CommissionTierSummary = {
  id: string;
  name: string;
  rate: number;
  minSales: number;
  maxSales: number | null;
};

type CommissionProgram = {
  periodKey: string;
  periodLabel: string;
  qualifiedGmv: number;
  completedOrders: number;
  currentTier: CommissionTierSummary;
  nextTier: CommissionTierSummary | null;
  salesToNextTier: number;
  tiers: CommissionTierSummary[];
  progress: {
    currentSales: number;
    currentFloor: number;
    nextFloor: number | null;
    salesToNextTier: number;
    percentToNextTier: number;
  };
  resetsAt: string;
  payoutProfileStatus: "missing" | "pending" | "verified" | "rejected";
  payoutProfileUpdatedAt: string | null;
};

type QuarterSummary = {
  periodKey: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  gross: number;
  sellerProfit: number;
  commission: number;
  held: number;
  refundedCancelled: number;
  payable: number;
  completedOrders: number;
};

type PartnerFinanceAnalytics = {
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
  commissionProgram: CommissionProgram;
  availableQuarterKeys: string[];
  selectedQuarterKey: string;
  quarterSummaries: QuarterSummary[];
  reportMeta: FinanceReportMeta;
  reportRows: FinanceReportRow[];
};

type PartnerFinanceQuarterAnalytics = {
  availableYears: number[];
  selectedYear: number;
  selectedQuarterKey: string;
  commissionProgram: CommissionProgram;
  quarterSummaries: QuarterSummary[];
};

type SheetValue = string | number;

type WorkbookSheet = {
  cell: (address: string) => {
    value: (value: unknown) => unknown;
  };
  range: (address: string) => {
    style: (style: string | Record<string, unknown>, value?: unknown) => unknown;
  };
  usedRange: () => {
    style: (style: string | Record<string, unknown>, value?: unknown) => unknown;
  } | undefined;
  freezePanes: (row: number, column: number) => unknown;
  column: (columnNameOrNumber: string | number) => {
    width: (value: number) => unknown;
  };
};

type WorkbookInstance = {
  sheet: (indexOrName: number | string) => WorkbookSheet & {
    name: (name: string) => unknown;
  };
  addSheet: (name: string, indexOrBeforeSheet?: number | string) => WorkbookSheet;
  outputAsync: (type?: string | { type?: string }) => Promise<Blob>;
};

type XlsxPopulateModule = {
  fromBlankAsync: () => Promise<WorkbookInstance>;
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

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatPayoutStatus(status: CommissionProgram["payoutProfileStatus"]): string {
  if (status === "verified") return "Подтвержден";
  if (status === "pending") return "На проверке";
  if (status === "rejected") return "Отклонен";
  return "Не заполнен";
}

function formatQuarterKeyLabel(periodKey: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(periodKey);
  if (!match) return periodKey;
  return `${match[2]} квартал ${match[1]}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatPeriodLabel(period: string): string {
  const date = new Date(period);
  if (Number.isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function sheetColumnLetter(index: number): string {
  let value = index;
  let result = "";
  while (value >= 0) {
    result = String.fromCharCode((value % 26) + 65) + result;
    value = Math.floor(value / 26) - 1;
  }
  return result;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function loadXlsxPopulate(): Promise<XlsxPopulateModule> {
  const module = await import("xlsx-populate/browser/xlsx-populate");
  return (module.default ?? module) as XlsxPopulateModule;
}

type WorksheetConfig = {
  name: string;
  description?: string;
  headers?: string[];
  rows: SheetValue[][];
  columnWidths?: number[];
};

type ExportWorkbookData = {
  analytics: PartnerFinanceAnalytics;
  quarterData: PartnerFinanceQuarterAnalytics;
  reportRows: FinanceReportRow[];
};

function writeSheetTable(
  sheet: WorkbookSheet,
  rows: SheetValue[][],
  columnWidths: number[] = [],
): void {
  sheet.cell("A1").value(rows);
  const used = sheet.usedRange();
  if (used) {
    used.style({
      fontFamily: "Inter",
      fontSize: 11,
      verticalAlignment: "center",
    });
  }
  if (rows.length > 0) {
    sheet.usedRange()?.style("border", false);
    sheet.freezePanes(2, 1);
  }
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  Array.from({ length: columnCount }, (_, index) => index).forEach((index) => {
    const letter = sheetColumnLetter(index);
    sheet.column(letter).width(columnWidths[index] ?? 18);
  });
  if (rows.length > 0) {
    const headerRangeEnd = sheetColumnLetter(columnCount - 1);
    sheet.range(`A1:${headerRangeEnd}1`).style({
      bold: true,
      fill: "EAF1FF",
      fontColor: "1E293B",
    });
  }
}

function normalizeSheetRows(rows: SheetValue[][]): SheetValue[][] {
  const width = Math.max(...rows.map((row) => row.length), 1);
  return rows.map((row) => {
    if (row.length === 0) {
      return Array.from({ length: width }, (_, index) => (index === 0 ? "" : ""));
    }
    if (row.length === width) {
      return row;
    }
    return [...row, ...Array.from({ length: width - row.length }, () => "")];
  });
}

function renderWorksheet(sheet: WorkbookSheet, config: WorksheetConfig): void {
  const rows: SheetValue[][] = [];
  if (config.description) {
    rows.push([config.description]);
    rows.push([""]);
  }
  if (config.headers) {
    rows.push(config.headers);
  }
  rows.push(...config.rows);
  writeSheetTable(sheet, normalizeSheetRows(rows), config.columnWidths);

  if (config.description) {
    sheet.range("A1:A1").style({
      bold: true,
      fontSize: 12,
      fontColor: "334155",
      wrapText: true,
    });
    if (config.headers) {
      const headerEnd = sheetColumnLetter(Math.max(0, config.headers.length - 1));
      sheet.range(`A3:${headerEnd}3`).style({
        bold: true,
        fill: "EAF1FF",
        fontColor: "1E293B",
      });
      sheet.freezePanes(4, 1);
    }
  }
}

function addWorksheetFromConfig(workbook: WorkbookInstance, config: WorksheetConfig, index: number): void {
  const sheet = index === 0 ? workbook.sheet(0) : workbook.addSheet(config.name);
  if (index === 0) {
    workbook.sheet(0).name(config.name);
  }
  renderWorksheet(sheet, config);
}

function buildExplanationSheetRows(): SheetValue[][] {
  return [
    ["Сводка", "Главные показатели продавца за выбранный диапазон", "Смотрите на заработано, к выплате, оборот, комиссию и возвраты как на итог по текущим фильтрам."],
    ["Динамика", "Изменение оборота, комиссии и выплат по периодам", "Каждая строка показывает один период группировки: день, неделю или месяц."],
    ["Статусы", "Разбивка по выплатам, заказам и платежам", "Помогает понять, где деньги уже готовы к выплате, где удерживаются и на каких статусах застревают."],
    ["Кварталы", "История по кварталам и текущая ступень программы комиссии", "Здесь видно, как менялись оборот, прибыль и прогресс до следующего уровня комиссии."],
    ["Ставки комиссии", "Все доступные уровни комиссии", "Смотрите пороги по обороту и текущий активный уровень продавца."],
    ["Реестр сделок", "Подробный список всех сделок в выбранном диапазоне", "Используйте для сверки заказов, покупателей, статусов и сумм."],
    [""],
    ["Термины", "Пояснение", "Примечание"],
    ["Заработано", "Сумма успешных продавцу денег за выбранный период", "Не включает удержанные и проблемные деньги."],
    ["К выплате", "Сумма, готовая продавцу после завершения сделки", "Это не просто оплаченные заказы, а только деньги, которые уже можно перечислять."],
    ["Оборот", "Полная сумма транзакций продавца за период", "Это общий денежный поток без вычета комиссии."],
    ["Комиссия", "Сколько площадка удержала комиссии", "Рассчитывается по ставке, действовавшей на момент сделки."],
    ["Возвраты и отмены", "Сумма отменённых и возвращённых операций", "Помогает увидеть проблемные или откатившиеся платежи."],
    ["Qualified GMV", "Оборот, который участвует в расчёте уровня комиссии", "Используется для перехода между ставками комиссии, а не любой оборот подряд."],
    ["Payout profile", "Статус платёжного профиля продавца", "Показывает, можно ли безопасно готовить выплаты продавцу."],
    ["Удержано", "Деньги, которые ещё не готовы к выплате", "Обычно это активные или незавершённые сделки."],
  ];
}

function buildSummarySheetRows(analytics: PartnerFinanceAnalytics): SheetValue[][] {
  return [
    ["Заработано", formatCurrency(analytics.summary.earned)],
    ["К выплате", formatCurrency(analytics.summary.payable)],
    ["Оборот", formatCurrency(analytics.summary.gross)],
    ["Комиссия", formatCurrency(analytics.summary.commissions)],
    ["Возвраты и отмены", formatCurrency(analytics.summary.refundedCancelled)],
    ["Операций", analytics.summary.transactions],
    ["Заказов", analytics.summary.ordersTotal],
    ["Активных заказов", analytics.summary.activeOrders],
    ["Завершённых заказов", analytics.summary.completedOrders],
    ["Средний чек", formatCurrency(analytics.summary.avgCheck)],
    ["Успешность платежей", formatPercent(analytics.summary.successRate)],
    [""],
    ["Период программы комиссии", analytics.commissionProgram.periodLabel],
    ["Текущий уровень", analytics.commissionProgram.currentTier.name],
    ["Ставка комиссии", formatPercent(analytics.commissionProgram.currentTier.rate)],
    ["Qualified GMV", formatCurrency(analytics.commissionProgram.qualifiedGmv)],
    ["Завершённых сделок", analytics.commissionProgram.completedOrders],
    [
      "Следующий уровень",
      analytics.commissionProgram.nextTier
        ? `${analytics.commissionProgram.nextTier.name} · ${formatPercent(analytics.commissionProgram.nextTier.rate)}`
        : "Максимальный уровень",
    ],
    ["Осталось до следующего уровня", formatCurrency(analytics.commissionProgram.salesToNextTier)],
    ["Payout profile", formatPayoutStatus(analytics.commissionProgram.payoutProfileStatus)],
  ];
}

function buildTimelineSheetRows(analytics: PartnerFinanceAnalytics): SheetValue[][] {
  return analytics.timeSeries.map((point) => [
    formatPeriodLabel(point.period),
    point.gross,
    point.commissions,
    point.sellerPayout,
    point.transactions,
    point.orders,
    point.itemsSold,
    point.medianPrice,
  ]);
}

function buildStatusesSheetRows(analytics: PartnerFinanceAnalytics): SheetValue[][] {
  return [
    ...analytics.settlementBuckets.map((item) => [
      "Выплаты",
      item.label,
      item.count,
      item.amount,
      item.commissions,
      item.sellerPayout,
    ]),
    ...analytics.orderStatusBreakdown.map((item) => ["Заказы", item.label, item.count, item.amount, "", ""]),
    ...analytics.transactionStatusBreakdown.map((item) => ["Платежи", item.label, item.count, item.amount, "", ""]),
  ];
}

function buildQuarterSheetRows(quarterData: PartnerFinanceQuarterAnalytics): SheetValue[][] {
  const quarterProgram = quarterData.commissionProgram;
  const selectedQuarter =
    quarterData.quarterSummaries.find((quarter) => quarter.periodKey === quarterData.selectedQuarterKey) ?? null;

  return [
    ...quarterData.quarterSummaries.map((quarter) => [
      quarter.periodLabel,
      quarter.gross,
      quarter.sellerProfit,
      quarter.commission,
      quarter.payable,
      quarter.held,
      quarter.refundedCancelled,
      quarter.completedOrders,
      formatShortDate(quarter.periodStart),
      formatShortDate(quarter.periodEnd),
    ]),
    [""],
    ["Выбранный квартал", selectedQuarter?.periodLabel ?? quarterProgram.periodLabel],
    ["Текущий уровень", quarterProgram.currentTier.name],
    ["Ставка комиссии", formatPercent(quarterProgram.currentTier.rate)],
    ["Qualified GMV", formatCurrency(quarterProgram.qualifiedGmv)],
    ["Осталось до следующего уровня", formatCurrency(quarterProgram.salesToNextTier)],
    ["Прогресс", formatPercent(quarterProgram.progress.percentToNextTier)],
  ];
}

function buildTierSheetRows(program: CommissionProgram): SheetValue[][] {
  return program.tiers.map((tier) => [
    tier.name,
    formatPercent(tier.rate),
    tier.minSales,
    tier.maxSales ?? "—",
    tier.id === program.currentTier.id
      ? "Текущий"
      : tier.minSales <= program.qualifiedGmv
        ? "Порог пройден"
        : "Не достигнут",
  ]);
}

function buildLedgerSheetRows(reportRows: FinanceReportRow[]): SheetValue[][] {
  return reportRows.map((row) => [
    row.id,
    row.orderId,
    row.transactionStatus,
    row.orderStatus,
    row.buyerName,
    row.buyerEmail,
    row.listingTitle,
    row.listingIds.join("|"),
    row.itemsCount,
    row.itemsTotalQuantity,
    row.amount,
    row.commission,
    row.commissionRate,
    row.sellerPayout,
    row.paymentProvider,
    row.paymentIntentId,
    new Date(row.createdAt).toLocaleString("ru-RU"),
  ]);
}

function buildFinanceWorkbookConfig(data: ExportWorkbookData): WorksheetConfig[] {
  return [
    {
      name: "Пояснения",
      description: "Этот файл содержит финансовый отчёт продавца. Сначала прочитайте этот лист, если хотите понять смысл метрик и вкладок.",
      headers: ["Раздел", "Смысл", "Как использовать"],
      rows: buildExplanationSheetRows(),
      columnWidths: [24, 42, 56],
    },
    {
      name: "Сводка",
      description: "Ключевые показатели продавца и текущая программа комиссии за выбранный диапазон.",
      headers: ["Показатель", "Значение"],
      rows: buildSummarySheetRows(data.analytics),
      columnWidths: [34, 42],
    },
    {
      name: "Динамика",
      description: "Разбивка оборота, комиссии и выплат по временным периодам, выбранным во вкладке Финансы.",
      headers: ["Период", "Оборот", "Комиссия", "К выплате", "Транзакции", "Заказы", "Единиц товара", "Медианная цена"],
      rows: buildTimelineSheetRows(data.analytics),
      columnWidths: [18, 16, 16, 16, 14, 12, 16, 18],
    },
    {
      name: "Статусы",
      description: "Сверка выплат, заказов и платежей, чтобы видеть текущее состояние денежного потока.",
      headers: ["Срез", "Статус", "Количество", "Сумма", "Комиссия", "К выплате"],
      rows: buildStatusesSheetRows(data.analytics),
      columnWidths: [14, 28, 14, 16, 16, 16],
    },
    {
      name: "Кварталы",
      description: "Поквартальная история продавца и текущая логика программы комиссии по выбранному году.",
      headers: ["Квартал", "Оборот", "Прибыль продавца", "Комиссия", "К выплате", "Удержано", "Возвраты/отмены", "Завершённые сделки", "Начало", "Конец"],
      rows: buildQuarterSheetRows(data.quarterData),
      columnWidths: [22, 16, 18, 16, 16, 16, 18, 18, 14, 14],
    },
    {
      name: "Ставки комиссии",
      description: "Все уровни комиссии продавца и их текущий статус относительно оборота продавца.",
      headers: ["Уровень", "Ставка", "От оборота", "До оборота", "Статус"],
      rows: buildTierSheetRows(data.quarterData.commissionProgram),
      columnWidths: [24, 14, 16, 16, 20],
    },
    {
      name: "Реестр сделок",
      description: "Полный список сделок в выбранном диапазоне для сверки заказов, покупателей, статусов и сумм.",
      headers: ["Сделка", "Заказ", "Статус денег", "Статус заказа", "Покупатель", "Email покупателя", "Объявление / товар", "ID объявлений", "Позиций", "Единиц", "Оборот", "Комиссия", "Ставка комиссии", "К выплате", "Провайдер", "Payment intent", "Дата"],
      rows: buildLedgerSheetRows(data.reportRows),
      columnWidths: [24, 24, 16, 16, 18, 26, 30, 24, 10, 10, 14, 14, 14, 14, 14, 28, 18],
    },
  ];
}

async function buildFinanceWorkbook(data: ExportWorkbookData): Promise<Blob> {
  const XlsxPopulate = await loadXlsxPopulate();
  const workbook = await XlsxPopulate.fromBlankAsync();
  const sheets = buildFinanceWorkbookConfig(data);
  sheets.forEach((sheetConfig, index) => addWorksheetFromConfig(workbook, sheetConfig, index));
  return workbook.outputAsync({ type: "blob" });
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
  const medianValues = points.map((point) => point.medianPrice).filter((value) => value > 0);
  const minMedian = Math.min(...medianValues, 0);
  const maxMedian = Math.max(...medianValues, 1);
  const yPadding = Math.max(1, Math.round((maxMedian - minMedian) * 0.12));
  const minValue = Math.max(0, minMedian - yPadding);
  const maxValue = Math.max(minValue + 1, maxMedian + yPadding);
  const yTicks = Array.from({ length: 4 }, (_, index) => {
    const value = maxValue - (index / 3) * (maxValue - minValue);
    return Math.round(value);
  });
  const xLabelIndexes =
    points.length <= 1
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
    ? padding.top + ((maxValue - activePoint.medianPrice) / (maxValue - minValue)) * chartHeight
    : 0;
  const tooltipRows = activePoint
    ? [
        formatPeriodLabel(activePoint.period),
        `Доход: ${formatCurrency(activePoint.gross)}`,
        `Прибыль: ${formatCurrency(activePoint.medianPrice)}`,
        `Продано: ${activePoint.itemsSold}`,
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
      const y = padding.top + ((maxValue - point.medianPrice) / (maxValue - minValue)) * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <div className="finance-chart" aria-label="Динамика оборота">
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
            <text
              key={`${points[index]?.period}-${index}`}
              x={x}
              y={height - 14}
              textAnchor="middle"
              className="finance-chart__tick"
            >
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
          const y = padding.top + ((maxValue - point.medianPrice) / (maxValue - minValue)) * chartHeight;
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
              <text key={row} x={7} y={8 + 10 + index * 14}>
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
            <span>
              {formatCurrency(item.amount)} · {item.count}
            </span>
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

function FinanceTabButton(props: {
  active: boolean;
  label: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`finance-tab ${props.active ? "finance-tab--active" : ""}`}
    >
      <div className="finance-tab__label">{props.label}</div>
      <div className="finance-tab__subtitle">{props.subtitle}</div>
    </button>
  );
}

function FinanceMetricCard(props: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "ok" | "info" | "warn" | "danger";
}) {
  const toneClass =
    props.tone === "ok"
      ? "finance-summary-card--ok"
      : props.tone === "info"
        ? "finance-summary-card--info"
        : props.tone === "warn"
          ? "finance-summary-card--warn"
          : props.tone === "danger"
            ? "finance-summary-card--danger"
            : "finance-summary-card--neutral";

  return (
    <div className={`dashboard-card finance-summary-card ${toneClass}`}>
      <div className="finance-summary-card__label">{props.label}</div>
      <div className="finance-summary-card__value">{props.value}</div>
      {props.note ? <div className="finance-summary-card__note">{props.note}</div> : null}
    </div>
  );
}

function CommissionTierTable({
  program,
  selectedSales,
}: {
  program: CommissionProgram;
  selectedSales: number;
}) {
  return (
    <section className="dashboard-card finance-panel">
      <div className="finance-panel__header">
        <div>
          <h3>Сетка комиссий</h3>
          <p>Какие ставки доступны продавцу и сколько нужно до следующей ступени</p>
        </div>
      </div>
      <div className="finance-tier-table">
        {program.tiers.map((tier) => {
          const isCurrent = tier.id === program.currentTier.id;
          const isLocked = tier.minSales > selectedSales;
          const remaining = Math.max(0, tier.minSales - selectedSales);
          return (
            <div
              key={tier.id}
              className={`finance-tier-table__row ${isCurrent ? "finance-tier-table__row--current" : ""}`}
            >
              <div>
                <div className="finance-tier-table__title">
                  <span>{tier.name}</span>
                  {isCurrent ? (
                    <span className="finance-tier-table__badge">
                      Текущий
                    </span>
                  ) : null}
                </div>
                <div className="finance-tier-table__hint">
                  От {formatCurrency(tier.minSales)}
                  {tier.maxSales ? ` до ${formatCurrency(tier.maxSales)}` : " и выше"}
                </div>
              </div>
              <div className="finance-tier-table__rate">
                <div>{tier.rate.toFixed(1)}%</div>
                <span>Ставка комиссии</span>
              </div>
              <div className="finance-tier-table__status">
                {isCurrent ? (
                  <div>
                    <div className="finance-tier-table__status-value">
                      {program.nextTier ? `Осталось ${formatCurrency(program.salesToNextTier)}` : "Максимальный уровень"}
                    </div>
                    <div className="finance-tier-table__hint">Активен в выбранном периоде</div>
                  </div>
                ) : isLocked ? (
                  <div>
                    <div className="finance-tier-table__status-value">Нужно еще {formatCurrency(remaining)}</div>
                    <div className="finance-tier-table__hint">До входа в этот уровень</div>
                  </div>
                ) : (
                  <div>
                    <div className="finance-tier-table__status-value">Порог уже пройден</div>
                    <div className="finance-tier-table__hint">Ставка ниже из-за другой ступени</div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuarterSelectionGrid({
  selectedQuarterKey,
  quarterSummaries,
  onSelect,
}: {
  selectedQuarterKey: string;
  quarterSummaries: QuarterSummary[];
  onSelect: (quarterKey: string) => void;
}) {
  return (
    <div className="finance-quarter-list">
      {quarterSummaries.map((quarter) => {
        const active = quarter.periodKey === selectedQuarterKey;
        return (
          <button
            key={quarter.periodKey}
            type="button"
            onClick={() => onSelect(quarter.periodKey)}
            className={`finance-quarter-button ${active ? "finance-quarter-button--active" : ""}`}
          >
            <div className="finance-quarter-button__content">
              <div>
                <div className="finance-quarter-button__label">{quarter.periodLabel}</div>
                <div className="finance-quarter-button__value">{formatCurrency(quarter.gross)}</div>
                <div className="finance-quarter-button__hint">Прибыль {formatCurrency(quarter.sellerProfit)}</div>
              </div>
              <div className="finance-quarter-button__meta">
                <div>{quarter.completedOrders} сделок</div>
                <div className="mt-1">{formatShortDate(quarter.periodStart)} - {formatShortDate(quarter.periodEnd)}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function PartnerFinancePage() {
  const [activeTab, setActiveTab] = useState<FinanceDashboardTab>("overview");
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(() => toDateInputValue(new Date()));
  const [groupBy, setGroupBy] = useState<FinanceGroupBy>("day");
  const [transactionStatus, setTransactionStatus] = useState<FinanceTransactionStatus>("all");
  const [orderStatus, setOrderStatus] = useState<FinanceOrderStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [analytics, setAnalytics] = useState<PartnerFinanceAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarterKey, setSelectedQuarterKey] = useState("");
  const [quarterAnalytics, setQuarterAnalytics] = useState<PartnerFinanceQuarterAnalytics | null>(null);
  const [isQuarterLoading, setIsQuarterLoading] = useState(false);

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
      const result = await apiGet<PartnerFinanceAnalytics>(`/partner/finance/analytics?${params.toString()}`);
      setAnalytics((previous) =>
        append && previous
          ? {
              ...result,
              reportRows: [...previous.reportRows, ...result.reportRows],
            }
          : result,
      );
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить финансовую аналитику");
    } finally {
      if (append) {
        setIsReportLoading(false);
      } else {
        setIsLoading(false);
      }
    }
  };

  const loadQuarterAnalytics = async (options?: { year?: number; quarterKey?: string }) => {
    const nextYear = options?.year ?? selectedYear;
    const nextQuarterKey = options?.quarterKey ?? selectedQuarterKey;
    setIsQuarterLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", String(nextYear));
      if (nextQuarterKey.trim()) params.set("quarterKey", nextQuarterKey.trim());
      const result = await apiGet<PartnerFinanceQuarterAnalytics>(`/partner/finance/quarters?${params.toString()}`);
      setQuarterAnalytics(result);
      if (result.selectedYear !== selectedYear) {
        setSelectedYear(result.selectedYear);
      }
      if (result.selectedQuarterKey !== selectedQuarterKey) {
        setSelectedQuarterKey(result.selectedQuarterKey);
      }
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить квартальную аналитику");
    } finally {
      setIsQuarterLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalytics({ offset: 0 });
  }, [queryString]);

  useEffect(() => {
    void loadQuarterAnalytics();
  }, [selectedYear, selectedQuarterKey]);

  const fetchAllReportRows = async (): Promise<FinanceReportRow[]> => {
    const rows: FinanceReportRow[] = [];
    let offset = 0;

    while (true) {
      const params = new URLSearchParams(queryString);
      params.set("reportLimit", String(FINANCE_EXPORT_PAGE_SIZE));
      params.set("reportOffset", String(offset));
      const result = await apiGet<PartnerFinanceAnalytics>(`/partner/finance/analytics?${params.toString()}`);
      rows.push(...result.reportRows);
      if (!result.reportMeta.hasMore || result.reportRows.length === 0) break;
      offset += result.reportRows.length;
    }

    return rows;
  };

  const fetchQuarterAnalyticsExport = async (): Promise<PartnerFinanceQuarterAnalytics> => {
    if (quarterAnalytics) return quarterAnalytics;
    const params = new URLSearchParams();
    params.set("year", String(selectedYear));
    if (selectedQuarterKey.trim()) params.set("quarterKey", selectedQuarterKey.trim());
    return apiGet<PartnerFinanceQuarterAnalytics>(`/partner/finance/quarters?${params.toString()}`);
  };

  const handleExport = async () => {
    setIsReportLoading(true);
    try {
      if (!analytics) {
        throw new Error("Нет данных для выгрузки");
      }

      const [reportRows, quarterData] = await Promise.all([fetchAllReportRows(), fetchQuarterAnalyticsExport()]);
      const blob = await buildFinanceWorkbook({
        analytics,
        quarterData,
        reportRows,
      });
      downloadBlob(blob, `partner_finance_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось выгрузить финансовый отчет");
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
  const overviewCommission = analytics?.commissionProgram ?? null;
  const selectedQuarterSummary = quarterAnalytics?.quarterSummaries.find(
    (quarter) => quarter.periodKey === quarterAnalytics.selectedQuarterKey,
  );
  const quarterProgram = quarterAnalytics?.commissionProgram ?? null;
  const selectedQuarterProgress = quarterProgram?.progress.percentToNextTier ?? 0;
  const activePanelHeading =
    activeTab === "quarters"
      ? {
          title: "Квартальная аналитика",
          subtitle: "Выбирайте год, переключайтесь между кварталами и выгружайте общую отчетность при необходимости.",
        }
      : activeTab === "ledger"
        ? {
            title: "Реестр сделок",
            subtitle: "Фильтруйте платежи, заказы и быстро выгружайте отчет по текущему диапазону.",
          }
        : {
            title: "Оперативный обзор",
            subtitle: "Фильтры, поиск и экспорт доступны сразу, а ключевые метрики и динамика идут ниже.",
          };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="dashboard-title">Финансы</h2>
        <p className="dashboard-subtitle">
          Оперативный обзор, квартальная программа комиссии и реестр сделок в привычной стилистике кабинета.
        </p>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--5">
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Заработано</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.earned ?? 0)}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">К выплате</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.payable ?? 0)}</div>
        </div>
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Оборот</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.gross ?? 0)}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">Комиссия</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.commissions ?? 0)}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Возвраты и отмены</div>
          <div className="dashboard-stat__value finance-stat-value">{formatCurrency(summary?.refundedCancelled ?? 0)}</div>
        </div>
      </div>

      <section className="dashboard-card finance-panel">
        <div className="finance-panel__header">
          <div>
            <h3>{activePanelHeading.title}</h3>
            <p>{activePanelHeading.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="btn-primary flex items-center justify-center gap-2 px-4 py-2 text-sm"
            disabled={!analytics || isReportLoading}
          >
            <Download className="h-4 w-4" />
            Финансовый отчет XLSX
          </button>
        </div>

        <div className="dashboard-toolbar finance-toolbar">
          <input className="dashboard-select" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input className="dashboard-select" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <select
            className="dashboard-select"
            value={transactionStatus}
            onChange={(event) => setTransactionStatus(event.target.value as FinanceTransactionStatus)}
          >
            {TRANSACTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="dashboard-select" value={orderStatus} onChange={(event) => setOrderStatus(event.target.value as FinanceOrderStatus)}>
            {ORDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select className="dashboard-select" value={groupBy} onChange={(event) => setGroupBy(event.target.value as FinanceGroupBy)}>
            <option value="day">По дням</option>
            <option value="week">По неделям</option>
            <option value="month">По месяцам</option>
          </select>
          <div className="dashboard-search finance-toolbar__search">
            <Search className="dashboard-search__icon" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Товар, заказ, покупатель"
              className="dashboard-search__input"
            />
          </div>
        </div>
      </section>

      <div className="finance-tabs">
        <FinanceTabButton
          active={activeTab === "overview"}
          label="Обзор"
          subtitle="Текущая выручка, выплаты и статусы"
          onClick={() => setActiveTab("overview")}
        />
        <FinanceTabButton
          active={activeTab === "quarters"}
          label="Кварталы"
          subtitle="Уровни комиссии и история по годам"
          onClick={() => setActiveTab("quarters")}
        />
        <FinanceTabButton
          active={activeTab === "ledger"}
          label="Реестр"
          subtitle="Фильтры, поиск и выгрузка сделок"
          onClick={() => setActiveTab("ledger")}
        />
      </div>

      {activeTab === "overview" ? (
        <div className="space-y-4">
          <section className="dashboard-card finance-panel">
            <div className="finance-panel__header">
              <div>
                <h3>Динамика оборота</h3>
                <p>{summary?.transactions ?? 0} операций · средний чек {formatCurrency(summary?.avgCheck ?? 0)}</p>
              </div>
              <strong>{formatNumber(summary?.successRate ?? 0)}%</strong>
            </div>
            <LineChart points={analytics?.timeSeries ?? []} />
          </section>

          {overviewCommission ? (
            <section className="dashboard-card finance-panel">
              <div className="finance-panel__header">
                <div>
                  <h3>Текущая программа комиссии</h3>
                  <p>
                    {overviewCommission.periodLabel} · payout profile {formatPayoutStatus(overviewCommission.payoutProfileStatus).toLowerCase()}
                  </p>
                </div>
                <strong>{overviewCommission.currentTier.rate.toFixed(1)}%</strong>
              </div>

              <div className="space-y-3">
                <FinanceMetricCard
                  label="Текущий уровень"
                  value={overviewCommission.currentTier.name}
                  note={`Оборот квартала ${formatCurrency(overviewCommission.qualifiedGmv)} · ${overviewCommission.completedOrders} завершенных сделок`}
                  tone="neutral"
                />
                <FinanceMetricCard
                  label="До следующего уровня"
                  value={overviewCommission.nextTier ? formatCurrency(overviewCommission.salesToNextTier) : "Максимум"}
                  note={
                    overviewCommission.nextTier
                      ? `${overviewCommission.nextTier.name} · ставка ${overviewCommission.nextTier.rate.toFixed(1)}%`
                      : "Вы уже на максимальном уровне комиссии"
                  }
                  tone="info"
                />
                <div className="dashboard-card finance-progress-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-slate-700">
                    <span>Прогресс до следующего уровня</span>
                    <span>{Math.round(overviewCommission.progress.percentToNextTier)}%</span>
                  </div>
                  <div className="finance-progress-card__track">
                    <div
                      className="finance-progress-card__bar"
                      style={{ width: `${overviewCommission.progress.percentToNextTier}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <span>От {formatCurrency(overviewCommission.progress.currentFloor)}</span>
                    <span>
                      {overviewCommission.progress.nextFloor
                        ? `До ${formatCurrency(overviewCommission.progress.nextFloor)}`
                        : "Верхний уровень достигнут"}
                    </span>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="dashboard-card finance-panel">
            <div className="finance-panel__header">
              <div>
                <h3>Состояние выплат</h3>
                <p>Текущий статус денежных потоков по сделкам продавца</p>
              </div>
            </div>
            <SettlementBucketRows items={analytics?.settlementBuckets ?? []} />
          </section>

          <section className="dashboard-card finance-panel">
            <div className="finance-panel__header">
              <div>
                <h3>Статусы заказов</h3>
                <p>
                  Всего {summary?.ordersTotal ?? 0} · активные {summary?.activeOrders ?? 0} · завершены {summary?.completedOrders ?? 0}
                </p>
              </div>
            </div>
            <BreakdownBars items={analytics?.orderStatusBreakdown ?? []} />
          </section>

          <section className="dashboard-card finance-panel">
            <div className="finance-panel__header">
              <div>
                <h3>Статусы платежей</h3>
                <p>Что происходит с деньгами в текущем диапазоне</p>
              </div>
            </div>
            <BreakdownBars items={analytics?.transactionStatusBreakdown ?? []} />
          </section>
        </div>
      ) : null}

      {activeTab === "quarters" ? (
        <div className="space-y-4">
          <div className="dashboard-toolbar grid gap-3">
            <select
              className="dashboard-select"
              value={selectedYear}
              onChange={(event) => {
                setSelectedQuarterKey("");
                setSelectedYear(Number(event.target.value));
              }}
            >
              {(quarterAnalytics?.availableYears ?? [selectedYear]).map((year) => (
                <option key={year} value={year}>
                  {year} год
                </option>
              ))}
            </select>
          </div>

          {isQuarterLoading && !quarterAnalytics ? <div className="dashboard-empty">Загрузка квартальной аналитики...</div> : null}

          {quarterAnalytics && quarterProgram ? (
            <>
              <QuarterSelectionGrid
                selectedQuarterKey={quarterAnalytics.selectedQuarterKey}
                quarterSummaries={quarterAnalytics.quarterSummaries}
                onSelect={(quarterKey) => setSelectedQuarterKey(quarterKey)}
              />

              <section className="dashboard-card finance-panel">
                <div className="finance-panel__header">
                  <div>
                    <h3>{selectedQuarterSummary?.periodLabel ?? quarterProgram.periodLabel}</h3>
                    <p>Выбранный квартал и текущая ступень комиссии</p>
                  </div>
                  <strong>{quarterProgram.currentTier.rate.toFixed(1)}%</strong>
                </div>

                <div className="space-y-3">
                  <FinanceMetricCard
                    label="Текущий уровень"
                    value={quarterProgram.currentTier.name}
                    note={`Сделок ${selectedQuarterSummary?.completedOrders ?? 0} · оборот ${formatCurrency(selectedQuarterSummary?.gross ?? 0)}`}
                    tone="neutral"
                  />
                  <FinanceMetricCard
                    label="Прибыль продавца"
                    value={formatCurrency(selectedQuarterSummary?.sellerProfit ?? 0)}
                    note={`Комиссия ${formatCurrency(selectedQuarterSummary?.commission ?? 0)} · к выплате ${formatCurrency(selectedQuarterSummary?.payable ?? 0)}`}
                    tone="ok"
                  />
                  <div className="dashboard-card finance-progress-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-slate-700">
                      <span>Прогресс до следующего уровня</span>
                      <span>{Math.round(selectedQuarterProgress)}%</span>
                    </div>
                    <div className="finance-progress-card__track">
                      <div
                        className="finance-progress-card__bar"
                        style={{ width: `${selectedQuarterProgress}%` }}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                      <span>Старт {formatCurrency(quarterProgram.progress.currentFloor)}</span>
                      <span>
                        {quarterProgram.progress.nextFloor
                          ? `Порог ${formatCurrency(quarterProgram.progress.nextFloor)}`
                          : "Порогов выше нет"}
                      </span>
                    </div>
                  </div>
                  <FinanceMetricCard
                    label="Payout profile"
                    value={formatPayoutStatus(quarterProgram.payoutProfileStatus)}
                    note={`Обновлен ${formatDateTime(quarterProgram.payoutProfileUpdatedAt)} · новый пересчет ${formatShortDate(quarterProgram.resetsAt)}`}
                    tone="info"
                  />
                </div>
              </section>

              <CommissionTierTable program={quarterProgram} selectedSales={quarterProgram.qualifiedGmv} />
            </>
          ) : null}
        </div>
      ) : null}

      {activeTab === "ledger" ? (
        <div className="space-y-4">
          <section className="dashboard-card finance-panel">
            <div className="finance-panel__header">
              <div>
                <h3>Лента операций</h3>
                <p>
                  Загружено {analytics?.reportRows.length ?? 0} из {analytics?.reportMeta.total ?? 0}
                </p>
              </div>
            </div>

            <div className="finance-table finance-report-scroll" onScroll={handleReportScroll}>
              {(analytics?.reportRows ?? []).map((row) => (
                <div key={row.id} className="finance-table__row finance-table__row--dense">
                  <div className="finance-table__main">
                    <strong>{row.listingTitle}</strong>
                    <span>
                      {row.id} · заказ {row.orderId} · {new Date(row.createdAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <div className="finance-table__status">
                    <span>{row.transactionStatus}</span>
                    <span>{row.orderStatus}</span>
                  </div>
                  <div className="finance-table__money">
                    <strong>{formatCurrency(row.sellerPayout)}</strong>
                    <span>оборот {formatCurrency(row.amount)} · комиссия {formatCurrency(row.commission)}</span>
                  </div>
                </div>
              ))}
              {analytics && analytics.reportRows.length === 0 ? <div className="dashboard-empty">Операции по текущим фильтрам не найдены</div> : null}
              {isLoading ? <div className="dashboard-empty">Загрузка финансов...</div> : null}
              {isReportLoading ? <div className="dashboard-empty">Догружаем сделки...</div> : null}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
