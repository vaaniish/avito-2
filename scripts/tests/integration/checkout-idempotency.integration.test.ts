import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, test } from "node:test";
import "dotenv/config";
import express from "express";
import { prisma } from "../../../backend/src/lib/prisma";
import { acceptPolicyForUser, getActivePolicy } from "../../../backend/src/modules/policy/policy.shared";
import { createProfileOrdersRouter } from "../../../backend/src/modules/profile/profile.orders.routes";

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

async function startCheckoutServer(buyerId: number, createPaymentCalls: { count: number }) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/profile",
    createProfileOrdersRouter({
      prisma,
      requireAnyRole: async () => ({ ok: true as const, user: { id: buyerId } }),
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
      toProfileOrderStatus: () => "processing",
      createYooKassaPayment: async () => {
        createPaymentCalls.count += 1;
        return {
          id: "pay-test-checkout-idempotency",
          status: "pending",
          confirmation: {
            type: "redirect",
            confirmation_url: "https://pay.example/confirm",
          },
        };
      },
      fetchYooKassaPaymentById: async () => null,
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

async function createListingFixture(sellerId: number, prefix: string) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return prisma.marketplaceListing.create({
    data: {
      public_id: `${prefix}-${suffix}`,
      seller_id: sellerId,
      type: "PRODUCT",
      title: `${prefix} listing`,
      description: "Checkout idempotency fixture",
      price: 25000,
      condition: "USED",
      status: "ACTIVE",
      moderation_status: "APPROVED",
    },
    select: {
      id: true,
      public_id: true,
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
    requestUserAgent: "checkout-idempotency-integration",
  });
  assert.equal(accepted.ok, true);
}

test(
  "integration: checkout idempotency replays cached response without creating duplicate orders",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("CHK-IDEMP-BUYER", "BUYER");
    const seller = await createUserFixture("CHK-IDEMP-SELLER", "SELLER");
    const listing = await createListingFixture(seller.id, "CHK-IDEMP-LST");
    const createPaymentCalls = { count: 0 };
    const baseUrl = await startCheckoutServer(buyer.id, createPaymentCalls);
    const idempotencyKey = `checkout-idempotency-${Date.now()}`;

    try {
      await ensureCheckoutPolicyAccepted(buyer.id);
      const body = {
        items: [{ listingId: listing.public_id, quantity: 1 }],
        deliveryType: "pickup",
        paymentMethod: "card",
      };

      const first = await fetch(`${baseUrl}/api/profile/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const firstPayload = await first.json();

      const second = await fetch(`${baseUrl}/api/profile/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
      const secondPayload = await second.json();

      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.deepEqual(secondPayload, firstPayload);
      assert.equal(createPaymentCalls.count, 1);

      const orders = await prisma.marketOrder.findMany({
        where: {
          buyer_id: buyer.id,
          seller_id: seller.id,
        },
        select: {
          public_id: true,
        },
      });
      assert.equal(orders.length, 1);

      const idempotencyRows = await prisma.checkoutIdempotencyKey.findMany({
        where: {
          actor_user_id: buyer.id,
          action: "checkout.orders.create",
          idempotency_key: idempotencyKey,
        },
        select: {
          response_status: true,
        },
      });
      assert.equal(idempotencyRows.length, 1);
      assert.equal(idempotencyRows[0]?.response_status, 201);
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);

test(
  "integration: checkout idempotency rejects same key with different payload",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("CHK-CONFLICT-BUYER", "BUYER");
    const seller = await createUserFixture("CHK-CONFLICT-SELLER", "SELLER");
    const primaryListing = await createListingFixture(seller.id, "CHK-CONFLICT-LST-A");
    const alternateListing = await createListingFixture(seller.id, "CHK-CONFLICT-LST-B");
    const createPaymentCalls = { count: 0 };
    const baseUrl = await startCheckoutServer(buyer.id, createPaymentCalls);
    const idempotencyKey = `checkout-conflict-${Date.now()}`;

    try {
      await ensureCheckoutPolicyAccepted(buyer.id);
      const first = await fetch(`${baseUrl}/api/profile/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          items: [{ listingId: primaryListing.public_id, quantity: 1 }],
          deliveryType: "pickup",
          paymentMethod: "card",
        }),
      });
      assert.equal(first.status, 201);

      const conflicting = await fetch(`${baseUrl}/api/profile/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          items: [{ listingId: alternateListing.public_id, quantity: 1 }],
          deliveryType: "pickup",
          paymentMethod: "card",
        }),
      });
      const conflictPayload = (await conflicting.json()) as { error?: string };

      assert.equal(conflicting.status, 409);
      assert.equal(
        conflictPayload.error,
        "Idempotency-Key reuse with different payload is not allowed for checkout.",
      );
      assert.equal(createPaymentCalls.count, 1);

      const orders = await prisma.marketOrder.findMany({
        where: {
          buyer_id: buyer.id,
          seller_id: seller.id,
        },
        select: {
          public_id: true,
        },
      });
      assert.equal(orders.length, 1);
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);
