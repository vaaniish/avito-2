import type { Product } from "../../shared/types";
import { apiGet, apiPost } from "../../shared/lib/api";
import type {
  CreateOrdersResponse,
  CheckoutPromoPreviewResponse,
  DeliveryProviderFilter,
  DeliveryPointsResponse,
  PaymentMethod,
  PaymentStatusResponse,
} from "./checkout.models";

export type CheckoutPolicy = {
  id: string;
  version: string;
  title: string;
  contentUrl: string;
};

export function fetchCheckoutPolicy(): Promise<CheckoutPolicy> {
  return apiGet<CheckoutPolicy>("/public/policy/current?scope=checkout");
}

export function fetchDeliveryPoints(params: {
  city: string;
  provider: DeliveryProviderFilter;
  cursor?: number;
  bbox?: string | null;
}): Promise<DeliveryPointsResponse> {
  const search = new URLSearchParams({ city: params.city });
  if (params.provider && params.provider !== "all") {
    search.set("provider", params.provider);
  }
  if (params.bbox) {
    search.set("bbox", params.bbox);
  }
  if (params.provider === "russian_post") {
    search.set("cursor", String(Math.max(0, Number(params.cursor ?? 0))));
    search.set("limit", "250");
  }
  return apiGet<DeliveryPointsResponse>(`/profile/delivery-points?${search.toString()}`);
}

export function fetchCheckoutProductListings(): Promise<Product[]> {
  return apiGet<Product[]>("/catalog/listings?type=products");
}

export function fetchPaymentStatus(orderIds: string[]): Promise<PaymentStatusResponse> {
  return apiGet<PaymentStatusResponse>(
    `/profile/orders/payment-status?orderIds=${encodeURIComponent(orderIds.join(","))}`,
  );
}

export function previewCheckoutPromo(payload: {
  items: Array<{ listingId: string; quantity: number }>;
  promoCode: string;
}): Promise<CheckoutPromoPreviewResponse> {
  return apiPost<CheckoutPromoPreviewResponse>("/profile/orders/promo/preview", payload);
}

export function createCheckoutOrders(
  payload: {
    items: Array<{ listingId: string; quantity: number }>;
    pickupPointAddress: string;
    pickupPointId: string | null;
    pickupPointProvider: string | null;
    deliveryType: "delivery" | "pickup";
    paymentMethod: PaymentMethod;
    promoCode: string;
  },
  idempotencyKey: string,
): Promise<CreateOrdersResponse> {
  return apiPost<CreateOrdersResponse>("/profile/orders", payload, {
    "Idempotency-Key": idempotencyKey,
  });
}
