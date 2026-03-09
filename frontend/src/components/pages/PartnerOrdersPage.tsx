import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, PackageOpen, Search, Truck, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { matchesSearch } from "../../lib/search";

type OrderStatus =
  | "CREATED"
  | "PAID"
  | "PREPARED"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

type PartnerOrder = {
  id: string;
  buyer_name: string;
  buyer_id: string;
  total_price: number;
  status: OrderStatus;
  delivery_type: "pickup" | "delivery";
  created_at: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
};

const statusOptions: OrderStatus[] = [
  "CREATED",
  "PAID",
  "PREPARED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

export function PartnerOrdersPage() {
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const result = await apiGet<PartnerOrder[]>("/partner/orders");
      setOrders(result);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось загрузить заказы");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOrders();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesQuery = matchesSearch(order, searchQuery);
      return matchesStatus && matchesQuery;
    });
  }, [orders, searchQuery, statusFilter]);

  const stats = useMemo(
    () => ({
      total: orders.length,
      active: orders.filter((item) => !["CANCELLED", "COMPLETED"].includes(item.status)).length,
      delivered: orders.filter((item) => ["DELIVERED", "COMPLETED"].includes(item.status)).length,
      cancelled: orders.filter((item) => item.status === "CANCELLED").length,
    }),
    [orders],
  );

  const getStatusLabel = (status: OrderStatus) => {
    const map = {
      CREATED: { label: "Создан", color: "bg-gray-100 text-gray-700", icon: Clock },
      PAID: { label: "Оплачен", color: "bg-blue-100 text-blue-700", icon: CheckCircle },
      PREPARED: { label: "Подготовлен", color: "bg-yellow-100 text-yellow-700", icon: PackageOpen },
      SHIPPED: { label: "Отправлен", color: "bg-purple-100 text-purple-700", icon: Truck },
      DELIVERED: { label: "Доставлен", color: "bg-green-100 text-green-700", icon: CheckCircle },
      COMPLETED: { label: "Завершён", color: "bg-green-100 text-green-700", icon: CheckCircle },
      CANCELLED: { label: "Отменён", color: "bg-red-100 text-red-700", icon: XCircle },
    };
    return map[status];
  };

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await apiPatch<{ success: boolean }>(`/partner/orders/${orderId}/status`, { status });
      await loadOrders();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось обновить статус");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h2 className="dashboard-title">Заказы</h2>
        <p className="dashboard-subtitle">Отслеживайте статус выполнения и обновляйте этапы</p>
      </div>

      <div className="dashboard-grid-stats">
        <div className="dashboard-stat">
          <div className="dashboard-stat__label">Всего</div>
          <div className="dashboard-stat__value">{stats.total}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--info">
          <div className="dashboard-stat__label">В работе</div>
          <div className="dashboard-stat__value">{stats.active}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--ok">
          <div className="dashboard-stat__label">Доставлено</div>
          <div className="dashboard-stat__value">{stats.delivered}</div>
        </div>
        <div className="dashboard-stat dashboard-stat--danger">
          <div className="dashboard-stat__label">Отменено</div>
          <div className="dashboard-stat__value">{stats.cancelled}</div>
        </div>
      </div>

      <div className="dashboard-toolbar space-y-3">
        <div className="dashboard-search">
          <Search className="dashboard-search__icon" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по покупателю, номеру или товару"
            className="dashboard-search__input"
          />
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "all")}
            className="dashboard-select"
          >
            <option value="all">Все статусы</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {getStatusLabel(status).label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const status = getStatusLabel(order.status);
            const Icon = status.icon;

            return (
              <article key={order.id} className="dashboard-card">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{order.id}</div>
                    <div className="text-sm text-gray-600">Покупатель: {order.buyer_name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleString("ru-RU")} • {order.delivery_type === "pickup" ? "Самовывоз" : "Доставка"}
                    </div>
                    <div className="mt-1 text-sm text-gray-700 break-words">
                      {order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                      <Icon className="w-3 h-3" /> {status.label}
                    </span>
                    <div className="text-left font-semibold sm:text-right">{order.total_price.toLocaleString("ru-RU")} ₽</div>
                    <select
                      value={order.status}
                      onChange={(event) => void updateStatus(order.id, event.target.value as OrderStatus)}
                      className="field-control py-1.5 text-sm sm:w-44"
                    >
                      {statusOptions.map((item) => (
                        <option key={item} value={item}>
                          {getStatusLabel(item).label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredOrders.length === 0 && <div className="dashboard-empty">Заказы не найдены</div>}
        </div>
      )}
    </div>
  );
}
