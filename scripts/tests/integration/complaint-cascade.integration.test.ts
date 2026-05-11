import assert from "node:assert/strict";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
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

async function apiRequest(params: {
  method: "POST" | "PATCH";
  path: string;
  token?: string;
  body?: unknown;
  expected: number;
  idempotencyKey?: string;
}) {
  const response = await fetch(`${baseUrl}${params.path}`, {
    method: params.method,
    headers: {
      "content-type": "application/json",
      ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
      ...(params.method === "PATCH"
        ? { "Idempotency-Key": params.idempotencyKey ?? randomUUID() }
        : {}),
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(
    response.status,
    params.expected,
    `${params.method} ${params.path} returned ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function loginAdmin(): Promise<{ token: string; userId: number }> {
  const payload = await apiRequest({
    method: "POST",
    path: "/api/auth/login",
    expected: 200,
    body: {
      email: "admin@ecomm.local",
      password: "admin123",
    },
  });
  assert.equal(typeof payload.sessionToken, "string");
  assert.equal(typeof payload.user?.id, "number");
  return { token: payload.sessionToken, userId: payload.user.id };
}

async function createUser(prefix: string, role: "BUYER" | "SELLER") {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return prisma.appUser.create({
    data: {
      public_id: `${prefix}-${suffix}`,
      role,
      status: "ACTIVE",
      email: `${prefix.toLowerCase()}-${suffix}@ecomm.local`,
      password: "not-used-in-test",
      name: `${prefix} Test User`,
    },
    select: {
      id: true,
      public_id: true,
    },
  });
}

async function createListing(sellerId: number, prefix: string) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return prisma.marketplaceListing.create({
    data: {
      public_id: `${prefix}-${suffix}`,
      seller_id: sellerId,
      type: "PRODUCT",
      title: `${prefix} listing`,
      description: "Cascade regression listing",
      price: 1000,
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

async function createComplaint(params: {
  publicId: string;
  status: "NEW" | "PENDING" | "APPROVED";
  listingId: number;
  sellerId: number;
  reporterId: number;
}) {
  return prisma.complaint.create({
    data: {
      public_id: params.publicId,
      status: params.status,
      complaint_type: "cascade_regression",
      listing_id: params.listingId,
      seller_id: params.sellerId,
      reporter_id: params.reporterId,
      description: "Cascade regression complaint",
    },
    select: {
      id: true,
      public_id: true,
    },
  });
}

test(
  "integration: approving non-permanent complaint does not cascade related seller complaints",
  { skip: !safeDb },
  async () => {
    const admin = await loginAdmin();
    const seller = await createUser("CASCADE-NONPERM-SELLER", "SELLER");
    const reporter = await createUser("CASCADE-NONPERM-BUYER", "BUYER");
    const listing = await createListing(seller.id, "CASCADE-NONPERM-LST");
    const primary = await createComplaint({
      publicId: `CASCADE-NONPERM-PRIMARY-${Date.now()}`,
      status: "NEW",
      listingId: listing.id,
      sellerId: seller.id,
      reporterId: reporter.id,
    });
    const related = await createComplaint({
      publicId: `CASCADE-NONPERM-RELATED-${Date.now()}`,
      status: "NEW",
      listingId: listing.id,
      sellerId: seller.id,
      reporterId: reporter.id,
    });

    try {
      const payload = await apiRequest({
        method: "PATCH",
        path: `/api/admin/complaints/${primary.public_id}/status`,
        token: admin.token,
        expected: 200,
        body: {
          status: "approved",
          actionTaken: "Non-permanent cascade regression",
        },
      });

      assert.equal((payload.enforcement as { level?: unknown })?.level, "warning");
      assert.deepEqual((payload.cascade as { cascadedComplaintIds?: unknown })?.cascadedComplaintIds, []);

      const relatedAfter = await prisma.complaint.findUnique({
        where: { id: related.id },
        select: { status: true },
      });
      assert.equal(relatedAfter?.status, "NEW");
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [seller.id, reporter.id] } },
      });
    }
  },
);

test(
  "integration: permanent seller ban cascades open seller complaints",
  { skip: !safeDb },
  async () => {
    const admin = await loginAdmin();
    const seller = await createUser("CASCADE-PERM-SELLER", "SELLER");
    const reporter = await createUser("CASCADE-PERM-BUYER", "BUYER");
    const listings = await Promise.all(
      [0, 1, 2, 3, 4, 5].map((index) => createListing(seller.id, `CASCADE-PERM-LST-${index}`)),
    );

    const existingApproved = await Promise.all(
      [0, 1, 2].map((index) =>
        createComplaint({
          publicId: `CASCADE-PERM-APPROVED-${index}-${Date.now()}`,
          status: "APPROVED",
          listingId: listings[index].id,
          sellerId: seller.id,
          reporterId: reporter.id,
        }),
      ),
    );
    const primary = await createComplaint({
      publicId: `CASCADE-PERM-PRIMARY-${Date.now()}`,
      status: "NEW",
      listingId: listings[3].id,
      sellerId: seller.id,
      reporterId: reporter.id,
    });
    const related = await Promise.all(
      [4, 5].map((index) =>
        createComplaint({
          publicId: `CASCADE-PERM-RELATED-${index}-${Date.now()}`,
          status: "PENDING",
          listingId: listings[index].id,
          sellerId: seller.id,
          reporterId: reporter.id,
        }),
      ),
    );

    try {
      const payload = await apiRequest({
        method: "PATCH",
        path: `/api/admin/complaints/${primary.public_id}/status`,
        token: admin.token,
        expected: 200,
        body: {
          status: "approved",
          actionTaken: "Permanent cascade regression",
        },
      });

      assert.equal((payload.enforcement as { level?: unknown })?.level, "permanent");
      const cascade = payload.cascade as {
        updatedCount?: unknown;
        cascadedComplaintIds?: unknown;
      };
      assert.equal(cascade.updatedCount, 3);
      assert.deepEqual(
        new Set(cascade.cascadedComplaintIds as string[]),
        new Set(related.map((item) => item.public_id)),
      );

      const relatedAfter = await prisma.complaint.findMany({
        where: { id: { in: related.map((item) => item.id) } },
        select: { status: true },
      });
      assert.deepEqual(
        new Set(relatedAfter.map((item) => item.status)),
        new Set(["APPROVED"]),
      );

      const sellerAfter = await prisma.appUser.findUnique({
        where: { id: seller.id },
        select: { status: true, blocked_until: true },
      });
      assert.equal(sellerAfter?.status, "BLOCKED");
      assert.equal(sellerAfter?.blocked_until, null);

      assert.equal(existingApproved.length, 3);
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [seller.id, reporter.id] } },
      });
    }
  },
);

test(
  "integration: admin complaint status idempotency replays cached response without duplicating side effects",
  { skip: !safeDb },
  async () => {
    const admin = await loginAdmin();
    const seller = await createUser("COMPLAINT-IDEMP-SELLER", "SELLER");
    const reporter = await createUser("COMPLAINT-IDEMP-BUYER", "BUYER");
    const listing = await createListing(seller.id, "COMPLAINT-IDEMP-LST");
    const primary = await createComplaint({
      publicId: `COMPLAINT-IDEMP-PRIMARY-${Date.now()}`,
      status: "NEW",
      listingId: listing.id,
      sellerId: seller.id,
      reporterId: reporter.id,
    });
    const idempotencyKey = `complaint-idemp-${Date.now()}`;

    try {
      const first = await apiRequest({
        method: "PATCH",
        path: `/api/admin/complaints/${primary.public_id}/status`,
        token: admin.token,
        idempotencyKey,
        expected: 200,
        body: {
          status: "rejected",
          actionTaken: "Complaint idempotency replay check",
        },
      });

      const second = await apiRequest({
        method: "PATCH",
        path: `/api/admin/complaints/${primary.public_id}/status`,
        token: admin.token,
        idempotencyKey,
        expected: 200,
        body: {
          status: "rejected",
          actionTaken: "Complaint idempotency replay check",
        },
      });

      assert.deepEqual(second, first);
      assert.equal(first.status, "rejected");

      const complaintAfter = await prisma.complaint.findUnique({
        where: { id: primary.id },
        select: { status: true, action_taken: true },
      });
      assert.equal(complaintAfter?.status, "REJECTED");
      assert.equal(complaintAfter?.action_taken, "Complaint idempotency replay check");

      const events = await prisma.complaintEvent.findMany({
        where: { complaint_id: primary.id, event_type: "STATUS_CHANGED" },
        select: { id: true },
      });
      assert.equal(events.length, 1);

      const notifications = await prisma.notification.findMany({
        where: {
          user_id: { in: [seller.id, reporter.id] },
        },
        select: { id: true, user_id: true, target_url: true },
      });
      const sellerNotifications = notifications.filter((item) => item.user_id === seller.id);
      const reporterNotifications = notifications.filter((item) => item.user_id === reporter.id);
      assert.equal(sellerNotifications.length, 1);
      assert.equal(reporterNotifications.length, 1);
      assert.equal(sellerNotifications[0]?.target_url, "/profile?tab=partner");
      assert.equal(reporterNotifications[0]?.target_url, `/products/${encodeURIComponent(listing.public_id)}`);

      const idempotencyRows = await prisma.adminIdempotencyKey.findMany({
        where: {
          actor_user_id: admin.userId,
          action: "complaint.status.update",
          idempotency_key: idempotencyKey,
        },
        select: { response_status: true },
      });
      assert.equal(idempotencyRows.length, 1);
      assert.equal(idempotencyRows[0]?.response_status, 200);
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [seller.id, reporter.id] } },
      });
    }
  },
);

test(
  "integration: admin complaint status idempotency rejects same key with different payload",
  { skip: !safeDb },
  async () => {
    const admin = await loginAdmin();
    const seller = await createUser("COMPLAINT-CONFLICT-SELLER", "SELLER");
    const reporter = await createUser("COMPLAINT-CONFLICT-BUYER", "BUYER");
    const listing = await createListing(seller.id, "COMPLAINT-CONFLICT-LST");
    const primary = await createComplaint({
      publicId: `COMPLAINT-CONFLICT-PRIMARY-${Date.now()}`,
      status: "NEW",
      listingId: listing.id,
      sellerId: seller.id,
      reporterId: reporter.id,
    });
    const idempotencyKey = `complaint-conflict-${Date.now()}`;

    try {
      await apiRequest({
        method: "PATCH",
        path: `/api/admin/complaints/${primary.public_id}/status`,
        token: admin.token,
        idempotencyKey,
        expected: 200,
        body: {
          status: "rejected",
          actionTaken: "Complaint idempotency conflict baseline",
        },
      });

      const conflict = await apiRequest({
        method: "PATCH",
        path: `/api/admin/complaints/${primary.public_id}/status`,
        token: admin.token,
        idempotencyKey,
        expected: 409,
        body: {
          status: "approved",
          actionTaken: "Complaint idempotency conflict payload",
        },
      });

      assert.equal(
        conflict.error,
        "Idempotency-Key reuse with different payload is not allowed for this action.",
      );

      const complaintAfter = await prisma.complaint.findUnique({
        where: { id: primary.id },
        select: { status: true, action_taken: true },
      });
      assert.equal(complaintAfter?.status, "REJECTED");
      assert.equal(complaintAfter?.action_taken, "Complaint idempotency conflict baseline");

      const events = await prisma.complaintEvent.findMany({
        where: { complaint_id: primary.id, event_type: "STATUS_CHANGED" },
        select: { id: true },
      });
      assert.equal(events.length, 1);
    } finally {
      await prisma.appUser.deleteMany({
        where: { id: { in: [seller.id, reporter.id] } },
      });
    }
  },
);
