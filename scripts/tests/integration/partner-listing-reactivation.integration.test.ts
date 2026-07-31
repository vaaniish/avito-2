import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import "dotenv/config";
import { app } from "../../../backend/src/app";
import { prisma } from "../../../backend/src/lib/prisma";
import { cookieSessionHeaders, encodeCookieSession } from "../helpers/cookie-session";

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

let baseUrl = "";
let server: ReturnType<typeof app.listen> | null = null;

before(async () => {
  if (!safeDb) return;

  server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  await prisma.$disconnect();
});

async function apiRequest(params: {
  method: "POST" | "PATCH";
  path: string;
  token?: string;
  body?: unknown;
  expected: number[];
}) {
  const headers: Record<string, string> = { origin: "http://localhost:3000" };
  if (params.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (params.token) {
    Object.assign(headers, cookieSessionHeaders(params.token));
  }

  const response = await fetch(`${baseUrl}${params.path}`, {
    method: params.method,
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (params.path.endsWith("/auth/login") && data) {
    data.cookieSession = encodeCookieSession(response.headers, data);
  }

  if (!params.expected.includes(response.status)) {
    throw new Error(
      `${params.method} ${params.path} -> ${response.status}\n${JSON.stringify(data, null, 2)}`,
    );
  }

  return { status: response.status, data };
}

async function login(email: string, password: string): Promise<string> {
  const response = await apiRequest({
    method: "POST",
    path: "/api/auth/login",
    expected: [200],
    body: { email, password },
  });
  assert.equal(typeof response.data?.cookieSession, "string");
  return response.data.cookieSession;
}

test(
  "integration: seller can reactivate restocked multi-stock listing even with active orders",
  { skip: !safeDb },
  async () => {
    const sellerToken = await login("seller1@ecomm.local", "DemoSeller2026!");
    const adminToken = await login("admin@ecomm.local", "DemoAdmin2026!");

    const seller = await prisma.appUser.findUnique({
      where: { email: "seller1@ecomm.local" },
      select: { id: true },
    });
    const buyer = await prisma.appUser.findUnique({
      where: { email: "buyer1@ecomm.local" },
      select: { id: true },
    });
    assert.ok(seller?.id, "seller1 not found");
    assert.ok(buyer?.id, "buyer1 not found");

    const publicSuffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const listing = await prisma.marketplaceListing.create({
      data: {
        public_id: `LST-REACT-${publicSuffix}`,
        seller_id: seller.id,
        type: "PRODUCT",
        title: "ASUS test relist",
        description: "Card sold out once, then seller restocked it while orders are still in flight",
        price: 68900,
        condition: "USED",
        status: "INACTIVE",
        moderation_status: "PENDING",
        has_multiple_stock: true,
        available_quantity: 11,
      },
      select: { id: true, public_id: true },
    });

    const order = await prisma.marketOrder.create({
      data: {
        public_id: `ORD-REACT-${publicSuffix}`,
        buyer_id: buyer.id,
        seller_id: seller.id,
        status: "PAID",
        delivery_type: "PICKUP",
        delivery_address: "Самовывоз",
        total_price: 68900,
        delivery_cost: 0,
        discount: 0,
      },
      select: { id: true },
    });

    await prisma.marketOrderItem.create({
      data: {
        order_id: order.id,
        listing_id: listing.id,
        name: "ASUS test relist",
        price: 68900,
        quantity: 1,
      },
    });

    try {
      const sellerReactivate = await apiRequest({
        method: "POST",
        path: `/api/partner/listings/${encodeURIComponent(listing.public_id)}/toggle-status`,
        token: sellerToken,
        expected: [200],
      });
      assert.equal(sellerReactivate.data?.success, true);
      assert.equal(sellerReactivate.data?.status, "moderation");

      const afterToggle = await prisma.marketplaceListing.findUnique({
        where: { id: listing.id },
        select: {
          status: true,
          moderation_status: true,
        },
      });
      assert.equal(afterToggle?.status, "MODERATION");
      assert.equal(afterToggle?.moderation_status, "PENDING");

      const approved = await apiRequest({
        method: "PATCH",
        path: `/api/admin/listings/${encodeURIComponent(listing.public_id)}/moderation`,
        token: adminToken,
        body: { status: "approved" },
        expected: [200],
      });
      assert.equal(approved.data?.activationBlockedByOrder, false);
      assert.equal(approved.data?.listingStatus, "active");

      const finalListing = await prisma.marketplaceListing.findUnique({
        where: { id: listing.id },
        select: {
          status: true,
          moderation_status: true,
        },
      });
      assert.equal(finalListing?.status, "ACTIVE");
      assert.equal(finalListing?.moderation_status, "APPROVED");
    } finally {
      await prisma.marketOrderItem.deleteMany({
        where: { order_id: order.id },
      });
      await prisma.marketOrder.deleteMany({
        where: { id: order.id },
      });
      await prisma.listingModerationEvent.deleteMany({
        where: { listing_id: listing.id },
      });
      await prisma.marketplaceListing.deleteMany({
        where: { id: listing.id },
      });
    }
  },
);

test(
  "integration: seller cannot reactivate listing removed by approved complaint",
  { skip: !safeDb },
  async () => {
    const sellerToken = await login("seller1@ecomm.local", "DemoSeller2026!");

    const seller = await prisma.appUser.findUnique({
      where: { email: "seller1@ecomm.local" },
      select: { id: true },
    });
    const buyer = await prisma.appUser.findUnique({
      where: { email: "buyer1@ecomm.local" },
      select: { id: true },
    });
    assert.ok(seller?.id, "seller1 not found");
    assert.ok(buyer?.id, "buyer1 not found");

    const publicSuffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const listing = await prisma.marketplaceListing.create({
      data: {
        public_id: `LST-COMPLAINT-REMOVED-${publicSuffix}`,
        seller_id: seller.id,
        type: "PRODUCT",
        title: "Removed by complaint test listing",
        description: "This listing was removed after an approved complaint",
        price: 12900,
        condition: "USED",
        status: "INACTIVE",
        moderation_status: "REJECTED",
      },
      select: { id: true, public_id: true },
    });
    const complaint = await prisma.complaint.create({
      data: {
        public_id: `CMP-COMPLAINT-REMOVED-${publicSuffix}`,
        status: "APPROVED",
        complaint_type: "reactivation_block",
        listing_id: listing.id,
        seller_id: seller.id,
        reporter_id: buyer.id,
        description: "Approved complaint blocks old listing reactivation",
      },
      select: { id: true },
    });

    try {
      for (const request of [
        {
          method: "POST" as const,
          path: `/api/partner/listings/${encodeURIComponent(listing.public_id)}/toggle-status`,
          body: undefined,
        },
        {
          method: "PATCH" as const,
          path: `/api/partner/listings/${encodeURIComponent(listing.public_id)}/status`,
          body: { status: "moderation" },
        },
        {
          method: "PATCH" as const,
          path: `/api/partner/listings/${encodeURIComponent(listing.public_id)}`,
          body: { title: "Trying to relist removed listing" },
        },
      ]) {
        const response = await apiRequest({
          method: request.method,
          path: request.path,
          token: sellerToken,
          body: request.body,
          expected: [409],
        });
        assert.equal(
          response.data?.error,
          "Это объявление снято по подтверждённой жалобе. Создайте новое объявление.",
        );
      }

      const after = await prisma.marketplaceListing.findUnique({
        where: { id: listing.id },
        select: { status: true, moderation_status: true },
      });
      assert.equal(after?.status, "INACTIVE");
      assert.equal(after?.moderation_status, "REJECTED");
    } finally {
      await prisma.complaint.deleteMany({ where: { id: complaint.id } });
      await prisma.marketplaceListing.deleteMany({ where: { id: listing.id } });
    }
  },
);
