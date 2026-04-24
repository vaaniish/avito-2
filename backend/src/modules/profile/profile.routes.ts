import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import {
  toClientCondition,
  toClientRole,
  toProfileOrderStatus,
} from "../../utils/format";
import { profileAccountRouter } from "./profile.account.routes";
import { createProfileAddressRouter } from "./profile.address.routes";
import {
  DELIVERY_PROVIDERS,
  appendPickupPointMetaToAddress,
  ensureYandexTrackingForOrders,
  getDeliveryPoints,
  loadLocationSuggestionsByYandex,
  normalizePickupProvider,
  parseDeliveryProviderFilter,
  stripPickupPointTag,
  toLocalizedDeliveryDate,
} from "./profile.delivery";
import { profileEngagementRouter } from "./profile.engagement.routes";
import { createProfileOrdersRouter } from "./profile.orders.routes";
import {
  createYooKassaPayment,
  extractYooKassaPaymentBaseId,
  fetchYooKassaPaymentById,
} from "./profile.payment";
import {
  buildAddressFullAddress,
  extractPrimaryCityFromAddresses,
  mapUserAddressToDto,
  normalizeTextField,
  parseLegacyBuilding,
} from "./profile.shared";
import { createProfileUserRouter } from "./profile.user.routes";

const profileRouter = Router();
const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

profileRouter.use(
  createProfileUserRouter({
    prisma,
    requireAnyRole,
    roleBuyer: ROLE_BUYER,
    roleSeller: ROLE_SELLER,
    roleAdmin: ROLE_ADMIN,
    fallbackListingImage: FALLBACK_LISTING_IMAGE,
    toClientRole,
    toProfileOrderStatus,
    toClientCondition,
    toLocalizedDeliveryDate,
    stripPickupPointTag,
    extractPrimaryCityFromAddresses,
    mapUserAddressToDto,
  }),
);

profileRouter.use(
  createProfileAddressRouter({
    prisma,
    requireAnyRole,
    roleBuyer: ROLE_BUYER,
    roleSeller: ROLE_SELLER,
    roleAdmin: ROLE_ADMIN,
    mapUserAddressToDto,
    normalizeTextField,
    parseLegacyBuilding,
    buildAddressFullAddress,
    loadLocationSuggestionsByYandex,
    parseDeliveryProviderFilter,
    getDeliveryPoints,
    deliveryProviders: DELIVERY_PROVIDERS,
  }),
);

profileRouter.use(
  createProfileOrdersRouter({
    prisma,
    requireAnyRole,
    roleBuyer: ROLE_BUYER,
    roleSeller: ROLE_SELLER,
    roleAdmin: ROLE_ADMIN,
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
    fetchYooKassaPaymentById,
    extractYooKassaPaymentBaseId,
    ensureYandexTrackingForOrders: (orderIds) =>
      ensureYandexTrackingForOrders(prisma, orderIds),
  }),
);

profileRouter.use(profileAccountRouter);
profileRouter.use(profileEngagementRouter);

export { profileRouter };
