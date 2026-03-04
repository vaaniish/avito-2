import React from "react";
import { Check, Package, Truck, Home, Store } from "lucide-react";

interface OrderCompletePageProps {
  orderTotal: number;
  orderIds: string[];
  paymentMethod: "card" | "cash";
  deliveryType: "delivery" | "pickup";
  onViewHistory: () => void;
  onBackToHome: () => void;
}

export function OrderCompletePage({
  orderTotal,
  orderIds,
  paymentMethod,
  deliveryType,
  onViewHistory,
  onBackToHome,
}: OrderCompletePageProps) {
  const hasManyOrders = orderIds.length > 1;
  const primaryOrder = orderIds[0] ? `#${orderIds[0]}` : "—";

  const orderDate = new Date().toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const paymentMethodLabel =
    paymentMethod === "card"
      ? "Банковская карта"
      : "Наличные при получении";
  const secondStepLabel = deliveryType === "pickup" ? "Готов к выдаче" : "В пути";
  const thirdStepLabel = deliveryType === "pickup" ? "Получен" : "Доставлен";

  return (
    <div className="min-h-screen app-shell pb-16 pt-[calc(var(--header-height,84px)+1rem)] md:pt-[calc(var(--header-height,84px)+1.4rem)]">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        {/* Page Title */}
        <h1 className="text-3xl md:text-5xl text-gray-900 mb-8 md:mb-12 text-center">
          Заказ оформлен!
        </h1>

        {/* Progress Steps */}
        <div className="hidden md:flex items-center justify-center gap-8 mb-12 md:mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <span className="text-sm md:text-base text-gray-900">
              Корзина покупок
            </span>
          </div>
          <div className="w-16 md:w-24 h-px bg-green-500"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <span className="text-sm md:text-base text-gray-900">
              Оформление
            </span>
          </div>
          <div className="w-16 md:w-24 h-px bg-green-500"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center">
              3
            </div>
            <span className="text-sm md:text-base text-gray-900">
              Заказ завершён
            </span>
          </div>
        </div>

        {/* Mobile Progress */}
        <div className="md:hidden flex items-center justify-center gap-3 mb-8">
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-full">
            <Check className="w-4 h-4" />
            <span className="text-xs">Корзина</span>
          </div>
          <div className="w-6 h-px bg-green-500"></div>
          <div className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-full">
            <Check className="w-4 h-4" />
            <span className="text-xs">Оформление</span>
          </div>
          <div className="w-6 h-px bg-green-500"></div>
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-full">
            <div className="w-4 h-4 rounded-full bg-white text-gray-900 flex items-center justify-center text-xs">
              3
            </div>
            <span className="text-xs">Завершён</span>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-50 rounded-2xl p-8 md:p-12 text-center">
            {/* Thank You Message */}
            <div className="mb-8 md:mb-12">
              <h2 className="text-2xl md:text-3xl text-gray-900 mb-3">
                Спасибо за заказ! 🎉
              </h2>
              <p className="text-base md:text-lg text-gray-600">
                Ваш заказ принят и обрабатывается
              </p>
            </div>

            {/* Order Timeline Icons */}
            <div className="flex items-center justify-center gap-6 md:gap-12 mb-10 md:mb-12">
              {/* Step 1 - Order Placed */}
              <div className="flex flex-col items-center">
                <div className="relative mb-3">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-green-100 flex items-center justify-center">
                    <Package className="w-8 h-8 md:w-10 md:h-10 text-green-600" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center text-xs">
                    1
                  </div>
                </div>
                <span className="text-xs md:text-sm text-gray-600">
                  Принят
                </span>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center">
                <div className="relative mb-3">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-200 flex items-center justify-center">
                    {deliveryType === "pickup" ? (
                      <Store className="w-8 h-8 md:w-10 md:h-10 text-gray-500" />
                    ) : (
                      <Truck className="w-8 h-8 md:w-10 md:h-10 text-gray-500" />
                    )}
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs">
                    2
                  </div>
                </div>
                <span className="text-xs md:text-sm text-gray-400">
                  {secondStepLabel}
                </span>
              </div>

              {/* Step 3 - Delivered */}
              <div className="flex flex-col items-center">
                <div className="relative mb-3">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gray-200 flex items-center justify-center">
                    <Home className="w-8 h-8 md:w-10 md:h-10 text-gray-500" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs">
                    3
                  </div>
                </div>
                <span className="text-xs md:text-sm text-gray-400">
                  {thirdStepLabel}
                </span>
              </div>
            </div>

            {/* Order Details */}
            <div className="bg-white rounded-xl p-6 md:p-8 mb-8 md:mb-10">
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                  <span className="text-sm md:text-base text-gray-600">
                    {hasManyOrders ? "Номера заказов:" : "Номер заказа:"}
                  </span>
                  <div className="text-right">
                    <div className="text-sm md:text-base text-gray-900">{primaryOrder}</div>
                    {hasManyOrders && (
                      <div className="text-xs text-gray-500">
                        +{orderIds.length - 1} шт.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                  <span className="text-sm md:text-base text-gray-600">
                    Дата:
                  </span>
                  <span className="text-sm md:text-base text-gray-900">
                    {orderDate}
                  </span>
                </div>

                <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                  <span className="text-sm md:text-base text-gray-600">
                    Итого:
                  </span>
                  <span className="text-lg md:text-xl text-gray-900">
                    {orderTotal.toLocaleString("ru-RU")} ₽
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-sm md:text-base text-gray-600">
                    Способ оплаты:
                  </span>
                  <span className="text-sm md:text-base text-gray-900">
                    {paymentMethodLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button
                onClick={onViewHistory}
                className="btn-primary flex-1 py-3 text-sm md:py-4 md:text-base"
              >
                История покупок
              </button>
              <button
                onClick={onBackToHome}
                className="btn-secondary flex-1 py-3 text-sm md:py-4 md:text-base"
              >
                На главную
              </button>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-8 md:mt-10 text-center">
            <p className="text-sm md:text-base text-gray-600 mb-2">
              {deliveryType === "pickup"
                ? "Информация о самовывозе отправлена на вашу электронную почту"
                : "Информация о доставке отправлена на вашу электронную почту"}
            </p>
            <p className="text-xs md:text-sm text-gray-500">
              Вы можете отслеживать статус заказа в разделе
              "История покупок"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
