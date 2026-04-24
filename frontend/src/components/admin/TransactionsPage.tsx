import { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { apiGet } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import { notifyError } from "../ui/notifications";
import type {
  OrderStatusValue,
  PaymentProviderValue,
  TransactionStatusValue,
} from "../checkout.models";

type AdminOrderStatus = Lowercase<OrderStatusValue>;
type AdminPaymentProvider = Lowercase<PaymentProviderValue>;
type AdminTransactionStatus = Lowercase<TransactionStatusValue>;

type TransactionStatus =
  | "all"
  | AdminTransactionStatus;

type Transaction = {
  id: string;
  orderId: string;
  orderStatus: AdminOrderStatus;
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
  deliveryType: "delivery" | "pickup";
  deliveryAddress: string | null;
  amount: number;
  commission: number;
  commissionRate: number;
  sellerPayout: number;
  status: AdminTransactionStatus;
  paymentProvider: AdminPaymentProvider;
  paymentIntentId: string;
  createdAt: string;
};

function csvEscape(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus>("all");
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const loadTransactions = async () => {
    try {
      const result = await apiGet<Transaction[]>("/admin/transactions");
      setTransactions(result);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить сделки");
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, []);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const matchesText = matchesSearch(transaction, searchQuery);
        const matchesStatus =
          statusFilter === "all" || transaction.status === statusFilter;
        return matchesText && matchesStatus;
      }),
    [searchQuery, statusFilter, transactions],
  );

  const stats = {
    total: transactions.length,
    held: transactions.filter((item) => item.status === "held").length,
    success: transactions.filter((item) => item.status === "success").length,
    cancelled: transactions.filter((item) => item.status === "cancelled").length,
    volume: transactions.reduce((sum, item) => sum + item.amount, 0),
    commissions: transactions.reduce((sum, item) => sum + item.commission, 0),
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: "RUB",
      minimumFractionDigits: 0,
    }).format(amount);

  const getStatusBadge = (status: Transaction["status"]) => {
    const styles: Record<Transaction["status"], string> = {
      pending: "bg-slate-100 text-slate-700 border-slate-300",
      held: "bg-yellow-100 text-yellow-700 border-yellow-300",
      success: "bg-green-100 text-green-700 border-green-300",
      failed: "bg-red-100 text-red-700 border-red-300",
      cancelled: "bg-red-100 text-red-700 border-red-300",
      refunded: "bg-blue-100 text-blue-700 border-blue-300",
    };

    const labels: Record<Transaction["status"], string> = {
      pending: "Ожидает",
      held: "Удержание",
      success: "Успешно",
      failed: "Ошибка",
      cancelled: "Отменено",
      refunded: "Возврат",
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const handleExport = () => {
    const headers = [
      "ID транзакции",
      "ID заказа",
      "Статус транзакции",
      "Статус заказа",
      "Покупатель ID",
      "Покупатель",
      "Покупатель email",
      "Продавец ID",
      "Продавец",
      "Продавец email",
      "Объявление",
      "ID объявлений",
      "Количество позиций",
      "Общее количество единиц",
      "Тип доставки",
      "Адрес доставки",
      "Сумма",
      "Комиссия",
      "Ставка комиссии",
      "К выплате продавцу",
      "Платежный провайдер",
      "Payment intent",
      "Создано",
    ];

    const lines = filteredTransactions.map((item) =>
      [
        item.id,
        item.orderId,
        item.status,
        item.orderStatus,
        item.buyerId,
        item.buyerName,
        item.buyerEmail,
        item.sellerId,
        item.sellerName,
        item.sellerEmail,
        item.listingTitle,
        item.listingIds.join("|"),
        item.itemsCount,
        item.itemsTotalQuantity,
        item.deliveryType,
        item.deliveryAddress ?? "",
        item.amount,
        item.commission,
        item.commissionRate,
        item.sellerPayout,
        item.paymentProvider,
        item.paymentIntentId,
        new Date(item.createdAt).toLocaleString("ru-RU"),
      ]
        .map((value) => csvEscape(value))
        .join(","),
    );

    const csv = [headers.map((value) => csvEscape(value)).join(","), ...lines].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="dashboard-title">Сделки</h1>
          <p className="dashboard-subtitle">
            Финансовые операции с деталями по доставке, участникам и выплатам
          </p>
        </div>
        <button
          onClick={handleExport}
          className="btn-primary flex w-full items-center justify-center gap-2 px-4 py-2 text-sm md:px-6 md:py-3 md:text-base sm:w-auto whitespace-nowrap"
        >
          <Download className="w-4 h-4 md:w-5 md:h-5" /> Экспорт CSV
        </button>
      </div>

      <div className="dashboard-grid-stats dashboard-grid-stats--5">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--warn">
          <div className="dashboard-stat__label">На удержании</div>
          <div className="dashboard-stat__value">{stats.held}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Успешные</div>
          <div className="dashboard-stat__value">{stats.success}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Отмененные</div>
          <div className="dashboard-stat__value">{stats.cancelled}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">Оборот / Комиссии</div>
          <div className="dashboard-stat__value text-base md:text-lg">
            {formatCurrency(stats.volume)} / {formatCurrency(stats.commissions)}
          </div>
        </div>
      </div>

      <div className="dashboard-toolbar">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="dashboard-search">
            <Search className="dashboard-search__icon" />
            <input
              type="text"
              placeholder="Поиск по любому полю сделки"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="dashboard-search__input"
            />
          </div>

          <div className="dashboard-chip-row">
            {[
              { value: "all", label: "Все" },
              { value: "pending", label: "Ожидают" },
              { value: "held", label: "Удержание" },
              { value: "success", label: "Успешные" },
              { value: "failed", label: "Ошибки" },
              { value: "cancelled", label: "Отмененные" },
              { value: "refunded", label: "Возвраты" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value as TransactionStatus)}
                className={`dashboard-chip ${
                  statusFilter === option.value ? "dashboard-chip--active" : ""
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredTransactions.map((transaction) => (
          <div key={transaction.id} className="dashboard-card">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{transaction.id}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(transaction.createdAt).toLocaleString("ru-RU")}
                  </div>
                  <div className="text-sm text-gray-700 mt-1 break-words">{transaction.listingTitle}</div>
                </div>
                <div className="flex items-center gap-2">{getStatusBadge(transaction.status)}</div>
              </div>

              <div className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2 xl:grid-cols-4">
                <div className="break-words">
                  <div className="font-medium text-gray-800">Покупатель</div>
                  {transaction.buyerName} ({transaction.buyerId})<br />
                  {transaction.buyerEmail}
                </div>
                <div className="break-words">
                  <div className="font-medium text-gray-800">Продавец</div>
                  {transaction.sellerName} ({transaction.sellerId})<br />
                  {transaction.sellerEmail}
                </div>
                <div className="break-words">
                  <div className="font-medium text-gray-800">Доставка</div>
                  {transaction.deliveryType === "delivery" ? "Доставка" : "Самовывоз"}
                  <br />
                  {transaction.deliveryAddress ?? "—"}
                </div>
                <div className="break-words">
                  <div className="font-medium text-gray-800">Платеж</div>
                  {transaction.paymentProvider} · {transaction.orderStatus}
                  <br />
                  {transaction.paymentIntentId}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-3">
                <div className="text-xs text-gray-600">
                  Заказ: {transaction.orderId} · Позиций: {transaction.itemsCount} · Единиц:{" "}
                  {transaction.itemsTotalQuantity}
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{formatCurrency(transaction.amount)}</div>
                  <div className="text-xs text-gray-500">
                    Комиссия {formatCurrency(transaction.commission)} ({transaction.commissionRate}%)
                  </div>
                  <div className="text-xs text-gray-600">
                    К выплате: {formatCurrency(transaction.sellerPayout)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredTransactions.length === 0 && (
          <div className="dashboard-empty">Сделки не найдены</div>
        )}
      </div>
    </div>
  );
}
