import React, { useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { apiGet } from "../../lib/api";

type TransactionStatus = "all" | "held" | "success" | "cancelled";

type Transaction = {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  listingTitle: string;
  amount: number;
  commission: number;
  commissionRate: number;
  status: "held" | "success" | "cancelled";
  paymentProvider: string;
  createdAt: string;
};

export function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus>("all");
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const loadTransactions = async () => {
    try {
      const result = await apiGet<Transaction[]>("/admin/transactions");
      setTransactions(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить сделки");
    }
  };

  useEffect(() => {
    void loadTransactions();
  }, []);

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          transaction.id.toLowerCase().includes(query) ||
          transaction.buyerName.toLowerCase().includes(query) ||
          transaction.sellerName.toLowerCase().includes(query) ||
          transaction.listingTitle.toLowerCase().includes(query);

        const matchesStatus = statusFilter === "all" || transaction.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
    [searchQuery, statusFilter, transactions],
  );

  const stats = {
    total: transactions.length,
    held: transactions.filter((item) => item.status === "held").length,
    success: transactions.filter((item) => item.status === "success").length,
    cancelled: transactions.filter((item) => item.status === "cancelled").length,
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 0 }).format(amount);

  const getStatusBadge = (status: Transaction["status"]) => {
    const styles = {
      held: "bg-yellow-100 text-yellow-700 border-yellow-300",
      success: "bg-green-100 text-green-700 border-green-300",
      cancelled: "bg-red-100 text-red-700 border-red-300",
    };

    const labels = {
      held: "В процессе",
      success: "Успешна",
      cancelled: "Отменена",
    };

    return <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>{labels[status]}</span>;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="dashboard-title">Сделки</h1>
          <p className="dashboard-subtitle">
            Учёт сделок между продавцами и покупателями и комиссии платформы
          </p>
        </div>
        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-[rgb(38,83,141)] px-4 py-2 text-sm text-white transition-all hover:bg-[rgb(28,63,111)] md:rounded-xl md:px-6 md:py-3 md:text-base sm:w-auto whitespace-nowrap">
          <Download className="w-4 h-4 md:w-5 md:h-5" /> Экспорт
        </button>
      </div>

      <div className="dashboard-grid-stats">
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
      </div>

      <div className="dashboard-toolbar">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="dashboard-search">
            <Search className="dashboard-search__icon" />
            <input
              type="text"
              placeholder="Поиск по ID, покупателю, продавцу..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="dashboard-search__input"
            />
          </div>

          <div className="dashboard-chip-row">
            {[
              { value: "all", label: "Все" },
              { value: "held", label: "На удержании" },
              { value: "success", label: "Успешные" },
              { value: "cancelled", label: "Отменённые" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value as TransactionStatus)}
                className={`dashboard-chip ${
                  statusFilter === option.value
                    ? "dashboard-chip--active"
                    : ""
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
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
              <div>
                <div className="text-sm font-semibold">{transaction.id}</div>
                <div className="text-xs text-gray-500">Заказ: {transaction.orderId}</div>
                <div className="text-sm text-gray-700 mt-1">{transaction.listingTitle}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Покупатель: {transaction.buyerName} • Продавец: {transaction.sellerName}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                {getStatusBadge(transaction.status)}
                <div className="text-left sm:text-right">
                  <div className="text-sm font-semibold">{formatCurrency(transaction.amount)}</div>
                  <div className="text-xs text-gray-500">Комиссия {formatCurrency(transaction.commission)} ({transaction.commissionRate}%)</div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredTransactions.length === 0 && <div className="dashboard-empty">Сделки не найдены</div>}
      </div>
    </div>
  );
}
