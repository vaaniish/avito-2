import React from "react";

interface OrderCompletePageProps {
  orderTotal: number;
  orderIds: string[];
  deliveryType: "delivery" | "pickup";
  onViewHistory: () => void;
  onBackToHome: () => void;
}

export function OrderCompletePage({
  orderTotal,
  orderIds,
  deliveryType,
  onViewHistory,
  onBackToHome,
}: OrderCompletePageProps) {
  const orderDate = new Date().toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const firstOrderId = orderIds[0] ?? "-";

  return (
    <div className="min-h-screen app-shell pb-16 pt-6 md:pt-8">
      <div className="mx-auto w-full max-w-[860px] px-4 md:px-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 md:p-10">
          <h1 className="text-center text-3xl text-gray-900 md:text-4xl">Спасибо за заказ!</h1>
          <p className="mt-3 text-center text-sm text-gray-600 md:text-base">
            Оплата подтверждена, заказ передан в обработку.
          </p>

          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div className="space-y-3 text-sm md:text-base">
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-600">Номер заказа</span>
                <span className="break-all text-right font-medium text-gray-900">#{firstOrderId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Дата</span>
                <span className="text-gray-900">{orderDate}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Доставка</span>
                <span className="text-gray-900">
                  {deliveryType === "delivery" ? "ПВЗ Яндекса" : "Самовывоз"}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <span className="text-gray-700">Сумма заказа</span>
                <span className="text-xl font-semibold text-gray-900">
                  {orderTotal.toLocaleString("ru-RU")} ₽
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button onClick={onViewHistory} className="btn-primary py-3 text-sm md:text-base">
              История покупок
            </button>
            <button onClick={onBackToHome} className="btn-secondary py-3 text-sm md:text-base">
              На главную
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
