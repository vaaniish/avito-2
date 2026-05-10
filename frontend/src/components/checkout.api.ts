import type { Product } from "../types";
import { apiGet, apiPost } from "../lib/api";
import type {
  CreateOrdersResponse,
  DeliveryPointsResponse,
  DeliveryProvider,
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
  provider: DeliveryProvider["code"] | "all";
  cursor?: number;
}): Promise<DeliveryPointsResponse> {
  const search = new URLSearchParams({ city: params.city });
  if (params.provider && params.provider !== "all") {
    search.set("provider", params.provider);
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

export function createCheckoutOrders(
  payload: {
    items: Array<{ listingId: string; quantity: number }>;
    addressId: null;
    customAddress: string;
    pickupPointId: string | null;
    pickupPointProvider: string | null;
    deliveryType: "delivery" | "pickup";
    paymentMethod: PaymentMethod;
  },
  idempotencyKey: string,
): Promise<CreateOrdersResponse> {
  return apiPost<CreateOrdersResponse>("/profile/orders", payload, {
    "Idempotency-Key": idempotencyKey,
  });
}
