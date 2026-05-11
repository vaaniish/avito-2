import { useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, Product } from "../../shared/types";
import type { YandexMapMarker } from "../../widgets/YandexMapPicker";
import {
  createCheckoutOrders,
  fetchCheckoutPolicy,
  fetchCheckoutProductListings,
  fetchDeliveryPoints,
  fetchPaymentStatus,
  type CheckoutPolicy,
} from "./checkout.api";
import {
  DEFAULT_DELIVERY_CITY,
  DELIVERY_PICKUP_PROVIDER,
  DELIVERY_PROVIDER_TABS,
  PAYMENT_RETURN_CHANNEL,
  PAYMENT_RETURN_EVENT_KEY,
  PAYMENT_TIMEOUT_MS,
  RUSSIA_BOUNDS,
  SBP_UI_ENABLED,
  YANDEX_GEOSUGGEST_API_KEY,
  type ActivePayment,
  type DeliveryPoint,
  type DeliveryProvider,
  type PaymentMethod,
} from "./checkout.models";
import { notifyError, notifyInfo } from "../../shared/ui/notifications";

function makeCheckoutIdempotencyFingerprint(params: {
  items: Array<{ id: string; quantity: number }>;
  customAddress: string;
  pickupPointId: string | null;
  pickupPointProvider: string | null;
  deliveryType: "delivery" | "pickup";
  paymentMethod: PaymentMethod;
}): string {
  return JSON.stringify({
    deliveryType: params.deliveryType,
    paymentMethod: params.paymentMethod,
    customAddress: params.customAddress.trim(),
    pickupPointId: params.pickupPointId ?? null,
    pickupPointProvider: params.pickupPointProvider ?? null,
    items: params.items
      .map((item) => ({ id: item.id, quantity: item.quantity }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `chk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function useCheckoutPolicy() {
  const [checkoutPolicy, setCheckoutPolicy] = useState<CheckoutPolicy>({
    id: "",
    version: "",
    title: "правила оформления и безопасной сделки",
    contentUrl: "/terms",
  });

  useEffect(() => {
    let cancelled = false;
    const loadCheckoutPolicy = async () => {
      try {
        const policy = await fetchCheckoutPolicy();
        if (cancelled) return;
        if (
          typeof policy.id === "string" &&
          typeof policy.title === "string" &&
          typeof policy.contentUrl === "string"
        ) {
          setCheckoutPolicy({
            id: policy.id,
            version: typeof policy.version === "string" ? policy.version : "",
            title: policy.title,
            contentUrl: policy.contentUrl,
          });
        }
      } catch {
        // Keep fallback local terms link if policy endpoint is temporarily unavailable.
      }
    };
    void loadCheckoutPolicy();
    return () => {
      cancelled = true;
    };
  }, []);

  return { checkoutPolicy };
}

export function useCheckoutDelivery(params: {
  deliveryType: "delivery" | "pickup";
}) {
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
  const deliverySearchInputRef = useRef<HTMLInputElement | null>(null);
  const nativeAddressSuggestViewRef = useRef<any>(null);
  const activeDeliveryProviderRef = useRef<DeliveryProvider["code"]>(DELIVERY_PICKUP_PROVIDER);

  const selectedPoint = useMemo(
    () => deliveryPoints.find((point) => point.id === selectedPointId) ?? null,
    [deliveryPoints, selectedPointId],
  );

  const visibleDeliveryPoints = useMemo(
    () => deliveryPoints.filter((point) => point.provider === activeDeliveryProvider),
    [deliveryPoints, activeDeliveryProvider],
  );

  const mapMarkers = useMemo<YandexMapMarker[]>(() => {
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
  }, [visibleDeliveryPoints]);

  useEffect(() => {
    activeDeliveryProviderRef.current = activeDeliveryProvider;
  }, [activeDeliveryProvider]);

  const loadDeliveryPoints = async (
    city: string,
    recenter = true,
    provider: DeliveryProvider["code"] | "all",
    options?: { cursor?: number; append?: boolean; silent?: boolean },
  ) => {
    if (params.deliveryType !== "delivery") return;
    const query = city.trim();
    if (!query) return;

    const cursor = Number(options?.cursor ?? 0);
    const append = Boolean(options?.append);
    const silent = Boolean(options?.silent);
    if (!append && !silent) setIsPointsLoading(true);

    try {
      const response = await fetchDeliveryPoints({ city: query, provider, cursor });
      if (append && provider === "russian_post") {
        setDeliveryPoints((prev) => {
          const byId = new Map(prev.map((point) => [point.id, point]));
          for (const point of response.points) byId.set(point.id, point);
          return Array.from(byId.values());
        });
      } else {
        setDeliveryPoints(response.points);
      }
      setDeliveryProviders(response.providers);
      setActiveDeliveryProvider(provider === "all" ? response.activeProvider : provider);
      if (!append) setSelectedPointId(null);
      setDeliveryCity(query);
      if (recenter) setMapCenterQuery(query);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить точки выдачи");
    } finally {
      if (!append && !silent) setIsPointsLoading(false);
    }
  };

  const applyLocationSearch = async (query: string) => {
    const value = query.trim();
    if (!value) return;
    setMapCenterQuery(value);
    await loadDeliveryPoints(value, true, activeDeliveryProvider);
  };

  useEffect(() => {
    if (params.deliveryType !== "delivery") return;
    void loadDeliveryPoints(
      deliveryCity.trim() || DEFAULT_DELIVERY_CITY,
      true,
      activeDeliveryProvider,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.deliveryType]);

  useEffect(() => {
    if (params.deliveryType !== "delivery") return;

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
        const suggestProvider = YANDEX_GEOSUGGEST_API_KEY
          ? {
              suggest: (request: unknown, options?: { results?: number }) => {
                const query = String(request ?? "").trim();
                if (!query) return ymaps.vow.resolve([]);

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
                      response.ok ? response.json() : Promise.resolve({ results: [] }),
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
                            item.subtitle?.text ?? item.address?.formatted_address ?? "",
                          ).trim();
                          const singleLine = [title, subtitle].filter(Boolean).join(", ").trim();
                          const value = singleLine || String(item.value ?? item.displayName ?? "").trim();
                          if (!value) return null;
                          return { value, displayName: value };
                        })
                        .filter(
                          (item): item is { value: string; displayName: string } => Boolean(item),
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
          void loadDeliveryPoints(selectedValue, true, activeDeliveryProviderRef.current);
        });

        nativeAddressSuggestViewRef.current = suggestView;
      } catch {
        // no-op
      }
    };

    initNativeSuggest();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      destroyNativeSuggest();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.deliveryType]);

  return {
    deliveryCity,
    mapCenterQuery,
    deliveryProviders,
    activeDeliveryProvider,
    deliveryPoints,
    selectedPointId,
    isPointsLoading,
    selectedPoint,
    visibleDeliveryPoints,
    mapMarkers,
    deliverySearchInputRef,
    setDeliveryCity,
    setMapCenterQuery,
    setActiveDeliveryProvider,
    setDeliveryPoints,
    setSelectedPointId,
    loadDeliveryPoints,
    applyLocationSearch,
  };
}

export function useCheckoutPayment(params: {
  items: CartItem[];
  deliveryType: "delivery" | "pickup";
  selectedPoint: DeliveryPoint | null;
  subtotal: number;
  shipping: number;
  total: number;
  onBack: () => void;
  onRemoveUnavailableItems?: (itemIds: string[]) => void;
  onOrderCreated?: (result: {
    orderIds: string[];
    total: number;
    deliveryType: "delivery" | "pickup";
    itemIds: string[];
  }) => void;
  onComplete: (result: {
    orderIds: string[];
    total: number;
    deliveryType: "delivery" | "pickup";
    itemIds: string[];
  }) => void;
}) {
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
  const checkoutIdempotencyRef = useRef<{ key: string; fingerprint: string } | null>(null);

  const hasActivePayment = Boolean(activePayment);

  const openOrReusePaymentTab = (url: string) => {
    let paymentWindow = paymentWindowRef.current;
    if (!paymentWindow || paymentWindow.closed) {
      paymentWindow = window.open("", "_blank");
      if (!paymentWindow) {
        throw new Error("Браузер заблокировал новую вкладку. Разрешите pop-up для сайта.");
      }
      paymentWindowRef.current = paymentWindow;
      paymentWindow.opener = null;
    }
    paymentWindow.location.href = url;
    paymentWindow.focus();
  };

  useEffect(() => {
    if (!activePayment) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remain = Math.max(0, Math.floor((activePayment.expiresAt - Date.now()) / 1000));
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
    if (!activePayment || activePayment.summary !== "pending") return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        if (cancelled) return;
        const response = await fetchPaymentStatus(activePayment.orderIds);
        if (cancelled) return;
        setPaymentStatusError(null);
        setActivePayment((prev) => (prev ? { ...prev, summary: response.summary } : prev));

        if (response.summary === "paid" && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          params.onComplete({
            orderIds: activePayment.orderIds,
            total: activePayment.total,
            deliveryType: activePayment.deliveryType,
            itemIds: params.items.map((item) => item.id),
          });
          return;
        }
      } catch (error) {
        if (cancelled) return;
        setPaymentStatusError(
          error instanceof Error ? error.message : "Не удалось обновить статус оплаты",
        );
      }

      if (!cancelled) {
        timer = setTimeout(() => {
          void poll();
        }, 4000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activePayment, params]);

  useEffect(() => {
    if (!activePayment || activePayment.summary !== "pending") return;

    let cancelled = false;
    let channel: BroadcastChannel | null = null;

    const refreshPaymentStatusNow = async () => {
      try {
        const response = await fetchPaymentStatus(activePayment.orderIds);
        if (cancelled) return;

        setPaymentStatusError(null);
        setActivePayment((prev) => (prev ? { ...prev, summary: response.summary } : prev));

        if (response.summary === "paid" && !hasCompletedRef.current) {
          hasCompletedRef.current = true;
          params.onComplete({
            orderIds: activePayment.orderIds,
            total: activePayment.total,
            deliveryType: activePayment.deliveryType,
            itemIds: params.items.map((item) => item.id),
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
        if (event.data?.type === "payment_returned") void refreshPaymentStatusNow();
      };
    } catch {
      channel = null;
    }

    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [activePayment, params]);

  const openPayment = () => {
    if (!activePayment?.confirmationUrl) {
      notifyError("Ссылка на оплату не найдена");
      return;
    }
    try {
      openOrReusePaymentTab(activePayment.confirmationUrl);
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : "Не удалось открыть страницу оплаты",
      );
    }
  };

  const placeOrder = async (canSelectDeliveryPoint: boolean) => {
    if (isPlacingOrderRef.current || hasActivePayment) return;

    if (paymentMethod === "sbp" && !SBP_UI_ENABLED) {
      notifyInfo("СБП пока недоступна в текущем тестовом контуре. Используйте оплату картой.");
      return;
    }

    if (!canSelectDeliveryPoint) {
      notifyInfo("Сначала выберите ПВЗ.");
      return;
    }

    const effectivePickupPoint =
      params.deliveryType === "delivery"
        ? `${params.selectedPoint?.name || ""}, ${params.selectedPoint?.address || ""}`
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

      const productListings: Product[] = await fetchCheckoutProductListings();
      const availableIds = new Set(productListings.map((listing) => listing.id));
      const unavailableItemIds = params.items
        .map((item) => item.id)
        .filter((itemId) => !availableIds.has(itemId));

      if (unavailableItemIds.length > 0) {
        params.onRemoveUnavailableItems?.(unavailableItemIds);
        notifyInfo(
          "Некоторые товары уже недоступны и были удалены из корзины. Проверьте заказ и попробуйте снова.",
        );
        if (paymentWindow && !paymentWindow.closed) paymentWindow.close();
        paymentWindowRef.current = null;
        params.onBack();
        return;
      }

      const checkoutPayload = {
        items: params.items.map((item) => ({ listingId: item.id, quantity: item.quantity })),
        addressId: null,
        customAddress: effectivePickupPoint,
        pickupPointId: params.selectedPoint?.id ?? null,
        pickupPointProvider: params.selectedPoint?.provider ?? null,
        deliveryType: params.deliveryType,
        paymentMethod,
      };
      const checkoutFingerprint = makeCheckoutIdempotencyFingerprint({
        items: params.items.map((item) => ({ id: item.id, quantity: item.quantity })),
        customAddress: effectivePickupPoint,
        pickupPointId: params.selectedPoint?.id ?? null,
        pickupPointProvider: params.selectedPoint?.provider ?? null,
        deliveryType: params.deliveryType,
        paymentMethod,
      });
      const existingIdempotency = checkoutIdempotencyRef.current;
      const idempotencyKey =
        existingIdempotency?.fingerprint === checkoutFingerprint
          ? existingIdempotency.key
          : generateIdempotencyKey();
      checkoutIdempotencyRef.current = { key: idempotencyKey, fingerprint: checkoutFingerprint };

      const response = await createCheckoutOrders(checkoutPayload, idempotencyKey);
      const orderIds = response.orders.map((order) => order.order_id);
      if (orderIds.length === 0) throw new Error("Сервер не вернул созданные заказы");

      const confirmationUrl = response.payment.confirmationUrl;
      if (!confirmationUrl) throw new Error("Не удалось получить ссылку на оплату");

      const createdResult = {
        orderIds,
        total: response.total,
        deliveryType: params.deliveryType,
        itemIds: params.items.map((item) => item.id),
      } as const;

      params.onOrderCreated?.(createdResult);
      hasCompletedRef.current = false;
      setPaymentStatusError(null);
      setLockedSummary({
        items: params.items.map((item) => ({ ...item })),
        subtotal: params.subtotal,
        shipping: params.shipping,
        total: params.total,
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
      if (paymentWindow && !paymentWindow.closed) paymentWindow.close();
      paymentWindowRef.current = null;
      notifyError(error instanceof Error ? error.message : "Не удалось оформить заказ");
    } finally {
      isPlacingOrderRef.current = false;
      setIsSubmitting(false);
    }
  };

  return {
    isSubmitting,
    paymentMethod,
    activePayment,
    lockedSummary,
    secondsLeft,
    paymentStatusError,
    hasActivePayment,
    setPaymentMethod,
    openPayment,
    placeOrder,
  };
}
