import { randomUUID } from "node:crypto";
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const API_BASE = `${BASE_URL.replace(/\/+$/, "")}/api`;
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5433/avito-db-dev?schema=public";

const report = [];

function record(name, ok, details = "") {
  report.push({ name, ok, details });
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isSafeDatabaseUrl(url) {
  const normalized = url.toLowerCase();
  return (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("postgres")
  );
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
  };
}

async function apiRequest(method, path, options = {}) {
  const {
    token,
    headers = {},
    body,
    expected = [200],
  } = options;

  const mergedHeaders = {
    ...headers,
  };
  if (token) {
    Object.assign(mergedHeaders, authHeaders(token));
  }
  if (body !== undefined && !Object.keys(mergedHeaders).some((key) => key.toLowerCase() === "content-type")) {
    mergedHeaders["content-type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: mergedHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!expected.includes(response.status)) {
    throw new Error(
      `${method} ${path} -> ${response.status}\n${typeof data === "string" ? data : JSON.stringify(data, null, 2)}`,
    );
  }

  return { status: response.status, data, headers: response.headers };
}

async function runStep(name, fn) {
  try {
    const details = await fn();
    record(name, true, details ?? "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function login(email, password) {
  const response = await apiRequest("POST", "/auth/login", {
    headers: { "content-type": "application/json" },
    body: { email, password },
    expected: [200],
  });

  invariant(typeof response.data?.sessionToken === "string", `sessionToken missing for ${email}`);
  invariant(typeof response.data?.user?.id === "number", `user.id missing for ${email}`);

  return {
    token: response.data.sessionToken,
    user: response.data.user,
  };
}

async function main() {
  if (!isSafeDatabaseUrl(DATABASE_URL)) {
    throw new Error(
      `Refusing to run critical e2e against non-local database: ${DATABASE_URL}`,
    );
  }

  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  let buyer;
  let seller;
  let admin;
  let sellerListing;

  const syntheticOrderIds = [];
  let originalListingStatus = null;
  let originalModerationStatus = null;

  try {
    await runStep("health endpoints", async () => {
      const healthRes = await fetch(`${BASE_URL}/health`);
      const healthBody = await healthRes.json();
      invariant(healthRes.status === 200, "health status is not 200");
      invariant(healthBody?.ok === true, "health ok=false");
      invariant(
        typeof healthRes.headers.get("x-request-id") === "string" &&
          healthRes.headers.get("x-request-id")?.length > 0,
        "x-request-id header is missing",
      );

      const readyRes = await fetch(`${BASE_URL}/health/ready`);
      const readyBody = await readyRes.json();
      invariant(readyRes.status === 200, "ready status is not 200");
      invariant(readyBody?.ok === true && readyBody?.db === "up", "readiness failed");

      const metricsRes = await fetch(`${BASE_URL}/health/metrics`);
      const metricsBody = await metricsRes.json();
      invariant(metricsRes.status === 200, "metrics status is not 200");
      invariant(typeof metricsBody?.http?.totalRequests === "number", "metrics payload malformed");

      return `requestId=${healthRes.headers.get("x-request-id")}`;
    });

    await runStep("reset anti-circ test fixture (pre-login)", async () => {
      const usersRes = await db.query(
        `SELECT id
         FROM "AppUser"
         WHERE email IN ('buyer1@ecomm.local', 'seller1@ecomm.local')`,
      );
      const userIds = usersRes.rows.map((row) => Number(row.id)).filter(Number.isInteger);
      invariant(userIds.length === 2, "fixture users not found");

      await db.query(
        `UPDATE "AppUser"
         SET status = 'ACTIVE', blocked_until = NULL, block_reason = NULL
         WHERE id = ANY($1::int[])`,
        [userIds],
      );
      await db.query(
        `DELETE FROM "AuditLog"
         WHERE actor_user_id = ANY($1::int[])
           AND action IN ('anti_circumvention.violation_detected', 'anti_circumvention.sanction_applied')`,
        [userIds],
      );
      return `users=${userIds.join(",")}`;
    });

    await runStep("auth login", async () => {
      buyer = await login("buyer1@ecomm.local", "buyer123");
      seller = await login("seller1@ecomm.local", "seller123");
      admin = await login("admin@ecomm.local", "admin123");
      return `buyer=${buyer.user.id}, seller=${seller.user.id}, admin=${admin.user.id}`;
    });

    await runStep("load seller listing", async () => {
      const listingsRes = await apiRequest("GET", "/partner/listings?type=products", {
        token: seller.token,
        expected: [200],
      });
      const listings = Array.isArray(listingsRes.data) ? listingsRes.data : [];
      invariant(listings.length > 0, "seller has no listings for critical checks");
      sellerListing = listings[0];
      invariant(typeof sellerListing?.id === "string", "seller listing id missing");
      return `listing=${sellerListing.id}`;
    });

    await runStep("checkout invariant quantity=1", async () => {
      const oversized = await apiRequest("POST", "/profile/orders", {
        token: buyer.token,
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: {
          items: [{ listingId: sellerListing.id, quantity: 2 }],
          deliveryType: "pickup",
          paymentMethod: "card",
        },
        expected: [400],
      });
      invariant(
        typeof oversized.data?.error === "string" && oversized.data.error.length > 0,
        "expected validation error for quantity > 1",
      );

      const duplicated = await apiRequest("POST", "/profile/orders", {
        token: buyer.token,
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: {
          items: [
            { listingId: sellerListing.id, quantity: 1 },
            { listingId: sellerListing.id, quantity: 1 },
          ],
          deliveryType: "pickup",
          paymentMethod: "card",
        },
        expected: [400],
      });

      invariant(
        typeof duplicated.data?.error === "string" && duplicated.data.error.length > 0,
        "expected duplicate listing validation error",
      );
      return "quantity>1 and duplicate listing are rejected";
    });

    await runStep("buyer anti-circumvention incident logged", async () => {
      const before = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM "AuditLog"
         WHERE actor_user_id = $1
           AND action = 'anti_circumvention.violation_detected'`,
        [buyer.user.id],
      );
      const beforeCount = before.rows[0]?.count ?? 0;

      const blocked = await apiRequest(
        "POST",
        `/catalog/listings/${encodeURIComponent(sellerListing.id)}/questions`,
        {
          token: buyer.token,
          headers: { "content-type": "application/json" },
          body: {
            question: "Пишите в Telegram @outside_deal и +79990000000",
          },
          expected: [400, 403],
        },
      );

      invariant(
        typeof blocked.data?.error === "string" && blocked.data.error.length > 0,
        "expected anti-circumvention error for buyer question",
      );

      const after = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM "AuditLog"
         WHERE actor_user_id = $1
           AND action = 'anti_circumvention.violation_detected'`,
        [buyer.user.id],
      );
      const afterCount = after.rows[0]?.count ?? 0;
      invariant(afterCount >= beforeCount + 1, "anti-circumvention audit event not recorded");
      return `audit ${beforeCount} -> ${afterCount}`;
    });

    await runStep("seller anti-circumvention blocks answer", async () => {
      const safeQuestion = await apiRequest(
        "POST",
        `/catalog/listings/${encodeURIComponent(sellerListing.id)}/questions`,
        {
          token: buyer.token,
          headers: { "content-type": "application/json" },
          body: {
            question: `Подскажите, есть ли гарантия? Тестовый запрос ${Math.floor(
              Math.random() * 1000,
            )}`,
          },
          expected: [201],
        },
      );

      const questionId = safeQuestion.data?.id;
      invariant(typeof questionId === "string" && questionId.length > 0, "question id missing");

      const before = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM "Complaint"
         WHERE seller_id = $1
           AND complaint_type = 'off_platform_contact_attempt'`,
        [seller.user.id],
      );
      const beforeCount = before.rows[0]?.count ?? 0;

      const answerAttempt = await apiRequest(
        "POST",
        `/partner/questions/${encodeURIComponent(questionId)}/answer`,
        {
          token: seller.token,
          headers: { "content-type": "application/json" },
          body: {
            answer: "Давайте вне платформы, вот номер +79995554433",
          },
          expected: [400, 403],
        },
      );

      invariant(
        typeof answerAttempt.data?.error === "string" && answerAttempt.data.error.length > 0,
        "expected anti-circumvention error for seller answer",
      );

      const after = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM "Complaint"
         WHERE seller_id = $1
           AND complaint_type = 'off_platform_contact_attempt'`,
        [seller.user.id],
      );
      const afterCount = after.rows[0]?.count ?? 0;
      invariant(afterCount >= beforeCount, "unexpected complaint count regression");
      return `complaints ${beforeCount} -> ${afterCount}`;
    });

    await runStep("listing cannot be reactivated when linked to order", async () => {
      const listingRow = await db.query(
        `SELECT id, public_id, seller_id, title, price, status, moderation_status
         FROM "MarketplaceListing"
         WHERE public_id = $1
         LIMIT 1`,
        [sellerListing.id],
      );
      const listing = listingRow.rows[0];
      invariant(Boolean(listing), "listing not found in DB");

      originalListingStatus = listing.status;
      originalModerationStatus = listing.moderation_status;

      await db.query(
        `UPDATE "MarketplaceListing"
         SET status = 'INACTIVE', moderation_status = 'APPROVED', updated_at = NOW()
         WHERE id = $1`,
        [listing.id],
      );

      const syntheticOrderPublicId = `CI-STAGE4-${Date.now()}`;
      const createdOrder = await db.query(
        `INSERT INTO "MarketOrder"
         (public_id, buyer_id, seller_id, status, delivery_type, delivery_address, total_price, delivery_cost, discount, created_at, updated_at)
         VALUES ($1, $2, $3, 'CREATED', 'PICKUP', 'CI synthetic order', $4, 0, 0, NOW(), NOW())
         RETURNING id`,
        [
          syntheticOrderPublicId,
          buyer.user.id,
          listing.seller_id,
          Math.max(Number(listing.price ?? 0), 100),
        ],
      );
      const syntheticOrderId = createdOrder.rows[0]?.id;
      invariant(Boolean(syntheticOrderId), "synthetic order not created");
      syntheticOrderIds.push(syntheticOrderId);

      await db.query(
        `INSERT INTO "MarketOrderItem"
         (order_id, listing_id, name, image, price, quantity)
         VALUES ($1, $2, $3, NULL, $4, 1)`,
        [
          syntheticOrderId,
          listing.id,
          String(listing.title || "CI listing"),
          Math.max(Number(listing.price ?? 0), 100),
        ],
      );

      const sellerActivationAttempt = await apiRequest(
        "PATCH",
        `/partner/listings/${encodeURIComponent(sellerListing.id)}/status`,
        {
          token: seller.token,
          headers: { "content-type": "application/json" },
          body: {
            status: "moderation",
          },
          expected: [409],
        },
      );
      invariant(
        typeof sellerActivationAttempt.data?.error === "string" &&
          sellerActivationAttempt.data.error.length > 0,
        "seller reactivation should be blocked",
      );

      const adminModeration = await apiRequest(
        "PATCH",
        `/admin/listings/${encodeURIComponent(sellerListing.id)}/moderation`,
        {
          token: admin.token,
          headers: { "content-type": "application/json" },
          body: {
            status: "approved",
          },
          expected: [200],
        },
      );

      invariant(adminModeration.data?.activationBlockedByOrder === true, "admin flag is not set");
      invariant(adminModeration.data?.listingStatus === "inactive", "listing must stay inactive");
      return "seller/admin activation blocked";
    });

    await runStep("partner orders expose finance fields", async () => {
      const orders = await apiRequest("GET", "/partner/orders", {
        token: seller.token,
        expected: [200],
      });
      invariant(Array.isArray(orders.data), "partner orders payload malformed");
      invariant(orders.data.length > 0, "partner orders list is empty");
      const withFinance = orders.data.find(
        (item) =>
          item &&
          typeof item === "object" &&
          item.finance &&
          typeof item.finance === "object" &&
          Object.prototype.hasOwnProperty.call(item.finance, "gross_amount"),
      );
      invariant(Boolean(withFinance), "finance block is missing in partner orders response");
      return `orders=${orders.data.length}`;
    });
  } finally {
    if (syntheticOrderIds.length > 0) {
      await db.query(
        `DELETE FROM "MarketOrderItem"
         WHERE order_id = ANY($1::int[])`,
        [syntheticOrderIds],
      );
      await db.query(
        `DELETE FROM "MarketOrder"
         WHERE id = ANY($1::int[])`,
        [syntheticOrderIds],
      );
    }

    if (sellerListing?.id && originalListingStatus && originalModerationStatus) {
      await db.query(
        `UPDATE "MarketplaceListing"
         SET status = $2::"ListingStatus",
             moderation_status = $3::"ModerationStatus",
             updated_at = NOW()
         WHERE public_id = $1`,
        [sellerListing.id, originalListingStatus, originalModerationStatus],
      );
    }

    await db.end();
  }

  const passed = report.filter((item) => item.ok);
  const failed = report.filter((item) => !item.ok);

  console.log("\nCRITICAL E2E REPORT");
  console.log("===================");
  for (const item of report) {
    console.log(`${item.ok ? "PASS" : "FAIL"} | ${item.name}`);
    if (item.details) {
      console.log(`  ${item.details}`);
    }
  }
  console.log("-------------------");
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
