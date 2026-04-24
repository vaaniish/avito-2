import { useState } from "react";
import { Minus, Plus, Heart, Trash2 } from "lucide-react";
import type { CartItem } from "../types";

interface CartPageProps {
  items: CartItem[];
  onUpdateQuantity: (id: string, quantity: number) => void;
  onCheckout: (deliveryType: "delivery" | "pickup") => void;
  onBackToHome: () => void;
}

export function CartPage({
  items,
  onUpdateQuantity,
  onCheckout,
  onBackToHome,
}: CartPageProps) {
  const shippingMethod: "delivery" = "delivery";
  const [couponCode, setCouponCode] = useState("");
  const [editingQuantities, setEditingQuantities] = useState<{
    [key: string]: string;
  }>({});

  const handleQuantityChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    itemId: string,
  ) => {
    const value = e.target.value;
    // Allow empty string or only digits
    if (value === "" || /^\d+$/.test(value)) {
      // Prevent entering more than 999
      const numValue = parseInt(value, 10);
      if (value !== "" && numValue > 999) {
        return; // Don't update if trying to enter value > 999
      }
      setEditingQuantities((prev) => ({
        ...prev,
        [itemId]: value,
      }));
    }
  };

  const applyQuantityChange = (itemId: string) => {
    const value = editingQuantities[itemId];

    if (value === undefined) {
      // Not being edited, do nothing
      return;
    }

    if (value === "") {
      // Empty field, set to 1
      onUpdateQuantity(itemId, 1);
    } else {
      const numValue = parseInt(value, 10);
      // Clamp value between 1 and 999
      if (numValue < 1) {
        onUpdateQuantity(itemId, 1);
      } else if (numValue > 999) {
        onUpdateQuantity(itemId, 999);
      } else {
        onUpdateQuantity(itemId, numValue);
      }
    }

    // Clear editing state
    setEditingQuantities((prev) => {
      const newState = { ...prev };
      delete newState[itemId];
      return newState;
    });
  };

  const handleQuantityKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    itemId: string,
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyQuantityChange(itemId);
      (e.target as HTMLInputElement).blur();
    }
  };

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const shippingCost = 500;
  const total = subtotal + shippingCost;

  const handleApplyCoupon = () => {
    // Placeholder for coupon logic
    console.log("Applying coupon:", couponCode);
  };

  return (
    <div className="min-h-screen app-shell pb-24 pt-6 md:pt-12">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        {/* Page Title */}
        <h1 className="text-center mb-8 md:mb-12">Корзина</h1>

        {/* Progress Steps - Hidden on mobile */}
        <div className="hidden md:flex items-center justify-center gap-8 mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center">
              1
            </div>
            <span className="text-base">Корзина покупок</span>
          </div>
          <div className="w-24 h-px bg-gray-300"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center">
              2
            </div>
            <span className="text-base text-gray-400">
              Оформление
            </span>
          </div>
          <div className="w-24 h-px bg-gray-300"></div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center">
              3
            </div>
            <span className="text-base text-gray-400">
              Заказ завершён
            </span>
          </div>
        </div>

        {/* Mobile Progress Indicator */}
        <div className="md:hidden flex items-center justify-center gap-3 mb-8">
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-full">
            <div className="w-6 h-6 rounded-full bg-white text-gray-900 flex items-center justify-center text-sm">
              1
            </div>
            <span className="text-sm">Корзина покупок</span>
          </div>
          <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-500 flex items-center justify-center text-sm">
            2
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-16 md:py-24">
            <p className="text-lg md:text-xl text-gray-500 mb-8">
              Ваша корзина пуста
            </p>
            <button
              type="button"
              onClick={onBackToHome}
              className="btn-primary px-6 py-3 text-sm md:text-base"
            >
              На главную
            </button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
            {/* Cart Items */}
            <div className="flex-1">
              {/* Table Header - Desktop Only */}
              <div className="hidden lg:grid grid-cols-12 gap-6 pb-6 border-b border-gray-200 mb-8">
                <div className="col-span-5 text-base text-gray-700">
                  Товар
                </div>
                <div className="col-span-3 text-base text-gray-700 text-center">
                  Количество
                </div>
                <div className="col-span-2 text-base text-gray-700">
                  Итого
                </div>
              </div>

              {/* Cart Items */}
              <div className="space-y-6 md:space-y-8">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="border-b border-gray-100 pb-6 md:pb-8"
                  >
                    {/* Desktop Layout */}
                    <div className="hidden lg:grid grid-cols-12 gap-6 items-start">
                      {/* Product Info */}
                      <div className="col-span-5 flex gap-4">
                        <div className="w-24 h-24 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden">
                          <img
                            src={item.image}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-base mb-3">
                            {item.title}
                          </h3>
                          <div className="flex items-center gap-3">
                            <button
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              title="В избранное"
                            >
                              <Heart className="w-5 h-5 text-gray-700" />
                            </button>
                            <button
                              onClick={() =>
                                onUpdateQuantity(item.id, 0)
                              }
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="w-5 h-5 text-gray-700" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div className="col-span-3 flex justify-center">
                        <div className="inline-flex items-center border border-gray-200 rounded-xl overflow-hidden">
                          <button
                            onClick={() =>
                              onUpdateQuantity(
                                item.id,
                                item.quantity - 1,
                              )
                            }
                            className="px-4 py-2 hover:bg-gray-50 transition-colors"
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <input
                            type="text"
                            value={
                              editingQuantities[item.id] !==
                              undefined
                                ? editingQuantities[item.id]
                                : item.quantity
                            }
                            onChange={(e) =>
                              handleQuantityChange(e, item.id)
                            }
                            onBlur={() =>
                              applyQuantityChange(item.id)
                            }
                            onKeyDown={(e) =>
                              handleQuantityKeyDown(
                                e,
                                item.id,
                              )
                            }
                            className="px-6 py-2 text-base min-w-[60px] text-center border-x border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                          />
                          <button
                            onClick={() =>
                              onUpdateQuantity(
                                item.id,
                                item.quantity + 1,
                              )
                            }
                            className="px-4 py-2 hover:bg-gray-50 transition-colors"
                            disabled={item.quantity >= 999}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Subtotal */}
                      <div className="col-span-2">
                        <p className="text-base">
                          {(
                            item.price * item.quantity
                          ).toLocaleString("ru-RU")}{" "}
                          ₽
                        </p>
                      </div>

                      {/* Empty columns for spacing */}
                      <div className="col-span-2"></div>
                    </div>

                    {/* Mobile Layout */}
                    <div className="lg:hidden flex gap-3 min-w-0">
                      <div className="w-20 sm:w-24 h-20 sm:h-24 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden">
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex justify-between items-start mb-3 gap-2">
                          <h3 className="text-sm sm:text-base flex-1 min-w-0 break-words">
                            {item.title}
                          </h3>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="В избранное"
                            >
                              <Heart className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
                            </button>
                            <button
                              onClick={() =>
                                onUpdateQuantity(item.id, 0)
                              }
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="Удалить"
                            >
                              <Trash2 className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="inline-flex items-center border border-gray-200 rounded-lg sm:rounded-xl overflow-hidden flex-shrink-0">
                            <button
                              onClick={() =>
                                onUpdateQuantity(
                                  item.id,
                                  item.quantity - 1,
                                )
                              }
                              className="px-2 sm:px-3 py-1.5 hover:bg-gray-50 transition-colors"
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                            <input
                              type="text"
                              value={
                                editingQuantities[item.id] !==
                                undefined
                                  ? editingQuantities[item.id]
                                  : item.quantity
                              }
                              onChange={(e) =>
                                handleQuantityChange(e, item.id)
                              }
                              onBlur={() =>
                                applyQuantityChange(item.id)
                              }
                              onKeyDown={(e) =>
                                handleQuantityKeyDown(
                                  e,
                                  item.id,
                                )
                              }
                              className="px-2 sm:px-4 py-1.5 text-sm sm:text-base min-w-[40px] sm:min-w-[50px] text-center border-x border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all"
                            />
                            <button
                              onClick={() =>
                                onUpdateQuantity(
                                  item.id,
                                  item.quantity + 1,
                                )
                              }
                              className="px-2 sm:px-3 py-1.5 hover:bg-gray-50 transition-colors"
                              disabled={item.quantity >= 999}
                            >
                              <Plus className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                          </div>
                          <p className="text-sm sm:text-base font-medium whitespace-nowrap">
                            {(
                              item.price * item.quantity
                            ).toLocaleString("ru-RU")}{" "}
                            ₽
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Coupon Section */}
              <div className="mt-12 md:mt-16 pt-6 md:pt-8 border-t border-gray-200">
                <h3 className="text-base md:text-lg mb-2">
                  Есть купон?
                </h3>
                <p className="text-sm text-gray-500 mb-4 md:mb-6">
                  Введите ваш код для мгновенной скидки на
                  корзину
                </p>
                <div className="flex gap-2 sm:gap-3 md:gap-4">
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) =>
                      setCouponCode(e.target.value)
                    }
                    placeholder="Код купона"
                    className="flex-1 min-w-0 px-3 sm:px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all text-sm sm:text-base"
                  />
                  <button
                    onClick={handleApplyCoupon}
                    className="btn-primary whitespace-nowrap px-4 py-3 text-sm font-medium sm:px-6 sm:text-base md:px-8"
                  >
                    Применить
                  </button>
                </div>
              </div>
            </div>

            {/* Cart Summary Sidebar */}
            <div className="w-full lg:w-[380px] flex-shrink-0">
              <div className="border border-gray-200 rounded-2xl p-6 md:p-8 lg:sticky lg:top-32">
                <h2 className="text-lg md:text-xl mb-6">
                  Итого по заказу
                </h2>

                {/* Shipping Options */}
                <div className="space-y-3 md:space-y-4 mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-200">
                  <label className="flex items-center justify-between p-3 md:p-4 border border-gray-900 rounded-xl bg-gray-50">
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shipping"
                        checked
                        readOnly
                        className="w-4 h-4 md:w-5 md:h-5 accent-gray-900"
                      />
                      <span className="text-sm md:text-base">
                        Самовывоз из ПВЗ Яндекса
                      </span>
                    </div>
                    <span className="text-sm md:text-base">
                      +500 ₽
                    </span>
                  </label>
                </div>

                {/* Totals */}
                <div className="space-y-3 md:space-y-4 mb-6 md:mb-8">
                  <div className="flex justify-between text-sm md:text-base">
                    <span className="text-gray-600">
                      Подытог
                    </span>
                    <span>
                      {subtotal.toLocaleString("ru-RU")} ₽
                    </span>
                  </div>
                  {shippingCost > 0 && (
                    <div className="flex justify-between text-sm md:text-base">
                      <span className="text-gray-600">
                        Доставка
                      </span>
                      <span>
                        {shippingCost.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>
                  )}
                  <div className="pt-3 md:pt-4 border-t border-gray-200">
                    <div className="flex justify-between text-base md:text-lg">
                      <span>Всего</span>
                      <span>
                        {total.toLocaleString("ru-RU")} ₽
                      </span>
                    </div>
                  </div>
                </div>

                {/* Checkout Button */}
                <button
                  onClick={() => onCheckout(shippingMethod)}
                  className="btn-primary w-full py-3 text-base md:py-4"
                >
                  Оформить заказ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
