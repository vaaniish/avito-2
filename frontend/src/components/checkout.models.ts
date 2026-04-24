export type PaymentMethod = "card" | "sbp";
export type PaymentStatusSummary = "pending" | "paid" | "failed";
export type OrderStatusValue =
  | "CREATED"
  | "PAID"
  | "PROCESSING"
  | "PREPARED"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";
export type TransactionStatusValue =
  | "PENDING"
  | "HELD"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED";
export type PaymentProviderValue = "YOOMONEY" | "STRIPE" | "OTHER";
export type YooKassaPaymentStatus =
  | "pending"
  | "waiting_for_capture"
  | "succeeded"
  | "canceled"
  | (string & {});

export type CreateOrdersResponse = {
  success: boolean;
  orders: Array<{
    order_id: string;
    total_price: number;
  }>;
  total: number;
  payment: {
    provider: "yoomoney";
    paymentId: string | null;
    status: YooKassaPaymentStatus | null;
    confirmationUrl: string | null;
  };
};

export type PaymentStatusResponse = {
  summary: PaymentStatusSummary;
  orders: Array<{
    orderId: string;
    orderStatus: OrderStatusValue;
    paymentStatus: TransactionStatusValue | null;
    paymentProvider: PaymentProviderValue | null;
    paymentIntentId: string | null;
  }>;
};

export type ActivePayment = {
  orderIds: string[];
  total: number;
  deliveryType: "delivery" | "pickup";
  paymentMethod: PaymentMethod;
  confirmationUrl: string;
  expiresAt: number;
  summary: PaymentStatusSummary;
};

export type DeliveryProvider = {
  code: "yandex_pvz" | "russian_post" | "cdek";
  label: string;
};

export type DeliveryPoint = {
  id: string;
  provider: DeliveryProvider["code"];
  providerLabel: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  workHours: string;
  etaDays: number;
  cost: number;
};

export type DeliveryPointsResponse = {
  city: string;
  location: {
    label: string;
    lat: number;
    lng: number;
  };
  providers: DeliveryProvider[];
  activeProvider: DeliveryProvider["code"];
  points: DeliveryPoint[];
  pagination: {
    total: number;
    cursor: number;
    nextCursor: number | null;
    hasMore: boolean;
  } | null;
};

export const DELIVERY_PICKUP_PROVIDER: DeliveryProvider["code"] = "yandex_pvz";
export const DEFAULT_DELIVERY_CITY = "Россия, Москва";
export const YANDEX_GEOSUGGEST_API_KEY =
  import.meta.env.VITE_YANDEX_GEOSUGGEST_API_KEY?.toString().trim() ?? "";
export const RUSSIA_BOUNDS: number[][] = [
  [41.185, 19.6389],
  [81.8587, 180],
];
export const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;
export const SBP_UI_ENABLED = false;
export const PAYMENT_RETURN_EVENT_KEY = "ecomm_payment_returned";
export const PAYMENT_RETURN_CHANNEL = "ecomm-payment-channel";
export const DELIVERY_PROVIDER_TABS: Array<{
  code: DeliveryProvider["code"];
  label: string;
  enabled: boolean;
}> = [
  { code: "yandex_pvz", label: "Яндекс ПВЗ", enabled: true },
  { code: "russian_post", label: "Почта России", enabled: true },
  { code: "cdek", label: "СДЭК", enabled: false },
];

export type PaymentStatusMeta = {
  className: string;
  title: string;
  description: string;
};

export function getPaymentStatusMeta(
  summary: PaymentStatusSummary,
): PaymentStatusMeta {
  if (summary === "paid") {
    return {
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      title: "Оплата подтверждена",
      description: "Спасибо за оплату. Перенаправляем на страницу заказа...",
    };
  }
  if (summary === "failed") {
    return {
      className: "border-rose-200 bg-rose-50 text-rose-800",
      title: "Ожидаем оплату",
      description: "Платёж не завершён. Можно повторно открыть страницу оплаты.",
    };
  }
  return {
    className: "border-amber-200 bg-amber-50 text-amber-800",
    title: "Ожидаем оплату",
    description: "Статус обновляется автоматически. Заказ ожидает оплату.",
  };
}

export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
