import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Clock,
  ExternalLink,
  Info,
  Loader2,
  PackageOpen,
  Search,
  Truck,
  XCircle,
} from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";
import { matchesSearch } from "../../lib/search";
import { ConfirmDialog, ToastViewport, type AppNotice } from "../ui/feedback";

type OrderStatus =
  | "CREATED"
  | "PAID"
  | "PROCESSING"
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
  tracking_provider: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  delivery_ext_status: string | null;
  delivery_address: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
};

type StatusMeta = {
  label: string;
  color: string;
  icon: typeof Clock;
};

const FILTER_STATUSES: OrderStatus[] = [
  "CREATED",
  "PREPARED",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
];

const STATUS_META: Record<OrderStatus, StatusMeta> = {
  CREATED: { label: "Создан", color: "bg-gray-100 text-gray-700", icon: Clock },
  PAID: { label: "Создан", color: "bg-gray-100 text-gray-700", icon: Clock },
  PROCESSING: { label: "В обработке", color: "bg-blue-100 text-blue-700", icon: Clock },
  PREPARED: { label: "Подготовлен", color: "bg-yellow-100 text-yellow-700", icon: PackageOpen },
  SHIPPED: { label: "Отправлен", color: "bg-indigo-100 text-indigo-700", icon: Truck },
  DELIVERED: { label: "Доставлен", color: "bg-green-100 text-green-700", icon: CheckCircle },
  COMPLETED: { label: "Выдан", color: "bg-green-100 text-green-700", icon: CheckCircle },
  CANCELLED: { label: "Отменён", color: "bg-red-100 text-red-700", icon: XCircle },
};

function getStatusMeta(status: OrderStatus): StatusMeta {
  return STATUS_META[status] ?? STATUS_META.CREATED;
}

function canMarkPrepared(order: PartnerOrder): boolean {
  return order.status === "CREATED" || order.status === "PAID";
}

function formatExternalDeliveryStatus(value: string | null): string {
  if (!value) return "Оформлено, ожидает передачу в ПВЗ";

  const key = value.trim().toUpperCase();
  const labels: Record<string, string> = {
    DRAFT: "Черновик",
    VALIDATING: "Проверка заявки",
    VALIDATING_ERROR: "Ошибка проверки заявки",
    CREATED: "Оформлено, ожидает передачу в ПВЗ",
    DELIVERY_PROCESSING_STARTED: "Заявка обрабатывается",
    DELIVERY_TRACK_RECIEVED: "Трек сформирован",
    SORTING_CENTER_PROCESSING_STARTED: "В сортировочном центре",
    SORTING_CENTER_TRACK_RECEIVED: "Обработано сортировочным центром",
    SORTING_CENTER_TRACK_LOADED: "Подготовлено к отгрузке",
    DELIVERY_LOADED: "Добавлено в отгрузку",
    SORTING_CENTER_LOADED: "Подтверждено сортировочным центром",
    SORTING_CENTER_AT_START: "Принято в точке отправки",
    SORTING_CENTER_PREPARED: "Готово к передаче в доставку",
    SORTING_CENTER_TRANSMITTED: "В пути до города получателя",
    DELIVERY_AT_START: "В городе получателя",
    DELIVERY_AT_START_SORT: "Сортировка в городе получателя",
    DELIVERY_TRANSPORTATION: "В пути до ПВЗ",
    DELIVERY_TRANSPORTATION_RECIPIENT: "В пути до получателя",
    DELIVERY_ARRIVED_PICKUP_POINT: "Доставлен в ПВЗ",
    DELIVERY_STORAGE_PERIOD_EXTENDED: "Срок хранения продлен",
    DELIVERY_STORAGE_PERIOD_EXPIRED: "Срок хранения истек",
    CONFIRMATION_CODE_RECEIVED: "Код подтверждения получен",
    DELIVERY_TRANSMITTED_TO_RECIPIENT: "Выдан получателю",
    DELIVERY_DELIVERED: "Доставка завершена",
    FINISHED: "Подтверждено",
    CANCELLED: "Отменено",
  };

  return labels[key] ?? value;
}

function stripPickupPointTag(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s*\[PICKUP_ID:[^\]]+\]\s*/giu, "").trim();
}

function formatPickupPointLabel(order: PartnerOrder): string {
  const cleanAddress = stripPickupPointTag(order.delivery_address);
  if (cleanAddress) return cleanAddress;
  if (order.tracking_provider === "russian_post") return "Отделение Почты России";
  if (order.tracking_provider === "yandex_pvz") return "ПВЗ Яндекса";
  return "Пункт выдачи уточняется";
}

export function PartnerOrdersPage() {
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [preparingOrderId, setPreparingOrderId] = useState<string | null>(null);
  const [prepareDialogOrderId, setPrepareDialogOrderId] = useState<string | null>(null);
  const [notices, setNotices] = useState<AppNotice[]>([]);

  const showNotice = useCallback((message: string, tone: AppNotice["tone"] = "info") => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotices((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setNotices((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const closeNotice = useCallback((id: number) => {
    setNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const loadOrders = useCallback(
    async (silent = false) => {
      if (!silent) {
        setIsLoading(true);
      }
      try {
        const result = await apiGet<PartnerOrder[]>("/partner/orders");
        setOrders(result);
      } catch (error) {
        showNotice(
          error instanceof Error ? error.message : "Не удалось загрузить заказы",
          "error",
        );
      } finally {
        if (!silent) {
          setIsLoading(false);
        }
      }
    },
    [showNotice],
  );

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadOrders(true);
    }, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loadOrders]);

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

  const confirmPrepared = async () => {
    if (!prepareDialogOrderId) return;

    const target = orders.find((order) => order.id === prepareDialogOrderId);
    if (!target || !canMarkPrepared(target)) {
      setPrepareDialogOrderId(null);
      return;
    }

    setPreparingOrderId(target.id);
    try {
      await apiPatch<{ success: boolean }>(`/partner/orders/${target.id}/status`, {
        status: "PREPARED",
      });
      showNotice(`Заказ ${target.id} отмечен как подготовленный`, "success");
      await loadOrders(true);
    } catch (error) {
      showNotice(
        error instanceof Error ? error.message : "Не удалось изменить статус заказа",
        "error",
      );
    } finally {
      setPreparingOrderId(null);
      setPrepareDialogOrderId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <ToastViewport notices={notices} onClose={closeNotice} />
      <ConfirmDialog
        open={Boolean(prepareDialogOrderId)}
        title="Подтвердите готовность заказа"
        description="После подтверждения заказ перейдёт в статус «Подготовлен». Отменить это действие нельзя."
        confirmLabel="Подтвердить"
        confirmPhrase="ПОДГОТОВЛЕН"
        confirmHint="Введите «ПОДГОТОВЛЕН», чтобы защититься от случайного нажатия."
        isBusy={Boolean(preparingOrderId)}
        onCancel={() => setPrepareDialogOrderId(null)}
        onConfirm={() => void confirmPrepared()}
      />

      <div>
        <h2 className="dashboard-title">Заказы</h2>
        <p className="dashboard-subtitle">Отслеживайте статусы и обновляйте этап подготовки и отправки</p>
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
            {FILTER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getStatusMeta(status).label}
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
            const statusMeta = getStatusMeta(order.status);
            const StatusIcon = statusMeta.icon;
            const preparedButtonDisabled =
              order.status === "PREPARED" || !canMarkPrepared(order) || preparingOrderId === order.id;
            const preparedButtonHint =
              order.status === "PREPARED"
                ? "Статус уже применён, его нельзя вернуть."
                : !canMarkPrepared(order)
                  ? "После отправки статус подготовки изменить нельзя."
                  : "";

            return (
              <article key={order.id} className="dashboard-card">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{order.id}</div>
                    <div className="text-sm text-gray-600">Покупатель: {order.buyer_name}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleString("ru-RU")} • ПВЗ
                    </div>
                    <div className="mt-1 text-sm text-gray-700 break-words">
                      {order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 sm:items-end">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusMeta.color}`}>
                      <StatusIcon className="w-3 h-3" /> {statusMeta.label}
                    </span>
                    <div className="text-left font-semibold whitespace-nowrap sm:text-right">
                      {order.total_price.toLocaleString("ru-RU")}&nbsp;₽
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <section className="rounded-xl border border-slate-200 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Подготовка заказа
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrepareDialogOrderId(order.id)}
                        disabled={preparedButtonDisabled}
                        className={
                          preparedButtonDisabled
                            ? "inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-500"
                            : "btn-primary w-full px-4 py-2 text-sm"
                        }
                      >
                        {preparingOrderId === order.id ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Подготовлен
                          </span>
                        ) : (
                          "Подготовлен"
                        )}
                      </button>
                      {preparedButtonDisabled && preparedButtonHint && (
                        <span
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500"
                          title={preparedButtonHint}
                          aria-label={preparedButtonHint}
                        >
                          <Info className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-slate-200 p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Трек-номер доставки
                    </div>
                    {order.delivery_type === "pickup" ? (
                      <p className="mt-2 text-sm text-slate-600">
                        Для самовывоза трек-номер не требуется.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2 text-sm">
                        {order.tracking_number ? (
                          <p className="text-slate-700">
                            Текущий трек: <span className="font-medium">{order.tracking_number}</span>
                          </p>
                        ) : (
                          <p className="text-slate-600">
                            Трек-номер формируется автоматически после подтверждения оплаты.
                          </p>
                        )}

                        <p className="text-slate-600">
                          Пункт выдачи:{" "}
                          <span className="font-medium text-slate-700">
                            {formatPickupPointLabel(order)}
                          </span>
                        </p>
                        {order.delivery_ext_status && (
                          <p className="text-slate-600">
                            Статус логистики:{" "}
                            <span className="font-medium text-slate-700">
                              {formatExternalDeliveryStatus(order.delivery_ext_status)}
                            </span>
                          </p>
                        )}

                        {order.tracking_url && (
                          <a
                            href={order.tracking_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-800"
                          >
                            Отследить
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                  </section>
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
