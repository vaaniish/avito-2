import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, test } from "node:test";
import "dotenv/config";
import express from "express";
import { prisma } from "../../../backend/src/lib/prisma";
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

async function startOrdersServer(params: {
  buyerId: number;
  createRefund: (input: {
    paymentId: string;
    amountRub: number;
    description: string;
    idempotenceKey?: string;
  }) => Promise<{ id: string; status: string; payment_id?: string }>;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/profile",
    createProfileOrdersRouter({
      prisma,
      requireAnyRole: async () => ({
        ok: true as const,
        user: { id: params.buyerId, role: "BUYER" },
      }),
      roleBuyer: "BUYER",
      roleSeller: "SELLER",
      roleAdmin: "ADMIN",
      fallbackListingImage: "https://example.com/fallback.jpg",
      normalizePickupProvider: () => "yandex_pvz",
      normalizeTextField: (value: unknown) =>
        typeof value === "string" ? value.trim() : "",
      buildAddressFullAddress: () => "",
      appendPickupPointMetaToAddress: (address: string) => address,
      stripPickupPointTag: (address: string | null) => address ?? "",
      toLocalizedDeliveryDate: (date: Date) => date.toISOString(),
      extractPrimaryCityFromAddresses: (addresses) =>
        addresses[0]?.city ?? null,
      toProfileOrderStatus: (status: string) => {
        if (status === "PREPARED") return "prepared";
        if (status === "SHIPPED") return "shipped";
        if (status === "DELIVERED" || status === "COMPLETED") return "completed";
        if (status === "CANCELLED") return "cancelled";
        return "processing";
      },
      createYooKassaPayment: async () => ({
        id: "pay-test",
        status: "pending",
        paid: false,
        confirmation: {
          type: "redirect",
          confirmation_url: "https://example.com/pay",
        },
      }),
      createYooKassaRefund: params.createRefund,
      fetchYooKassaPaymentById: async () => null,
      extractYooKassaPaymentBaseId: (paymentIntentId: string) =>
        paymentIntentId.split(":")[0] ?? paymentIntentId,
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
    },
  });
}

async function createOrderFixture(params: {
  buyerId: number;
  sellerId: number;
  publicId: string;
  status: "CREATED" | "PAID" | "PREPARED";
  transactionStatus: "HELD" | "SUCCESS";
}) {
  const order = await prisma.marketOrder.create({
    data: {
      public_id: params.publicId,
      buyer_id: params.buyerId,
      seller_id: params.sellerId,
      status: params.status,
      delivery_type: "PICKUP",
      delivery_address: "Москва, тестовый ПВЗ",
      total_price: 15000,
      delivery_cost: 0,
      discount: 0,
      items: {
        create: [
          {
            name: "Fixture item",
            image: "https://example.com/item.jpg",
            price: 15000,
            quantity: 1,
          },
        ],
      },
      transactions: {
        create: [
          {
            public_id: `TX-${params.publicId}`,
            buyer_id: params.buyerId,
            seller_id: params.sellerId,
            amount: 15000,
            status: params.transactionStatus,
            commission_rate: 3.5,
            commission: 525,
            payment_provider: "YOOMONEY",
            payment_intent_id: `pay-${params.publicId}:1`,
          },
        ],
      },
    },
    select: {
      id: true,
    },
  });

  await prisma.orderStatusHistory.create({
    data: {
      order_id: order.id,
      from_status: null,
      to_status: params.status,
      changed_by_id: params.buyerId,
      reason: "integration.fixture",
    },
  });
}

test(
  "integration: buyer can cancel CREATED order without refund",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("ORD-CANCEL-BUYER-CREATED", "BUYER");
    const seller = await createUserFixture("ORD-CANCEL-SELLER-CREATED", "SELLER");
    const publicId = `ORD-CREATED-${Date.now()}`;
    const baseUrl = await startOrdersServer({
      buyerId: buyer.id,
      createRefund: async () => {
        throw new Error("refund should not be called");
      },
    });

    try {
      await createOrderFixture({
        buyerId: buyer.id,
        sellerId: seller.id,
        publicId,
        status: "CREATED",
        transactionStatus: "HELD",
      });

      const response = await fetch(
        `${baseUrl}/api/profile/orders/${encodeURIComponent(publicId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.success, true);
      assert.equal(payload.order.publicId, publicId);
      assert.equal(payload.order.canCancel, false);
      assert.match(payload.message, /Заказ отменен/i);

      const order = await prisma.marketOrder.findUnique({
        where: { public_id: publicId },
        include: {
          transactions: true,
        },
      });
      assert.equal(order?.status, "CANCELLED");
      assert.equal(order?.transactions[0]?.status, "CANCELLED");
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);

test(
  "integration: buyer can cancel PAID order with YooKassa refund",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("ORD-CANCEL-BUYER-PAID", "BUYER");
    const seller = await createUserFixture("ORD-CANCEL-SELLER-PAID", "SELLER");
    const publicId = `ORD-PAID-${Date.now()}`;
    let refundCalls = 0;
    const baseUrl = await startOrdersServer({
      buyerId: buyer.id,
      createRefund: async ({ paymentId, amountRub }) => {
        refundCalls += 1;
        return {
          id: "refund-paid-order",
          status: "succeeded",
          payment_id: `${paymentId}:${amountRub}`,
        };
      },
    });

    try {
      await createOrderFixture({
        buyerId: buyer.id,
        sellerId: seller.id,
        publicId,
        status: "PAID",
        transactionStatus: "SUCCESS",
      });

      const response = await fetch(
        `${baseUrl}/api/profile/orders/${encodeURIComponent(publicId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(refundCalls, 1);
      assert.equal(payload.success, true);
      assert.equal(payload.order.status, "cancelled");
      assert.match(payload.message, /возврат денег оформлен/i);

      const order = await prisma.marketOrder.findUnique({
        where: { public_id: publicId },
        include: {
          transactions: true,
        },
      });
      assert.equal(order?.status, "CANCELLED");
      assert.equal(order?.transactions[0]?.status, "REFUNDED");
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);

test(
  "integration: buyer cannot cancel PREPARED order and failed refund does not mutate order",
  { skip: !safeDb },
  async () => {
    const buyer = await createUserFixture("ORD-CANCEL-BUYER-BLOCKED", "BUYER");
    const seller = await createUserFixture("ORD-CANCEL-SELLER-BLOCKED", "SELLER");
    const preparedPublicId = `ORD-PREPARED-${Date.now()}`;
    const paidPublicId = `ORD-PAID-FAIL-${Date.now()}`;
    const baseUrl = await startOrdersServer({
      buyerId: buyer.id,
      createRefund: async () => {
        throw new Error("refund provider unavailable");
      },
    });

    try {
      await createOrderFixture({
        buyerId: buyer.id,
        sellerId: seller.id,
        publicId: preparedPublicId,
        status: "PREPARED",
        transactionStatus: "SUCCESS",
      });
      await createOrderFixture({
        buyerId: buyer.id,
        sellerId: seller.id,
        publicId: paidPublicId,
        status: "PAID",
        transactionStatus: "SUCCESS",
      });

      const preparedResponse = await fetch(
        `${baseUrl}/api/profile/orders/${encodeURIComponent(preparedPublicId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      const preparedPayload = await preparedResponse.json();
      assert.equal(preparedResponse.status, 409);
      assert.match(String(preparedPayload.error ?? ""), /только до статуса PREPARED/i);

      const refundFailResponse = await fetch(
        `${baseUrl}/api/profile/orders/${encodeURIComponent(paidPublicId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
        },
      );
      const refundFailPayload = await refundFailResponse.json();
      assert.equal(refundFailResponse.status, 502);
      assert.match(String(refundFailPayload.error ?? ""), /YooKassa/i);

      const [preparedOrder, paidOrder] = await Promise.all([
        prisma.marketOrder.findUnique({
          where: { public_id: preparedPublicId },
          include: { transactions: true },
        }),
        prisma.marketOrder.findUnique({
          where: { public_id: paidPublicId },
          include: { transactions: true },
        }),
      ]);

      assert.equal(preparedOrder?.status, "PREPARED");
      assert.equal(preparedOrder?.transactions[0]?.status, "SUCCESS");
      assert.equal(paidOrder?.status, "PAID");
      assert.equal(paidOrder?.transactions[0]?.status, "SUCCESS");
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [buyer.id, seller.id] } },
      });
    }
  },
);
