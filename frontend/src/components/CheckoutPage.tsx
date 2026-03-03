import React, { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, MapPin } from "lucide-react";
import type { CartItem } from "../types";
import { apiGet, apiPost } from "../lib/api";

interface CheckoutPageProps {
  items: CartItem[];
  onBack: () => void;
  onComplete: (result: {
    orderIds: string[];
    total: number;
    paymentMethod: "card" | "cash";
  }) => void;
}

type Address = {
  id: string;
  label: string;
  fullAddress: string;
  isDefault: boolean;
};

type CreateOrdersResponse = {
  success: boolean;
  orders: Array<{
    order_id: string;
    total_price: number;
  }>;
  total: number;
};

export function CheckoutPage({ items, onBack, onComplete }: CheckoutPageProps) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [customAddress, setCustomAddress] = useState("");
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "cash">("card");
  const [cardDetails, setCardDetails] = useState({ number: "", expiry: "", cvc: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let ignore = false;

    const loadAddresses = async () => {
      try {
        const result = await apiGet<Address[]>("/profile/addresses");
        if (!ignore) {
          setAddresses(result);
          const defaultAddress = result.find((address) => address.isDefault);
          setSelectedAddress(defaultAddress?.id ?? result[0]?.id ?? null);
        }
      } catch (_error) {
        if (!ignore) {
          setAddresses([]);
        }
      }
    };

    void loadAddresses();

    return () => {
      ignore = true;
    };
  }, []);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items],
  );
  const shipping = 0;
  const total = subtotal + shipping;

  const handlePlaceOrder = async () => {
    if (!useCustomAddress && !selectedAddress) {
      alert("Пожалуйста, выберите адрес доставки");
      return;
    }
    if (useCustomAddress && !customAddress.trim()) {
      alert("Пожалуйста, введите адрес доставки");
      return;
    }

    if (paymentMethod === "card") {
      if (!cardDetails.number || !cardDetails.expiry || !cardDetails.cvc) {
        alert("Пожалуйста, заполните данные карты");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const response = await apiPost<CreateOrdersResponse>("/profile/orders", {
        items: items.map((item) => ({ listingId: item.id, quantity: item.quantity })),
        addressId: useCustomAddress ? null : selectedAddress,
        customAddress: useCustomAddress ? customAddress.trim() : null,
        deliveryType: "delivery",
        paymentMethod,
      });

      const orderIds = response.orders.map((order) => order.order_id);
      if (orderIds.length === 0) {
        throw new Error("Сервер не вернул созданные заказы");
      }

      onComplete({
        orderIds,
        total: response.total,
        paymentMethod,
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Не удалось оформить заказ");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white pt-24 md:pt-28 pb-16">
      <div className="max-w-[1200px] mx-auto px-4 md:px-6">
        <h1 className="text-3xl md:text-5xl text-gray-900 mb-8 md:mb-12 text-center">Оформление заказа</h1>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 md:gap-8">
          <div className="space-y-6 md:space-y-8">
            <div className="bg-white rounded-2xl p-6 md:p-8 border border-gray-200">
              <h2 className="text-xl md:text-2xl text-gray-900 mb-6">Адрес доставки</h2>

              <div className="mb-6 space-y-3">
                <p className="text-sm text-gray-600 uppercase tracking-wide mb-3">Выберите из сохраненных адресов</p>
                {addresses.map((address) => (
                  <button
                    key={address.id}
                    onClick={() => {
                      setSelectedAddress(address.id);
                      setUseCustomAddress(false);
                    }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-300 ${
                      selectedAddress === address.id && !useCustomAddress
                        ? "border-gray-900 bg-gray-50"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 mb-1">
                            {address.label}
                            {address.isDefault && <span className="ml-2 text-xs text-green-600">(по умолчанию)</span>}
                          </p>
                          <p className="text-sm text-gray-600">{address.fullAddress}</p>
                        </div>
                      </div>
                      {selectedAddress === address.id && !useCustomAddress && (
                        <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="pt-6 border-t border-gray-200">
                <button
                  onClick={() => setUseCustomAddress((prev) => !prev)}
                  className="flex items-center gap-2 text-sm text-gray-900 hover:text-gray-700 transition-colors duration-300 mb-4"
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-300 ${
                      useCustomAddress ? "border-gray-900 bg-gray-900" : "border-gray-300"
                    }`}
                  >
                    {useCustomAddress && <Check className="w-3 h-3 text-white" />}
                  </div>
                  Ввести новый адрес
                </button>

                {useCustomAddress && (
                  <input
                    type="text"
                    value={customAddress}
                    onChange={(event) => setCustomAddress(event.target.value)}
                    placeholder="Введите полный адрес доставки"
                    className="w-full px-4 py-3 bg-white rounded-xl border border-gray-300 text-gray-900 text-sm focus:outline-none focus:border-gray-900 transition-colors duration-300"
                  />
                )}
              </div>
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
                  <span className="text-sm md:text-base text-gray-900">Наличными при получении</span>
                  {paymentMethod === "cash" && (
                    <div className="w-5 h-5 rounded-full bg-gray-900 text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </button>
              </div>

              {paymentMethod === "card" && (
                <div className="space-y-4 pt-6 border-t border-gray-200">
                  <input
                    type="text"
                    value={cardDetails.number}
                    onChange={(event) =>
                      setCardDetails((prev) => ({ ...prev, number: event.target.value }))
                    }
                    placeholder="Номер карты"
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-gray-900"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={cardDetails.expiry}
                      onChange={(event) =>
                        setCardDetails((prev) => ({ ...prev, expiry: event.target.value }))
                      }
                      placeholder="ММ/ГГ"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-gray-900"
                    />
                    <input
                      type="text"
                      value={cardDetails.cvc}
                      onChange={(event) =>
                        setCardDetails((prev) => ({ ...prev, cvc: event.target.value }))
                      }
                      placeholder="CVC"
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-gray-900"
                    />
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
                      <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
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
                  <span className="text-gray-600">Доставка</span>
                  <span className="text-green-600">Бесплатно</span>
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
                  className="w-full py-4 bg-[rgb(38,83,141)] hover:bg-[rgb(58,103,161)] disabled:bg-gray-400 text-white rounded-xl transition-all duration-300 text-sm md:text-base"
                >
                  {isSubmitting ? "Оформляем..." : "Оформить заказ"}
                </button>
                <button
                  onClick={onBack}
                  className="w-full py-4 bg-white text-gray-900 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all duration-300 text-sm md:text-base"
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
