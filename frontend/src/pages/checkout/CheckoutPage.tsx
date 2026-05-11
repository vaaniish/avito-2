import { useMemo } from "react";
import type { CartItem } from "../../shared/types";
import { type YandexMapMarker } from "../../widgets/YandexMapPicker";
import { useCheckoutDelivery, useCheckoutPayment, useCheckoutPolicy } from "./checkout.hooks";
import { CheckoutDeliverySection } from "./checkout.delivery-section";
import {
  DELIVERY_PICKUP_PROVIDER,
  getPaymentStatusMeta,
} from "./checkout.models";
import { CheckoutOrderSummary } from "./checkout.order-summary";
import { CheckoutPaymentMethodSection } from "./checkout.payment-method-section";

interface CheckoutPageProps {
  items: CartItem[];
  deliveryType: "delivery" | "pickup";
  userType: "regular" | "partner" | "admin";
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
}

export function CheckoutPage({
  items,
  deliveryType,
  userType,
  onBack,
  onRemoveUnavailableItems,
  onOrderCreated,
  onComplete,
}: CheckoutPageProps) {
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );
  const shipping = deliveryType === "delivery" ? 500 : 0;
  const total = subtotal + shipping;
  const { checkoutPolicy } = useCheckoutPolicy();
  const {
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
  } = useCheckoutDelivery({ deliveryType });
  const {
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
  } = useCheckoutPayment({
    items,
    deliveryType,
    selectedPoint,
    subtotal,
    shipping,
    total,
    onBack,
    onRemoveUnavailableItems,
    onOrderCreated,
    onComplete,
  });

  const canSelectDeliveryPoint = deliveryType !== "delivery" || Boolean(selectedPoint);
  const paymentIsPaid = activePayment?.summary === "paid";
  const canSubmitOrder = userType !== "admin";
  const summaryItems = lockedSummary?.items ?? items;
  const summarySubtotal = lockedSummary?.subtotal ?? subtotal;
  const summaryShipping = lockedSummary?.shipping ?? shipping;
  const summaryTotal = lockedSummary?.total ?? total;

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
            canSubmitOrder={canSubmitOrder}
            hasActivePayment={hasActivePayment}
            isSubmitting={isSubmitting}
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
            onPrimaryAction={() => {
              if (!canSubmitOrder) {
                return;
              }
              if (hasActivePayment) {
                openPayment();
                return;
              }
              void placeOrder(canSelectDeliveryPoint);
            }}
            onBack={onBack}
          />
        </div>
      </div>
    </div>
  );
}
