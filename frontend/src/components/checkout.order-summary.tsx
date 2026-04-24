import type { CartItem } from "../types";
import {
  formatCountdown,
  type ActivePayment,
  type PaymentStatusMeta,
} from "./checkout.models";

type CheckoutOrderSummaryProps = {
  summaryItems: CartItem[];
  summarySubtotal: number;
  summaryShipping: number;
  summaryTotal: number;
  deliveryType: "delivery" | "pickup";
  hasActivePayment: boolean;
  isSubmitting: boolean;
  canCheckoutWithSelectedPoint: boolean;
  policyAccepted: boolean;
  policyTitle: string;
  policyUrl: string;
  paymentIsPaid: boolean | undefined;
  activePayment: ActivePayment | null;
  paymentStatusMeta: PaymentStatusMeta | null;
  paymentStatusError: string | null;
  secondsLeft: number;
  onPolicyAcceptedChange: (value: boolean) => void;
  onPrimaryAction: () => void;
  onBack: () => void;
};

export function CheckoutOrderSummary({
  summaryItems,
  summarySubtotal,
  summaryShipping,
  summaryTotal,
  deliveryType,
  hasActivePayment,
  isSubmitting,
  canCheckoutWithSelectedPoint,
  policyAccepted,
  policyTitle,
  policyUrl,
  paymentIsPaid,
  activePayment,
  paymentStatusMeta,
  paymentStatusError,
  secondsLeft,
  onPolicyAcceptedChange,
  onPrimaryAction,
  onBack,
}: CheckoutOrderSummaryProps) {
  return (
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
          {!hasActivePayment && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 md:text-sm">
              <input
                type="checkbox"
                checked={policyAccepted}
                onChange={(event) => onPolicyAcceptedChange(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                Я принимаю{" "}
                <a
                  href={policyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-700 underline"
                >
                  {policyTitle}
                </a>
              </span>
            </label>
          )}
          <button
            onClick={onPrimaryAction}
            disabled={
              isSubmitting ||
              (!hasActivePayment &&
                (!canCheckoutWithSelectedPoint || !policyAccepted)) ||
              paymentIsPaid
            }
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
                Способ оплаты: <span className="font-medium">{activePayment.paymentMethod === "sbp" ? "СБП" : "Карта Мир"}</span>
              </div>
              <div>
                До отмены оплаты: <span className="font-medium">{formatCountdown(secondsLeft)}</span>
              </div>
            </div>

            {paymentStatusError && <div className="mt-2 text-xs text-red-700">{paymentStatusError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
