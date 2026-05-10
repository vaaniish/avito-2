import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import "dotenv/config";
import { app } from "../../../backend/src/app";
import { prisma } from "../../../backend/src/lib/prisma";

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
  if (!safeDb) {
    return;
  }

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
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  token?: string;
  body?: unknown;
  expected: number[];
}) {
  const headers: Record<string, string> = {};
  if (params.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  if (params.token) {
    headers.authorization = `Bearer ${params.token}`;
  }

  const response = await fetch(`${baseUrl}${params.path}`, {
    method: params.method,
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;

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
  assert.equal(typeof response.data?.sessionToken, "string");
  return response.data.sessionToken;
}

async function waitForListingEvent(params: {
  listingPublicId: string;
  decision: "AUTO_APPROVED" | "AUTO_REVIEW" | "QUEUED";
}) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const listing = await prisma.marketplaceListing.findUnique({
      where: { public_id: params.listingPublicId },
      select: {
        id: true,
        status: true,
        moderation_status: true,
        moderation_events: {
          where: { decision: params.decision },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    });

    if (
      listing &&
      listing.moderation_events.length > 0 &&
      (params.decision !== "AUTO_APPROVED" ||
        (listing.status === "ACTIVE" &&
          listing.moderation_status === "APPROVED"))
    ) {
      return listing;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(
    `Timed out waiting for ${params.decision} moderation event on ${params.listingPublicId}`,
  );
}

function testCatalogAttributes(itemName: string) {
  return [
    { key: "__catalog_category", value: "Комплектующие для ПК" },
    { key: "__catalog_subcategory", value: "Основные комплектующие для ПК" },
    { key: "__catalog_item", value: itemName },
    { key: "__catalog_item_custom", value: itemName },
  ];
}

test(
  "integration: partner listing rejects incomplete quality payload and accepts valid payload",
  { skip: !safeDb },
  async () => {
    const sellerToken = await login("seller1@ecomm.local", "seller123");

    const rejected = await apiRequest({
      method: "POST",
      path: "/api/partner/listings",
      token: sellerToken,
      expected: [400],
      body: {
        type: "products",
        title: `integration invalid ${Date.now()}`,
        price: 1000,
        condition: "used",
        description: "integration invalid listing",
        category: "CI тестовый товар",
        images: [
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
        ],
        attributes: testCatalogAttributes("CI тестовый товар"),
      },
    });
    assert.equal(rejected.data?.reasonCode, "QUALITY_PHOTO_MINIMUM_NOT_MET");

    const created = await apiRequest({
      method: "POST",
      path: "/api/partner/listings",
      token: sellerToken,
      expected: [201],
      body: {
        type: "products",
        title: "CI safe sale alpha",
        price: 12000,
        condition: "restored",
        description: "clean sale approved by rules",
        category: "CI тестовый товар",
        images: [
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
          "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
          "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
        ],
        attributes: [
          ...testCatalogAttributes("CI тестовый товар"),
        ],
      },
    });

    const listingId = created.data?.id;
    assert.equal(typeof listingId, "string");
    assert.equal(created.data?.condition, "restored");
    assert.equal(created.data?.status, "moderation");
    assert.equal(created.data?.moderationStatus, "pending");

    const queuedListing = await waitForListingEvent({
      listingPublicId: listingId,
      decision: "QUEUED",
    });
    assert.equal(typeof queuedListing.id, "number");

    const autoApprovedListing = await waitForListingEvent({
      listingPublicId: listingId,
      decision: "AUTO_APPROVED",
    });
    assert.equal(autoApprovedListing.status, "ACTIVE");
    assert.equal(autoApprovedListing.moderation_status, "APPROVED");

    const patchRejected = await apiRequest({
      method: "PATCH",
      path: `/api/partner/listings/${encodeURIComponent(listingId)}`,
      token: sellerToken,
      expected: [400],
      body: {
        images: [
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
        ],
      },
    });
    assert.equal(patchRejected.data?.reasonCode, "QUALITY_PHOTO_MINIMUM_NOT_MET");

    await apiRequest({
      method: "DELETE",
      path: `/api/partner/listings/${encodeURIComponent(listingId)}`,
      token: sellerToken,
      expected: [200],
    });
  },
);

test(
  "integration: flagged partner listing stays pending for manual moderation",
  { skip: !safeDb },
  async () => {
    const sellerToken = await login("seller1@ecomm.local", "seller123");

    const created = await apiRequest({
      method: "POST",
      path: "/api/partner/listings",
      token: sellerToken,
      expected: [201],
      body: {
        type: "products",
        title: `integration manual review ${Date.now()}`,
        price: 16000,
        condition: "used",
        description:
          "integration listing with contact marker telegram @manualreview for moderation",
        category: "CI рискованный товар",
        images: [
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
          "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
          "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
        ],
        attributes: [
          ...testCatalogAttributes("CI рискованный товар"),
        ],
      },
    });

    const listingId = created.data?.id;
    assert.equal(typeof listingId, "string");
    assert.equal(created.data?.status, "moderation");
    assert.equal(created.data?.moderationStatus, "pending");

    const reviewedListing = await waitForListingEvent({
      listingPublicId: listingId,
      decision: "AUTO_REVIEW",
    });
    assert.equal(reviewedListing.status, "MODERATION");
    assert.equal(reviewedListing.moderation_status, "PENDING");

    await apiRequest({
      method: "DELETE",
      path: `/api/partner/listings/${encodeURIComponent(listingId)}`,
      token: sellerToken,
      expected: [200],
    });
  },
);

test(
  "integration: admin moderation persists reason-coded history",
  { skip: !safeDb },
  async () => {
    const sellerToken = await login("seller1@ecomm.local", "seller123");
    const adminToken = await login("admin@ecomm.local", "admin123");

    const created = await apiRequest({
      method: "POST",
      path: "/api/partner/listings",
      token: sellerToken,
      expected: [201],
      body: {
        type: "products",
        title: `integration moderation ${Date.now()}`,
        price: 14000,
        condition: "used",
        description: "integration moderation listing",
        category: "CI модерационный товар",
        images: [
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
          "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
          "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
        ],
        attributes: [
          ...testCatalogAttributes("CI модерационный товар"),
        ],
      },
    });

    const listingId = created.data?.id;
    assert.equal(typeof listingId, "string");

    await apiRequest({
      method: "PATCH",
      path: `/api/admin/listings/${encodeURIComponent(listingId)}/moderation`,
      token: adminToken,
      expected: [200],
      body: {
        status: "rejected",
        reasonCode: "ADMIN_REJECT_QUALITY_INCOMPLETE",
        reasonNote: "Missing diagnostics proof",
      },
    });

    const events = await apiRequest({
      method: "GET",
      path: `/api/admin/listings/${encodeURIComponent(listingId)}/moderation-events`,
      token: adminToken,
      expected: [200],
    });

    assert.ok(Array.isArray(events.data?.events));
    assert.ok(
      events.data.events.some(
        (event: { reasonCode?: string; decision?: string }) =>
          event.reasonCode === "ADMIN_REJECT_QUALITY_INCOMPLETE" &&
          event.decision === "rejected",
      ),
      "expected rejected moderation event with reason code",
    );

    await apiRequest({
      method: "DELETE",
      path: `/api/partner/listings/${encodeURIComponent(listingId)}`,
      token: sellerToken,
      expected: [200],
    });
  },
);
