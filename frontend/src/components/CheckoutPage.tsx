import React, { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, MapPin, Search, X } from "lucide-react";
import type { CartItem, Product } from "../types";
import { apiGet, apiPost } from "../lib/api";
import { YandexMapMarker, YandexMapPicker } from "./YandexMapPicker";
import { notifyError, notifyInfo } from "./ui/notifications";

interface CheckoutPageProps {
  items: CartItem[];
  deliveryType: "delivery" | "pickup";
  onBack: () => void;
  onRemoveUnavailableItems?: (itemIds: string[]) => void;
  onComplete: (result: {
    orderIds: string[];
    total: number;
    paymentMethod: "card" | "cash";
    deliveryType: "delivery" | "pickup";
  }) => void;
}

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

type DeliveryProvider = {
  code: "cdek" | "russian_post" | "ozon";
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
  points: DeliveryPoint[];
};

type LocationSuggestion = {
  title?: { text?: string } | string;
  subtitle?: { text?: string } | string;
  address?: { formatted_address?: string };
  uri?: string;
  value?: string;
  displayName?: string;
};

type LocationSuggestResponse = {
  query: string;
  suggestions: LocationSuggestion[];
};

const getSuggestionText = (
  value: { text?: string } | string | null | undefined,
): string => {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value.text === "string") {
    return value.text.trim();
  }
  return "";
};

const getSuggestionTitle = (suggestion: LocationSuggestion): string => {
  const title = getSuggestionText(suggestion.title);
  if (title) return title;
  if (typeof suggestion.displayName === "string" && suggestion.displayName.trim()) {
    return suggestion.displayName.trim();
  }
  if (typeof suggestion.value === "string" && suggestion.value.trim()) {
    return suggestion.value.trim();
  }
  return "";
};

const getSuggestionSubtitle = (suggestion: LocationSuggestion): string => {
  const title = getSuggestionTitle(suggestion).toLowerCase();
  const subtitle = getSuggestionText(suggestion.subtitle);
  if (subtitle && subtitle.toLowerCase() !== title) return subtitle;
  if (
    suggestion.address &&
    typeof suggestion.address.formatted_address === "string" &&
    suggestion.address.formatted_address.trim()
  ) {
    const formatted = suggestion.address.formatted_address.trim();
    if (formatted.toLowerCase() !== title) {
      return formatted;
    }
  }
  return "";
};

const getSuggestionInputValue = (suggestion: LocationSuggestion): string => {
  const title = getSuggestionTitle(suggestion);
  const subtitle = getSuggestionSubtitle(suggestion);
  return title || subtitle;
};

const getSuggestionSearchQuery = (suggestion: LocationSuggestion): string => {
  if (typeof suggestion.uri === "string" && suggestion.uri.trim()) {
    return suggestion.uri.trim();
  }
  const subtitle = getSuggestionSubtitle(suggestion);
  if (subtitle) return subtitle;
  return getSuggestionInputValue(suggestion);
};

const DELIVERY_PVZ_STUB = "Тестовый ПВЗ, Москва, ул. Тестовая, 1";

export function CheckoutPage({
  items,
  deliveryType,
  onBack,
  onRemoveUnavailableItems,
  onComplete,
}: CheckoutPageProps) {
  const [pickupPoint, setPickupPoint] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("Москва");
  const [mapCenterQuery, setMapCenterQuery] = useState<string | null>("Москва");
  const [providers, setProviders] = useState<DeliveryProvider[]>([]);
  const [deliveryPoints, setDeliveryPoints] = useState<DeliveryPoint[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSuggestLoading, setIsSuggestLoading] = useState(false);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [activeSuggestIndex, setActiveSuggestIndex] = useState(-1);
  const [selectedProvider, setSelectedProvider] = useState<
    "all" | DeliveryProvider["code"]
  >("all");
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [isPointsLoading, setIsPointsLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const filteredPoints = useMemo(() => {
    if (selectedProvider === "all") return deliveryPoints;
    return deliveryPoints.filter((point) => point.provider === selectedProvider);
  }, [deliveryPoints, selectedProvider]);

  const mapMarkers = useMemo<YandexMapMarker[]>(
    () =>
      filteredPoints.map((point) => ({
        id: point.id,
        title: point.name,
        subtitle: `${point.providerLabel} · ${point.address}`,
        provider: point.provider,
        lat: point.lat,
        lng: point.lng,
      })),
    [filteredPoints],
  );

  const loadDeliveryPoints = async (city: string) => {
    if (deliveryType !== "delivery") return;
    const query = city.trim();
    if (!query) return;

    setIsPointsLoading(true);
    try {
      const response = await apiGet<DeliveryPointsResponse>(
        `/profile/delivery-points?city=${encodeURIComponent(query)}`,
      );
      setProviders(response.providers);
      setDeliveryPoints(response.points);
      setDeliveryCity(response.location?.label || query);
      setMapCenterQuery(response.location?.label || query);
      if (response.points.length > 0) {
        const first = response.points[0];
        setSelectedPointId(first.id);
        setPickupPoint(first.address);
      }
    } catch (error) {
      notifyError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить точки доставки",
      );
    } finally {
      setIsPointsLoading(false);
    }
  };

  useEffect(() => {
    if (deliveryType !== "delivery") return;
    void loadDeliveryPoints(deliveryCity);
    // Initial load only for current delivery flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryType]);

  useEffect(() => {
    if (deliveryType !== "delivery") return;

    const query = deliveryCity.trim();
    if (query.length < 2) {
      setSearchSuggestions([]);
      setIsSuggestLoading(false);
      setActiveSuggestIndex(-1);
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setIsSuggestLoading(true);
      try {
        const response = await apiGet<LocationSuggestResponse>(
          `/profile/location/suggest?q=${encodeURIComponent(query)}&limit=8`,
        );
        if (!cancelled) {
          const suggestions = response.suggestions ?? [];
          setSearchSuggestions(suggestions);
          setActiveSuggestIndex(suggestions.length > 0 ? 0 : -1);
        }
      } catch {
        if (!cancelled) {
          setSearchSuggestions([]);
          setActiveSuggestIndex(-1);
        }
      } finally {
        if (!cancelled) {
          setIsSuggestLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [deliveryCity, deliveryType]);

  const applyLocationSearch = async (query: string) => {
    const value = query.trim();
    if (!value) return;
    setIsSuggestOpen(false);
    await loadDeliveryPoints(value);
  };

  const applySuggestion = (suggestion: LocationSuggestion) => {
    const selectedLabel = getSuggestionInputValue(suggestion);
    const queryValue = getSuggestionSearchQuery(suggestion) || selectedLabel;
    if (!queryValue) return;
    setDeliveryCity(selectedLabel || queryValue);
    void applyLocationSearch(queryValue);
  };

  const handlePlaceOrder = async () => {
    const effectivePickupPoint =
      deliveryType === "delivery"
        ? selectedPoint?.address || pickupPoint.trim() || DELIVERY_PVZ_STUB
        : "Самовывоз";

    setIsSubmitting(true);
    try {
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
        onBack();
        return;
      }

      const response = await apiPost<CreateOrdersResponse>("/profile/orders", {
        items: items.map((item) => ({ listingId: item.id, quantity: item.quantity })),
        addressId: null,
        customAddress: effectivePickupPoint,
        deliveryType,
        paymentMethod,
      });

      const orderIds = response.orders.map((order) => order.order_id);
      if (orderIds.length === 0) {
        throw new Error("Сервер не вернул созданные заказы");
      }

      if (paymentMethod === "card") {
        const confirmationUrl = response.payment?.confirmationUrl;
        if (!confirmationUrl) {
          throw new Error("Не удалось получить ссылку на оплату YooMoney");
        }

        const paymentWindow = window.open(
          confirmationUrl,
          "_blank",
          "noopener,noreferrer",
        );

        onComplete({
          orderIds,
          total: response.total,
          paymentMethod,
          deliveryType,
        });

        if (!paymentWindow) {
          window.location.assign(confirmationUrl);
        }
        return;
      }

      onComplete({
        orderIds,
        total: response.total,
        paymentMethod,
        deliveryType,
      });
    } catch (error) {
      notifyError(
        error instanceof Error ? error.message : "Не удалось оформить заказ",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen app-shell pb-16 pt-[calc(var(--header-height,84px)+1rem)] md:pt-[calc(var(--header-height,84px)+1.4rem)]">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <h1 className="text-3xl md:text-5xl text-gray-900 mb-8 md:mb-12 text-center">
          Оформление заказа
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 md:gap-8">
          <div className="space-y-6 md:space-y-8">
            <div className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200">
              {deliveryType === "delivery" ? (
                <>
                  <h2 className="text-xl md:text-2xl text-gray-900 mb-4">Выберите ПВЗ</h2>
                  <p className="text-sm text-gray-600 mb-4">
                    На карте показываются все доступные ПВЗ по провайдерам CDEK, Почта России и
                    Ozon.
                  </p>

                  <div className="mb-4">
                    <div className="relative">
                      <div className="flex items-center rounded-xl border border-slate-300 bg-white px-4 py-3 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                        <Search className="mr-3 h-5 w-5 text-slate-400" />
                        <input
                          value={deliveryCity}
                          onFocus={() => {
                            setIsSuggestOpen(true);
                            if (searchSuggestions.length > 0) {
                              setActiveSuggestIndex(0);
                            }
                          }}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setIsSuggestOpen(false);
                            }, 120);
                          }}
                          onKeyDown={(event) => {
                            if (
                              event.key === "ArrowDown" &&
                              isSuggestOpen &&
                              searchSuggestions.length > 0
                            ) {
                              event.preventDefault();
                              setActiveSuggestIndex((prev) =>
                                prev < 0
                                  ? 0
                                  : Math.min(prev + 1, searchSuggestions.length - 1),
                              );
                              return;
                            }
                            if (
                              event.key === "ArrowUp" &&
                              isSuggestOpen &&
                              searchSuggestions.length > 0
                            ) {
                              event.preventDefault();
                              setActiveSuggestIndex((prev) =>
                                prev <= 0 ? 0 : prev - 1,
                              );
                              return;
                            }
                            if (event.key === "Enter") {
                              event.preventDefault();
                              if (
                                isSuggestOpen &&
                                activeSuggestIndex >= 0 &&
                                activeSuggestIndex < searchSuggestions.length
                              ) {
                                applySuggestion(searchSuggestions[activeSuggestIndex]);
                                return;
                              }
                              void applyLocationSearch(deliveryCity);
                            }
                            if (event.key === "Escape") {
                              setIsSuggestOpen(false);
                            }
                          }}
                          onChange={(event) => {
                            setDeliveryCity(event.target.value);
                            setIsSuggestOpen(true);
                          }}
                          placeholder="Введите адрес, организацию или координаты"
                          className="h-8 w-full border-0 bg-transparent text-lg text-slate-900 outline-none placeholder:text-slate-400"
                        />
                        {deliveryCity.trim().length > 0 && (
                          <button
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setDeliveryCity("");
                              setSearchSuggestions([]);
                              setActiveSuggestIndex(-1);
                              setIsSuggestOpen(false);
                            }}
                            className="ml-3 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                            aria-label="Очистить поиск"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        )}
                      </div>

                      {isSuggestOpen && (deliveryCity.trim().length > 0 || isSuggestLoading) && (
                        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                          {isSuggestLoading && (
                            <div className="px-4 py-3 text-sm text-slate-500">Ищем варианты...</div>
                          )}

                          {!isSuggestLoading && searchSuggestions.length === 0 && (
                            <div className="px-4 py-3 text-sm text-slate-500">
                              Ничего не найдено. Попробуйте уточнить запрос.
                            </div>
                          )}

                          {!isSuggestLoading &&
                            searchSuggestions.map((suggestion, index) => {
                              const title = getSuggestionTitle(suggestion);
                              const subtitle = getSuggestionSubtitle(suggestion);
                              const inputValue = getSuggestionInputValue(suggestion);
                              const queryValue = getSuggestionSearchQuery(suggestion);
                              const isActive = index === activeSuggestIndex;
                              const key =
                                (typeof suggestion.uri === "string" && suggestion.uri.trim()) ||
                                [title, subtitle, suggestion.value, String(index)]
                                  .filter(Boolean)
                                  .join("|");

                              return (
                              <button
                                key={key}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActiveSuggestIndex(index)}
                                onClick={() => {
                                  applySuggestion(suggestion);
                                }}
                                className={`flex w-full items-start border-t px-4 py-3 text-left first:border-t-0 ${
                                  isActive
                                    ? "border-slate-200 bg-slate-100"
                                    : "border-slate-200 bg-white hover:bg-slate-50"
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-base text-slate-800">
                                    {title || inputValue}
                                  </span>
                                </span>
                              </button>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => {
                          void applyLocationSearch(deliveryCity);
                        }}
                        className="btn-secondary py-2.5"
                      >
                        Найти на карте
                      </button>
                    </div>
                  </div>

                  <div className="dashboard-chip-row mb-4">
                    <button
                      onClick={() => setSelectedProvider("all")}
                      className={`dashboard-chip ${
                        selectedProvider === "all" ? "dashboard-chip--active" : ""
                      }`}
                    >
                      Все провайдеры
                    </button>
                    {providers.map((provider) => (
                      <button
                        key={provider.code}
                        onClick={() => setSelectedProvider(provider.code)}
                        className={`dashboard-chip ${
                          selectedProvider === provider.code
                            ? "dashboard-chip--active"
                            : ""
                        }`}
                      >
                        {provider.label}
                      </button>
                    ))}
                  </div>

                  <div className="h-[420px]">
                    <YandexMapPicker
                      markers={mapMarkers}
                      centerQuery={mapCenterQuery}
                      selectedMarkerId={selectedPointId}
                      onMarkerSelect={(marker) => {
                        const point = deliveryPoints.find((item) => item.id === marker.id);
                        if (!point) return;
                        setSelectedPointId(point.id);
                        setPickupPoint(point.address);
                      }}
                      onAddressSelect={(address) => {
                        const formatted = [address.city, address.street, address.building]
                          .filter(Boolean)
                          .join(", ");
                        const query = address.fullAddress || formatted || address.city || "";
                        if (query) {
                          setDeliveryCity(query);
                          setMapCenterQuery(query);
                          void loadDeliveryPoints(query);
                        }
                        setSelectedPointId(null);
                        setPickupPoint(formatted || query);
                      }}
                    />
                  </div>

                  <div className="mt-4 space-y-2">
                    {isPointsLoading && (
                      <div className="text-sm text-gray-500">Загрузка ПВЗ...</div>
                    )}
                    {!isPointsLoading &&
                      filteredPoints.slice(0, 6).map((point) => (
                        <button
                          key={point.id}
                          onClick={() => {
                            setSelectedPointId(point.id);
                            setPickupPoint(point.address);
                          }}
                          className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                            selectedPointId === point.id
                              ? "border-[rgb(38,83,141)] bg-blue-50"
                              : "border-gray-200 bg-white hover:bg-gray-50"
                          }`}
                        >
                          <div className="font-medium text-gray-900">{point.name}</div>
                          <div className="text-xs text-gray-600">
                            {point.providerLabel} · {point.address}
                          </div>
                          <div className="text-xs text-gray-500">
                            {point.workHours} · {point.etaDays} дн. · {point.cost} ₽
                          </div>
                        </button>
                      ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    {pickupPoint
                      ? `Выбранный адрес/ПВЗ: ${pickupPoint}`
                      : `ПВЗ еще не выбран. Будет использована заглушка: ${DELIVERY_PVZ_STUB}`}
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-xl md:text-2xl text-gray-900 mb-4">Самовывоз</h2>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center gap-2 text-gray-900 mb-2">
                      <MapPin className="w-4 h-4" />
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

            <div className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200">
              <h2 className="text-xl md:text-2xl text-gray-900 mb-6">Способ оплаты</h2>

              <div className="space-y-3 mb-6">
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`w-full p-4 rounded-xl border-2 transition-all duration-300 flex items-center justify-between ${
                    paymentMethod === "card"
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="w-5 h-5 text-gray-600" />
                    <span className="text-sm md:text-base text-gray-900">Оплата картой</span>
                  </div>
                  {paymentMethod === "card" && (
                    <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>

                <button
                  onClick={() => setPaymentMethod("cash")}
                  className={`w-full p-4 rounded-xl border-2 transition-all duration-300 flex items-center justify-between ${
                    paymentMethod === "cash"
                      ? "border-gray-900 bg-gray-50"
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <span className="text-sm md:text-base text-gray-900">
                    Наличными при получении
                  </span>
                  {paymentMethod === "cash" && (
                    <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              </div>

              {paymentMethod === "card" && (
                <div className="space-y-4 pt-6 border-t border-gray-200">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                    <p className="font-medium text-gray-900 mb-2">
                      Оплата через YooMoney (тестовый режим)
                    </p>
                    <p className="mb-2">
                      После нажатия кнопки вы перейдете на защищенную страницу YooMoney для
                      ввода данных карты.
                    </p>
                    <p className="text-xs text-gray-600">
                      Тестовая карта: 5555 5555 5555 4477, срок 01/30, CVC 123.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:sticky lg:top-32 h-fit">
            <div className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200">
              <h2 className="text-xl md:text-2xl text-gray-900 mb-6">Ваш заказ</h2>

              <div className="space-y-4 mb-6 pb-6 border-b border-gray-200">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-4">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 mb-1 truncate">{item.title}</p>
                      <p className="text-xs text-gray-600">Количество: {item.quantity}</p>
                    </div>
                    <div className="text-sm text-gray-900">
                      {(item.price * item.quantity).toLocaleString("ru-RU")} ₽
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Подытог</span>
                  <span className="text-gray-900">{subtotal.toLocaleString("ru-RU")} ₽</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">
                    {deliveryType === "delivery" ? "Доставка до ПВЗ" : "Самовывоз"}
                  </span>
                  <span className={deliveryType === "delivery" ? "text-gray-900" : "text-green-600"}>
                    {shipping > 0 ? `${shipping.toLocaleString("ru-RU")} ₽` : "Бесплатно"}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center mb-6">
                <span className="text-lg text-gray-900">Итого</span>
                <span className="text-2xl text-gray-900">{total.toLocaleString("ru-RU")} ₽</span>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => void handlePlaceOrder()}
                  disabled={isSubmitting}
                  className="btn-primary w-full py-4 text-sm disabled:bg-gray-400 md:text-base"
                >
                  {isSubmitting
                    ? "Оформляем..."
                    : paymentMethod === "card"
                      ? "Перейти к оплате YooMoney"
                      : "Оформить заказ"}
                </button>
                <button
                  onClick={onBack}
                  className="btn-secondary w-full py-4 text-sm md:text-base"
                >
                  Вернуться в корзину
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
