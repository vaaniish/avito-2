import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, Product } from "../shared/types";
import { trackRecommendationEvent } from "../shared/lib/recommendations.api";
import { apiGet } from "../shared/lib/api";
import { dispatchCatalogOrderUpdated } from "../shared/lib/catalog-order-events";
import { notifyInfo } from "../shared/ui/notifications";
import { previewCheckoutPromo } from "../pages/checkout/checkout.api";
import type { AppliedPromo } from "../shared/types/promo";
type CheckoutFlowResult = {
  orderIds: string[];
  total: number;
  deliveryType: "delivery" | "pickup";
  itemIds: string[];
};

const CART_STORAGE_KEY_PREFIX = "ecomm_cart";

function buildCartStorageKey(userPublicId: string | null): string {
  return userPublicId
    ? `${CART_STORAGE_KEY_PREFIX}:${userPublicId}`
    : `${CART_STORAGE_KEY_PREFIX}:guest`;
}

function readCartFromStorage(storageKey: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CartItem =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as CartItem).id === "string" &&
        typeof (item as CartItem).quantity === "number",
    );
  } catch {
    return [];
  }
}

function resolveMaxCartQuantity(item: Pick<Product, "availableQuantity" | "hasMultipleStock">): number {
  const explicitQuantity = Number(item.availableQuantity);
  if (Number.isInteger(explicitQuantity) && explicitQuantity > 0) {
    return explicitQuantity;
  }
  return item.hasMultipleStock ? 999 : 1;
}

export function useAppCartState(params: {
  isAuthenticated: boolean;
  userType: "regular" | "partner" | "admin";
  currentUserPublicId: string | null;
  onRequireAuth: () => void;
}) {
  const { currentUserPublicId, isAuthenticated, onRequireAuth, userType } = params;
  const storageKey = useMemo(
    () => buildCartStorageKey(currentUserPublicId),
    [currentUserPublicId],
  );
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [lastOrderIds, setLastOrderIds] = useState<string[]>([]);
  const [selectedDeliveryType, setSelectedDeliveryType] = useState<
    "delivery" | "pickup"
  >("delivery");
  const [lastDeliveryType, setLastDeliveryType] = useState<
    "delivery" | "pickup"
  >("delivery");
  const [couponCode, setCouponCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const previousStorageKeyRef = useRef(storageKey);
  const couponCodeRef = useRef(couponCode);

  useEffect(() => {
    couponCodeRef.current = couponCode;
  }, [couponCode]);

  useEffect(() => {
    const previousStorageKey = previousStorageKeyRef.current;
    if (previousStorageKey !== storageKey && !currentUserPublicId && typeof window !== "undefined") {
      window.localStorage.removeItem(previousStorageKey);
    }
    setCartItems(readCartFromStorage(storageKey));
    previousStorageKeyRef.current = storageKey;
  }, [currentUserPublicId, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cartItems.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(cartItems));
  }, [cartItems, storageKey]);

  useEffect(() => {
    setCartItems((prev) => {
      let changed = false;
      const next = prev.map((item) => {
        const maxQuantity = resolveMaxCartQuantity(item);
        if (item.quantity <= maxQuantity) {
          return item;
        }
        changed = true;
        return {
          ...item,
          quantity: maxQuantity,
        };
      }).filter((item) => item.quantity > 0);
      return changed ? next : prev;
    });
  }, []);

  const cartItemIdsSignature = useMemo(
    () => cartItems.map((item) => item.id).sort((left, right) => left.localeCompare(right)).join("|"),
    [cartItems],
  );

  useEffect(() => {
    if (cartItems.length === 0) return;
    let cancelled = false;

    const refreshCartItems = async () => {
      try {
        const latestProducts = await Promise.all(
          cartItems.map((item) =>
            apiGet<Product>(`/catalog/listings/${encodeURIComponent(item.id)}`).catch(() => null),
          ),
        );
        if (cancelled) return;

        const latestById = new Map(
          latestProducts
            .filter((item): item is Product => Boolean(item?.id))
            .map((item) => [item.id, item]),
        );

        setCartItems((prev) =>
          prev.map((item) => {
            const latest = latestById.get(item.id);
            if (!latest) return item;
            return {
              ...item,
              ...latest,
              quantity: Math.min(item.quantity, resolveMaxCartQuantity(latest)),
            };
          }).filter((item) => item.quantity > 0),
        );
      } catch {
        // Keep existing cart snapshot if refresh fails.
      }
    };

    void refreshCartItems();

    return () => {
      cancelled = true;
    };
  }, [cartItemIdsSignature]);

  const cartItemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );
  const cartPromoSignature = useMemo(
    () =>
      cartItems
        .map((item) => `${item.id}:${item.quantity}`)
        .sort((left, right) => left.localeCompare(right))
        .join("|"),
    [cartItems],
  );

  const requestLoginForCartAccess = useCallback(() => {
    if (isAuthenticated) {
      return true;
    }

    onRequireAuth();
    return false;
  }, [isAuthenticated, onRequireAuth]);

  const addToCartUnsafe = useCallback((product: Product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      const maxQuantity = resolveMaxCartQuantity(product);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...product,
                ...item,
                ...product,
                quantity: Math.min(item.quantity + 1, maxQuantity),
              }
            : item,
        );
      }

      return [...prev, { ...product, quantity: 1 }];
    });
  }, []);

  const addToCart = useCallback(
    (product: Product) => {
      if (!requestLoginForCartAccess()) {
        return;
      }
      if (userType === "partner" && currentUserPublicId && product.sellerId === currentUserPublicId) {
        notifyInfo("Нельзя добавить в корзину собственное объявление.");
        return;
      }
      const existing = cartItems.find((item) => item.id === product.id);
      const maxQuantity = resolveMaxCartQuantity(product);
      if (existing && existing.quantity >= maxQuantity) {
        notifyInfo(
          maxQuantity <= 1
            ? "Этот товар доступен только в одном экземпляре."
            : `Доступно только ${maxQuantity} шт.`,
        );
        return;
      }
      addToCartUnsafe(product);
      void trackRecommendationEvent({
        listingPublicId: product.id,
        eventType: "ADD_TO_CART",
        sourcePage: "cart-flow",
      }).catch(() => undefined);
    },
    [addToCartUnsafe, cartItems, currentUserPublicId, userType],
  );

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    setCartItems((prev) => {
      const current = prev.find((item) => item.id === id);
      if (!current) return prev;
      const maxQuantity = resolveMaxCartQuantity(current);
      return prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity: Math.max(1, Math.min(quantity, maxQuantity)),
            }
          : item,
      );
    });
  }, []);

  const syncCartItemProduct = useCallback((product: Product) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.id === product.id
          ? {
              ...item,
              ...product,
              quantity: Math.min(item.quantity, resolveMaxCartQuantity(product)),
            }
          : item,
      ),
    );
  }, []);

  const handleRemoveUnavailableItems = useCallback((itemIds: string[]) => {
    setCartItems((prev) => prev.filter((item) => !itemIds.includes(item.id)));
  }, []);

  const resetCouponState = useCallback(() => {
    setCouponCode("");
    setAppliedPromo(null);
    setCouponError(null);
  }, []);

  const unlockAppliedCoupon = useCallback(() => {
    setAppliedPromo(null);
    setCouponError(null);
  }, []);

  const handleCouponCodeChange = useCallback((value: string) => {
    setCouponCode(value);
    if (appliedPromo && value.trim().toUpperCase() !== appliedPromo.code) {
      setAppliedPromo(null);
    }
    if (couponError) {
      setCouponError(null);
    }
  }, [appliedPromo, couponError]);

  const applyCoupon = useCallback(
    async (options?: { silent?: boolean; promoCode?: string }) => {
      const nextCode = (options?.promoCode ?? couponCodeRef.current).trim().toUpperCase();

      if (!requestLoginForCartAccess()) {
        return false;
      }
      if (!nextCode) {
        setAppliedPromo(null);
        setCouponError("Введите промокод");
        return false;
      }
      if (cartItems.length === 0) {
        setAppliedPromo(null);
        setCouponError("Добавьте товары в корзину, чтобы применить промокод");
        return false;
      }

      if (!options?.silent) {
        setIsApplyingCoupon(true);
      }
      if (!options?.silent) {
        setCouponError(null);
      }

      try {
        const result = await previewCheckoutPromo({
          items: cartItems.map((item) => ({
            listingId: item.id,
            quantity: item.quantity,
          })),
          promoCode: nextCode,
        });

        setCouponCode(result.code);
        setAppliedPromo({
          code: result.code,
          discountAmount: result.discountAmount,
          discountPercent: result.discountPercent,
          subtotal: result.subtotal,
          remainingActivations: result.remainingActivations,
          message: result.message,
        });
        setCouponError(null);
        return true;
      } catch (error) {
        setAppliedPromo(null);
        setCouponError(
          error instanceof Error ? error.message : "Не удалось применить промокод",
        );
        return false;
      } finally {
        if (!options?.silent) {
          setIsApplyingCoupon(false);
        }
      }
    },
    [cartItems, requestLoginForCartAccess],
  );

  useEffect(() => {
    if (!appliedPromo) return;
    if (cartItems.length === 0) {
      setAppliedPromo(null);
      setCouponError(null);
      return;
    }
    void applyCoupon({ silent: true, promoCode: appliedPromo.code });
  }, [appliedPromo?.code, applyCoupon, cartItems.length, cartPromoSignature]);

  const handleOrderCreated = useCallback((result: CheckoutFlowResult) => {
    setLastOrderTotal(result.total);
    setLastOrderIds(result.orderIds);
    setLastDeliveryType(result.deliveryType);
  }, []);

  const handleOrderComplete = useCallback((result: CheckoutFlowResult) => {
    setLastOrderTotal(result.total);
    setLastOrderIds(result.orderIds);
    setLastDeliveryType(result.deliveryType);
    setCartItems([]);
    setCouponCode("");
    setAppliedPromo(null);
    setCouponError(null);
    dispatchCatalogOrderUpdated();
  }, []);

  return {
    cartItems,
    cartItemCount,
    lastDeliveryType,
    lastOrderIds,
    lastOrderTotal,
    selectedDeliveryType,
    setSelectedDeliveryType,
    couponCode,
    appliedPromo,
    couponError,
    isApplyingCoupon,
    setCouponCode: handleCouponCodeChange,
    applyCoupon,
    resetCouponState,
    unlockAppliedCoupon,
    requestLoginForCartAccess,
    addToCartUnsafe,
    addToCart,
    updateQuantity,
    syncCartItemProduct,
    handleRemoveUnavailableItems,
    handleOrderCreated,
    handleOrderComplete,
  };
}
