import { validationError } from "../../../../common/application-error";
import type { DeliveryExternalStatus, DeliveryProviderCode } from "../../order-delivery";

export const ORDER_DELIVERY_SYNC_INTERVAL_MS = 2 * 60 * 1000;
export const DEFAULT_TRACKING_PROVIDER: DeliveryProviderCode = "yandex_pvz";

export function toDeliveryType(value: string): "pickup" | "delivery" {
  return value === "PICKUP" ? "pickup" : "delivery";
}

export function parseOrderStatus(value: unknown) {
  const raw = typeof value === "string" ? value.toUpperCase() : "";
  if (raw === "CREATED") return "CREATED";
  if (raw === "PAID") return "PAID";
  if (raw === "PROCESSING") return "PROCESSING";
  if (raw === "PREPARED") return "PREPARED";
  if (raw === "SHIPPED") return "SHIPPED";
  if (raw === "DELIVERED") return "DELIVERED";
  if (raw === "COMPLETED") return "COMPLETED";
  if (raw === "CANCELLED") return "CANCELLED";
  return null;
}

export function parseSellerEditableOrderStatus(value: unknown) {
  const raw = parseOrderStatus(value);
  if (raw === "PREPARED") return raw;
  return null;
}

export function normalizeTrackingProvider(value: unknown): DeliveryProviderCode {
  if (value === "russian_post") return "russian_post";
  if (value === "yandex_pvz") return "yandex_pvz";
  return DEFAULT_TRACKING_PROVIDER;
}

export function mapExternalDeliveryStatusToOrderStatus(
  status: DeliveryExternalStatus,
) {
  if (status === "IN_TRANSIT") return "SHIPPED";
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "ISSUED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  return null;
}

export function shouldSyncDeliveryStatus(order: {
  status: string;
  delivery_type: string;
  tracking_number: string | null;
  delivery_checked_at: Date | null;
}): boolean {
  if (order.delivery_type !== "DELIVERY") return false;
  if (!order.tracking_number) return false;
  if (order.status === "CANCELLED" || order.status === "COMPLETED") return false;
  if (!order.delivery_checked_at) return true;
  return (
    Date.now() - order.delivery_checked_at.getTime() >=
    ORDER_DELIVERY_SYNC_INTERVAL_MS
  );
}

export function mapPartnerOrder(order: {
  public_id: string;
  buyer: { public_id: string; name: string };
  total_price: number;
  status: string;
  delivery_type: string;
  created_at: Date;
  tracking_provider: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  delivery_ext_status: string | null;
  delivery_address: string | null;
  transactions: Array<{
    amount: number;
    commission: number;
    commission_rate: number;
    status: string;
    payment_provider: string | null;
    payment_intent_id: string | null;
  }>;
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    listing: { public_id: string } | null;
  }>;
}) {
  const latestTransaction = order.transactions[0] ?? null;
  const grossAmount = latestTransaction?.amount ?? order.total_price;
  const commissionAmount = latestTransaction?.commission ?? null;
  const sellerPayout =
    commissionAmount === null ? null : grossAmount - commissionAmount;

  return {
    id: order.public_id,
    buyer_name: order.buyer.name,
    buyer_id: order.buyer.public_id,
    total_price: order.total_price,
    status: order.status,
    delivery_type: toDeliveryType(order.delivery_type),
    created_at: order.created_at,
    tracking_provider: order.tracking_provider,
    tracking_number: order.tracking_number,
    tracking_url: order.tracking_url,
    delivery_ext_status: order.delivery_ext_status,
    delivery_address: order.delivery_address,
    finance: {
      gross_amount: grossAmount,
      commission_rate: latestTransaction?.commission_rate ?? null,
      commission_amount: commissionAmount,
      seller_payout: sellerPayout,
      transaction_status: latestTransaction?.status ?? null,
      payment_provider: latestTransaction?.payment_provider?.toLowerCase() ?? null,
      payment_intent_id: latestTransaction?.payment_intent_id ?? null,
    },
    items: order.items.map((item) => ({
      id: String(item.id),
      listing_public_id: item.listing?.public_id ?? "",
      name: item.name,
      quantity: item.quantity,
      price: item.price,
    })),
  };
}
