import { useMemo } from "react";
import type { CartItem } from "../../shared/types";
import { useCheckoutDelivery, useCheckoutPayment, useCheckoutPolicy } from "./checkout.hooks";
import { CheckoutDeliverySection } from "./checkout.delivery-section";
import { getPaymentStatusMeta } from "./checkout.models";
import { CheckoutOrderSummary } from "./checkout.order-summary";
import { CheckoutPaymentMethodSection } from "./checkout.payment-method-section";
import type { AppliedPromo } from "../../shared/types/promo";

interface CheckoutPageProps {
  items: CartItem[];
  deliveryType: "delivery" | "pickup";
  userType: "regular" | "partner" | "admin";
  couponCode: string;
  appliedPromo: AppliedPromo | null;
  couponError: string | null;
  isApplyingCoupon: boolean;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => Promise<boolean>;
  onEditAppliedCoupon: () => void;
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
  couponCode,
  appliedPromo,
  couponError,
  isApplyingCoupon,
  onCouponCodeChange,
  onApplyCoupon,
  onEditAppliedCoupon,
  onBack,
  onRemoveUnavailableItems,
  onOrderCreated,
  onComplete,
}: CheckoutPageProps) {
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );
  const discount = appliedPromo?.discountAmount ?? 0;
  const shipping = deliveryType === "delivery" ? 500 : 0;
  const total = Math.max(0, subtotal - discount + shipping);
  const { checkoutPolicy } = useCheckoutPolicy();
  const {
    deliveryCity,
    mapCenterQuery,
    deliveryProviders,
    activeDeliveryProvider,
    deliveryPoints,
    selectedPointKey,
    isPointsLoading,
    selectedPoint,
    visibleDeliveryPoints,
    mapMarkers,
    viewportBounds,
    deliverySearchInputRef,
    setDeliveryCity,
    setMapCenterQuery,
    setActiveDeliveryProvider,
    setDeliveryPoints,
    setSelectedPointKey,
    setViewportBounds,
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
    discount,
    shipping,
    total,
    appliedPromo,
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
  const summaryDiscount = lockedSummary?.discount ?? discount;
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

        <div className="grid grid-cols-1 gap-6 md:gap-8 lg:items-start lg:grid-cols-[1fr_400px]">
          <div className="space-y-6 md:space-y-8">
            <CheckoutDeliverySection
              deliveryType={deliveryType}
              deliveryProviders={deliveryProviders}
              activeDeliveryProvider={activeDeliveryProvider}
              deliveryCity={deliveryCity}
              deliverySearchInputRef={deliverySearchInputRef}
              mapMarkers={mapMarkers}
              mapCenterQuery={mapCenterQuery}
              selectedPointKey={selectedPointKey}
              visibleDeliveryPoints={visibleDeliveryPoints}
              selectedPoint={selectedPoint}
              isPointsLoading={isPointsLoading}
              onProviderSelect={(providerCode) => {
                setActiveDeliveryProvider(providerCode);
                setSelectedPointKey(null);
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
                setSelectedPointKey(null);
              }}
              onMarkerSelect={(markerId) => {
                const point = deliveryPoints.find(
                  (item) => `${item.provider}:${item.id}` === markerId,
                );
                if (!point) return;
                setSelectedPointKey(`${point.provider}:${point.id}`);
              }}
              onViewportChange={(bounds) => {
                const unchanged =
                  bounds?.minLat === viewportBounds?.minLat &&
                  bounds?.minLng === viewportBounds?.minLng &&
                  bounds?.maxLat === viewportBounds?.maxLat &&
                  bounds?.maxLng === viewportBounds?.maxLng;
                if (unchanged) return;
                setViewportBounds(bounds);
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
            summaryDiscount={summaryDiscount}
            summaryShipping={summaryShipping}
            summaryTotal={summaryTotal}
            deliveryType={deliveryType}
            couponCode={couponCode}
            appliedPromo={appliedPromo}
            couponError={couponError}
            isApplyingCoupon={isApplyingCoupon}
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
            onCouponCodeChange={onCouponCodeChange}
            onApplyCoupon={onApplyCoupon}
            onEditAppliedCoupon={onEditAppliedCoupon}
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
