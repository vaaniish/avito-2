import React, { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, MapPin, QrCode, Search, X } from "lucide-react";
import type { CartItem, Product } from "../types";
import { apiGet, apiPost } from "../lib/api";
import { YandexMapMarker, YandexMapPicker } from "./YandexMapPicker";
import { notifyError, notifyInfo } from "./ui/notifications";

interface CheckoutPageProps {
  items: CartItem[];
  deliveryType: "delivery" | "pickup";
  onBack: () => void;
  onRemoveUnavailableItems?: (itemIds: string[]) => void;
  onOrderCreated?: (result: {
    orderIds: string[];
    total: number;
    deliveryType: "delivery" | "pickup";
  }) => void;
  onComplete: (result: {
    orderIds: string[];
    total: number;
    deliveryType: "delivery" | "pickup";
  }) => void;
}

type PaymentMethod = "card" | "sbp";
type PaymentStatusSummary = "pending" | "paid" | "failed";

type CreateOrdersResponse = {
  success: boolean;
  orders: Array<{
    order_id: string;
    total_price: number;
  }>;
  total: number;
  payment?: {
    provider: "yoomoney";
    paymentId: string | null;
    status: string | null;
    confirmationUrl: string | null;
  } | null;
};

type PaymentStatusResponse = {
  summary: PaymentStatusSummary;
  orders: Array<{
    orderId: string;
    orderStatus: string;
    paymentStatus: string | null;
    paymentProvider: string | null;
    paymentIntentId: string | null;
  }>;
};

type ActivePayment = {
  orderIds: string[];
  total: number;
  deliveryType: "delivery" | "pickup";
  paymentMethod: PaymentMethod;
  confirmationUrl: string;
  expiresAt: number;
  summary: PaymentStatusSummary;
};

type DeliveryProvider = {
  code: "yandex_pvz" | "russian_post" | "cdek";
  label: string;
};

type DeliveryPoint = {
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

type DeliveryPointsResponse = {
  city: string;
  location?: {
    label: string;
    lat: number;
    lng: number;
  };
  providers: DeliveryProvider[];
  activeProvider?: DeliveryProvider["code"];
  points: DeliveryPoint[];
  pagination?: {
    total: number;
    cursor: number;
    nextCursor: number | null;
    hasMore: boolean;
  } | null;
};

const DELIVERY_PICKUP_PROVIDER: DeliveryProvider["code"] = "yandex_pvz";
const DEFAULT_DELIVERY_CITY = "Россия, Москва";
const YANDEX_GEOSUGGEST_API_KEY =
  import.meta.env.VITE_YANDEX_GEOSUGGEST_API_KEY?.toString().trim() ?? "";
const RUSSIA_BOUNDS: number[][] = [
  [41.185, 19.6389],
  [81.8587, 180],
];
const PAYMENT_TIMEOUT_MS = 30 * 60 * 1000;
const SBP_UI_ENABLED = false;
const PAYMENT_RETURN_EVENT_KEY = "ecomm_payment_returned";
const PAYMENT_RETURN_CHANNEL = "ecomm-payment-channel";
const DELIVERY_PROVIDER_TABS: Array<{
  code: DeliveryProvider["code"];
  label: string;
  enabled: boolean;
}> = [
  { code: "yandex_pvz", label: "Яндекс ПВЗ", enabled: true },
  { code: "russian_post", label: "Почта России", enabled: true },
  { code: "cdek", label: "СДЭК", enabled: false },
];

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CheckoutPage({
  items,
  deliveryType,
  onBack,
  onRemoveUnavailableItems,
  onOrderCreated,
  onComplete,
}: CheckoutPageProps) {
  const [deliveryCity, setDeliveryCity] = useState("");
  const [mapCenterQuery, setMapCenterQuery] = useState<string | null>(null);
  const [deliveryProviders, setDeliveryProviders] = useState<DeliveryProvider[]>(
    DELIVERY_PROVIDER_TABS.filter((tab) => tab.enabled).map((tab) => ({
      code: tab.code,
      label: tab.label,
    })),
  );
  const [activeDeliveryProvider, setActiveDeliveryProvider] =
    useState<DeliveryProvider["code"]>(DELIVERY_PICKUP_PROVIDER);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isPointsLoading, setIsPointsLoading] = useState(false);
  const [isPointsLoadingMore, setIsPointsLoadingMore] = useState(false);
  const [russianPostNextCursor, setRussianPostNextCursor] = useState<number | null>(null);
  const [russianPostHasMore, setRussianPostHasMore] = useState(false);
  const [mapZoom, setMapZoom] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card");
  const [activePayment, setActivePayment] = useState<ActivePayment | null>(null);
  const [lockedSummary, setLockedSummary] = useState<{
    items: CartItem[];
    subtotal: number;
    shipping: number;
    total: number;
  } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [paymentStatusError, setPaymentStatusError] = useState<string | null>(null);

  const isPlacingOrderRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const paymentWindowRef = useRef<Window | null>(null);
  const deliverySearchInputRef = useRef<HTMLInputElement | null>(null);
  const nativeAddressSuggestViewRef = useRef<any>(null);
  const activeDeliveryProviderRef = useRef<DeliveryProvider["code"]>(
    DELIVERY_PICKUP_PROVIDER,
  );

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );
  const shipping = deliveryType === "delivery" ? 500 : 0;
  const total = subtotal + shipping;

  const selectedPoint = useMemo(
    () => deliveryPoints.find((point) => point.id === selectedPointId) ?? null,
    [deliveryPoints, selectedPointId],
  );

  const visibleDeliveryPoints = useMemo(
    () =>
      deliveryPoints.filter(
        (point) => point.provider === activeDeliveryProvider,
      ),
    [deliveryPoints, activeDeliveryProvider],
  );

  const mapMarkers = useMemo<YandexMapMarker[]>(
    () => {
      const byId = new Map<string, YandexMapMarker>();
      for (const point of visibleDeliveryPoints) {
        if (
          !Number.isFinite(point.lat) ||
          !Number.isFinite(point.lng) ||
          Math.abs(point.lat) > 90 ||
          Math.abs(point.lng) > 180
        ) {
          continue;
        }

        byId.set(point.id, {
          id: point.id,
          title: point.name,
          subtitle: `${point.providerLabel} - ${point.address}`,
          provider: point.provider,
          lat: point.lat,
          lng: point.lng,
        });
      }
      return Array.from(byId.values());
    },
    [visibleDeliveryPoints],
  );

  const canSelectDeliveryPoint = deliveryType !== "delivery" || Boolean(selectedPoint);
  const canCheckoutWithSelectedPoint =
    deliveryType !== "delivery" || Boolean(selectedPoint);
  const hasActivePayment = Boolean(activePayment);
  const paymentIsPaid = activePayment?.summary === "paid";
  const summaryItems = lockedSummary?.items ?? items;
  const summarySubtotal = lockedSummary?.subtotal ?? subtotal;
  const summaryShipping = lockedSummary?.shipping ?? shipping;
  const summaryTotal = lockedSummary?.total ?? total;

  useEffect(() => {
    activeDeliveryProviderRef.current = activeDeliveryProvider;
  }, [activeDeliveryProvider]);

  const loadDeliveryPoints = async (
    city: string,
    recenter = true,
    provider: DeliveryProvider["code"] | "all",
    options?: { cursor?: number; append?: boolean; silent?: boolean },
  ) => {
    if (deliveryType !== "delivery") return;
    const query = city.trim();
    if (!query) return;

    const cursor = Number(options?.cursor ?? 0);
    const append = Boolean(options?.append);
    const silent = Boolean(options?.silent);
    if (append || silent) {
      setIsPointsLoadingMore(true);
    } else {
      setIsPointsLoading(true);
    }
    try {
      const params = new URLSearchParams({
        city: query,
      });
      if (provider && provider !== "all") {
        params.set("provider", provider);
      }
      if (provider === "russian_post") {
        params.set("cursor", String(Math.max(0, cursor)));
        params.set("limit", "250");
      }
      const response = await apiGet<DeliveryPointsResponse>(
        `/profile/delivery-points?${params.toString()}`,
      );
      const nextCursor = response.pagination?.nextCursor ?? null;
      const hasMore = Boolean(response.pagination?.hasMore);
      if (append && provider === "russian_post") {
        setDeliveryPoints((prev) => {
          const byId = new Map(prev.map((point) => [point.id, point]));
          for (const point of response.points) {
            byId.set(point.id, point);
          }
          return Array.from(byId.values());
        });
      } else {
        setDeliveryPoints(response.points);
      }
      setDeliveryProviders(response.providers);
      setActiveDeliveryProvider(
        provider === "all"
          ? response.activeProvider ?? DELIVERY_PICKUP_PROVIDER
          : provider,
      );
      if (!append) {
        setSelectedPointId(null);
      }
      setDeliveryCity(query);
      if (provider === "russian_post") {
        setRussianPostNextCursor(nextCursor);
        setRussianPostHasMore(hasMore);
      } else {
        setRussianPostNextCursor(null);
        setRussianPostHasMore(false);
      }
      if (recenter) {
        setMapCenterQuery(query);
      }
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить точки выдачи",
      );
    } finally {
      if (append || silent) {
        setIsPointsLoadingMore(false);
      } else {
        setIsPointsLoading(false);
      }
    }
  };

  const applyLocationSearch = async (query: string) => {
    const value = query.trim();
    if (!value) return;
    setMapCenterQuery(value);
    await loadDeliveryPoints(value, true, activeDeliveryProvider);
  };

  useEffect(() => {
    if (deliveryType !== "delivery") return;
    void loadDeliveryPoints(
      deliveryCity.trim() || DEFAULT_DELIVERY_CITY,
      true,
      activeDeliveryProvider,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryType]);

  const openOrReusePaymentTab = (url: string) => {
    let paymentWindow = paymentWindowRef.current;
    if (!paymentWindow || paymentWindow.closed) {
      paymentWindow = window.open("", "_blank");
      if (!paymentWindow) {
        throw new Error(
          "Браузер заблокировал новую вкладку. Разрешите pop-up для сайта.",
        );
      }
      paymentWindowRef.current = paymentWindow;
      paymentWindow.opener = null;
    }
    paymentWindow.location.href = url;
    paymentWindow.focus();
  };

  useEffect(() => {
    if (deliveryType !== "delivery") return;

    let cancelled = false;
    let retryTimer = 0;

    const destroyNativeSuggest = () => {
      const current = nativeAddressSuggestViewRef.current;
      if (!current) return;
      try {
        current.destroy?.();
      } catch {
        // no-op
      }
      nativeAddressSuggestViewRef.current = null;
    };

    const initNativeSuggest = () => {
      if (cancelled || nativeAddressSuggestViewRef.current) return;

      const ymaps = (window as unknown as { ymaps?: any }).ymaps;
      const inputEl = deliverySearchInputRef.current;
      if (!ymaps?.SuggestView || !inputEl) {
        retryTimer = window.setTimeout(initNativeSuggest, 120);
        return;
      }

      try {
        const suggestProvider =
          YANDEX_GEOSUGGEST_API_KEY
            ? {
                suggest: (request: unknown, options?: { results?: number }) => {
                  const query = String(request ?? "").trim();
                  if (!query) {
                    return ymaps.vow.resolve([]);
                  }

                  const limitRaw = Number(options?.results ?? 8);
                  const limit =
                    Number.isFinite(limitRaw) && limitRaw > 0
                      ? Math.min(Math.floor(limitRaw), 10)
                      : 8;

                  const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
                  url.searchParams.set("apikey", YANDEX_GEOSUGGEST_API_KEY);
                  url.searchParams.set("text", query);
                  url.searchParams.set("lang", "ru_RU");
                  url.searchParams.set("results", String(limit));
                  url.searchParams.set("types", "biz,geo");
                  url.searchParams.set("attrs", "uri");
                  url.searchParams.set("print_address", "1");
                  url.searchParams.set("org_address_kind", "house");

                  return ymaps.vow.resolve(
                    fetch(url.toString(), { method: "GET" })
                      .then((response) =>
                        response.ok
                          ? response.json()
                          : Promise.resolve({ results: [] }),
                      )
                      .then((payload: unknown) => {
                        const rawResults =
                          payload &&
                          typeof payload === "object" &&
                          Array.isArray((payload as { results?: unknown[] }).results)
                            ? (payload as { results: unknown[] }).results
                            : [];

                        return rawResults
                          .map((entry) => {
                            if (!entry || typeof entry !== "object") return null;
                            const item = entry as {
                              title?: { text?: string };
                              subtitle?: { text?: string };
                              address?: { formatted_address?: string };
                              value?: string;
                              displayName?: string;
                            };
                            const title = String(item.title?.text ?? "").trim();
                            const subtitle = String(
                              item.subtitle?.text ??
                                item.address?.formatted_address ??
                                "",
                            ).trim();
                            const singleLine = [title, subtitle]
                              .filter(Boolean)
                              .join(", ")
                              .trim();
                            const value =
                              singleLine ||
                              String(item.value ?? item.displayName ?? "").trim();
                            if (!value) return null;
                            return {
                              value,
                              displayName: value,
                            };
                          })
                          .filter(
                            (item): item is { value: string; displayName: string } =>
                              Boolean(item),
                          );
                      })
                      .catch(() => []),
                  );
                },
              }
            : "yandex#map";

        const suggestView = new ymaps.SuggestView(inputEl, {
          provider: suggestProvider,
          results: 8,
          boundedBy: RUSSIA_BOUNDS,
          strictBounds: true,
        });

        suggestView.events?.add?.("select", (event: any) => {
          const item = event?.get?.("item");
          const selectedValue = String(item?.value ?? "").trim();
          if (!selectedValue) return;
          setDeliveryCity(selectedValue);
          setMapCenterQuery(selectedValue);
          void loadDeliveryPoints(
            selectedValue,
            true,
            activeDeliveryProviderRef.current,
          );
        });

        nativeAddressSuggestViewRef.current = suggestView;
      } catch {
        // no-op
      }
    };

    initNativeSuggest();

    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      destroyNativeSuggest();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryType]);

  useEffect(() => {
    if (!activePayment) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remain = Math.max(
        0,
        Math.floor((activePayment.expiresAt - Date.now()) / 1000),
      );
      setSecondsLeft(remain);
      if (remain === 0) {
        setActivePayment((prev) => {
          if (!prev || prev.summary !== "pending") return prev;
          return { ...prev, summary: "failed" };
        });
      }
    };

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [activePayment]);

  useEffect(() => {
    if (!activePayment || activePayment.summary !== "pending") {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const encodedOrderIds = encodeURIComponent(activePayment.orderIds.join(","));

    const poll = async () => {
      try {
        if (cancelled) return;
        const response = await apiGet<PaymentStatusResponse>(
          `/profile/orders/payment-status?orderIds=${encodedOrderIds}`,
        );
        if (cancelled) return;
        setPaymentStatusError(null);
        setActivePayment((prev) => (prev ? { ...prev, summary: response.summary } : prev));

        if (response.summary === "paid" && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete({
            orderIds: activePayment.orderIds,
            total: activePayment.total,
            deliveryType: activePayment.deliveryType,
          });
          return;
        }
      } catch (error) {
        if (cancelled) return;
        setPaymentStatusError(
          error instanceof Error
            ? error.message
            : "Не удалось обновить статус оплаты",
        );
      } finally {}

      if (!cancelled) {
        timer = setTimeout(() => {
          void poll();
        }, 4000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activePayment, onComplete]);

  useEffect(() => {
    if (!activePayment || activePayment.summary !== "pending") {
      return;
    }

    let cancelled = false;
    let channel: BroadcastChannel | null = null;
    const encodedOrderIds = encodeURIComponent(activePayment.orderIds.join(","));

    const refreshPaymentStatusNow = async () => {
      try {
        const response = await apiGet<PaymentStatusResponse>(
          `/profile/orders/payment-status?orderIds=${encodedOrderIds}`,
        );
        if (cancelled) return;

        setPaymentStatusError(null);
        setActivePayment((prev) => (prev ? { ...prev, summary: response.summary } : prev));

        if (response.summary === "paid" && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          onComplete({
            orderIds: activePayment.orderIds,
            total: activePayment.total,
            deliveryType: activePayment.deliveryType,
          });
        }
      } catch (error) {
        if (cancelled) return;
        setPaymentStatusError(
          error instanceof Error ? error.message : "Не удалось обновить статус оплаты",
        );
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== PAYMENT_RETURN_EVENT_KEY) return;
      void refreshPaymentStatusNow();
    };

    window.addEventListener("storage", onStorage);

    try {
      channel = new BroadcastChannel(PAYMENT_RETURN_CHANNEL);
      channel.onmessage = (event) => {
        if (event.data?.type === "payment_returned") {
          void refreshPaymentStatusNow();
        }
      };
    } catch {
      channel = null;
    }

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [activePayment, onComplete]);

  const handleOpenPayment = () => {
    if (!activePayment?.confirmationUrl) {
      notifyError("Ссылка на оплату не найдена");
      return;
    }
    try {
      openOrReusePaymentTab(activePayment.confirmationUrl);
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Не удалось открыть страницу оплаты",
      );
    }
  };

  const handlePlaceOrder = async () => {
    if (isPlacingOrderRef.current || hasActivePayment) {
      return;
    }

    if (paymentMethod === "sbp" && !SBP_UI_ENABLED) {
      notifyInfo("СБП пока недоступна в текущем тестовом контуре. Используйте оплату картой.");
      return;
    }

    if (!canSelectDeliveryPoint) {
      notifyInfo(
        "Выберите точку на карте перед оформлением заказа.",
      );
      return;
    }
    const effectivePickupPoint =
      deliveryType === "delivery"
        ? `${selectedPoint?.name || ""}, ${selectedPoint?.address || ""}`
        : "Самовывоз";

    let paymentWindow: Window | null = null;
    isPlacingOrderRef.current = true;
    setIsSubmitting(true);
    try {
      paymentWindow = window.open("", "_blank");
      if (!paymentWindow) {
        throw new Error("Браузер заблокировал новую вкладку. Разрешите pop-up для сайта.");
      }
      paymentWindowRef.current = paymentWindow;
      paymentWindow.opener = null;
      paymentWindow.document.title = "Переход к оплате";
      paymentWindow.document.body.innerHTML =
        "<p style='font-family:Arial,sans-serif;padding:16px'>Подготавливаем страницу оплаты...</p>";

      const [productListings, serviceListings] = await Promise.all([
        apiGet<Product[]>("/catalog/listings?type=products"),
        apiGet<Product[]>("/catalog/listings?type=services"),
      ]);

      const availableIds = new Set(
        [...productListings, ...serviceListings].map((listing) => listing.id),
      );
      const unavailableItemIds = items
        .map((item) => item.id)
        .filter((itemId) => !availableIds.has(itemId));

      if (unavailableItemIds.length > 0) {
        onRemoveUnavailableItems?.(unavailableItemIds);
        notifyInfo(
          "Некоторые товары уже недоступны и были удалены из корзины. Проверьте заказ и попробуйте снова.",
        );
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.close();
        }
        paymentWindowRef.current = null;
        onBack();
        return;
      }

      const response = await apiPost<CreateOrdersResponse>("/profile/orders", {
        items: items.map((item) => ({ listingId: item.id, quantity: item.quantity })),
        addressId: null,
        customAddress: effectivePickupPoint,
        pickupPointId: selectedPoint?.id ?? null,
        pickupPointProvider: selectedPoint?.provider ?? null,
        deliveryType,
        paymentMethod,
      });

      const orderIds = response.orders.map((order) => order.order_id);
      if (orderIds.length === 0) {
        throw new Error("Сервер не вернул созданные заказы");
      }

      const confirmationUrl = response.payment?.confirmationUrl;
      if (!confirmationUrl) {
        throw new Error("Не удалось получить ссылку на оплату");
      }

      const createdResult = {
        orderIds,
        total: response.total,
        deliveryType,
      } as const;

      onOrderCreated?.(createdResult);
      hasCompletedRef.current = false;
      setPaymentStatusError(null);
      setLockedSummary({
        items: items.map((item) => ({ ...item })),
        subtotal,
        shipping,
        total,
      });
      setActivePayment({
        ...createdResult,
        paymentMethod,
        confirmationUrl,
        expiresAt: Date.now() + PAYMENT_TIMEOUT_MS,
        summary: "pending",
      });

      paymentWindow.location.href = confirmationUrl;
      notifyInfo("Заказ создан. Ожидаем подтверждение оплаты.");
    } catch (error) {
      if (paymentWindow && !paymentWindow.closed) {
        paymentWindow.close();
      }
      paymentWindowRef.current = null;
      notifyError(
        error instanceof Error ? error.message : "Не удалось оформить заказ",
      );
    } finally {
      isPlacingOrderRef.current = false;
      setIsSubmitting(false);
    }
  };

  const paymentStatusMeta = useMemo(() => {
    if (!activePayment) return null;
    if (activePayment.summary === "paid") {
      return {
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        title: "Оплата подтверждена",
        description: "Спасибо за оплату. Перенаправляем на страницу заказа...",
      };
    }
    if (activePayment.summary === "failed") {
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
  }, [activePayment]);

  return (
    <div className="min-h-screen app-shell pb-16 pt-6 md:pt-8">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6">
        <h1 className="mb-8 text-center text-3xl text-gray-900 md:mb-12 md:text-5xl">
          Оформление заказа
        </h1>

        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[1fr_400px]">
          <div className="space-y-6 md:space-y-8">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
              {deliveryType === "delivery" ? (
                <>
                  <h2 className="mb-4 text-xl text-gray-900 md:text-2xl">Выберите ПВЗ</h2>
                  <p className="mb-4 text-sm text-gray-600">
                    На карте показаны доступные точки выдачи выбранного провайдера.
                    Введите адрес или название ПВЗ, затем выберите нужную метку на карте.
                  </p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {DELIVERY_PROVIDER_TABS.map((tab) => (
                      <button
                        key={tab.code}
                        type="button"
                        disabled={
                          !tab.enabled ||
                          !deliveryProviders.some(
                            (provider) => provider.code === tab.code,
                          )
                        }
                        onClick={() => {
                          if (
                            !tab.enabled ||
                            !deliveryProviders.some(
                              (provider) => provider.code === tab.code,
                            )
                          ) {
                            return;
                          }
                          setActiveDeliveryProvider(tab.code);
                          setSelectedPointId(null);
                          const query = deliveryCity.trim();
                          if (query) {
                            void loadDeliveryPoints(query, false, tab.code);
                          } else {
                            setDeliveryPoints([]);
                            setMapCenterQuery(null);
                          }
                        }}
                        className={`rounded-full border px-3 py-1.5 text-xs md:text-sm ${
                          !tab.enabled ||
                          !deliveryProviders.some(
                            (provider) => provider.code === tab.code,
                          )
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            : activeDeliveryProvider === tab.code
                              ? "border-blue-300 bg-blue-100 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="mb-4">
                    <div className="flex items-center rounded-xl border border-slate-300 bg-white px-4 py-3 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                      <Search className="mr-3 h-5 w-5 text-slate-400" />
                      <input
                        ref={deliverySearchInputRef}
                        value={deliveryCity}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void applyLocationSearch(deliveryCity);
                          }
                        }}
                        onChange={(event) => {
                          setDeliveryCity(event.target.value);
                        }}
                        placeholder="Введите адрес или название ПВЗ"
                        className="h-8 w-full border-0 bg-transparent text-lg text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          void applyLocationSearch(deliveryCity);
                        }}
                        className="ml-2 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white transition hover:bg-slate-800 md:text-sm"
                      >
                        Найти
                      </button>
                      {deliveryCity.trim().length > 0 && (
                        <button
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            setDeliveryCity("");
                            setMapCenterQuery(null);
                            setDeliveryPoints([]);
                            setSelectedPointId(null);
                          }}
                          className="ml-3 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                          aria-label="Очистить поиск"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="h-[420px]">
                    <YandexMapPicker
                      markers={mapMarkers}
                      centerQuery={mapCenterQuery}
                      selectedMarkerId={selectedPointId}
                      onMarkerSelect={(marker) => {
                        const point = visibleDeliveryPoints.find(
                          (item) => item.id === marker.id,
                        );
                        if (!point) return;
                        setSelectedPointId(point.id);
                      }}
                      allowAddressSelect={false}
                      onAddressSelect={() => {}}
                    />
                  </div>

                  <div className="mt-4 text-sm text-gray-500">
                    {isPointsLoading && <div>Загрузка ПВЗ...</div>}
                    {!isPointsLoading &&
                      visibleDeliveryPoints.length === 0 &&
                      deliveryCity.trim().length === 0 && (
                        <div>Введите адрес или название ПВЗ, чтобы загрузить метки на карте.</div>
                      )}
                    {!isPointsLoading &&
                      visibleDeliveryPoints.length === 0 &&
                      deliveryCity.trim().length > 0 && <div>По вашему запросу ПВЗ не найдены.</div>}
                    {!isPointsLoading &&
                      visibleDeliveryPoints.length > 0 &&
                      !selectedPoint && (
                      <div>Нажмите на метку на карте, чтобы выбрать конкретный ПВЗ.</div>
                    )}
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    {selectedPoint
                      ? `Выбранная точка (${selectedPoint.providerLabel}): ${selectedPoint.name} - ${selectedPoint.address}`
                      : "ПВЗ еще не выбран. Выберите метку на карте."}
                    {selectedPoint && (
                      <div className="mt-1 text-xs text-gray-600">
                        Город: {selectedPoint.city}. Режим работы:{" "}
                        {selectedPoint.workHours || "По расписанию"}.
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mb-4 text-xl text-gray-900 md:text-2xl">Самовывоз</h2>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-gray-900">
                      <MapPin className="h-4 w-4" />
                      <span className="font-medium">Вы выбрали самовывоз</span>
                    </div>
                    <p className="text-sm text-gray-600">
                      После оформления заказа продавец свяжется с вами для согласования точки и
                      времени получения.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
              <h2 className="mb-6 text-xl text-gray-900 md:text-2xl">Способ оплаты</h2>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  disabled={hasActivePayment}
                  className={`rounded-xl border p-4 text-left transition ${
                    paymentMethod === "card"
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  } ${hasActivePayment ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <div className="mb-1 flex items-center gap-2 text-gray-900">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-sm font-medium md:text-base">Банковская карта</span>
                  </div>
                  <div className="text-xs text-gray-600">Любая карта Мир</div>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("sbp")}
                  disabled={hasActivePayment || !SBP_UI_ENABLED}
                  className={`rounded-xl border p-4 text-left transition ${
                    paymentMethod === "sbp"
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                  } ${hasActivePayment || !SBP_UI_ENABLED ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <div className="mb-1 flex items-center gap-2 text-gray-900">
                    <QrCode className="h-4 w-4" />
                    <span className="text-sm font-medium md:text-base">Система быстрых платежей</span>
                  </div>
                  <div className="text-xs text-gray-600">Оплата по QR-коду через приложение банка</div>
                </button>
              </div>
            </div>
          </div>

          <div className="h-fit lg:sticky lg:top-32">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
              <h2 className="mb-6 text-xl text-gray-900 md:text-2xl">Ваш заказ</h2>

              <div className="mb-6 space-y-4 border-b border-gray-200 pb-6">
                {summaryItems.map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                      <img src={item.image} alt={item.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 truncate text-sm text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-600">Количество: {item.quantity}</p>
                    </div>
                    <div className="text-sm text-gray-900">
                      {(item.price * item.quantity).toLocaleString("ru-RU")} ₽
                    </div>
                  </div>
                ))}
              </div>

              <div className="mb-6 space-y-3 border-b border-gray-200 pb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Подытог</span>
                  <span className="text-gray-900">{summarySubtotal.toLocaleString("ru-RU")} ₽</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {deliveryType === "delivery" ? "Доставка до ПВЗ" : "Самовывоз"}
                  </span>
                  <span className={deliveryType === "delivery" ? "text-gray-900" : "text-green-600"}>
                    {summaryShipping > 0 ? `${summaryShipping.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                  </span>
                </div>
              </div>

              <div className="mb-6 flex items-center justify-between">
                <span className="text-lg text-gray-900">Итого</span>
                <span className="text-2xl text-gray-900">{summaryTotal.toLocaleString("ru-RU")} ₽</span>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    if (hasActivePayment) {
                      handleOpenPayment();
                      return;
                    }
                    void handlePlaceOrder();
                  }}
                  disabled={isSubmitting || (!hasActivePayment && !canCheckoutWithSelectedPoint) || paymentIsPaid}
                  className="btn-primary w-full py-4 text-sm disabled:bg-gray-400 md:text-base"
                >
                  {isSubmitting
                    ? "Оформляем..."
                    : paymentIsPaid
                      ? "Оплата подтверждена"
                      : hasActivePayment
                        ? "Открыть страницу оплаты"
                        : `Оплатить ${summaryTotal.toLocaleString("ru-RU")} ₽`}
                </button>
                {!hasActivePayment && (
                  <button onClick={onBack} className="btn-secondary w-full py-4 text-sm md:text-base">
                    Вернуться в корзину
                  </button>
                )}
              </div>

              {activePayment && paymentStatusMeta && (
                <div className={`mt-4 rounded-xl border p-4 ${paymentStatusMeta.className}`}>
                  <div className="text-sm font-semibold md:text-base">{paymentStatusMeta.title}</div>
                  <div className="mt-1 text-xs md:text-sm">{paymentStatusMeta.description}</div>
                  <div className="mt-3 space-y-1 text-xs md:text-sm">
                    <div>
                      Заказы: <span className="font-medium">{activePayment.orderIds.join(", ")}</span>
                    </div>
                    <div>
                      Способ оплаты:{" "}
                      <span className="font-medium">
                        {activePayment.paymentMethod === "sbp" ? "СБП" : "Карта Мир"}
                      </span>
                    </div>
                    <div>
                      До отмены оплаты: <span className="font-medium">{formatCountdown(secondsLeft)}</span>
                    </div>
                  </div>

                  {paymentStatusError && (
                    <div className="mt-2 text-xs text-red-700">{paymentStatusError}</div>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
