import type { Request } from "express";
import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import {
  DELIVERY_PROVIDERS,
  appendPickupPointMetaToAddress,
  ensureYandexTrackingForOrders,
  normalizePickupProvider,
  stripPickupPointTag,
  toLocalizedDeliveryDate,
} from "../profile.delivery";
import {
  buildAddressFullAddress,
  extractPrimaryCityFromAddresses,
  normalizeTextField,
} from "../profile.shared";
import {
  createYooKassaRefund,
  createYooKassaPayment,
  extractYooKassaPaymentBaseId,
  fetchYooKassaPaymentById,
} from "../profile.payment";
import { toProfileOrderStatus } from "../../../utils/format";
import {
  CancelProfileOrderService,
  CreateOrderService,
  GetOrderPaymentStatusService,
  HandleYooKassaWebhookService,
  ListProfileOrdersService,
  PreviewCheckoutPromoService,
  ResolveYooKassaPaymentService,
} from "./application/profile-orders.service";
import type {
  DeliveryProviderCode,
  ProfileOrdersServiceHelpers,
  YooKassaPayment,
} from "./application/profile-orders.types";
import {
  createProfileOrdersHttpRouter,
  type ProfileOrdersHttpDeps,
} from "./http/profile-orders.router";
import { ProfileOrdersDeliveryGateway } from "./infrastructure/gateways/profile-orders-delivery.gateway";
import { ProfileOrdersPaymentGateway } from "./infrastructure/gateways/profile-orders-payment.gateway";
import { ProfileOrdersNotificationRepository } from "./infrastructure/repositories/profile-orders-notification.repository";
import { ProfileOrdersPolicyRepository } from "./infrastructure/repositories/profile-orders-policy.repository";
import { ProfileOrdersRepository } from "./infrastructure/repositories/profile-orders.repository";

type SessionResult =
  | { ok: true; user: { id: number; role: string } }
  | { ok: false; status: number; message: string };

export type ProfileOrdersModuleDeps = {
  prisma: unknown;
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  roleBuyer: string;
  roleSeller: string;
  roleAdmin: string;
  normalizePickupProvider: (value: unknown) => DeliveryProviderCode;
  createYooKassaPayment: (params: {
    amountRub: number;
    description: string;
    metadata: Record<string, string>;
    paymentMethod: "card" | "sbp";
    idempotenceKey?: string;
  }) => Promise<YooKassaPayment>;
  createYooKassaRefund: (params: {
    paymentId: string;
    amountRub: number;
    description: string;
    idempotenceKey?: string;
  }) => Promise<import("./application/profile-orders.types").YooKassaRefund>;
  fetchYooKassaPaymentById: (
    paymentId: string,
  ) => Promise<YooKassaPayment | null>;
  extractYooKassaPaymentBaseId: (paymentIntentId: string) => string;
  fallbackListingImage: string;
  normalizeTextField: (value: unknown) => string;
  buildAddressFullAddress: ProfileOrdersServiceHelpers["buildAddressFullAddress"];
  appendPickupPointMetaToAddress: ProfileOrdersServiceHelpers["appendPickupPointMetaToAddress"];
  stripPickupPointTag: ProfileOrdersServiceHelpers["stripPickupPointTag"];
  toLocalizedDeliveryDate: ProfileOrdersServiceHelpers["toLocalizedDeliveryDate"];
  extractPrimaryCityFromAddresses: ProfileOrdersServiceHelpers["extractPrimaryCityFromAddresses"];
  toProfileOrderStatus: ProfileOrdersServiceHelpers["toProfileOrderStatus"];
  ensureYandexTrackingForOrders?: (orderIds: number[]) => Promise<void>;
};

export function createProfileOrdersRouter(
  deps: ProfileOrdersModuleDeps,
) {
  const prisma =
    deps.prisma as ConstructorParameters<typeof ProfileOrdersRepository>[0];
  const repository = new ProfileOrdersRepository(prisma);
  const paymentGateway = new ProfileOrdersPaymentGateway(
    deps.createYooKassaPayment,
    deps.fetchYooKassaPaymentById,
    deps.createYooKassaRefund,
    deps.extractYooKassaPaymentBaseId,
  );
  const deliveryGateway = new ProfileOrdersDeliveryGateway();
  const notificationWriter = new ProfileOrdersNotificationRepository(prisma);
  const policyReader = new ProfileOrdersPolicyRepository(prisma);
  const paymentResolver = new ResolveYooKassaPaymentService(
    repository,
    paymentGateway,
  );
  const helpers: ProfileOrdersServiceHelpers = {
    roleAdmin: deps.roleAdmin,
    fallbackListingImage: deps.fallbackListingImage,
    normalizeTextField: deps.normalizeTextField,
    buildAddressFullAddress: deps.buildAddressFullAddress,
    appendPickupPointMetaToAddress: deps.appendPickupPointMetaToAddress,
    stripPickupPointTag: deps.stripPickupPointTag,
    toLocalizedDeliveryDate: deps.toLocalizedDeliveryDate,
    extractPrimaryCityFromAddresses: deps.extractPrimaryCityFromAddresses,
    toProfileOrderStatus: deps.toProfileOrderStatus,
  };

  const services: ProfileOrdersHttpDeps["services"] = {
    handleYooKassaWebhook: new HandleYooKassaWebhookService(paymentResolver),
    getOrderPaymentStatus: new GetOrderPaymentStatusService(
      repository,
      paymentGateway,
    ),
    createOrder: new CreateOrderService(
      repository,
      paymentGateway,
      notificationWriter,
      policyReader,
      helpers,
    ),
    previewCheckoutPromo: new PreviewCheckoutPromoService(repository),
    listProfileOrders: new ListProfileOrdersService(
      repository,
      deliveryGateway,
      helpers,
    ),
    cancelProfileOrder: new CancelProfileOrderService(
      repository,
      paymentGateway,
      helpers,
    ),
  };

  return createProfileOrdersHttpRouter({
    requireAnyRole: deps.requireAnyRole,
    roleBuyer: deps.roleBuyer,
    roleSeller: deps.roleSeller,
    roleAdmin: deps.roleAdmin,
    normalizePickupProvider: deps.normalizePickupProvider,
    services,
  });
}

const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

export const profileOrdersRouter = createProfileOrdersRouter({
  prisma,
  requireAnyRole,
  roleBuyer: "BUYER",
  roleSeller: "SELLER",
  roleAdmin: "ADMIN",
  fallbackListingImage: FALLBACK_LISTING_IMAGE,
  normalizePickupProvider,
  normalizeTextField,
  buildAddressFullAddress,
  appendPickupPointMetaToAddress,
  stripPickupPointTag,
  toLocalizedDeliveryDate,
  extractPrimaryCityFromAddresses,
  toProfileOrderStatus,
  createYooKassaPayment,
  createYooKassaRefund,
  fetchYooKassaPaymentById,
  extractYooKassaPaymentBaseId,
  ensureYandexTrackingForOrders: (orderIds) =>
    ensureYandexTrackingForOrders(prisma, orderIds),
});
