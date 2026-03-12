export type DeliveryProviderCode = "russian_post";

export type DeliveryValidationResult = {
  valid: boolean;
  normalizedTrackingNumber: string;
  trackingUrl: string;
  source: "api" | "fallback";
};

export type DeliveryExternalStatus =
  | "UNKNOWN"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "ISSUED";

export type DeliveryStatusResult = {
  status: DeliveryExternalStatus;
  trackingUrl?: string;
  rawStatus?: string;
};

const DEFAULT_PROVIDER: DeliveryProviderCode = "russian_post";
const DELIVERY_API_BASE_URL = process.env.DELIVERY_TRACKING_API_URL?.trim() ?? "";
const DELIVERY_API_KEY = process.env.DELIVERY_TRACKING_API_KEY?.trim() ?? "";
const DELIVERY_API_TIMEOUT_MS = Number(process.env.DELIVERY_TRACKING_API_TIMEOUT_MS ?? "8000");
const RUSSIAN_POST_API_BASE_URL =
  process.env.RUSSIAN_POST_API_BASE_URL?.trim() ?? "https://www.pochta.ru";
const RUSSIAN_POST_API_PATH =
  process.env.RUSSIAN_POST_API_PATH?.trim() ?? "/tracking-api/v1/trackings/by-barcodes";
const RUSSIAN_POST_API_TIMEOUT_MS = Number(process.env.RUSSIAN_POST_API_TIMEOUT_MS ?? "8000");
const RUSSIAN_POST_ACCESS_TOKEN = process.env.RUSSIAN_POST_ACCESS_TOKEN?.trim() ?? "";
const RUSSIAN_POST_USER_AUTH = process.env.RUSSIAN_POST_USER_AUTH?.trim() ?? "";

function isLikelyRussianPostTrack(value: string): boolean {
  const v = value.trim().toUpperCase();
  if (/^[A-Z]{2}\d{9}[A-Z]{2}$/u.test(v)) return true;
  if (/^\d{14}$/u.test(v)) return true;
  return false;
}

function normalizeTrackingNumber(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function buildTrackingUrl(provider: DeliveryProviderCode, trackingNumber: string): string {
  if (provider === "russian_post") {
    return `https://www.pochta.ru/tracking#${encodeURIComponent(trackingNumber)}`;
  }
  return "";
}

function normalizeProvider(value: unknown): DeliveryProviderCode {
  return value === "russian_post" ? "russian_post" : DEFAULT_PROVIDER;
}

function normalizeExternalStatus(value: unknown): DeliveryExternalStatus {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "UNKNOWN";
  if (raw === "in_transit" || raw === "transit" || raw === "shipped" || raw === "moving") {
    return "IN_TRANSIT";
  }
  if (raw === "delivered" || raw === "arrived" || raw === "ready_for_pickup") {
    return "DELIVERED";
  }
  if (
    raw === "issued" ||
    raw === "picked_up" ||
    raw === "handed_over" ||
    raw === "completed" ||
    raw === "delivered_to_recipient"
  ) {
    return "ISSUED";
  }
  return "UNKNOWN";
}

function hasObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function getPathString(root: unknown, path: string[]): string | null {
  let cursor: unknown = root;
  for (const key of path) {
    if (!hasObject(cursor)) return null;
    cursor = cursor[key];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor.trim() : null;
}

function detectRussianPostStatus(payload: Record<string, unknown>): DeliveryExternalStatus {
  const snapshot = JSON.stringify(payload).toLocaleLowerCase("ru-RU");
  if (
    snapshot.includes("вручен") ||
    snapshot.includes("выдан") ||
    snapshot.includes("получен") ||
    snapshot.includes("delivered_to_recipient") ||
    snapshot.includes("issued")
  ) {
    return "ISSUED";
  }
  if (
    snapshot.includes("доставлен") ||
    snapshot.includes("прибыл") ||
    snapshot.includes("ready_for_pickup") ||
    snapshot.includes("arrived")
  ) {
    return "DELIVERED";
  }
  if (
    snapshot.includes("в пути") ||
    snapshot.includes("транзит") ||
    snapshot.includes("сортиров") ||
    snapshot.includes("покинул") ||
    snapshot.includes("принят") ||
    snapshot.includes("in_transit")
  ) {
    return "IN_TRANSIT";
  }
  return "UNKNOWN";
}

function extractRussianPostRawStatus(payload: Record<string, unknown>): string | undefined {
  const directCandidates = [
    ["status", "name"],
    ["status_name"],
    ["globalStatus", "name"],
    ["global_status_name"],
    ["trackingItem", "status", "name"],
  ];
  for (const path of directCandidates) {
    const value = getPathString(payload, path);
    if (value) return value;
  }

  const listCandidates: unknown[] = [];
  if (isArray(payload.trackings)) {
    listCandidates.push(...payload.trackings);
  }
  if (isArray(payload.detailedTrackings)) {
    listCandidates.push(...payload.detailedTrackings);
  }
  if (isArray(payload.items)) {
    listCandidates.push(...payload.items);
  }

  for (const item of listCandidates) {
    if (!hasObject(item)) continue;
    for (const path of directCandidates) {
      const value = getPathString(item, path);
      if (value) return value;
    }
  }

  return undefined;
}

function isRussianPostNotFound(payload: Record<string, unknown>): boolean {
  const snapshot = JSON.stringify(payload).toLocaleLowerCase("ru-RU");
  return (
    snapshot.includes("не найден") ||
    snapshot.includes("не существует") ||
    snapshot.includes("not found") ||
    snapshot.includes("invalid")
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestTrackingApi(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown> | null> {
  if (!DELIVERY_API_BASE_URL) return null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (DELIVERY_API_KEY) {
    headers.Authorization = `Bearer ${DELIVERY_API_KEY}`;
  }

  try {
    const response = await fetchWithTimeout(
      `${DELIVERY_API_BASE_URL.replace(/\/+$/u, "")}${path}`,
      {
        ...init,
        headers,
      },
      Number.isFinite(DELIVERY_API_TIMEOUT_MS)
        ? Math.max(2_000, DELIVERY_API_TIMEOUT_MS)
        : 8_000,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === "object") {
      return payload as Record<string, unknown>;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

async function requestRussianPostTracking(
  trackingNumber: string,
): Promise<Record<string, unknown> | null> {
  if (!RUSSIAN_POST_API_BASE_URL) return null;

  const baseUrl = RUSSIAN_POST_API_BASE_URL.replace(/\/+$/u, "");
  const apiPath = RUSSIAN_POST_API_PATH.startsWith("/")
    ? RUSSIAN_POST_API_PATH
    : `/${RUSSIAN_POST_API_PATH}`;
  const url = `${baseUrl}${apiPath}?barcodes=${encodeURIComponent(trackingNumber)}`;

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": "avito-2/1.0 (tracking)",
  };
  if (RUSSIAN_POST_ACCESS_TOKEN) {
    headers.Authorization = `AccessToken ${RUSSIAN_POST_ACCESS_TOKEN}`;
  }
  if (RUSSIAN_POST_USER_AUTH) {
    headers["X-User-Authorization"] = `Basic ${RUSSIAN_POST_USER_AUTH}`;
  }

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers,
      },
      Number.isFinite(RUSSIAN_POST_API_TIMEOUT_MS)
        ? Math.max(2_000, RUSSIAN_POST_API_TIMEOUT_MS)
        : 8_000,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as unknown;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

export async function validateTrackingNumber(params: {
  provider?: unknown;
  trackingNumber: string;
}): Promise<DeliveryValidationResult> {
  const provider = normalizeProvider(params.provider);
  const normalizedTrackingNumber = normalizeTrackingNumber(params.trackingNumber);

  if (!normalizedTrackingNumber) {
    return {
      valid: false,
      normalizedTrackingNumber,
      trackingUrl: buildTrackingUrl(provider, normalizedTrackingNumber),
      source: "fallback",
    };
  }

  if (provider === "russian_post") {
    const russianPostPayload = await requestRussianPostTracking(
      normalizedTrackingNumber,
    );
    if (russianPostPayload) {
      return {
        valid: !isRussianPostNotFound(russianPostPayload),
        normalizedTrackingNumber,
        trackingUrl: buildTrackingUrl(provider, normalizedTrackingNumber),
        source: "api",
      };
    }
  }

  const payload = await requestTrackingApi("/validate", {
    method: "POST",
    body: JSON.stringify({
      provider,
      trackingNumber: normalizedTrackingNumber,
    }),
  });

  if (payload) {
    const valid = Boolean(payload.valid);
    const normalizedFromApi =
      typeof payload.normalizedTrackingNumber === "string"
        ? normalizeTrackingNumber(payload.normalizedTrackingNumber)
        : normalizedTrackingNumber;
    const trackingUrl =
      typeof payload.trackingUrl === "string" && payload.trackingUrl.trim()
        ? payload.trackingUrl.trim()
        : buildTrackingUrl(provider, normalizedFromApi);

    return {
      valid,
      normalizedTrackingNumber: normalizedFromApi,
      trackingUrl,
      source: "api",
    };
  }

  const valid = isLikelyRussianPostTrack(normalizedTrackingNumber);
  return {
    valid,
    normalizedTrackingNumber,
    trackingUrl: buildTrackingUrl(provider, normalizedTrackingNumber),
    source: "fallback",
  };
}

export async function fetchTrackingStatus(params: {
  provider?: unknown;
  trackingNumber: string;
}): Promise<DeliveryStatusResult | null> {
  const provider = normalizeProvider(params.provider);
  const normalizedTrackingNumber = normalizeTrackingNumber(params.trackingNumber);
  if (!normalizedTrackingNumber) {
    return null;
  }

  if (provider === "russian_post") {
    const russianPostPayload = await requestRussianPostTracking(
      normalizedTrackingNumber,
    );
    if (russianPostPayload) {
      return {
        status: detectRussianPostStatus(russianPostPayload),
        trackingUrl: buildTrackingUrl(provider, normalizedTrackingNumber),
        rawStatus: extractRussianPostRawStatus(russianPostPayload),
      };
    }
  }

  if (!DELIVERY_API_BASE_URL) {
    return null;
  }

  const payload = await requestTrackingApi(
    `/status?provider=${encodeURIComponent(provider)}&trackingNumber=${encodeURIComponent(normalizedTrackingNumber)}`,
    { method: "GET" },
  );

  if (!payload) {
    return null;
  }

  const rawStatus = typeof payload.status === "string" ? payload.status : "";
  const trackingUrl =
    typeof payload.trackingUrl === "string" && payload.trackingUrl.trim()
      ? payload.trackingUrl.trim()
      : buildTrackingUrl(provider, normalizedTrackingNumber);

  return {
    status: normalizeExternalStatus(rawStatus),
    trackingUrl,
    rawStatus: rawStatus || undefined,
  };
}
