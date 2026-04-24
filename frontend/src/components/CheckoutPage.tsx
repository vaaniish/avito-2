import { useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, Product } from "../types";
import { apiGet, apiPost } from "../lib/api";
import { type YandexMapMarker } from "./YandexMapPicker";
import { notifyError, notifyInfo } from "./ui/notifications";
import { CheckoutDeliverySection } from "./checkout.delivery-section";
import {
  DELIVERY_PICKUP_PROVIDER,
  DEFAULT_DELIVERY_CITY,
  DELIVERY_PROVIDER_TABS,
  PAYMENT_RETURN_CHANNEL,
  PAYMENT_RETURN_EVENT_KEY,
  PAYMENT_TIMEOUT_MS,
  RUSSIA_BOUNDS,
  SBP_UI_ENABLED,
  YANDEX_GEOSUGGEST_API_KEY,
  getPaymentStatusMeta,
  type ActivePayment,
  type CreateOrdersResponse,
  type DeliveryPoint,
  type DeliveryPointsResponse,
  type DeliveryProvider,
  type PaymentMethod,
  type PaymentStatusResponse,
} from "./checkout.models";
import { CheckoutOrderSummary } from "./checkout.order-summary";
import { CheckoutPaymentMethodSection } from "./checkout.payment-method-section";

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

type CheckoutPolicy = {
  id: string;
  version: string;
  title: string;
  contentUrl: string;
};

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
  const [checkoutPolicy, setCheckoutPolicy] = useState<CheckoutPolicy>({
    id: "",
    version: "",
    title: "правила оформления и безопасной сделки",
    contentUrl: "/terms",
  });
  const [policyAccepted, setPolicyAccepted] = useState(false);

  const isPlacingOrderRef = useRef(false);
  const hasCompletedRef = useRef(false);
  const paymentWindowRef = useRef<Window | null>(null);
  const checkoutIdempotencyRef = useRef<{ key: string; fingerprint: string } | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const loadCheckoutPolicy = async () => {
      try {
        const policy = await apiGet<{
          id: string;
          version: string;
          title: string;
          contentUrl: string;
        }>("/public/policy/current?scope=checkout");
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
    if (!append && !silent) {
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
          ? response.activeProvider
          : provider,
      );
      if (!append) {
        setSelectedPointId(null);
      }
      setDeliveryCity(query);
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
      if (!append && !silent) {
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

    if (!policyAccepted) {
      notifyInfo("Перед оплатой нужно принять правила оформления и безопасной сделки.");
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

      const checkoutPayload = {
        items: items.map((item) => ({ listingId: item.id, quantity: item.quantity })),
        addressId: null,
        customAddress: effectivePickupPoint,
        pickupPointId: selectedPoint?.id ?? null,
        pickupPointProvider: selectedPoint?.provider ?? null,
        deliveryType,
        paymentMethod,
      };
      const checkoutFingerprint = makeCheckoutIdempotencyFingerprint({
        items: items.map((item) => ({ id: item.id, quantity: item.quantity })),
        customAddress: effectivePickupPoint,
        pickupPointId: selectedPoint?.id ?? null,
        pickupPointProvider: selectedPoint?.provider ?? null,
        deliveryType,
        paymentMethod,
      });
      const existingIdempotency = checkoutIdempotencyRef.current;
      const idempotencyKey =
        existingIdempotency?.fingerprint === checkoutFingerprint
          ? existingIdempotency.key
          : generateIdempotencyKey();
      checkoutIdempotencyRef.current = {
        key: idempotencyKey,
        fingerprint: checkoutFingerprint,
      };

      await apiPost<{ success: boolean }>(
        "/profile/policy-acceptance",
        {
          scope: "checkout",
          policyId: checkoutPolicy.id || undefined,
        },
      );

      const response = await apiPost<CreateOrdersResponse>(
        "/profile/orders",
        checkoutPayload,
        {
          "Idempotency-Key": idempotencyKey,
        },
      );

      const orderIds = response.orders.map((order) => order.order_id);
      if (orderIds.length === 0) {
        throw new Error("Сервер не вернул созданные заказы");
      }

      const confirmationUrl = response.payment.confirmationUrl;
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
    return getPaymentStatusMeta(activePayment.summary);
  }, [activePayment]);

  return (
    <div className="min-h-screen app-shell pb-16 pt-6 md:pt-8">
      <div className="mx-auto max-w-[1200px] px-4 md:px-6">
        <h1 className="mb-8 text-center text-3xl text-gray-900 md:mb-12 md:text-5xl">
          Оформление заказа
        </h1>

        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[1fr_400px]">
          <div className="space-y-6 md:space-y-8">
            <CheckoutDeliverySection
              deliveryType={deliveryType}
              deliveryProviders={deliveryProviders}
              activeDeliveryProvider={activeDeliveryProvider}
              deliveryCity={deliveryCity}
              deliverySearchInputRef={deliverySearchInputRef}
              mapMarkers={mapMarkers}
              mapCenterQuery={mapCenterQuery}
              selectedPointId={selectedPointId}
              visibleDeliveryPoints={visibleDeliveryPoints}
              selectedPoint={selectedPoint}
              isPointsLoading={isPointsLoading}
              onProviderSelect={(providerCode) => {
                setActiveDeliveryProvider(providerCode);
                setSelectedPointId(null);
                const query = deliveryCity.trim();
                if (query) {
                  void loadDeliveryPoints(query, false, providerCode);
                } else {
                  setDeliveryPoints([]);
                  setMapCenterQuery(null);
                }
              }}
              onDeliveryCityChange={setDeliveryCity}
              onSearch={() => {
                void applyLocationSearch(deliveryCity);
              }}
              onClearSearch={() => {
                setDeliveryCity("");
                setMapCenterQuery(null);
                setDeliveryPoints([]);
                setSelectedPointId(null);
              }}
              onMarkerSelect={(markerId) => {
                const point = visibleDeliveryPoints.find(
                  (item) => item.id === markerId,
                );
                if (!point) return;
                setSelectedPointId(point.id);
              }}
            />

            <CheckoutPaymentMethodSection
              paymentMethod={paymentMethod}
              hasActivePayment={hasActivePayment}
              onPaymentMethodChange={setPaymentMethod}
            />
          </div>

          <CheckoutOrderSummary
            summaryItems={summaryItems}
            summarySubtotal={summarySubtotal}
            summaryShipping={summaryShipping}
            summaryTotal={summaryTotal}
            deliveryType={deliveryType}
            hasActivePayment={hasActivePayment}
            isSubmitting={isSubmitting}
            canCheckoutWithSelectedPoint={canCheckoutWithSelectedPoint}
            policyAccepted={policyAccepted}
            policyTitle={
              checkoutPolicy.version
                ? `${checkoutPolicy.title} (v${checkoutPolicy.version})`
                : checkoutPolicy.title
            }
            policyUrl={checkoutPolicy.contentUrl || "/terms"}
            paymentIsPaid={paymentIsPaid}
            activePayment={activePayment}
            paymentStatusMeta={paymentStatusMeta}
            paymentStatusError={paymentStatusError}
            secondsLeft={secondsLeft}
            onPolicyAcceptedChange={setPolicyAccepted}
            onPrimaryAction={() => {
              if (hasActivePayment) {
                handleOpenPayment();
                return;
              }
              void handlePlaceOrder();
            }}
            onBack={onBack}
          />
        </div>
      </div>
    </div>
  );
}
