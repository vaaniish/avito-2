import "dotenv/config";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const API_BASE = `${BASE_URL.replace(/\/+$/, "")}/api`;

const ITERATIONS = Number(process.env.STAGE10_HTTP_ITERATIONS ?? "40");
const WARMUP = Number(process.env.STAGE10_HTTP_WARMUP ?? "5");
const CATALOG_P95_SLO_MS = Number(process.env.STAGE10_CATALOG_P95_SLO_MS ?? "200");
const ADMIN_COMPLAINTS_P95_SLO_MS = Number(
  process.env.STAGE10_ADMIN_COMPLAINTS_P95_SLO_MS ?? "350",
);
const LOGIN_P95_SLO_MS = Number(process.env.STAGE10_LOGIN_P95_SLO_MS ?? "250");
const PRODUCT_DETAIL_P95_SLO_MS = Number(
  process.env.STAGE10_PRODUCT_DETAIL_P95_SLO_MS ?? "180",
);
const CHECKOUT_CREATE_P95_SLO_MS = Number(
  process.env.STAGE10_CHECKOUT_CREATE_P95_SLO_MS ?? "550",
);
const LISTING_CREATE_P95_SLO_MS = Number(
  process.env.STAGE10_LISTING_CREATE_P95_SLO_MS ?? "450",
);
const ADMIN_MODERATION_P95_SLO_MS = Number(
  process.env.STAGE10_ADMIN_MODERATION_P95_SLO_MS ?? "250",
);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const normalized = [...values].sort((left, right) => left - right);
  const rank = Math.ceil((p / 100) * normalized.length);
  return normalized[Math.max(0, Math.min(normalized.length - 1, rank - 1))];
}

function summarizeLatency(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    min: Number(min.toFixed(3)),
    max: Number(max.toFixed(3)),
    avg: Number(avg.toFixed(3)),
    p50: Number(percentile(values, 50).toFixed(3)),
    p95: Number(percentile(values, 95).toFixed(3)),
  };
}

async function apiRequest(method, path, options = {}) {
  const { headers = {}, body, expected = [200], token } = options;
  const requestHeaders = {
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (body !== undefined) {
    const hasContentType = Object.keys(requestHeaders).some(
      (key) => key.toLowerCase() === "content-type",
    );
    if (!hasContentType) {
      requestHeaders["content-type"] = "application/json";
    }
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: requestHeaders,
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

async function timedApiRequest(method, path, options = {}) {
  const startedAt = performance.now();
  const result = await apiRequest(method, path, options);
  return {
    result,
    elapsedMs: performance.now() - startedAt,
  };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function collectLatency(params) {
  const { name, path, headers } = params;
  const samples = [];

  for (let index = 0; index < WARMUP + ITERATIONS; index += 1) {
    const startedAt = performance.now();
    await apiRequest("GET", path, { headers, expected: [200] });
    const elapsedMs = performance.now() - startedAt;
    if (index >= WARMUP) {
      samples.push(elapsedMs);
    }
  }

  return {
    name,
    path,
    summary: summarizeLatency(samples),
  };
}

async function collectRequestLatency(params) {
  const { name, prepare, execute } = params;
  const samples = [];

  for (let index = 0; index < WARMUP + ITERATIONS; index += 1) {
    const requestPlan = await prepare(index);
    const startedAt = performance.now();
    await execute(requestPlan);
    const elapsedMs = performance.now() - startedAt;
    if (index >= WARMUP) {
      samples.push(elapsedMs);
    }
  }

  return {
    name,
    summary: summarizeLatency(samples),
  };
}

function testCatalogAttributes(itemName) {
  return [
    { key: "__catalog_category", value: "Комплектующие для ПК" },
    { key: "__catalog_subcategory", value: "Основные комплектующие для ПК" },
    { key: "__catalog_item", value: itemName },
    { key: "__catalog_item_custom", value: itemName },
  ];
}

function benchmarkListingPayload(suffix) {
  return {
    type: "products",
    title: `stage10 benchmark ${suffix}`,
    price: 12000,
    condition: "restored",
    description: "stage10 benchmark listing",
    category: "CI тестовый товар",
    images: [
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
      "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
      "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
      "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
    ],
    attributes: testCatalogAttributes("CI тестовый товар"),
  };
}

async function main() {
  invariant(ITERATIONS >= 10, "STAGE10_HTTP_ITERATIONS must be >= 10");
  invariant(WARMUP >= 0, "STAGE10_HTTP_WARMUP must be >= 0");

  const adminLogin = await apiRequest("POST", "/auth/login", {
    headers: { "content-type": "application/json" },
    body: { email: "admin@ecomm.local", password: "admin123" },
    expected: [200],
  });
  const adminToken = String(adminLogin.data?.sessionToken ?? "").trim();
  invariant(adminToken.length > 0, "admin sessionToken is required for latency benchmark");

  const buyerLogin = await apiRequest("POST", "/auth/login", {
    headers: { "content-type": "application/json" },
    body: { email: "buyer1@ecomm.local", password: "buyer123" },
    expected: [200],
  });
  const buyerToken = String(buyerLogin.data?.sessionToken ?? "").trim();
  invariant(buyerToken.length > 0, "buyer sessionToken is required for latency benchmark");

  const sellerLogin = await apiRequest("POST", "/auth/login", {
    headers: { "content-type": "application/json" },
    body: { email: "seller1@ecomm.local", password: "seller123" },
    expected: [200],
  });
  const sellerToken = String(sellerLogin.data?.sessionToken ?? "").trim();
  invariant(sellerToken.length > 0, "seller sessionToken is required for latency benchmark");

  const productCatalog = await apiRequest("GET", "/catalog/listings?type=products&limit=50&offset=0");
  const productIds = Array.isArray(productCatalog.data)
    ? productCatalog.data
        .map((item) => String(item?.id ?? "").trim())
        .filter((itemId) => itemId.length > 0)
    : [];
  invariant(productIds.length > 0, "product detail benchmark requires an existing product listing");
  const productId = productIds[0];

  const policyRes = await apiRequest("GET", "/public/policy/current?scope=checkout", {
    expected: [200],
  });
  const checkoutPolicyId = String(policyRes.data?.id ?? "").trim();
  invariant(checkoutPolicyId.length > 0, "checkout policy id missing");
  await apiRequest("POST", "/profile/policy-acceptance", {
    headers: authHeaders(buyerToken),
    body: { scope: "checkout", policyId: checkoutPolicyId },
    expected: [201],
  });

  const moderationFixtures = [];
  for (let index = 0; index < WARMUP + ITERATIONS; index += 1) {
    const payload = benchmarkListingPayload(`moderate-${index + 1}`);
    const created = await apiRequest("POST", "/partner/listings", {
      token: sellerToken,
      body: payload,
      expected: [201],
    });
    const listingId = String(created.data?.id ?? "").trim();
    invariant(listingId.length > 0, "moderation benchmark fixture id missing");
    moderationFixtures.push(listingId);
  }

  const [loginLatency, productDetailLatency, catalogLatency, adminComplaintsLatency, listingCreateLatency, moderationLatency] =
    await Promise.all([
      collectRequestLatency({
        name: "login",
        prepare: async (index) => ({
          body: {
            email: index % 2 === 0 ? "buyer1@ecomm.local" : "admin@ecomm.local",
            password: index % 2 === 0 ? "buyer123" : "admin123",
          },
        }),
        execute: async (plan) =>
          apiRequest("POST", "/auth/login", {
            headers: { "content-type": "application/json" },
            body: plan.body,
            expected: [200],
          }),
      }),
      collectLatency({
        name: "product_detail",
        path: `/catalog/listings/${encodeURIComponent(productId)}`,
        headers: authHeaders(adminToken),
      }),
      collectLatency({
        name: "catalog_list",
        path: "/catalog/listings?type=products&limit=24&offset=0",
        headers: {},
      }),
      collectLatency({
        name: "admin_complaints_filtered",
        path: "/admin/complaints?page=1&pageSize=20&status=new,pending&sortBy=createdAt&sortOrder=desc",
        headers: authHeaders(adminToken),
      }),
      collectRequestLatency({
        name: "listing_create",
        prepare: async (index) => ({
          body: benchmarkListingPayload(`create-${index + 1}`),
        }),
        execute: async (plan) => {
          const response = await timedApiRequest("POST", "/partner/listings", {
            token: sellerToken,
            body: plan.body,
            expected: [201],
          });
          const createdListingId = String(response.result.data?.id ?? "").trim();
          if (createdListingId) {
            await apiRequest("DELETE", `/partner/listings/${encodeURIComponent(createdListingId)}`, {
              token: sellerToken,
              expected: [200, 409],
            });
          }
          return response;
        },
      }),
      collectRequestLatency({
        name: "admin_moderation_decision",
        prepare: async (index) => ({
          listingId: moderationFixtures[index],
        }),
        execute: async (plan) =>
          apiRequest("PATCH", `/admin/listings/${encodeURIComponent(plan.listingId)}/moderation`, {
            token: adminToken,
            body: {
              status: "approved",
              reasonCode: "AUTO_APPROVED",
              reasonNote: "stage10 moderation benchmark",
            },
            expected: [200],
          }),
      }),
  ]);

  const catalogP95 = catalogLatency.summary.p95;
  const adminComplaintsP95 = adminComplaintsLatency.summary.p95;
  const loginP95 = loginLatency.summary.p95;
  const productDetailP95 = productDetailLatency.summary.p95;
  const listingCreateP95 = listingCreateLatency.summary.p95;
  const moderationP95 = moderationLatency.summary.p95;
  invariant(
    catalogP95 <= CATALOG_P95_SLO_MS,
    `catalog p95 ${catalogP95}ms exceeds SLO ${CATALOG_P95_SLO_MS}ms`,
  );
  invariant(
    adminComplaintsP95 <= ADMIN_COMPLAINTS_P95_SLO_MS,
    `admin complaints p95 ${adminComplaintsP95}ms exceeds SLO ${ADMIN_COMPLAINTS_P95_SLO_MS}ms`,
  );
  invariant(loginP95 <= LOGIN_P95_SLO_MS, `login p95 ${loginP95}ms exceeds SLO ${LOGIN_P95_SLO_MS}ms`);
  invariant(
    productDetailP95 <= PRODUCT_DETAIL_P95_SLO_MS,
    `product detail p95 ${productDetailP95}ms exceeds SLO ${PRODUCT_DETAIL_P95_SLO_MS}ms`,
  );
  invariant(
    listingCreateP95 <= LISTING_CREATE_P95_SLO_MS,
    `listing create p95 ${listingCreateP95}ms exceeds SLO ${LISTING_CREATE_P95_SLO_MS}ms`,
  );
  invariant(
    moderationP95 <= ADMIN_MODERATION_P95_SLO_MS,
    `admin moderation p95 ${moderationP95}ms exceeds SLO ${ADMIN_MODERATION_P95_SLO_MS}ms`,
  );
  const report = {
    scenario: "stage10_http_p95",
    result: "PASS",
    config: {
      baseUrl: BASE_URL,
      iterations: ITERATIONS,
      warmup: WARMUP,
      sloMs: {
        loginP95: LOGIN_P95_SLO_MS,
        productDetailP95: PRODUCT_DETAIL_P95_SLO_MS,
        catalogP95: CATALOG_P95_SLO_MS,
        adminComplaintsP95: ADMIN_COMPLAINTS_P95_SLO_MS,
        listingCreateP95: LISTING_CREATE_P95_SLO_MS,
        adminModerationP95: ADMIN_MODERATION_P95_SLO_MS,
      },
    },
    endpoints: [
      loginLatency,
      productDetailLatency,
      catalogLatency,
      adminComplaintsLatency,
      listingCreateLatency,
      moderationLatency,
    ],
  };

  for (const listingId of moderationFixtures) {
    await apiRequest("DELETE", `/partner/listings/${encodeURIComponent(listingId)}`, {
      token: sellerToken,
      expected: [200, 409],
    });
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
