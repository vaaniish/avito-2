import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const API = `${BASE_URL}/api`;
const ORIGIN = process.env.PERF_ORIGIN ?? "http://localhost:3000";
const RUN_ID = `perf_${Date.now()}_${randomUUID().slice(0, 8)}`;
const COOKIE_NAME = process.env.NODE_ENV === "production" ? "__Host-ecomm_session" : "ecomm_session";
const REQUEST_TIMEOUT_MS = Number(process.env.PERF_REQUEST_TIMEOUT_MS ?? 10_000);
const PASSWORD = "PerfSession2026!";
const configuredPasswordRounds = Number(process.env.PASSWORD_HASH_SALT_ROUNDS ?? 10);
if (!Number.isInteger(configuredPasswordRounds) || configuredPasswordRounds < 4 || configuredPasswordRounds > 31) {
  throw new Error("PASSWORD_HASH_SALT_ROUNDS must be an integer between 4 and 31");
}
const PERF_PASSWORD_HASH_ROUNDS = Math.max(10, configuredPasswordRounds);
const IMAGE_URLS = [
  "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
  "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
  "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
  "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
];
const SCALE = Number(process.env.PERF_DURATION_SCALE ?? 1);
const SCENARIOS = ["catalog", "login", "listing", "checkout", "moderation"];
const ONLY_SCENARIO = process.env.PERF_ONLY_SCENARIO?.trim().toLowerCase() || null;
if (ONLY_SCENARIO && !SCENARIOS.includes(ONLY_SCENARIO)) {
  throw new Error(`PERF_ONLY_SCENARIO must be one of ${SCENARIOS.join(", ")}`);
}
const COHORTS = {
  catalog: { start: 0, size: 500, weight: 0.5 },
  login: { start: 500, size: 150, weight: 0.15 },
  listing: { start: 650, size: 150, weight: 0.15 },
  checkout: { start: 800, size: 100, weight: 0.1 },
  moderation: { start: 900, size: 100, weight: 0.1 },
};
const stageSource = ONLY_SCENARIO
  ? [[10, 15], [25, 15], [50, 20], [COHORTS[ONLY_SCENARIO].size, 30], [0, 10]]
  : [[50, 30], [100, 30], [250, 30], [500, 45], [750, 45], [1000, 120], [0, 30]];
const STAGES = stageSource.map(([vus, seconds]) => ({ vus, seconds: Math.max(1, Math.round(seconds * SCALE)) }));
const EXPECTED_PEAK_VUS = Math.max(...STAGES.map((stage) => stage.vus));
const METRICS_TOKEN = process.env.PERF_METRICS_ACCESS_TOKEN ?? process.env.METRICS_ACCESS_TOKEN ?? "";

const thresholds = {
  errorRate: Number(process.env.PERF_MAX_ERROR_RATE ?? 0.01),
  timeoutRate: Number(process.env.PERF_MAX_TIMEOUT_RATE ?? 0.005),
  catalog: Number(process.env.PERF_CATALOG_P95_MS ?? 500),
  login: Number(process.env.PERF_LOGIN_P95_MS ?? 750),
  listing: Number(process.env.PERF_LISTING_P95_MS ?? 1500),
  checkout: Number(process.env.PERF_CHECKOUT_P95_MS ?? 1500),
  moderation: Number(process.env.PERF_MODERATION_P95_MS ?? 1000),
};

function assertSafeTarget(raw) {
  if (process.env.PERF_TEST_CONFIRM !== "RUN_LOCAL_1000_VU") {
    throw new Error("Set PERF_TEST_CONFIRM=RUN_LOCAL_1000_VU to enable the destructive perf fixture lifecycle");
  }
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("The 1000 VU test is restricted to a local PostgreSQL instance");
  }
  const database = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
  if (!/(perf|test)/.test(database)) throw new Error("DATABASE_URL database name must include 'perf' or 'test'");
  if (process.env.NODE_ENV === "production") throw new Error("The load test cannot run with NODE_ENV=production");
}

const databaseUrl = process.env.PERF_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("PERF_DATABASE_URL or DATABASE_URL is required");
assertSafeTarget(databaseUrl);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 10 }) });

const stats = Object.fromEntries(SCENARIOS.map((name) => [name, {
  requests: 0, errors: 0, timeouts: 0, statuses4xx: 0, statuses5xx: 0, latencies: [],
}]));
let activeVus = 0;
let peakVus = 0;
const stageResults = [];
const eventLoopSamples = [];
const backendMetricsSamples = [];
let eventLoopTimer;
let backendMetricsTimer;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p / 100) - 1)];
}

function summary(value) {
  return {
    requests: value.requests,
    errors: value.errors,
    timeouts: value.timeouts,
    statuses4xx: value.statuses4xx,
    statuses5xx: value.statuses5xx,
    p50: Number(percentile(value.latencies, 50).toFixed(2)),
    p95: Number(percentile(value.latencies, 95).toFixed(2)),
    p99: Number(percentile(value.latencies, 99).toFixed(2)),
    max: Number((Math.max(0, ...value.latencies)).toFixed(2)),
  };
}

function captureStats() {
  return Object.fromEntries(SCENARIOS.map((name) => [name, {
    requests: stats[name].requests,
    errors: stats[name].errors,
    timeouts: stats[name].timeouts,
    statuses4xx: stats[name].statuses4xx,
    statuses5xx: stats[name].statuses5xx,
    latencyOffset: stats[name].latencies.length,
  }]));
}

function stageScenarioSummary(before) {
  return Object.fromEntries(SCENARIOS.map((name) => {
    const current = stats[name];
    const previous = before[name];
    return [name, summary({
      requests: current.requests - previous.requests,
      errors: current.errors - previous.errors,
      timeouts: current.timeouts - previous.timeouts,
      statuses4xx: current.statuses4xx - previous.statuses4xx,
      statuses5xx: current.statuses5xx - previous.statuses5xx,
      latencies: current.latencies.slice(previous.latencyOffset),
    })];
  }));
}

function startEventLoopMonitor() {
  let expected = performance.now() + 100;
  eventLoopTimer = setInterval(() => {
    const now = performance.now();
    eventLoopSamples.push(Math.max(0, now - expected));
    expected = now + 100;
  }, 100);
}

function startBackendMetricsMonitor() {
  if (!METRICS_TOKEN) return;
  let sampling = false;
  backendMetricsTimer = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      const response = await fetch(`${BASE_URL}/health/metrics`, {
        headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        const payload = await response.json();
        backendMetricsSamples.push({
          at: Date.now(),
          activeRequests: payload?.http?.activeRequests ?? null,
          postgresPool: payload?.postgresPool ?? null,
        });
      }
    } catch {
      // Diagnostics are best-effort and do not change request thresholds.
    } finally {
      sampling = false;
    }
  }, 500);
}

async function readBackendMetrics() {
  if (!METRICS_TOKEN) return null;
  const response = await fetch(`${BASE_URL}/health/metrics`, {
    headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
    signal: AbortSignal.timeout(2_000),
  });
  return response.ok ? response.json() : null;
}

async function waitForBackendQuiescence() {
  if (!METRICS_TOKEN) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    return;
  }
  const timeoutMs = Number(process.env.PERF_QUIESCENCE_TIMEOUT_MS ?? 120_000);
  const deadline = Date.now() + timeoutMs;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const payload = await readBackendMetrics().catch(() => null);
    const pool = payload?.postgresPool;
    const idle = payload &&
      (payload.http?.activeRequests ?? 0) <= 1 &&
      (pool?.waiting ?? 0) === 0 &&
      (pool?.total ?? 0) === (pool?.idle ?? -1) &&
      (payload.backgroundModeration?.queued ?? 0) === 0 &&
      (payload.backgroundModeration?.active ?? 0) === 0;
    stableSamples = idle ? stableSamples + 1 : 0;
    if (stableSamples >= 5) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`backend did not become idle within ${timeoutMs}ms`);
}

function opaqueToken() {
  return randomBytes(32).toString("base64url");
}

async function request(name, session, path, options = {}) {
  const started = performance.now();
  const scenario = stats[name];
  scenario.requests += 1;
  const headers = { Origin: ORIGIN, ...(options.headers ?? {}) };
  if (session?.cookie) headers.Cookie = `${COOKIE_NAME}=${session.cookie}`;
  if (session?.csrf && options.method && options.method !== "GET") headers["X-CSRF-Token"] = session.csrf;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    const response = await fetch(`${API}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status >= 400 && response.status < 500) scenario.statuses4xx += 1;
    if (response.status >= 500) scenario.statuses5xx += 1;
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
    return { response, payload };
  } catch (error) {
    scenario.errors += 1;
    if (error?.name === "TimeoutError" || error?.name === "AbortError") scenario.timeouts += 1;
    return { error };
  } finally {
    scenario.latencies.push(performance.now() - started);
  }
}

function listingPayload(index, catalog) {
  return {
    type: "products",
    title: `${RUN_ID} listing ${index} ${Date.now()}`,
    price: 12_000,
    condition: "restored",
    description: "Isolated load-test listing with complete local fixture data.",
    category: catalog.item,
    images: IMAGE_URLS,
    attributes: [
      { key: "__catalog_category", value: catalog.category },
      { key: "__catalog_subcategory", value: catalog.subcategory },
      { key: "__catalog_item", value: catalog.item },
      ...catalog.attributes,
    ],
  };
}

async function setupFixtures() {
  const password = await bcrypt.hash(PASSWORD, PERF_PASSWORD_HASH_ROUNDS);
  const users = Array.from({ length: 1000 }, (_, index) => ({
    public_id: `${RUN_ID}_USR_${index}`,
    role: index >= 900 ? "ADMIN" : index >= 650 && index < 800 ? "SELLER" : "BUYER",
    status: "ACTIVE",
    email: `${RUN_ID}.${index}@perf.test`,
    password,
    name: `Perf user ${index}`,
  }));
  users.push({
    public_id: `${RUN_ID}_SELLER`, role: "SELLER", status: "ACTIVE",
    email: `${RUN_ID}.seller@perf.test`, password, name: "Perf seller",
  });
  users.push(...Array.from({ length: 100 }, (_, index) => ({
    public_id: `${RUN_ID}_CHECKOUT_SELLER_${index}`,
    role: "SELLER",
    status: "ACTIVE",
    email: `${RUN_ID}.checkout-seller-${index}@perf.test`,
    password,
    name: `Perf checkout seller ${index}`,
  })));
  await prisma.appUser.createMany({ data: users });
  const created = await prisma.appUser.findMany({
    where: { public_id: { startsWith: RUN_ID } },
    select: { id: true, public_id: true, email: true },
  });
  const byPublicId = new Map(created.map((user) => [user.public_id, user]));
  const seller = byPublicId.get(`${RUN_ID}_SELLER`);
  const checkoutSellers = Array.from({ length: 100 }, (_, index) =>
    byPublicId.get(`${RUN_ID}_CHECKOUT_SELLER_${index}`));
  await prisma.sellerProfile.createMany({
    data: [
      { user_id: seller.id, is_verified: true },
      ...Array.from({ length: 150 }, (_, offset) => ({
        user_id: byPublicId.get(`${RUN_ID}_USR_${650 + offset}`).id,
        is_verified: true,
      })),
      ...checkoutSellers.map((user) => ({ user_id: user.id, is_verified: true })),
    ],
  });
  const verifier = byPublicId.get(`${RUN_ID}_USR_900`);
  await prisma.sellerPayoutProfile.createMany({
    data: [
      ...Array.from({ length: 150 }, (_, offset) => {
      const index = 650 + offset;
      return {
        public_id: `${RUN_ID}_PAYOUT_${index}`,
        seller_id: byPublicId.get(`${RUN_ID}_USR_${index}`).id,
        legal_type: "IP",
        legal_name: `Perf seller ${index}`,
        tax_id: `${770000000000 + index}`,
        bank_account: `${40702810000000000000n + BigInt(index)}`,
        bank_bic: "044525225",
        correspondent_account: "30101810400000000225",
        bank_name: "Perf local bank",
        recipient_name: `Perf seller ${index}`,
        status: "VERIFIED",
        verified_by_id: verifier.id,
        verified_at: new Date(),
      };
      }),
      ...checkoutSellers.map((user, index) => ({
        public_id: `${RUN_ID}_CHECKOUT_PAYOUT_${index}`,
        seller_id: user.id,
        legal_type: "IP",
        legal_name: `Perf checkout seller ${index}`,
        tax_id: `${780000000000 + index}`,
        bank_account: `${40702820000000000000n + BigInt(index)}`,
        bank_bic: "044525225",
        correspondent_account: "30101810400000000225",
        bank_name: "Perf local bank",
        recipient_name: `Perf checkout seller ${index}`,
        status: "VERIFIED",
        verified_by_id: verifier.id,
        verified_at: new Date(),
      })),
    ],
  });

  let policy = await prisma.platformPolicy.findFirst({ where: { scope: "CHECKOUT", is_active: true } });
  let ownsPolicy = false;
  if (!policy) {
    policy = await prisma.platformPolicy.create({ data: {
      public_id: `${RUN_ID}_POLICY`, scope: "CHECKOUT", version: RUN_ID,
      title: "Perf checkout policy", content_url: "/terms", is_active: true,
    } });
    ownsPolicy = true;
  }

  const sessions = [];
  const sessionRows = [];
  const acceptances = [];
  for (let index = 0; index < 1000; index += 1) {
    const user = byPublicId.get(`${RUN_ID}_USR_${index}`);
    const token = opaqueToken();
    const csrf = opaqueToken();
    sessions.push({ userId: user.id, email: user.email, cookie: token, csrf, index });
    sessionRows.push({
      user_id: user.id,
      token_hash: createHash("sha256").update(token).digest("hex"),
      csrf_token: csrf,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    if (index < 650 || index >= 800 && index < 900) {
      acceptances.push({ policy_id: policy.id, user_id: user.id });
    }
  }
  await prisma.authSession.createMany({ data: sessionRows });
  await prisma.policyAcceptance.createMany({ data: acceptances, skipDuplicates: true });

  const referenceModel = await prisma.catalogReferenceModel.findFirst({
    where: { variants: { some: {} } },
    include: {
      brand: {
        include: {
          item: { include: { subcategory: { include: { category: true } } } },
        },
      },
      variants: {
        include: { characteristics: { orderBy: { order_index: "asc" } } },
        orderBy: { order_index: "asc" },
      },
    },
    orderBy: { id: "asc" },
  });
  if (!referenceModel) throw new Error("Perf DB must contain catalog reference models");
  const item = referenceModel.brand.item;
  const characteristicValues = new Map();
  for (const variant of referenceModel.variants) {
    for (const characteristic of variant.characteristics) {
      if (!characteristicValues.has(characteristic.key)) {
        characteristicValues.set(characteristic.key, characteristic.value);
      }
    }
  }
  const catalog = {
    item: item.name,
    subcategory: item.subcategory.name,
    category: item.subcategory.category.name,
    attributes: [
      { key: "brand", value: referenceModel.brand.name },
      { key: "model", value: referenceModel.name },
      ...Array.from(characteristicValues, ([key, value]) => ({ key, value })),
    ],
  };
  await prisma.marketplaceListing.createMany({
    data: Array.from({ length: 100 }, (_, index) => ({
      public_id: `${RUN_ID}_CHECKOUT_${index}`,
      seller_id: checkoutSellers[index].id,
      item_id: item.id,
      type: "PRODUCT",
      title: `${RUN_ID} checkout fixture ${index}`,
      description: "Isolated load test checkout inventory",
      price: 12_000,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      has_multiple_stock: true,
      available_quantity: 100_000,
    })),
  });
  const checkout = await prisma.marketplaceListing.findMany({
    where: { public_id: { startsWith: `${RUN_ID}_CHECKOUT_` } },
    select: { id: true, public_id: true },
    orderBy: { public_id: "asc" },
  });
  await prisma.listingImage.createMany({
    data: checkout.map((listing) => ({
      listing_id: listing.id,
      url: IMAGE_URLS[0],
      sort_order: 0,
    })),
  });
  const moderation = await Promise.all(Array.from({ length: 100 }, (_, index) =>
    prisma.marketplaceListing.create({ data: {
      public_id: `${RUN_ID}_MOD_${index}`, seller_id: seller.id, item_id: item.id, type: "PRODUCT",
      title: `${RUN_ID} moderation ${index}`, price: 1000, condition: "USED",
      status: "MODERATION", moderation_status: "PENDING", available_quantity: 1,
      images: { create: { url: IMAGE_URLS[0], sort_order: 0 } },
    }, select: { public_id: true } }),
  ));
  return { sessions, seller, catalog, checkout, moderation, ownsPolicy };
}

async function cleanupFixtures() {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await prisma.appUser.deleteMany({ where: { public_id: { startsWith: RUN_ID } } });
      await prisma.platformPolicy.deleteMany({ where: { public_id: `${RUN_ID}_POLICY` } });
      const remainingUsers = await prisma.appUser.count({
        where: { public_id: { startsWith: RUN_ID } },
      });
      if (remainingUsers !== 0) throw new Error(`cleanup left ${remainingUsers} perf users`);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = /deadlock|40P01|P2034/i.test(message);
      if (!retryable || attempt === 5) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

async function vuLoop(session, scenarioName, deadline, fixtures) {
  activeVus += 1;
  peakVus = Math.max(peakVus, activeVus);
  let iteration = 0;
  try {
    while (performance.now() < deadline) {
      if (scenarioName === "catalog") {
        const target = fixtures.checkout[session.index % fixtures.checkout.length];
        await request("catalog", session, iteration % 2
          ? `/catalog/listings/${encodeURIComponent(target.public_id)}`
          : "/catalog/listings?type=products&limit=24&offset=0");
      } else if (scenarioName === "login") {
        const result = await request("login", session, "/auth/login", {
          method: "POST", body: { email: session.email, password: PASSWORD, rememberMe: false },
        });
        const setCookie = result.response?.headers.get("set-cookie") ?? "";
        const cookie = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(setCookie)?.[1];
        if (cookie && result.payload?.csrfToken) {
          session.cookie = cookie;
          session.csrf = result.payload.csrfToken;
          await request("login", session, "/auth/me");
        }
      } else if (scenarioName === "listing") {
        await request("listing", session, "/partner/listings", {
          method: "POST", body: listingPayload(`${session.index}_${iteration}`, fixtures.catalog),
        });
      } else if (scenarioName === "checkout") {
        const target = fixtures.checkout[session.index % fixtures.checkout.length];
        await request("checkout", session, "/profile/orders", {
          method: "POST",
          headers: { "Idempotency-Key": `${RUN_ID}:${session.index}:${iteration}` },
          body: {
            items: [{ listingId: target.public_id, quantity: 1 }],
            deliveryType: "pickup", paymentMethod: "card", promoCode: "",
          },
        });
      } else {
        const target = fixtures.moderation[session.index % fixtures.moderation.length];
        await request("moderation", session, `/admin/listings/${target.public_id}/moderation`, {
          method: "PATCH",
          body: { status: "approved", reasonCode: "PERF_APPROVED", reasonNote: RUN_ID },
        });
      }
      iteration += 1;
    }
  } finally {
    activeVus -= 1;
  }
}

function proportionalCounts(targetVus) {
  if (ONLY_SCENARIO) return { [ONLY_SCENARIO]: Math.min(targetVus, COHORTS[ONLY_SCENARIO].size) };
  const result = Object.fromEntries(SCENARIOS.map((name) => [name, Math.floor(targetVus * COHORTS[name].weight)]));
  let assigned = Object.values(result).reduce((sum, count) => sum + count, 0);
  for (const name of SCENARIOS) {
    if (assigned >= targetVus) break;
    result[name] += 1;
    assigned += 1;
  }
  return result;
}

function stageAssignments(targetVus, fixtures) {
  const counts = proportionalCounts(targetVus);
  return Object.entries(counts).flatMap(([scenarioName, count]) => {
    const cohort = COHORTS[scenarioName];
    return fixtures.sessions
      .slice(cohort.start, cohort.start + Math.min(count, cohort.size))
      .map((session) => ({ session, scenarioName }));
  });
}

async function runStages(fixtures) {
  let previousAssignments = [];
  for (const stage of STAGES) {
    const started = performance.now();
    const startedAt = Date.now();
    const before = captureStats();
    if (stage.vus === 0) {
      const rampStarted = performance.now();
      await Promise.all(previousAssignments.map((assignment, index) => {
        const fractionRemaining = 1 - index / Math.max(1, previousAssignments.length);
        return vuLoop(assignment.session, assignment.scenarioName, rampStarted + stage.seconds * 1000 * fractionRemaining, fixtures);
      }));
    } else {
      const deadline = performance.now() + stage.seconds * 1000;
      const assignments = stageAssignments(stage.vus, fixtures);
      await Promise.all(assignments.map((assignment) => vuLoop(assignment.session, assignment.scenarioName, deadline, fixtures)));
      previousAssignments = assignments;
    }
    const endedAt = Date.now();
    const samples = backendMetricsSamples.filter((sample) => sample.at >= startedAt && sample.at <= endedAt);
    stageResults.push({
      targetVus: stage.vus,
      allocation: stage.vus === 0 ? {} : proportionalCounts(stage.vus),
      durationSec: Number(((performance.now() - started) / 1000).toFixed(2)),
      scenarios: stageScenarioSummary(before),
      backend: {
        maxActiveRequests: Math.max(0, ...samples.map((sample) => sample.activeRequests ?? 0)),
        maxPoolTotal: Math.max(0, ...samples.map((sample) => sample.postgresPool?.total ?? 0)),
        maxPoolWaiting: Math.max(0, ...samples.map((sample) => sample.postgresPool?.waiting ?? 0)),
      },
    });
  }
}

function buildReport(startedAt) {
  const scenarios = Object.fromEntries(Object.entries(stats).map(([name, value]) => [name, summary(value)]));
  const totalRequests = Object.values(scenarios).reduce((sum, item) => sum + item.requests, 0);
  const totalErrors = Object.values(scenarios).reduce((sum, item) => sum + item.errors, 0);
  const totalTimeouts = Object.values(scenarios).reduce((sum, item) => sum + item.timeouts, 0);
  const failures = [];
  if (peakVus < EXPECTED_PEAK_VUS) failures.push(`peak VU ${peakVus} is below ${EXPECTED_PEAK_VUS}`);
  if (totalErrors / Math.max(1, totalRequests) >= thresholds.errorRate) failures.push("error rate threshold exceeded");
  if (totalTimeouts / Math.max(1, totalRequests) >= thresholds.timeoutRate) failures.push("timeout rate threshold exceeded");
  for (const name of Object.keys(stats)) {
    if (scenarios[name].p95 > thresholds[name]) failures.push(`${name} p95 threshold exceeded`);
  }
  const saturationStage = stageResults.find((stage) => {
    if (stage.targetVus === 0) return false;
    const stageScenarios = Object.entries(stage.scenarios);
    const requests = stageScenarios.reduce((sum, [, item]) => sum + item.requests, 0);
    const errors = stageScenarios.reduce((sum, [, item]) => sum + item.errors, 0);
    return errors / Math.max(1, requests) >= thresholds.errorRate ||
      stageScenarios.some(([name, item]) => item.p95 > thresholds[name]);
  });
  return {
    runId: RUN_ID,
    result: failures.length ? "FAIL" : "PASS",
    failures,
    startedAt: new Date(startedAt).toISOString(),
    durationSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
    config: {
      stages: STAGES,
      thresholds,
      poolMax: Number(process.env.PG_POOL_MAX ?? 10),
      fixturePoolMax: 10,
      passwordHashRounds: PERF_PASSWORD_HASH_ROUNDS,
      onlyScenario: ONLY_SCENARIO,
    },
    totals: {
      requests: totalRequests,
      rps: Number((totalRequests / Math.max(1, (Date.now() - startedAt) / 1000)).toFixed(2)),
      errors: totalErrors,
      errorRate: totalErrors / Math.max(1, totalRequests),
      timeouts: totalTimeouts,
      timeoutRate: totalTimeouts / Math.max(1, totalRequests),
      peakVus,
    },
    eventLoopLagMs: {
      p95: Number(percentile(eventLoopSamples, 95).toFixed(2)),
      p99: Number(percentile(eventLoopSamples, 99).toFixed(2)),
      max: Number(Math.max(0, ...eventLoopSamples).toFixed(2)),
    },
    backend: {
      samples: backendMetricsSamples.length,
      maxActiveRequests: Math.max(0, ...backendMetricsSamples.map((sample) => sample.activeRequests ?? 0)),
      maxPoolTotal: Math.max(0, ...backendMetricsSamples.map((sample) => sample.postgresPool?.total ?? 0)),
      maxPoolWaiting: Math.max(0, ...backendMetricsSamples.map((sample) => sample.postgresPool?.waiting ?? 0)),
    },
    saturationPointVus: saturationStage?.targetVus ?? null,
    stages: stageResults,
    scenarios,
  };
}

let fixtures;
const startedAt = Date.now();
let report;
try {
  fixtures = await setupFixtures();
  startEventLoopMonitor();
  startBackendMetricsMonitor();
  await runStages(fixtures);
} catch (error) {
  report = { runId: RUN_ID, result: "FAIL", failures: [error instanceof Error ? error.message : String(error)] };
} finally {
  if (eventLoopTimer) clearInterval(eventLoopTimer);
  if (backendMetricsTimer) clearInterval(backendMetricsTimer);
  if (!report) report = buildReport(startedAt);
  try {
    await waitForBackendQuiescence();
  } catch (error) {
    report.result = "FAIL";
    report.failures.push(`quiescence failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await cleanupFixtures();
  } catch (error) {
    report.result = "FAIL";
    report.failures.push(`cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await prisma.$disconnect();
  } catch (error) {
    report.result = "FAIL";
    report.failures.push(`database disconnect failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  await mkdir("artifacts/perf", { recursive: true });
  const reportPath = `artifacts/perf/${RUN_ID}.json`;
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.table(Object.entries(report.scenarios ?? {}).map(([scenario, value]) => ({ scenario, ...value })));
  console.log(`1000 VU report: ${reportPath} (${report.result})`);
  if (report.result !== "PASS") process.exitCode = 1;
}
