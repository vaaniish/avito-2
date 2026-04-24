"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const profile_account_routes_1 = require("./profile.account.routes");
const profile_address_routes_1 = require("./profile.address.routes");
const profile_delivery_1 = require("./profile.delivery");
const profile_engagement_routes_1 = require("./profile.engagement.routes");
const profile_orders_routes_1 = require("./profile.orders.routes");
const profile_payment_1 = require("./profile.payment");
const profile_shared_1 = require("./profile.shared");
const profile_user_routes_1 = require("./profile.user.routes");
const profileRouter = (0, express_1.Router)();
exports.profileRouter = profileRouter;
const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const FALLBACK_LISTING_IMAGE = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
profileRouter.use((0, profile_user_routes_1.createProfileUserRouter)({
    prisma: prisma_1.prisma,
    requireAnyRole: session_1.requireAnyRole,
    roleBuyer: ROLE_BUYER,
    roleSeller: ROLE_SELLER,
    roleAdmin: ROLE_ADMIN,
    fallbackListingImage: FALLBACK_LISTING_IMAGE,
    toClientRole: format_1.toClientRole,
    toProfileOrderStatus: format_1.toProfileOrderStatus,
    toClientCondition: format_1.toClientCondition,
    toLocalizedDeliveryDate: profile_delivery_1.toLocalizedDeliveryDate,
    stripPickupPointTag: profile_delivery_1.stripPickupPointTag,
    extractPrimaryCityFromAddresses: profile_shared_1.extractPrimaryCityFromAddresses,
    mapUserAddressToDto: profile_shared_1.mapUserAddressToDto,
}));
profileRouter.use((0, profile_address_routes_1.createProfileAddressRouter)({
    prisma: prisma_1.prisma,
    requireAnyRole: session_1.requireAnyRole,
    roleBuyer: ROLE_BUYER,
    roleSeller: ROLE_SELLER,
    roleAdmin: ROLE_ADMIN,
    mapUserAddressToDto: profile_shared_1.mapUserAddressToDto,
    normalizeTextField: profile_shared_1.normalizeTextField,
    parseLegacyBuilding: profile_shared_1.parseLegacyBuilding,
    buildAddressFullAddress: profile_shared_1.buildAddressFullAddress,
    loadLocationSuggestionsByYandex: profile_delivery_1.loadLocationSuggestionsByYandex,
    parseDeliveryProviderFilter: profile_delivery_1.parseDeliveryProviderFilter,
    getDeliveryPoints: profile_delivery_1.getDeliveryPoints,
    deliveryProviders: profile_delivery_1.DELIVERY_PROVIDERS,
}));
profileRouter.use((0, profile_orders_routes_1.createProfileOrdersRouter)({
    prisma: prisma_1.prisma,
    requireAnyRole: session_1.requireAnyRole,
    roleBuyer: ROLE_BUYER,
    roleSeller: ROLE_SELLER,
    roleAdmin: ROLE_ADMIN,
    fallbackListingImage: FALLBACK_LISTING_IMAGE,
    normalizePickupProvider: profile_delivery_1.normalizePickupProvider,
    normalizeTextField: profile_shared_1.normalizeTextField,
    buildAddressFullAddress: profile_shared_1.buildAddressFullAddress,
    appendPickupPointMetaToAddress: profile_delivery_1.appendPickupPointMetaToAddress,
    stripPickupPointTag: profile_delivery_1.stripPickupPointTag,
    toLocalizedDeliveryDate: profile_delivery_1.toLocalizedDeliveryDate,
    extractPrimaryCityFromAddresses: profile_shared_1.extractPrimaryCityFromAddresses,
    toProfileOrderStatus: format_1.toProfileOrderStatus,
    createYooKassaPayment: profile_payment_1.createYooKassaPayment,
    fetchYooKassaPaymentById: profile_payment_1.fetchYooKassaPaymentById,
    extractYooKassaPaymentBaseId: profile_payment_1.extractYooKassaPaymentBaseId,
    ensureYandexTrackingForOrders: (orderIds) => (0, profile_delivery_1.ensureYandexTrackingForOrders)(prisma_1.prisma, orderIds),
}));
profileRouter.use(profile_account_routes_1.profileAccountRouter);
profileRouter.use(profile_engagement_routes_1.profileEngagementRouter);
//# sourceMappingURL=profile.routes.js.map