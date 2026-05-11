import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
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
let server: Server | null = null;
let baseUrl = "";

before(async () => {
  if (!safeDb) return;

  server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
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

function testCatalogAttributes(itemName: string) {
  return [
    { key: "__catalog_category", value: "Комплектующие для ПК" },
    { key: "__catalog_subcategory", value: "Основные комплектующие для ПК" },
    { key: "__catalog_item", value: itemName },
    { key: "__catalog_item_custom", value: itemName },
  ];
}

async function apiRequest(params: {
  method: "GET" | "POST" | "PATCH";
  path: string;
  token?: string;
  body?: unknown;
  expected: number;
}) {
  const response = await fetch(`${baseUrl}${params.path}`, {
    method: params.method,
    headers: {
      ...(params.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(
    response.status,
    params.expected,
    `${params.method} ${params.path} -> ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function login(email: string, password: string): Promise<{ token: string; userId: number }> {
  const payload = await apiRequest({
    method: "POST",
    path: "/api/auth/login",
    expected: 200,
    body: { email, password },
  });
  assert.equal(typeof payload.sessionToken, "string");
  assert.equal(typeof payload.user?.id, "number");
  return {
    token: payload.sessionToken as string,
    userId: payload.user.id as number,
  };
}

test(
  "integration: listing rejection persists moderation history, audit row and seller notification",
  { skip: !safeDb },
  async () => {
    const admin = await login("admin@ecomm.local", "admin123");
    const seller = await login("seller1@ecomm.local", "seller123");

    const createdListing = await apiRequest({
      method: "POST",
      path: "/api/partner/listings",
      token: seller.token,
      expected: 201,
      body: {
        type: "products",
        title: `integration notification listing ${Date.now()}`,
        price: 15000,
        condition: "used",
        description: "clean listing for moderation notification integration coverage",
        category: "CI тестовый товар",
        images: [
          "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
          "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
          "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
          "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
        ],
        attributes: testCatalogAttributes("CI тестовый товар"),
      },
    });
    assert.equal(typeof createdListing.id, "string");

    const listing = await prisma.marketplaceListing.findUnique({
      where: { public_id: createdListing.id as string },
      select: {
        id: true,
        public_id: true,
        moderation_status: true,
        status: true,
      },
    });
    assert.ok(listing, "created listing not found");

    const beforeNotifications = await prisma.notification.count({
      where: { user_id: seller.userId },
    });
    const reasonNote = `integration reject reason ${Date.now()}`;

    try {
      await apiRequest({
        method: "PATCH",
        path: `/api/admin/listings/${listing.public_id}/moderation`,
        token: admin.token,
        expected: 200,
        body: {
          status: "rejected",
          reasonCode: "CONTACTS_IN_DESCRIPTION",
          reasonNote,
        },
      });

      const moderationEvents = await apiRequest({
        method: "GET",
        path: `/api/admin/listings/${listing.public_id}/moderation-events`,
        token: admin.token,
        expected: 200,
      });
      assert.ok(Array.isArray(moderationEvents.events));
      assert.equal(moderationEvents.events[0]?.reasonNote, reasonNote);

      const rejectNotifications = await prisma.notification.findMany({
        where: { user_id: seller.userId },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: {
          message: true,
          target_url: true,
        },
      });
      const rejectNotification = rejectNotifications.find(
        (item) => item.target_url === "/profile?tab=partner" && item.message.includes(reasonNote),
      );
      assert.ok(rejectNotification, "notification was not persisted");
      assert.match(rejectNotification.message, /отклонено/i);
      assert.equal(rejectNotification.target_url, "/profile?tab=partner");

      const notificationsPayload = await apiRequest({
        method: "GET",
        path: "/api/profile/notifications",
        token: seller.token,
        expected: 200,
      });
      assert.ok(Array.isArray(notificationsPayload.notifications));
      assert.ok(
        notificationsPayload.notifications.some(
          (item) => item.message.includes(reasonNote) && item.url === "/profile?tab=partner",
        ),
        "profile notifications endpoint did not expose moderation notification",
      );

      const auditRow = await prisma.auditLog.findFirst({
        where: {
          actor_user_id: admin.userId,
          action: "listing.moderation_changed",
          entity_public_id: listing.public_id,
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        select: { details: true },
      });
      assert.ok(auditRow, "audit row was not persisted");
      const auditJson = JSON.stringify(auditRow.details);
      assert.match(auditJson, /listing\.moderation_changed|ADMIN_REJECT_OTHER|reasonCode/);
      assert.match(auditJson, new RegExp(reasonNote));

      const afterNotifications = await prisma.notification.count({
        where: { user_id: seller.userId },
      });
      assert.ok(afterNotifications >= beforeNotifications + 1);
    } finally {
      await prisma.marketplaceListing
        .update({
          where: { id: listing.id },
          data: {
            moderation_status: listing.moderation_status,
            status: listing.status,
          },
        })
        .catch(() => null);
      await apiRequest({
        method: "PATCH",
        path: `/api/admin/listings/${listing.public_id}/moderation`,
        token: admin.token,
        expected: 200,
        body: {
          status: "approved",
        },
      }).catch(() => null);
      await fetch(`${baseUrl}/api/partner/listings/${encodeURIComponent(listing.public_id)}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${seller.token}`,
        },
      }).catch(() => null);
    }
  },
);
