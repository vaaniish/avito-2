import { createHmac, randomUUID } from "node:crypto";
import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const API_BASE = `${BASE_URL.replace(/\/+$/, "")}/api`;
const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://user:password@localhost:5433/avito-db-dev?schema=public";
const YOOKASSA_WEBHOOK_TOKEN = process.env.YOOKASSA_WEBHOOK_TOKEN?.trim() || "";

const jsonHeaders = {
  "content-type": "application/json",
};

const report = [];
const DEFAULT_SESSION_TOKEN_ISSUER = "avito-2-backend";
const DEFAULT_SESSION_TOKEN_AUDIENCE = "avito-2-frontend";
const DEV_FALLBACK_SESSION_TOKEN_SECRET = "dev-local-session-secret-change-me";

function record(name, ok, details = "") {
  report.push({ name, ok, details });
}

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requireToken(token, userLabel) {
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error(`missing sessionToken for ${userLabel}`);
  }
  return token.trim();
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function toBase64Url(input) {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getSessionTokenSecretForSmoke() {
  return process.env.SESSION_TOKEN_SECRET?.trim() || DEV_FALLBACK_SESSION_TOKEN_SECRET;
}

function getSessionTokenIssuerForSmoke() {
  return process.env.SESSION_TOKEN_ISSUER?.trim() || DEFAULT_SESSION_TOKEN_ISSUER;
}

function getSessionTokenAudienceForSmoke() {
  return process.env.SESSION_TOKEN_AUDIENCE?.trim() || DEFAULT_SESSION_TOKEN_AUDIENCE;
}

function signHmacSha256(payload, secret) {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createExpiredSessionToken(userId) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: String(userId),
      iat: nowSeconds - 7200,
      exp: nowSeconds - 3600,
      iss: getSessionTokenIssuerForSmoke(),
      aud: getSessionTokenAudienceForSmoke(),
      v: 1,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = signHmacSha256(signingInput, getSessionTokenSecretForSmoke());
  return `${signingInput}.${signature}`;
}

function createMalformedSessionToken(token) {
  const normalized = requireToken(token, "malformed");
  return `${normalized}broken`;
}

async function apiRequest(method, path, options = {}) {
  const { headers = {}, body, expected = [200] } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
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

  return { status: response.status, data };
}

async function runStep(name, fn) {
  try {
    const details = await fn();
    record(name, true, details ?? "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  let buyer = null;
  let seller = null;
  let admin = null;
  let buyerToken = null;
  let sellerToken = null;
  let adminToken = null;
  let firstListing = null;
  let createdAddressId = null;
  let originalDefaultAddressId = null;
  let createdListingId = null;
  let createdAddressLabel = null;
  let createdComplaintPublicId = null;
  let createdQuestionPublicId = null;
  let syntheticOrderPublicId = null;
  let syntheticKycPublicId = null;
  let syntheticSellerUserId = null;

  await runStep("health", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    invariant(res.status === 200 && data?.ok === true, "health failed");
    return "ok=true";
  });

  await runStep("auth: reject wrong password", async () => {
    const res = await apiRequest("POST", "/auth/login", {
      headers: jsonHeaders,
      body: { email: "buyer1@ecomm.local", password: "wrong-password" },
      expected: [401],
    });
    invariant(typeof res.data?.error === "string", "expected error payload for wrong password");
    return `status=${res.status}`;
  });

  await runStep("authz: reject anonymous profile access", async () => {
    const res = await apiRequest("GET", "/profile/me", {
      expected: [401],
    });
    invariant(typeof res.data?.error === "string", "expected unauthorized error");
    return `status=${res.status}`;
  });

  await runStep("auth: login buyer/seller/admin", async () => {
    const buyerRes = await apiRequest("POST", "/auth/login", {
      headers: jsonHeaders,
      body: { email: "buyer1@ecomm.local", password: "buyer123" },
      expected: [200],
    });
    const sellerRes = await apiRequest("POST", "/auth/login", {
      headers: jsonHeaders,
      body: { email: "seller1@ecomm.local", password: "seller123" },
      expected: [200],
    });
    const adminRes = await apiRequest("POST", "/auth/login", {
      headers: jsonHeaders,
      body: { email: "admin@ecomm.local", password: "admin123" },
      expected: [200],
    });

    buyer = buyerRes.data?.user;
    seller = sellerRes.data?.user;
    admin = adminRes.data?.user;
    buyerToken = requireToken(buyerRes.data?.sessionToken, "buyer");
    sellerToken = requireToken(sellerRes.data?.sessionToken, "seller");
    adminToken = requireToken(adminRes.data?.sessionToken, "admin");
    invariant(buyer?.id && seller?.id && admin?.id, "missing user ids from login");
    return `buyer=${buyer.id}, seller=${seller.id}, admin=${admin.id}`;
  });

  await runStep("auth: me via bearer token", async () => {
    const res = await apiRequest("GET", "/auth/me", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [200],
    });
    invariant(res.data?.user?.id === buyer?.id, "auth/me returned unexpected user");
    return `id=${res.data.user.id}`;
  });

  await runStep("authz: reject buyer access to admin endpoints", async () => {
    const res = await apiRequest("GET", "/admin/users", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [403],
    });
    invariant(typeof res.data?.error === "string", "expected forbidden error");
    return `status=${res.status}`;
  });

  await runStep("auth: reject malformed bearer token", async () => {
    const malformedToken = createMalformedSessionToken(requireToken(buyerToken, "buyer"));
    const res = await apiRequest("GET", "/auth/me", {
      headers: authHeaders(malformedToken),
      expected: [401],
    });
    invariant(res.data?.error === "Unauthorized", "unexpected response for malformed token");
    return `status=${res.status}`;
  });

  await runStep("auth: reject expired bearer token", async () => {
    invariant(Boolean(buyer?.id), "buyer id required for expired-token test");
    const expiredToken = createExpiredSessionToken(buyer.id);
    const res = await apiRequest("GET", "/auth/me", {
      headers: authHeaders(expiredToken),
      expected: [401],
    });
    invariant(res.data?.error === "Unauthorized", "unexpected response for expired token");
    return `status=${res.status}`;
  });

  await runStep("catalog: list/detail/suggestions", async () => {
    const categories = await apiRequest("GET", "/catalog/categories?type=products");
    const products = await apiRequest("GET", "/catalog/listings?type=products&limit=24&offset=0");
    const suggestions = await apiRequest("GET", "/catalog/suggestions?q=iphone");

    invariant(Array.isArray(categories.data) && categories.data.length > 0, "no categories");
    invariant(Array.isArray(products.data) && products.data.length > 0, "no products");
    invariant(Array.isArray(suggestions.data), "suggestions not array");

    firstListing = products.data[0];
    const detail = await apiRequest(
      "GET",
      `/catalog/listings/${encodeURIComponent(firstListing.id)}`,
    );
    invariant(detail.data?.id === firstListing.id, "listing detail mismatch");
    return `products=${products.data.length}, first=${firstListing.id}`;
  });

  await runStep("catalog: questions flow", async () => {
    invariant(firstListing?.id, "listing id required for questions flow");
    const before = await apiRequest("GET", `/catalog/listings/${firstListing.id}/questions`, {
      expected: [200],
    });
    invariant(Array.isArray(before.data), "questions list must be array");

    const questionText = "Подскажите, пожалуйста, есть ли гарантия на устройство?";
    const created = await apiRequest("POST", `/catalog/listings/${firstListing.id}/questions`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: { question: questionText },
      expected: [201],
    });
    createdQuestionPublicId = created.data?.id ?? null;
    invariant(createdQuestionPublicId, "created question id missing");

    const paged = await apiRequest(
      "GET",
      `/catalog/listings/${firstListing.id}/questions?paginated=1&limit=20&offset=0`,
      { expected: [200] },
    );
    invariant(Array.isArray(paged.data?.items), "paginated questions malformed");
    invariant(
      paged.data.items.some((item) => item.id === createdQuestionPublicId),
      "created question is not visible in paginated list",
    );
    return `question=${createdQuestionPublicId}`;
  });

  await runStep("catalog: complaint create flow", async () => {
    invariant(firstListing?.id, "listing id required for complaint flow");
    const complaintType = `ci_smoke_${Date.now()}`;
    const created = await apiRequest("POST", `/catalog/listings/${firstListing.id}/complaints`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {
        complaintType,
        description: "CI smoke complaint to validate complaint create flow",
      },
      expected: [201],
    });
    createdComplaintPublicId = created.data?.id ?? null;
    invariant(createdComplaintPublicId, "complaint create did not return id");
    return `complaint=${createdComplaintPublicId}`;
  });

  await runStep("profile: me/wishlist/notifications", async () => {
    const me = await apiRequest("GET", "/profile/me", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
    });
    const wishlist = await apiRequest("GET", "/profile/wishlist", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
    });
    const notifications = await apiRequest("GET", "/profile/notifications", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
    });

    invariant(me.data?.user?.id === buyer?.id, "profile/me mismatch");
    invariant(Array.isArray(wishlist.data), "wishlist is not array");
    invariant(Array.isArray(notifications.data?.notifications), "notifications malformed");

    await apiRequest("PATCH", "/profile/notifications/mark-as-read", {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {},
      expected: [200],
    });
    return `wishlist=${wishlist.data.length}, notifications=${notifications.data.notifications.length}`;
  });

  await runStep("profile: patch me and revert", async () => {
    const before = await apiRequest("GET", "/profile/me", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [200],
    });
    const originalUser = before.data?.user;
    invariant(originalUser?.email, "profile/me missing user payload");

    const nextFirstName = `${originalUser.firstName || "Buyer"} CI`;
    await apiRequest("PATCH", "/profile/me", {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {
        firstName: nextFirstName,
        lastName: originalUser.lastName ?? "",
        displayName: originalUser.displayName ?? "",
        email: originalUser.email,
      },
      expected: [200],
    });

    const afterPatch = await apiRequest("GET", "/profile/me", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [200],
    });
    invariant(
      afterPatch.data?.user?.firstName === nextFirstName,
      "profile patch did not update firstName",
    );

    await apiRequest("PATCH", "/profile/me", {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {
        firstName: originalUser.firstName ?? "",
        lastName: originalUser.lastName ?? "",
        displayName: originalUser.displayName ?? "",
        email: originalUser.email,
      },
      expected: [200],
    });

    return `patched+reverted firstName`;
  });

  await runStep("profile: address CRUD + default switch", async () => {
    const listBefore = await apiRequest("GET", "/profile/addresses", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
    });
    invariant(Array.isArray(listBefore.data), "addresses not array");
    originalDefaultAddressId =
      listBefore.data.find((item) => item.isDefault)?.id ?? null;

    createdAddressLabel = `ci-${Date.now()}`;
    const created = await apiRequest("POST", "/profile/addresses", {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {
        name: createdAddressLabel,
        fullAddress: "Москва, Тверская улица, дом 1",
        region: "Москва",
        city: "Москва",
        street: "Тверская улица",
        house: "1",
        apartment: "1",
        entrance: "1",
        postalCode: "125009",
        lat: 55.757,
        lon: 37.615,
        isDefault: false,
      },
      expected: [201],
    });
    createdAddressId = created.data?.id;
    invariant(createdAddressId, "address create did not return id");

    await apiRequest("PATCH", `/profile/addresses/${createdAddressId}`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {
        city: "Москва",
        street: "Тверская",
        house: "2",
      },
      expected: [200],
    });

    await apiRequest("POST", `/profile/addresses/${createdAddressId}/default`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {},
      expected: [200],
    });

    if (originalDefaultAddressId && originalDefaultAddressId !== createdAddressId) {
      await apiRequest("POST", `/profile/addresses/${originalDefaultAddressId}/default`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(buyerToken, "buyer")),
        },
        body: {},
        expected: [200],
      });
    }

    await apiRequest("DELETE", `/profile/addresses/${createdAddressId}`, {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [200],
    });

    const dbCheck = await db.query(
      'select count(*)::int as cnt from "UserAddress" where user_id = $1 and label = $2',
      [buyer.id, createdAddressLabel],
    );
    invariant(dbCheck.rows[0].cnt === 0, "created address still present in DB");
    return `created+deleted address label=${createdAddressLabel}`;
  });

  await runStep("profile: reject delete default address", async () => {
    const list = await apiRequest("GET", "/profile/addresses", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [200],
    });
    invariant(Array.isArray(list.data), "addresses payload malformed");
    const defaultAddress = list.data.find((item) => item.isDefault);
    invariant(defaultAddress?.id, "default address not found");

    const result = await apiRequest("DELETE", `/profile/addresses/${defaultAddress.id}`, {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [400],
    });
    invariant(
      typeof result.data?.error === "string" &&
        result.data.error.includes("Default address"),
      "unexpected error for default-address delete",
    );
    return `status=${result.status}`;
  });

  await runStep("profile: wishlist add/remove", async () => {
    const currentWishlist = await apiRequest("GET", "/profile/wishlist", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
    });
    const existingIds = new Set(
      (currentWishlist.data ?? []).map((item) => item.id),
    );
    const listings = await apiRequest(
      "GET",
      "/catalog/listings?type=products&limit=100&offset=0",
    );
    const target =
      listings.data.find((item) => !existingIds.has(item.id)) ?? listings.data[0];
    invariant(target?.id, "no listing available for wishlist test");

    await apiRequest("POST", `/profile/wishlist/${target.id}`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
      },
      body: {},
      expected: [201],
    });
    const afterAdd = await apiRequest("GET", "/profile/wishlist", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
    });
    invariant(afterAdd.data.some((item) => item.id === target.id), "wishlist add failed");

    await apiRequest("DELETE", `/profile/wishlist/${target.id}`, {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [200],
    });
    const afterDelete = await apiRequest("GET", "/profile/wishlist", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
    });
    invariant(
      !afterDelete.data.some((item) => item.id === target.id),
      "wishlist delete failed",
    );

    return `target=${target.id}`;
  });

  await runStep("partner: listings/query endpoints", async () => {
    const listings = await apiRequest("GET", "/partner/listings?type=products", {
      headers: authHeaders(requireToken(sellerToken, "seller")),
    });
    const titleSuggestions = await apiRequest(
      "GET",
      "/partner/listings/title-suggestions?q=iphone&type=products",
      {
        headers: authHeaders(requireToken(sellerToken, "seller")),
      },
    );
    const categoryGuess = await apiRequest(
      "GET",
      "/partner/listings/category-guess?title=iphone&type=products",
      {
        headers: authHeaders(requireToken(sellerToken, "seller")),
      },
    );
    const orders = await apiRequest("GET", "/partner/orders", {
      headers: authHeaders(requireToken(sellerToken, "seller")),
    });
    const questions = await apiRequest("GET", "/partner/questions", {
      headers: authHeaders(requireToken(sellerToken, "seller")),
    });

    invariant(Array.isArray(listings.data), "partner listings not array");
    invariant(Array.isArray(titleSuggestions.data), "title suggestions not array");
    invariant(Array.isArray(orders.data), "orders malformed");
    invariant(Array.isArray(questions.data), "questions malformed");
    return `listings=${listings.data.length}, category=${categoryGuess.data?.category ?? "null"}`;
  });

  await runStep("partner: create/update/toggle/delete listing", async () => {
    const created = await apiRequest("POST", "/partner/listings", {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(sellerToken, "seller")),
      },
      body: {
        type: "products",
        title: `CI listing ${Date.now()}`,
        price: 12345,
        condition: "new",
        description: "Smoke test listing",
        category: "Электроника",
        images: ["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80"],
        attributes: [
          { key: "brand", value: "ci" },
          { key: "model", value: "smoke" },
        ],
      },
      expected: [201],
    });
    createdListingId = created.data?.id;
    invariant(createdListingId, "partner listing create failed");

    const updated = await apiRequest("PATCH", `/partner/listings/${createdListingId}`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(sellerToken, "seller")),
      },
      body: {
        title: `CI listing updated ${Date.now()}`,
        price: 12456,
        condition: "new",
        description: "Smoke test listing updated",
        category: "Электроника",
        images: ["https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80"],
        attributes: [
          { key: "brand", value: "ci-updated" },
          { key: "model", value: "smoke-updated" },
        ],
      },
      expected: [200],
    });
    invariant(updated.data?.id === createdListingId, "listing update returned unexpected id");

    await apiRequest("PATCH", `/partner/listings/${createdListingId}/status`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(sellerToken, "seller")),
      },
      body: { status: "inactive" },
      expected: [200],
    });
    await apiRequest("POST", `/partner/listings/${createdListingId}/toggle-status`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(sellerToken, "seller")),
      },
      body: {},
      expected: [200],
    });
    await apiRequest("DELETE", `/partner/listings/${createdListingId}`, {
      headers: authHeaders(requireToken(sellerToken, "seller")),
      expected: [200],
    });

    const dbCheck = await db.query(
      'select count(*)::int as cnt from "MarketplaceListing" where public_id = $1',
      [createdListingId],
    );
    invariant(dbCheck.rows[0].cnt === 0, "created listing still exists after delete");
    return `created+deleted listing=${createdListingId}`;
  });

  await runStep("partner: order status + tracking", async () => {
    invariant(buyer?.id && seller?.id, "buyer/seller ids are required");
    const sellerListingRes = await db.query(
      `select id, public_id, title, price
         from "MarketplaceListing"
        where seller_id = $1
        order by created_at desc
        limit 1`,
      [seller.id],
    );
    const sellerListing = sellerListingRes.rows[0];
    invariant(sellerListing?.id, "no seller listing found for order update flow");

    syntheticOrderPublicId = `ORD-CI-${Date.now()}`;
    const insertedOrder = await db.query(
      `insert into "MarketOrder"
        (public_id, buyer_id, seller_id, status, delivery_type, delivery_address, total_price, delivery_cost, discount, created_at, updated_at)
       values
        ($1, $2, $3, 'PAID', 'DELIVERY', $4, $5, 0, 0, now(), now())
       returning id`,
      [syntheticOrderPublicId, buyer.id, seller.id, "Москва, тестовый адрес", Number(sellerListing.price) || 1000],
    );
    const orderId = insertedOrder.rows[0]?.id;
    invariant(orderId, "failed to insert synthetic order");

    await db.query(
      `insert into "MarketOrderItem" (order_id, listing_id, name, image, price, quantity)
       values ($1, $2, $3, $4, $5, $6)`,
      [orderId, sellerListing.id, sellerListing.title || "CI order item", null, Number(sellerListing.price) || 1000, 1],
    );

    try {
      const statusUpdate = await apiRequest("PATCH", `/partner/orders/${syntheticOrderPublicId}/status`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(sellerToken, "seller")),
        },
        body: { status: "prepared" },
        expected: [200],
      });
      invariant(statusUpdate.data?.status === "PREPARED", "order status was not updated");

      const trackingNumber = `CI${Date.now()}`;
      const trackingUpdate = await apiRequest("PATCH", `/partner/orders/${syntheticOrderPublicId}/tracking`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(sellerToken, "seller")),
        },
        body: {
          tracking_number: trackingNumber,
          provider: "yandex_pvz",
        },
        expected: [200],
      });
      invariant(trackingUpdate.data?.status === "SHIPPED", "tracking update did not ship order");
      invariant(
        typeof trackingUpdate.data?.tracking_number === "string" &&
          trackingUpdate.data.tracking_number.length > 0,
        "tracking number missing after update",
      );
      return `order=${syntheticOrderPublicId}`;
    } finally {
      await db.query(`delete from "MarketOrder" where public_id = $1`, [syntheticOrderPublicId]);
      syntheticOrderPublicId = null;
    }
  });

  await runStep("partner: reject cross-seller listing update", async () => {
    const syntheticSellerPublicId = `USR-CI-SELLER-${Date.now()}`;
    const syntheticSellerEmail = `ci-seller-${Date.now()}@ecomm.local`;
    const syntheticListingPublicId = `LST-CI-${Date.now()}`;

    const insertedSeller = await db.query(
      `insert into "AppUser"
        (public_id, role, status, email, password, name, joined_at, created_at, updated_at)
       values
        ($1, 'SELLER', 'ACTIVE', $2, $3, $4, now(), now(), now())
       returning id`,
      [syntheticSellerPublicId, syntheticSellerEmail, "ci-temporary-password", "CI Synthetic Seller"],
    );
    syntheticSellerUserId = insertedSeller.rows[0]?.id ?? null;
    invariant(syntheticSellerUserId, "failed to create synthetic seller");

    await db.query(
      `insert into "MarketplaceListing"
        (public_id, seller_id, type, title, description, price, condition, status, moderation_status, views, shipping_by_seller, created_at, updated_at)
       values
        ($1, $2, 'PRODUCT', $3, $4, $5, 'NEW', 'ACTIVE', 'APPROVED', 0, true, now(), now())`,
      [
        syntheticListingPublicId,
        syntheticSellerUserId,
        "CI foreign seller listing",
        "CI listing for ownership check",
        15000,
      ],
    );

    try {
      const res = await apiRequest("PATCH", `/partner/listings/${syntheticListingPublicId}`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(sellerToken, "seller")),
        },
        body: {
          title: "should not update foreign listing",
        },
        expected: [403, 404],
      });
      invariant(
        typeof res.data?.error === "string",
        "expected ownership error payload for cross-seller update",
      );
      return `status=${res.status}`;
    } finally {
      await db.query(`delete from "AppUser" where id = $1`, [syntheticSellerUserId]);
      syntheticSellerUserId = null;
    }
  });

  await runStep("admin: read endpoints", async () => {
    const transactions = await apiRequest("GET", "/admin/transactions", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const auditLogs = await apiRequest("GET", "/admin/audit-logs?limit=100", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const kyc = await apiRequest("GET", "/admin/kyc-requests", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const listings = await apiRequest("GET", "/admin/listings", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const users = await apiRequest("GET", "/admin/users", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const tiers = await apiRequest("GET", "/admin/commission-tiers", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const complaints = await apiRequest("GET", "/admin/complaints?page=1&pageSize=20", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const complaintStats = await apiRequest("GET", "/admin/complaints/stats", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });

    invariant(Array.isArray(transactions.data), "transactions malformed");
    invariant(Array.isArray(auditLogs.data?.logs), "audit logs malformed");
    invariant(Array.isArray(kyc.data), "kyc malformed");
    invariant(Array.isArray(listings.data), "admin listings malformed");
    invariant(Array.isArray(users.data), "admin users malformed");
    invariant(Array.isArray(tiers.data), "commission tiers malformed");
    invariant(Array.isArray(complaints.data?.items), "complaints malformed");
    invariant(typeof complaintStats.data?.total === "number", "complaint stats malformed");

    return `users=${users.data.length}, complaints=${complaints.data.items.length}`;
  });

  await runStep("admin: complaint status requires idempotency key", async () => {
    let complaintId = createdComplaintPublicId;
    if (!complaintId) {
      const fallback = await apiRequest(
        "GET",
        "/admin/complaints?page=1&pageSize=20&status=new,pending",
        {
          headers: authHeaders(requireToken(adminToken, "admin")),
          expected: [200],
        },
      );
      complaintId = fallback.data?.items?.[0]?.id ?? null;
    }
    invariant(complaintId, "no complaint available for idempotency validation");

    const res = await apiRequest("PATCH", `/admin/complaints/${complaintId}/status`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(adminToken, "admin")),
      },
      body: { status: "pending", actionTaken: "missing idempotency key check" },
      expected: [400],
    });
    invariant(
      typeof res.data?.error === "string" &&
        res.data.error.includes("Idempotency-Key"),
      "unexpected error payload for missing idempotency key",
    );
    return `status=${res.status}`;
  });

  await runStep("admin: review kyc request", async () => {
    syntheticKycPublicId = `KYC-CI-${Date.now()}`;
    await db.query(
      `insert into "KycRequest"
        (public_id, status, seller_id, email, phone, company_name, inn, address, documents, notes)
       values
        ($1, 'PENDING', $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        syntheticKycPublicId,
        seller.id,
        `ci+${Date.now()}@example.local`,
        "+79990000000",
        "CI COMPANY",
        "7701234567",
        "Москва, CI street, 1",
        "doc.pdf",
        "ci synthetic request",
      ],
    );

    try {
      const review = await apiRequest("PATCH", `/admin/kyc-requests/${syntheticKycPublicId}`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(adminToken, "admin")),
        },
        body: { status: "approved" },
        expected: [200],
      });
      invariant(review.data?.success === true, "kyc review did not return success");
      invariant(review.data?.status === "approved", "kyc status mismatch after review");
      return `kyc=${syntheticKycPublicId}`;
    } finally {
      await db.query(`delete from "KycRequest" where public_id = $1`, [syntheticKycPublicId]);
      syntheticKycPublicId = null;
    }
  });

  await runStep("admin: mutation endpoints + audit growth", async () => {
    const beforeAudit = await db.query('select count(*)::int as cnt from "AuditLog"');
    const beforeCount = beforeAudit.rows[0].cnt;

    const users = await apiRequest("GET", "/admin/users", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const targetUser = users.data.find((user) => user.role !== "admin");
    invariant(targetUser?.id, "no non-admin user found");
    await apiRequest("PATCH", `/admin/users/${targetUser.id}/status`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(adminToken, "admin")),
      },
      body: { status: "active", blockReason: "" },
      expected: [200],
    });

    const listings = await apiRequest("GET", "/admin/listings", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const targetListing = listings.data[0];
    invariant(targetListing?.id, "no listing found for moderation patch");
    await apiRequest("PATCH", `/admin/listings/${targetListing.id}/moderation`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(adminToken, "admin")),
      },
      body: { status: "pending" },
      expected: [200],
    });

    const tiers = await apiRequest("GET", "/admin/commission-tiers", {
      headers: authHeaders(requireToken(adminToken, "admin")),
    });
    const tier = tiers.data[0];
    invariant(tier?.id, "no commission tier found");
    await apiRequest("PATCH", `/admin/commission-tiers/${tier.id}`, {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(adminToken, "admin")),
      },
      body: { commissionRate: tier.commissionRate },
      expected: [200],
    });

    const complaints = await apiRequest(
      "GET",
      "/admin/complaints?page=1&pageSize=50&status=new,pending",
      {
        headers: authHeaders(requireToken(adminToken, "admin")),
      },
    );
    const pendingComplaint =
      complaints.data.items.find((item) => item.status === "new" || item.status === "pending") ??
      null;
    if (pendingComplaint?.id) {
      await apiRequest("PATCH", `/admin/complaints/${pendingComplaint.id}/status`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(adminToken, "admin")),
          "Idempotency-Key": randomUUID(),
        },
        body: { status: "pending", actionTaken: "ci smoke review" },
        expected: [200],
      });
    }

    const afterAudit = await db.query('select count(*)::int as cnt from "AuditLog"');
    const afterCount = afterAudit.rows[0].cnt;
    invariant(afterCount >= beforeCount + 3, "audit log did not grow as expected");
    return `audit ${beforeCount} -> ${afterCount}`;
  });

  await runStep("profile: order creation external dependency behavior", async () => {
    const listings = await apiRequest(
      "GET",
      "/catalog/listings?type=products&limit=100&offset=0",
    );
    const activeListing = listings.data[0];
    invariant(activeListing?.id, "no listing for order create");

    const result = await apiRequest("POST", "/profile/orders", {
      headers: {
        ...jsonHeaders,
        ...authHeaders(requireToken(buyerToken, "buyer")),
        "Idempotency-Key": randomUUID(),
      },
      body: {
        items: [{ listingId: activeListing.id, quantity: 1 }],
        deliveryType: "pickup",
        customAddress: "Самовывоз",
        paymentMethod: "card",
      },
      expected: [201, 502],
    });

    if (result.status === 201) {
      return "order created with payment link";
    }

    invariant(
      typeof result.data?.error === "string" && result.data.error.includes("YooKassa"),
      "unexpected failure for order creation",
    );
    return "blocked by YooKassa env/provider (expected in local smoke)";
  });

  await runStep("profile: yookassa webhook replay idempotency", async () => {
    invariant(buyer?.id && seller?.id, "buyer/seller ids are required");
    const sellerListingRes = await db.query(
      `select id, title, price
         from "MarketplaceListing"
        where seller_id = $1
        order by created_at desc
        limit 1`,
      [seller.id],
    );
    const sellerListing = sellerListingRes.rows[0];
    invariant(sellerListing?.id, "no seller listing found for webhook flow");

    const syntheticWebhookOrderId = `ORD-WEBHOOK-CI-${Date.now()}`;
    const syntheticWebhookTxId = `TRX-WEBHOOK-CI-${Date.now()}`;
    const syntheticPaymentIntentId = `PAY-CI-${Date.now()}`;

    const insertedOrder = await db.query(
      `insert into "MarketOrder"
        (public_id, buyer_id, seller_id, status, delivery_type, delivery_address, total_price, delivery_cost, discount, created_at, updated_at)
       values
        ($1, $2, $3, 'CREATED', 'PICKUP', $4, $5, 0, 0, now(), now())
       returning id`,
      [
        syntheticWebhookOrderId,
        buyer.id,
        seller.id,
        "Москва, вебхук smoke",
        Number(sellerListing.price) || 1000,
      ],
    );
    const webhookOrderPk = insertedOrder.rows[0]?.id;
    invariant(webhookOrderPk, "failed to insert synthetic webhook order");

    await db.query(
      `insert into "MarketOrderItem" (order_id, listing_id, name, image, price, quantity)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        webhookOrderPk,
        sellerListing.id,
        sellerListing.title || "CI webhook item",
        null,
        Number(sellerListing.price) || 1000,
        1,
      ],
    );

    await db.query(
      `insert into "PlatformTransaction"
        (public_id, order_id, buyer_id, seller_id, amount, status, commission_rate, commission, payment_provider, payment_intent_id, created_at)
       values
        ($1, $2, $3, $4, $5, 'PENDING', $6, $7, 'YOOMONEY', $8, now())`,
      [
        syntheticWebhookTxId,
        webhookOrderPk,
        buyer.id,
        seller.id,
        Number(sellerListing.price) || 1000,
        0.1,
        0,
        syntheticPaymentIntentId,
      ],
    );

    try {
      const webhookBody = {
        event: "payment.succeeded",
        object: {
          id: syntheticPaymentIntentId,
          status: "succeeded",
        },
      };

      const firstWebhook = await apiRequest("POST", "/profile/payments/yookassa/webhook", {
        headers: {
          ...jsonHeaders,
          ...(YOOKASSA_WEBHOOK_TOKEN
            ? { "x-yookassa-webhook-token": YOOKASSA_WEBHOOK_TOKEN }
            : {}),
        },
        body: webhookBody,
        expected: [200],
      });
      const secondWebhook = await apiRequest("POST", "/profile/payments/yookassa/webhook", {
        headers: {
          ...jsonHeaders,
          ...(YOOKASSA_WEBHOOK_TOKEN
            ? { "x-yookassa-webhook-token": YOOKASSA_WEBHOOK_TOKEN }
            : {}),
        },
        body: webhookBody,
        expected: [200],
      });

      invariant(firstWebhook.data?.success === true, "first webhook call did not succeed");
      invariant(secondWebhook.data?.success === true, "second webhook call did not succeed");

      const txState = await db.query(
        `select status
           from "PlatformTransaction"
          where public_id = $1`,
        [syntheticWebhookTxId],
      );
      const orderState = await db.query(
        `select status
           from "MarketOrder"
          where public_id = $1`,
        [syntheticWebhookOrderId],
      );
      invariant(txState.rows[0]?.status === "SUCCESS", "transaction is not SUCCESS after webhook");
      invariant(orderState.rows[0]?.status === "PAID", "order is not PAID after webhook");
      return `order=${syntheticWebhookOrderId}`;
    } finally {
      await db.query(`delete from "MarketOrder" where public_id = $1`, [syntheticWebhookOrderId]);
    }
  });

  await runStep("admin: concurrent complaint status update consistency", async () => {
    invariant(buyer?.id, "buyer id is required");
    const sellerListingRes = await db.query(
      `select id, seller_id
         from "MarketplaceListing"
        where status = 'ACTIVE'
        order by created_at desc
        limit 1`,
      [],
    );
    const targetListing = sellerListingRes.rows[0];
    invariant(targetListing?.id && targetListing?.seller_id, "listing seed data is required");

    const complaintPublicId = `CMP-RACE-CI-${Date.now()}`;
    await db.query(
      `insert into "Complaint"
        (public_id, status, complaint_type, listing_id, seller_id, reporter_id, description, created_at)
       values
        ($1, 'NEW', $2, $3, $4, $5, $6, now())`,
      [
        complaintPublicId,
        "ci_concurrency_check",
        targetListing.id,
        targetListing.seller_id,
        buyer.id,
        "CI concurrency check complaint",
      ],
    );

    try {
      const sharedIdempotencyKey = randomUUID();
      const [left, right] = await Promise.all([
        apiRequest("PATCH", `/admin/complaints/${complaintPublicId}/status`, {
          headers: {
            ...jsonHeaders,
            ...authHeaders(requireToken(adminToken, "admin")),
            "Idempotency-Key": sharedIdempotencyKey,
          },
          body: { status: "pending", actionTaken: "race-left" },
          expected: [200, 409],
        }),
        apiRequest("PATCH", `/admin/complaints/${complaintPublicId}/status`, {
          headers: {
            ...jsonHeaders,
            ...authHeaders(requireToken(adminToken, "admin")),
            "Idempotency-Key": sharedIdempotencyKey,
          },
          body: { status: "pending", actionTaken: "race-left" },
          expected: [200, 409],
        }),
      ]);

      const states = [left.status, right.status];
      invariant(
        states.includes(200),
        "expected at least one successful response for concurrent complaint updates",
      );
      invariant(
        states.every((status) => status === 200 || status === 409),
        "unexpected status for concurrent complaint updates",
      );

      const complaintState = await db.query(
        `select status
           from "Complaint"
          where public_id = $1`,
        [complaintPublicId],
      );
      invariant(complaintState.rows[0]?.status === "PENDING", "complaint status is not PENDING");
      return `statuses=${states.join("/")}`;
    } finally {
      await db.query(`delete from "Complaint" where public_id = $1`, [complaintPublicId]);
    }
  });

  await runStep("profile: concurrent default address switch keeps single default", async () => {
    const before = await apiRequest("GET", "/profile/addresses", {
      headers: authHeaders(requireToken(buyerToken, "buyer")),
      expected: [200],
    });
    invariant(Array.isArray(before.data), "addresses payload malformed");
    const originalDefaultAddress = before.data.find((item) => item.isDefault);
    invariant(originalDefaultAddress?.id, "default address is required for race scenario");

    const addressLabelA = `ci-race-a-${Date.now()}`;
    const addressLabelB = `ci-race-b-${Date.now()}`;
    let addressAId = null;
    let addressBId = null;

    try {
      const createA = await apiRequest("POST", "/profile/addresses", {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(buyerToken, "buyer")),
        },
        body: {
          name: addressLabelA,
          fullAddress: "Москва, Ленинский проспект, дом 1",
          region: "Москва",
          city: "Москва",
          street: "Ленинский проспект",
          house: "1",
          apartment: "1",
          entrance: "1",
          postalCode: "119049",
          lat: 55.727,
          lon: 37.604,
          isDefault: false,
        },
        expected: [201],
      });
      const createB = await apiRequest("POST", "/profile/addresses", {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(buyerToken, "buyer")),
        },
        body: {
          name: addressLabelB,
          fullAddress: "Москва, Ленинский проспект, дом 2",
          region: "Москва",
          city: "Москва",
          street: "Ленинский проспект",
          house: "2",
          apartment: "2",
          entrance: "2",
          postalCode: "119049",
          lat: 55.728,
          lon: 37.605,
          isDefault: false,
        },
        expected: [201],
      });

      addressAId = createA.data?.id ?? null;
      addressBId = createB.data?.id ?? null;
      invariant(addressAId && addressBId, "failed to create race addresses");

      await Promise.all([
        apiRequest("POST", `/profile/addresses/${addressAId}/default`, {
          headers: {
            ...jsonHeaders,
            ...authHeaders(requireToken(buyerToken, "buyer")),
          },
          body: {},
          expected: [200],
        }),
        apiRequest("POST", `/profile/addresses/${addressBId}/default`, {
          headers: {
            ...jsonHeaders,
            ...authHeaders(requireToken(buyerToken, "buyer")),
          },
          body: {},
          expected: [200],
        }),
      ]);

      const after = await apiRequest("GET", "/profile/addresses", {
        headers: authHeaders(requireToken(buyerToken, "buyer")),
        expected: [200],
      });
      const defaults = after.data.filter((item) => item.isDefault);
      invariant(defaults.length === 1, "address race broke single-default invariant");
      return `defaultAddress=${defaults[0]?.id ?? "unknown"}`;
    } finally {
      await apiRequest("POST", `/profile/addresses/${originalDefaultAddress.id}/default`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(buyerToken, "buyer")),
        },
        body: {},
        expected: [200],
      });

      if (addressAId) {
        await apiRequest("DELETE", `/profile/addresses/${addressAId}`, {
          headers: authHeaders(requireToken(buyerToken, "buyer")),
          expected: [200, 404],
        });
      }
      if (addressBId) {
        await apiRequest("DELETE", `/profile/addresses/${addressBId}`, {
          headers: authHeaders(requireToken(buyerToken, "buyer")),
          expected: [200, 404],
        });
      }
    }
  });

  await runStep("partner: concurrent order status mutation bounded", async () => {
    invariant(buyer?.id && seller?.id, "buyer/seller ids are required");
    const sellerListingRes = await db.query(
      `select id, title, price
         from "MarketplaceListing"
        where seller_id = $1
        order by created_at desc
        limit 1`,
      [seller.id],
    );
    const sellerListing = sellerListingRes.rows[0];
    invariant(sellerListing?.id, "no seller listing found for concurrent order mutation");

    const syntheticOrderPublicIdForRace = `ORD-RACE-CI-${Date.now()}`;
    const insertedOrder = await db.query(
      `insert into "MarketOrder"
        (public_id, buyer_id, seller_id, status, delivery_type, delivery_address, total_price, delivery_cost, discount, created_at, updated_at)
       values
        ($1, $2, $3, 'PAID', 'DELIVERY', $4, $5, 0, 0, now(), now())
       returning id`,
      [
        syntheticOrderPublicIdForRace,
        buyer.id,
        seller.id,
        "Москва, race order",
        Number(sellerListing.price) || 1000,
      ],
    );
    const orderPk = insertedOrder.rows[0]?.id;
    invariant(orderPk, "failed to create race order");

    await db.query(
      `insert into "MarketOrderItem" (order_id, listing_id, name, image, price, quantity)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        orderPk,
        sellerListing.id,
        sellerListing.title || "CI race order item",
        null,
        Number(sellerListing.price) || 1000,
        1,
      ],
    );

    try {
      const [first, second] = await Promise.all([
        apiRequest("PATCH", `/partner/orders/${syntheticOrderPublicIdForRace}/status`, {
          headers: {
            ...jsonHeaders,
            ...authHeaders(requireToken(sellerToken, "seller")),
          },
          body: { status: "prepared" },
          expected: [200, 409],
        }),
        apiRequest("PATCH", `/partner/orders/${syntheticOrderPublicIdForRace}/status`, {
          headers: {
            ...jsonHeaders,
            ...authHeaders(requireToken(sellerToken, "seller")),
          },
          body: { status: "prepared" },
          expected: [200, 409],
        }),
      ]);

      invariant(
        [first.status, second.status].every((status) => status === 200 || status === 409),
        "unexpected response status in concurrent order mutation",
      );

      const finalState = await db.query(
        `select status
           from "MarketOrder"
          where public_id = $1`,
        [syntheticOrderPublicIdForRace],
      );
      invariant(
        finalState.rows[0]?.status === "CREATED" || finalState.rows[0]?.status === "PREPARED",
        "order ended in invalid status after concurrent update",
      );
      return `statuses=${first.status}/${second.status}, final=${finalState.rows[0]?.status ?? "unknown"}`;
    } finally {
      await db.query(`delete from "MarketOrder" where public_id = $1`, [
        syntheticOrderPublicIdForRace,
      ]);
    }
  });

  await runStep("admin: legacy complaints patch endpoint compatibility", async () => {
    invariant(buyer?.id && seller?.id, "buyer/seller ids are required");
    const listingRes = await db.query(
      `select id
         from "MarketplaceListing"
        where seller_id = $1
        order by created_at desc
        limit 1`,
      [seller.id],
    );
    const listing = listingRes.rows[0];
    invariant(listing?.id, "seller listing is required for legacy complaint patch");

    const legacyComplaintId = `CMP-LEGACY-CI-${Date.now()}`;
    await db.query(
      `insert into "Complaint"
        (public_id, status, complaint_type, listing_id, seller_id, reporter_id, description, created_at)
       values
        ($1, 'NEW', $2, $3, $4, $5, $6, now())`,
      [
        legacyComplaintId,
        "ci_legacy_patch",
        listing.id,
        seller.id,
        buyer.id,
        "CI legacy route compatibility complaint",
      ],
    );

    try {
      const idempotencyKey = randomUUID();
      const first = await apiRequest("PATCH", `/admin/complaints/${legacyComplaintId}`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(adminToken, "admin")),
          "Idempotency-Key": idempotencyKey,
        },
        body: {
          status: "pending",
          actionTaken: "legacy-route-compat",
        },
        expected: [200],
      });
      const replay = await apiRequest("PATCH", `/admin/complaints/${legacyComplaintId}`, {
        headers: {
          ...jsonHeaders,
          ...authHeaders(requireToken(adminToken, "admin")),
          "Idempotency-Key": idempotencyKey,
        },
        body: {
          status: "pending",
          actionTaken: "legacy-route-compat",
        },
        expected: [200],
      });

      invariant(first.data?.success === true, "legacy endpoint first response is not success");
      invariant(replay.data?.success === true, "legacy endpoint replay response is not success");
      invariant(
        first.data?.status === "pending" && replay.data?.status === "pending",
        "legacy endpoint did not preserve status contract",
      );
      return `complaint=${legacyComplaintId}`;
    } finally {
      await db.query(`delete from "Complaint" where public_id = $1`, [legacyComplaintId]);
    }
  });

  await db.end();

  const failed = report.filter((item) => !item.ok);
  const passed = report.filter((item) => item.ok);

  console.log("\nE2E SMOKE REPORT");
  console.log("================");
  for (const item of report) {
    console.log(`${item.ok ? "PASS" : "FAIL"} | ${item.name}`);
    if (item.details) {
      console.log(`  ${item.details}`);
    }
  }
  console.log("----------------");
  console.log(`Passed: ${passed.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
