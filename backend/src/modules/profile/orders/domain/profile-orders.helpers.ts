import type { OrderStatus } from "@prisma/client";
import { createHash } from "node:crypto";
import type {
  BuyerOrderPaymentStatusRow,
  BuyerOrderWithRelations,
  BuyerProfileOrderDto,
  BuyerProfileOrderStatus,
  BuyerOrderPresentationHelpers,
  CheckoutGroupOrderPaymentStatusRow,
  DeliveryProviderCode,
  OrderPaymentSummaryDto,
  ProfileOrdersServiceHelpers,
} from "./profile-orders.types";

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

export const LISTING_RESERVATION_CONFLICT = "LISTING_RESERVATION_CONFLICT";
export const LAUNCH_PROMO_CODE = "START15";
export const LAUNCH_PROMO_PERCENT = 15;
export const LAUNCH_PROMO_MAX_BUYERS = 100;

export function makeCheckoutIdempotencyHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

const BUYER_CANCELLABLE_ORDER_STATUSES = new Set<OrderStatus>([
  "CREATED",
  "PAID",
  "PROCESSING",
]);

const BUYER_POST_PURCHASE_SUPPORT_STATUSES = new Set<OrderStatus>([
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
]);

export function calculateLaunchPromoDiscount(subtotal: number): number {
  return Math.max(0, Math.floor((Math.max(0, subtotal) * LAUNCH_PROMO_PERCENT) / 100));
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

function normalizeSupportField(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

export function canBuyerCancelOrder(status: OrderStatus): boolean {
  return BUYER_CANCELLABLE_ORDER_STATUSES.has(status);
}

export function shouldExposeSellerSupportForBuyerOrder(status: OrderStatus): boolean {
  return BUYER_POST_PURCHASE_SUPPORT_STATUSES.has(status);
}

export function summarizeOrderPayments(
  orders: Array<BuyerOrderPaymentStatusRow | CheckoutGroupOrderPaymentStatusRow>,
): OrderPaymentSummaryDto {
  const paymentOrders = orders.map((order) => ({
    orderId: order.public_id,
    orderStatus: order.status,
    paymentStatus: order.transactions[0]?.status ?? null,
    paymentProvider: order.transactions[0]?.payment_provider ?? null,
    paymentIntentId: order.transactions[0]?.payment_intent_id ?? null,
  }));

  const hasFailed = paymentOrders.some(
    (order) =>
      order.orderStatus === "CANCELLED" ||
      order.paymentStatus === "FAILED" ||
      order.paymentStatus === "CANCELLED",
  );
  const isPaid =
    paymentOrders.length > 0 &&
    paymentOrders.every(
      (order) =>
        order.orderStatus === "PAID" || order.paymentStatus === "SUCCESS",
    );

  return {
    summary: hasFailed ? "failed" : isPaid ? "paid" : "pending",
    orders: paymentOrders,
  };
}

export function getSellerSupportContacts(order: BuyerOrderWithRelations): {
  sellerSupportPhone: string | null;
  sellerSupportEmail: string | null;
  sellerWorkingHours: string | null;
} {
  const profile = order.seller.partnership_requests[0]?.onboarding_profile ?? null;
  return {
    sellerSupportPhone: normalizeSupportField(profile?.support_phone),
    sellerSupportEmail: normalizeSupportField(order.seller.work_email),
    sellerWorkingHours: normalizeSupportField(profile?.service_hours),
  };
}

export function mapBuyerOrder(
  order: BuyerOrderWithRelations,
  reviewedListingIds: Set<number>,
  helpers: BuyerOrderPresentationHelpers,
): BuyerProfileOrderDto {
  const sellerSupport = shouldExposeSellerSupportForBuyerOrder(order.status)
    ? getSellerSupportContacts(order)
    : {
        sellerSupportPhone: null,
        sellerSupportEmail: null,
        sellerWorkingHours: null,
      };

  return {
    id: String(order.id),
    publicId: order.public_id,
    orderNumber: `#${order.public_id}`,
    date: order.created_at,
    status: helpers.toProfileOrderStatus(order.status),
    canCancel: canBuyerCancelOrder(order.status),
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
    sellerSupportPhone: sellerSupport.sellerSupportPhone,
    sellerSupportEmail: sellerSupport.sellerSupportEmail,
    sellerWorkingHours: sellerSupport.sellerWorkingHours,
    seller: {
      name: order.seller.name,
      avatar: order.seller.avatar,
      phone: order.seller.phone ?? "",
      address: `${
        helpers.extractPrimaryCityFromAddresses(order.seller.addresses) ??
        "Город не указан"
      }`,
      workingHours: sellerSupport.sellerWorkingHours ?? "",
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

export type ProfileOrderStatusOutput = BuyerProfileOrderStatus;
export type DeliveryProvider = DeliveryProviderCode;
