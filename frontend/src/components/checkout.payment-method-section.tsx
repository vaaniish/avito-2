import { CreditCard, QrCode } from "lucide-react";
import { SBP_UI_ENABLED, type PaymentMethod } from "./checkout.models";

type CheckoutPaymentMethodSectionProps = {
  paymentMethod: PaymentMethod;
  hasActivePayment: boolean;
  onPaymentMethodChange: (next: PaymentMethod) => void;
};

export function CheckoutPaymentMethodSection({
  paymentMethod,
  hasActivePayment,
  onPaymentMethodChange,
}: CheckoutPaymentMethodSectionProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
      <h2 className="mb-6 text-xl text-gray-900 md:text-2xl">Способ оплаты</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onPaymentMethodChange("card")}
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
          onClick={() => onPaymentMethodChange("sbp")}
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
  );
}
