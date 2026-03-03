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
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold mb-1 md:mb-2">Сделки</h1>
          <p className="text-xs md:text-sm lg:text-base text-gray-600">
            Учёт сделок между продавцами и покупателями и комиссии платформы
          </p>
        </div>
        <button className="flex items-center justify-center gap-2 px-4 md:px-6 py-2 md:py-3 bg-[rgb(38,83,141)] text-white rounded-lg md:rounded-xl hover:bg-[rgb(28,63,111)] transition-all text-sm md:text-base whitespace-nowrap">
          <Download className="w-4 h-4 md:w-5 md:h-5" /> Экспорт
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
        <div className="p-3 md:p-4 bg-white rounded-xl border-2 border-gray-200">
          <div className="text-xs md:text-sm text-gray-600 mb-1">Всего</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="p-3 md:p-4 bg-yellow-50 rounded-xl border-2 border-yellow-200">
          <div className="text-xs md:text-sm text-yellow-700 mb-1">На удержании</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-yellow-700">{stats.held}</div>
        </div>
        <div className="p-3 md:p-4 bg-green-50 rounded-xl border-2 border-green-200">
          <div className="text-xs md:text-sm text-green-700 mb-1">Успешные</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-green-700">{stats.success}</div>
        </div>
        <div className="p-3 md:p-4 bg-red-50 rounded-xl border-2 border-red-200">
          <div className="text-xs md:text-sm text-red-700 mb-1">Отмененные</div>
          <div className="text-lg md:text-xl lg:text-2xl font-bold text-red-700">{stats.cancelled}</div>
        </div>
      </div>

      <div className="p-3 md:p-4 lg:p-6 bg-white rounded-xl md:rounded-2xl border-2 border-gray-200">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="relative">
            <Search className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по ID, покупателю, продавцу..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full pl-9 md:pl-12 pr-3 md:pr-4 py-2 md:py-3 rounded-xl border border-gray-300"
            />
          </div>

          <div className="flex gap-1.5 md:gap-2 overflow-x-auto">
            {[
              { value: "all", label: "Все" },
              { value: "held", label: "На удержании" },
              { value: "success", label: "Успешные" },
              { value: "cancelled", label: "Отменённые" },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value as TransactionStatus)}
                className={`px-2.5 md:px-3 lg:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl font-medium transition-all whitespace-nowrap text-xs md:text-sm ${
                  statusFilter === option.value
                    ? "bg-[rgb(38,83,141)] text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
          <div key={transaction.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
              <div>
                <div className="text-sm font-semibold">{transaction.id}</div>
                <div className="text-xs text-gray-500">Заказ: {transaction.orderId}</div>
                <div className="text-sm text-gray-700 mt-1">{transaction.listingTitle}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Покупатель: {transaction.buyerName} • Продавец: {transaction.sellerName}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {getStatusBadge(transaction.status)}
                <div className="text-right">
                  <div className="text-sm font-semibold">{formatCurrency(transaction.amount)}</div>
                  <div className="text-xs text-gray-500">Комиссия {formatCurrency(transaction.commission)} ({transaction.commissionRate}%)</div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {filteredTransactions.length === 0 && <div className="text-sm text-gray-500">Сделки не найдены</div>}
      </div>
    </div>
  );
}
