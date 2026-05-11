import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, Product } from "../shared/types";
import { notifyInfo } from "../shared/ui/notifications";
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
  const previousStorageKeyRef = useRef(storageKey);

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

  const cartItemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
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
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
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
      addToCartUnsafe(product);
    },
    [addToCartUnsafe, currentUserPublicId, requestLoginForCartAccess, userType],
  );

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    setCartItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
            }
          : item,
      ),
    );
  }, []);

  const handleRemoveUnavailableItems = useCallback((itemIds: string[]) => {
    setCartItems((prev) => prev.filter((item) => !itemIds.includes(item.id)));
  }, []);

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
  }, []);

  return {
    cartItems,
    cartItemCount,
    lastDeliveryType,
    lastOrderIds,
    lastOrderTotal,
    selectedDeliveryType,
    setSelectedDeliveryType,
    requestLoginForCartAccess,
    addToCartUnsafe,
    addToCart,
    updateQuantity,
    handleRemoveUnavailableItems,
    handleOrderCreated,
    handleOrderComplete,
  };
}
