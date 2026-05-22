import { useEffect, useState } from "react";
import { ArrowLeft, Minus, Plus, Heart, Trash2 } from "lucide-react";
import type { CartItem, Product } from "../../shared/types";
import { fetchCartRecommendations } from "../../shared/lib/recommendations.api";
import type { RecommendationItem } from "../../shared/types/recommendations";
import { RecommendationShelf } from "../../widgets/recommendations/RecommendationShelf";
import type { AppliedPromo } from "../../shared/types/promo";
import { PromoCodePanel } from "../../shared/ui/PromoCodePanel";

interface CartPageProps {
  items: CartItem[];
  wishlistProductIds: Set<string>;
  couponCode: string;
  appliedPromo: AppliedPromo | null;
  couponError: string | null;
  isApplyingCoupon: boolean;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onWishlistToggle: (productId: string, shouldAddToWishlist: boolean) => void;
  onOpenListing: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onCheckout: (deliveryType: "delivery" | "pickup") => void;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => Promise<boolean>;
  onEditAppliedCoupon: () => void;
  onBackToHome: () => void;
}

export function CartPage({
  items,
  wishlistProductIds,
  couponCode,
  appliedPromo,
  couponError,
  isApplyingCoupon,
  onUpdateQuantity,
  onWishlistToggle,
  onOpenListing,
  onAddToCart,
  onCheckout,
  onCouponCodeChange,
  onApplyCoupon,
  onEditAppliedCoupon,
  onBackToHome,
}: CartPageProps) {
  const shippingMethod: "delivery" = "delivery";
  const [editingQuantities, setEditingQuantities] = useState<{
    [key: string]: string;
  }>({});
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);

  useEffect(() => {
    let ignore = false;
    if (items.length === 0) {
      setRecommendations([]);
      return;
    }

    const load = async () => {
      try {
        const next = await fetchCartRecommendations(items.map((item) => item.id));
        if (!ignore) {
          setRecommendations(next);
        }
      } catch {
        if (!ignore) {
          setRecommendations([]);
        }
      }
    };

    void load();

    return () => {
      ignore = true;
    };
  }, [items]);

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
  const discountAmount = appliedPromo?.discountAmount ?? 0;
  const total = Math.max(0, subtotal - discountAmount + shippingCost);

  return (
    <div className="min-h-screen app-shell pb-24 pt-6 md:pt-12">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <button
          type="button"
          onClick={onBackToHome}
          className="back-link mb-6 inline-flex items-center gap-2 text-sm md:text-base"
        >
          <ArrowLeft className="h-4 w-4" />
          На главную
        </button>

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
          <>
            <div className="flex max-w-full flex-col gap-8 lg:items-start lg:flex-row lg:gap-12">
              {/* Cart Items */}
              <div className="min-w-0 max-w-full flex-1">
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
                {items.map((item) => {
                  const isWishlisted = wishlistProductIds.has(item.id);
                  return (
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
                          <button
                            type="button"
                            onClick={() => onOpenListing(item)}
                            className="mb-3 text-left text-base font-medium text-[rgb(38,83,141)] transition hover:text-[rgb(26,64,116)] hover:underline"
                          >
                            {item.title}
                          </button>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                onWishlistToggle(item.id, !isWishlisted)
                              }
                              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                              title="В избранное"
                            >
                              <Heart
                                className={`w-5 h-5 ${
                                  isWishlisted
                                    ? "fill-red-500 text-red-500"
                                    : "text-gray-700"
                                }`}
                              />
                            </button>
                            <button
                              type="button"
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
                            type="button"
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
                            type="button"
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
                          <button
                            type="button"
                            onClick={() => onOpenListing(item)}
                            className="min-w-0 flex-1 break-words text-left text-sm font-medium text-[rgb(38,83,141)] transition hover:text-[rgb(26,64,116)] hover:underline sm:text-base"
                          >
                            {item.title}
                          </button>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                onWishlistToggle(item.id, !isWishlisted)
                              }
                              className="p-1 hover:bg-gray-100 rounded transition-colors"
                              title="В избранное"
                            >
                              <Heart
                                className={`w-4 h-4 sm:w-5 sm:h-5 ${
                                  isWishlisted
                                    ? "fill-red-500 text-red-500"
                                    : "text-gray-700"
                                }`}
                              />
                            </button>
                            <button
                              type="button"
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
                              type="button"
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
                              type="button"
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
                  );
                })}
              </div>

              {recommendations.length > 0 ? (
                <div className="mt-12 min-w-0 max-w-full overflow-hidden md:mt-16">
                  <h2 className="mb-3 text-xl text-gray-900 md:text-2xl">
                    Вам может понравится
                  </h2>
                  <div className="min-w-0 max-w-full overflow-hidden">
                  <RecommendationShelf
                    title="Вам может понравится"
                    showHeader={false}
                    items={recommendations}
                    cartItems={items}
                    wishlistProductIds={wishlistProductIds}
                    onProductClick={onOpenListing}
                    onAddToCart={onAddToCart}
                    onUpdateQuantity={onUpdateQuantity}
                    onWishlistToggle={onWishlistToggle}
                  />
                  </div>
                </div>
              ) : null}
            </div>

              {/* Cart Summary Sidebar */}
              <div className="w-full flex-shrink-0 lg:w-[380px] lg:self-start">
                <div className="border border-gray-200 rounded-2xl p-6 md:p-8 lg:sticky lg:top-28">
                <h2 className="text-lg md:text-xl mb-6">
                  Итого по заказу
                </h2>

                <div className="mb-6 md:mb-8 pb-6 md:pb-8 border-b border-gray-200">
                  <PromoCodePanel
                    couponCode={couponCode}
                    appliedPromo={appliedPromo}
                    couponError={couponError}
                    isApplyingCoupon={isApplyingCoupon}
                    onCouponCodeChange={onCouponCodeChange}
                    onApplyCoupon={onApplyCoupon}
                    onEditAppliedCoupon={onEditAppliedCoupon}
                  />
                </div>

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
                        Доставка в ПВЗ
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
                  <div className="flex justify-between text-sm md:text-base">
                    <span className="text-gray-600">
                      Скидка
                    </span>
                    <span className={discountAmount > 0 ? "text-emerald-700" : "text-gray-400"}>
                      {discountAmount > 0 ? `-${discountAmount.toLocaleString("ru-RU")} ₽` : "—"}
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
          </>
        )}
      </div>
    </div>
  );
}
