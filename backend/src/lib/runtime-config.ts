const MINUTE_MS = 60_000;

export function boundedPositiveInteger(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function boundedRatio(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }
  return value;
}

export function assertRuntimeConfiguration(): void {
  boundedPositiveInteger("AUTH_SESSION_TTL_MS", 24 * 60 * MINUTE_MS, MINUTE_MS, 365 * 24 * 60 * MINUTE_MS);
  boundedPositiveInteger("AUTH_REMEMBERED_SESSION_TTL_MS", 30 * 24 * 60 * MINUTE_MS, MINUTE_MS, 365 * 24 * 60 * MINUTE_MS);
  boundedPositiveInteger("AUTH_SESSION_PRUNE_INTERVAL_MS", MINUTE_MS, 1_000, 24 * 60 * MINUTE_MS);
  boundedPositiveInteger("PG_POOL_MAX", 10, 1, 100);
  boundedPositiveInteger("PG_POOL_IDLE_TIMEOUT_MS", 30_000, 1_000, 10 * MINUTE_MS);
  boundedPositiveInteger("PG_POOL_CONNECTION_TIMEOUT_MS", 5_000, 250, MINUTE_MS);
  boundedPositiveInteger("SHUTDOWN_TIMEOUT_MS", 10_000, 1_000, MINUTE_MS);
  boundedPositiveInteger("CATALOG_CACHE_TTL_MS", 15_000, 1_000, 5 * MINUTE_MS);
  boundedPositiveInteger("LISTING_MODERATION_CONCURRENCY", 4, 1, 20);
  boundedRatio("HTTP_LOG_SAMPLE_RATE", 1);

  for (const obsolete of [
    "SESSION_TOKEN_SECRET",
    "SESSION_TOKEN_ISSUER",
    "SESSION_TOKEN_AUDIENCE",
    "SESSION_TOKEN_TTL_MS",
  ]) {
    if (process.env[obsolete]) throw new Error(`${obsolete} is obsolete and must be removed`);
  }

  if (process.env.NODE_ENV !== "production") return;
  const origins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (origins.length === 0) throw new Error("CORS_ALLOWED_ORIGINS is required in production");
  for (const origin of origins) {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") throw new Error("Production CORS origins must use HTTPS");
  }

  const forbiddenDemoValues = new Set([
    "demo-shop",
    "demo-secret",
    "demo-webhook-token",
    "admin123",
    "password",
    "changeme",
    "replace-me",
  ]);
  for (const key of [
    "YOOKASSA_SHOP_ID",
    "YOOKASSA_SECRET_KEY",
    "YOOKASSA_WEBHOOK_TOKEN",
    "DADATA_API_KEY",
    "DADATA_SECRET_KEY",
    "YANDEX_DELIVERY_TOKEN",
  ]) {
    const value = process.env[key]?.trim().toLowerCase();
    if (value && forbiddenDemoValues.has(value)) {
      throw new Error(`${key} contains a known demo/default credential`);
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const parsed = new URL(databaseUrl);
    const username = decodeURIComponent(parsed.username).trim().toLowerCase();
    const password = decodeURIComponent(parsed.password).trim().toLowerCase();
    if (forbiddenDemoValues.has(username) || forbiddenDemoValues.has(password)) {
      throw new Error("DATABASE_URL contains a known default credential");
    }
  }
  if ((process.env.METRICS_ACCESS_TOKEN ?? "").trim().length > 0 &&
      (process.env.METRICS_ACCESS_TOKEN ?? "").trim().length < 32) {
    throw new Error("METRICS_ACCESS_TOKEN must contain at least 32 characters");
  }
}
