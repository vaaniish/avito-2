import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, test } from "node:test";
import "dotenv/config";
import express from "express";
import { prisma } from "../../../backend/src/lib/prisma";
import { acceptPolicyForUser, getActivePolicy } from "../../../backend/src/modules/policy/policy.shared";
import { createProfileOrdersRouter } from "../../../backend/src/modules/profile/profile.orders.routes";
import { ProfileOrdersRepository } from "../../../backend/src/modules/profile/orders/infrastructure/repositories/profile-orders.repository";

function isSafeDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("postgres")
  );
}

const safeDb = isSafeDatabaseUrl(process.env.DATABASE_URL);
const servers = new Set<Server>();

after(async () => {
  await Promise.all(
    Array.from(servers).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
  servers.clear();
  await prisma.$disconnect();
});

async function startCheckoutServer(buyerId: number) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/profile",
    createProfileOrdersRouter({
      prisma,
      requireAnyRole: async () => ({
        ok: true as const,
        user: { id: buyerId, role: "BUYER" },
      }),
      roleBuyer: "BUYER",
      roleSeller: "SELLER",
      roleAdmin: "ADMIN",
      fallbackListingImage: "https://example.com/fallback.jpg",
      normalizePickupProvider: () => "yandex_pvz",
      normalizeTextField: (value: unknown) => (typeof value === "string" ? value.trim() : ""),
      buildAddressFullAddress: () => "",
      appendPickupPointMetaToAddress: (address: string) => address,
      stripPickupPointTag: (address: string | null) => address ?? "",
      toLocalizedDeliveryDate: (date: Date) => date.toISOString(),
      extractPrimaryCityFromAddresses: () => null,
      toProfileOrderStatus: (status: string) => {
        if (status === "PREPARED") return "prepared";
        if (status === "SHIPPED") return "shipped";
        if (status === "DELIVERED" || status === "COMPLETED") return "completed";
        if (status === "CANCELLED") return "cancelled";
        return "processing";
      },
      createYooKassaPayment: async () => ({
        id: `pay-stock-${Date.now()}`,
        status: "pending",
        paid: false,
        confirmation: {
          type: "redirect",
          confirmation_url: "https://example.com/pay",
        },
      }),
      fetchYooKassaPaymentById: async () => null,
      createYooKassaRefund: async ({ paymentId, amountRub }) => ({
        id: `refund-${paymentId}`,
        status: "succeeded",
        payment_id: `${paymentId}:${amountRub}`,
      }),
      extractYooKassaPaymentBaseId: (paymentIntentId: string) => paymentIntentId.split(":")[0] ?? paymentIntentId,
      ensureYandexTrackingForOrders: async () => {},
    }),
  );

  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  servers.add(server);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function createUserFixture(prefix: string, role: "BUYER" | "SELLER") {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return prisma.appUser.create({
    data: {
      public_id: `${prefix}-${suffix}`,
      role,
      status: "ACTIVE",
      email: `${prefix.toLowerCase()}-${suffix}@ecomm.local`,
      password: "fixture-password",
      name: `${prefix} Test User`,
    },
    select: {
      id: true,
      public_id: true,
    },
  });
}

async function createListingFixture(params: {
  sellerId: number;
  prefix: string;
  availableQuantity: number;
  hasMultipleStock: boolean;
}) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return prisma.marketplaceListing.create({
    data: {
      public_id: `${params.prefix}-${suffix}`,
      seller_id: params.sellerId,
      type: "PRODUCT",
      title: `${params.prefix} listing`,
      description: "Checkout stock fixture",
      price: 25000,
      condition: "USED",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      has_multiple_stock: params.hasMultipleStock,
      available_quantity: params.availableQuantity,
    },
    select: {
      id: true,
      public_id: true,
    },
  });
}

async function createPromoFixture(prefix: string, discountValue: number) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const now = Date.now();
  return prisma.promoCode.create({
    data: {
      public_id: `${prefix}-${suffix}`,
      code: `${prefix}-${suffix}`.toUpperCase(),
      discount_type: "FIXED_AMOUNT",
      discount_value: discountValue,
      min_subtotal: 0,
      max_activations: 100,
      per_user_limit: 1,
      starts_at: new Date(now - 60 * 60 * 1000),
      ends_at: new Date(now + 24 * 60 * 60 * 1000),
      is_enabled: true,
      all_catalog: true,
    },
    select: {
      id: true,
      code: true,
    },
  });
}

async function ensureCheckoutPolicyAccepted(userId: number) {
  const policy = await getActivePolicy(prisma, "CHECKOUT");
  assert.ok(policy, "Active checkout policy was not found");

  await prisma.policyAcceptance.deleteMany({
    where: {
      user_id: userId,
      policy_id: policy.id,
    },
  });

  const accepted = await acceptPolicyForUser({
    prisma,
    userId,
    scope: "CHECKOUT",
    requestPolicyPublicId: policy.public_id,
    requestIp: "127.0.0.1",
    requestUserAgent: "checkout-stock-integration",
  });
  assert.equal(accepted.ok, true);
}

async function createCheckout(params: {
  baseUrl: string;
  listingPublicId: string;
  quantity: number;
  idempotencyKey: string;
  promoCode?: string;
}) {
  return fetch(`${params.baseUrl}/api/profile/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      items: [{ listingId: params.listingPublicId, quantity: params.quantity }],
      deliveryType: "pickup",
      paymentMethod: "card",
      promoCode: params.promoCode ?? "",
    }),
  });
}

test(
  "integration: multi-stock checkout decrements stock and buyer cancellation restores it",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("CHK-STOCK-BUYER-CANCEL", "BUYER");
    const seller = await createUserFixture("CHK-STOCK-SELLER-CANCEL", "SELLER");
    const listing = await createListingFixture({
      sellerId: seller.id,
      prefix: "CHK-STOCK-LST-CANCEL",
      availableQuantity: 2,
      hasMultipleStock: true,
    });
    const baseUrl = await startCheckoutServer(buyer.id);

    try {
      await ensureCheckoutPolicyAccepted(buyer.id);

      const checkout = await createCheckout({
        baseUrl,
        listingPublicId: listing.public_id,
        quantity: 2,
        idempotencyKey: `checkout-stock-cancel-${Date.now()}`,
      });
      const checkoutPayload = await checkout.json();

      assert.equal(checkout.status, 201);
      const orderPublicId = checkoutPayload.orders[0]?.order_id as string;
      assert.ok(orderPublicId);

      const reservedListing = await prisma.marketplaceListing.findUnique({
        where: { id: listing.id },
        select: {
          available_quantity: true,
          status: true,
        },
      });
      assert.equal(reservedListing?.available_quantity, 0);
      assert.equal(reservedListing?.status, "INACTIVE");

      const orderItem = await prisma.marketOrderItem.findFirst({
        where: {
          listing_id: listing.id,
        },
        select: {
          quantity: true,
        },
      });
      assert.equal(orderItem?.quantity, 2);

      const cancellation = await fetch(
        `${baseUrl}/api/profile/orders/${encodeURIComponent(orderPublicId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      assert.equal(cancellation.status, 200);

      const restoredListing = await prisma.marketplaceListing.findUnique({
        where: { id: listing.id },
        select: {
          available_quantity: true,
          status: true,
        },
      });
      assert.equal(restoredListing?.available_quantity, 2);
      assert.equal(restoredListing?.status, "ACTIVE");
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);

test(
  "integration: platform-funded promo keeps partner transaction amount before discount",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("CHK-PROMO-BUYER", "BUYER");
    const seller = await createUserFixture("CHK-PROMO-SELLER", "SELLER");
    const listing = await createListingFixture({
      sellerId: seller.id,
      prefix: "CHK-PROMO-LST",
      availableQuantity: 1,
      hasMultipleStock: false,
    });
    const promo = await createPromoFixture("CHKPROMO", 5_000);
    const baseUrl = await startCheckoutServer(buyer.id);

    try {
      await ensureCheckoutPolicyAccepted(buyer.id);

      const checkout = await createCheckout({
        baseUrl,
        listingPublicId: listing.public_id,
        quantity: 1,
        idempotencyKey: `checkout-promo-platform-funded-${Date.now()}`,
        promoCode: promo.code,
      });
      const checkoutPayload = await checkout.json();

      assert.equal(checkout.status, 201);
      assert.equal(checkoutPayload.discount, 5_000);
      assert.equal(checkoutPayload.total, 20_000);

      const orderPublicId = checkoutPayload.orders[0]?.order_id as string;
      assert.ok(orderPublicId);

      const order = await prisma.marketOrder.findUnique({
        where: { public_id: orderPublicId },
        include: {
          transactions: {
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
      });

      assert.ok(order);
      assert.equal(order.total_price, 20_000);
      assert.equal(order.discount, 5_000);

      const transaction = order.transactions[0];
      assert.ok(transaction);
      assert.equal(transaction.amount, 25_000);
      assert.equal(
        transaction.commission,
        Math.round((transaction.amount * transaction.commission_rate) / 100),
      );
    } finally {
      await prisma.promoCode.deleteMany({
        where: { id: promo.id },
      });
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);

test(
  "integration: checkout rejects quantity above available stock",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("CHK-STOCK-BUYER-REJECT", "BUYER");
    const seller = await createUserFixture("CHK-STOCK-SELLER-REJECT", "SELLER");
    const listing = await createListingFixture({
      sellerId: seller.id,
      prefix: "CHK-STOCK-LST-REJECT",
      availableQuantity: 2,
      hasMultipleStock: true,
    });
    const baseUrl = await startCheckoutServer(buyer.id);

    try {
      await ensureCheckoutPolicyAccepted(buyer.id);

      const checkout = await createCheckout({
        baseUrl,
        listingPublicId: listing.public_id,
        quantity: 3,
        idempotencyKey: `checkout-stock-reject-${Date.now()}`,
      });
      const payload = await checkout.json();

      assert.equal(checkout.status, 400);
      assert.equal(typeof payload, "object");

      const untouchedListing = await prisma.marketplaceListing.findUnique({
        where: { id: listing.id },
        select: {
          available_quantity: true,
          status: true,
        },
      });
      assert.equal(untouchedListing?.available_quantity, 2);
      assert.equal(untouchedListing?.status, "ACTIVE");

      const orders = await prisma.marketOrder.count({
        where: {
          buyer_id: buyer.id,
          seller_id: seller.id,
        },
      });
      assert.equal(orders, 0);
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);

test(
  "integration: failed payment restores reserved stock and reactivates listing",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("CHK-STOCK-BUYER-FAILED", "BUYER");
    const seller = await createUserFixture("CHK-STOCK-SELLER-FAILED", "SELLER");
    const listing = await createListingFixture({
      sellerId: seller.id,
      prefix: "CHK-STOCK-LST-FAILED",
      availableQuantity: 2,
      hasMultipleStock: true,
    });
    const baseUrl = await startCheckoutServer(buyer.id);
    const repository = new ProfileOrdersRepository(prisma);

    try {
      await ensureCheckoutPolicyAccepted(buyer.id);

      const checkout = await createCheckout({
        baseUrl,
        listingPublicId: listing.public_id,
        quantity: 2,
        idempotencyKey: `checkout-stock-failed-${Date.now()}`,
      });
      assert.equal(checkout.status, 201);

      const createdOrder = await prisma.marketOrder.findFirst({
        where: {
          buyer_id: buyer.id,
          seller_id: seller.id,
        },
        select: {
          id: true,
          status: true,
          transactions: {
            select: {
              id: true,
            },
          },
        },
      });
      assert.ok(createdOrder);
      assert.equal(createdOrder.status, "CREATED");

      await repository.applyFailedPayment({
        transactionIds: createdOrder.transactions.map((item) => item.id),
        orderIds: [createdOrder.id],
        requestIp: "127.0.0.1",
        reason: "integration.failed_payment",
      });

      const restoredListing = await prisma.marketplaceListing.findUnique({
        where: { id: listing.id },
        select: {
          available_quantity: true,
          status: true,
        },
      });
      assert.equal(restoredListing?.available_quantity, 2);
      assert.equal(restoredListing?.status, "ACTIVE");

      const cancelledOrder = await prisma.marketOrder.findUnique({
        where: { id: createdOrder.id },
        select: {
          status: true,
          transactions: {
            select: {
              status: true,
            },
          },
        },
      });
      assert.equal(cancelledOrder?.status, "CANCELLED");
      assert.equal(cancelledOrder?.transactions[0]?.status, "FAILED");
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);
