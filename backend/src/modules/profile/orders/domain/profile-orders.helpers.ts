import type { OrderStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import type {
  BuyerOrderWithRelations,
  BuyerProfileOrderDto,
  BuyerProfileOrderStatus,
  DeliveryProviderCode,
  ProfileOrdersServiceHelpers,
} from "./profile-orders.types";

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export const LISTING_RESERVATION_CONFLICT = "LISTING_RESERVATION_CONFLICT";

export function makeCheckoutIdempotencyHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

export function mapDeliveryStatusToOrderStatus(
  status: string,
): OrderStatus | null {
  if (status === "IN_TRANSIT") return "SHIPPED";
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "ISSUED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  return null;
}

export function shouldSyncBuyerDeliveryStatus(order: {
  status: string;
  delivery_type: string;
  tracking_provider: string | null;
  tracking_number: string | null;
  delivery_checked_at: Date | null;
}): boolean {
  if (order.delivery_type !== "DELIVERY") return false;
  if (!order.tracking_provider || !order.tracking_number) return false;
  if (order.status === "CANCELLED" || order.status === "COMPLETED") return false;
  if (!order.delivery_checked_at) return true;
  return Date.now() - order.delivery_checked_at.getTime() >= 30_000;
}

export function buildCheckoutPolicyDto(policy: {
  public_id: string;
  version: string;
  title: string;
  content_url: string;
} | null) {
  if (!policy) {
    return null;
  }

  return {
    id: policy.public_id,
    scope: "checkout" as const,
    version: policy.version,
    title: policy.title,
    contentUrl: policy.content_url,
  };
}

export function mapBuyerOrder(
  order: BuyerOrderWithRelations,
  reviewedListingIds: Set<number>,
  helpers: ProfileOrdersServiceHelpers,
): BuyerProfileOrderDto {
  return {
    id: String(order.id),
    orderNumber: `#${order.public_id}`,
    date: order.created_at,
    status: helpers.toProfileOrderStatus(order.status),
    total: order.total_price,
    deliveryDate: helpers.toLocalizedDeliveryDate(order.created_at),
    deliveryAddress:
      helpers.stripPickupPointTag(order.delivery_address) || "Адрес не указан",
    deliveryCost: order.delivery_cost,
    discount: order.discount,
    trackingProvider: order.tracking_provider,
    trackingNumber: order.tracking_number,
    trackingUrl: order.tracking_url,
    deliveryExternalStatus: order.delivery_ext_status,
    seller: {
      name: order.seller.name,
      avatar: order.seller.avatar,
      phone: order.seller.phone ?? "",
      address: `${
        helpers.extractPrimaryCityFromAddresses(order.seller.addresses) ??
        "Город не указан"
      }`,
      workingHours: "пн — вс: 9:00-21:00",
    },
    items: order.items.map((item) => {
      const reviewed =
        item.listing_id !== null && reviewedListingIds.has(item.listing_id);
      return {
        id: String(item.id),
        listingPublicId: item.listing?.public_id ?? "",
        name: item.name,
        image: item.image ?? "",
        price: item.price,
        quantity: item.quantity,
        reviewed,
        canReview:
          order.status === "COMPLETED" &&
          item.listing_id !== null &&
          !reviewed,
      };
    }),
  };
}

export type ProfileOrdersServicesDeps = {
  repository: import("./profile-orders.types").ProfileOrdersRepositoryPort;
  paymentGateway: import("./profile-orders.types").ProfileOrdersPaymentGatewayPort;
  deliveryGateway: import("./profile-orders.types").ProfileOrdersDeliveryGatewayPort;
  notificationWriter: import("./profile-orders.types").ProfileOrdersNotificationPort;
  policyReader: import("./profile-orders.types").ProfileOrdersPolicyPort;
  helpers: ProfileOrdersServiceHelpers;
};

export function normalizeDeliveryAddressFromRecord(params: {
  address: {
    full_address: string | null;
    region: string | null;
    city: string | null;
    street: string | null;
    house: string | null;
    apartment: string | null;
    entrance: string | null;
  };
  helpers: ProfileOrdersServiceHelpers;
}): string {
  return (
    params.helpers.normalizeTextField(params.address.full_address) ||
    params.helpers.buildAddressFullAddress({
      region: params.address.region ?? "",
      city: params.address.city ?? "",
      street: params.address.street ?? "",
      house: params.address.house ?? "",
      apartment: params.address.apartment ?? "",
      entrance: params.address.entrance ?? "",
    })
  );
}

export type ProfileOrderStatusOutput = BuyerProfileOrderStatus;
export type DeliveryProvider = DeliveryProviderCode;
