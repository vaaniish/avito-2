import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, Clock, PackageOpen, Search, Truck, XCircle } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

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
      const query = searchQuery.toLowerCase();
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      const matchesSearch =
        order.buyer_name.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query) ||
        order.items.some((item) => item.name.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [orders, searchQuery, statusFilter]);

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
    <div>
      <h2 className="text-2xl md:text-3xl text-gray-900 mb-6">Заказы</h2>

      <div className="bg-white p-4 rounded-xl border border-gray-200 mb-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по покупателю, номеру или товару"
            className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "all")}
          className="px-3 py-2 border border-gray-300 rounded-lg"
        >
          <option value="all">Все статусы</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {getStatusLabel(status).label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Загрузка...</div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => {
            const status = getStatusLabel(order.status);
            const Icon = status.icon;

            return (
              <div key={order.id} className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">{order.id}</div>
                    <div className="text-sm text-gray-600">Покупатель: {order.buyer_name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleString("ru-RU")} • {order.delivery_type === "pickup" ? "Самовывоз" : "Доставка"}
                    </div>
                    <div className="text-sm text-gray-700 mt-1">
                      {order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${status.color}`}>
                      <Icon className="w-3 h-3" /> {status.label}
                    </span>
                    <div className="text-right font-semibold">{order.total_price.toLocaleString("ru-RU")} ₽</div>
                    <select
                      value={order.status}
                      onChange={(event) => void updateStatus(order.id, event.target.value as OrderStatus)}
                      className="px-2 py-1 border border-gray-300 rounded-lg text-sm"
                    >
                      {statusOptions.map((item) => (
                        <option key={item} value={item}>
                          {getStatusLabel(item).label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredOrders.length === 0 && <div className="text-sm text-gray-500">Заказы не найдены</div>}
        </div>
      )}
    </div>
  );
}
