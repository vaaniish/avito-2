import { normalizeTextField } from "../profile/profile.shared";

export type CdekDeliveryPoint = {
  id: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  workHours: string;
};

export type CdekCity = {
  code: number;
  city: string;
};

export type CdekOrderCreateParams = {
  orderPublicId: string;
  shipmentPoint: string;
  deliveryPoint: string;
  recipientName: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  totalPrice: number;
  items: Array<{
    name: string;
    price: number;
    quantity: number;
  }>;
};

export type CdekOrderCreateResult = {
  uuid: string | null;
  trackingNumber: string;
  trackingUrl: string;
  rawStatus: string;
};

export type CdekTrackingResult = {
  status: "UNKNOWN" | "IN_TRANSIT" | "DELIVERED" | "ISSUED" | "CANCELLED";
  rawStatus?: string;
  trackingUrl: string;
};

const CDEK_API_BASE_URL =
  process.env.CDEK_API_BASE_URL?.trim() || "https://api.edu.cdek.ru/v2";
const CDEK_CLIENT_ID = process.env.CDEK_CLIENT_ID?.trim() ?? "";
const CDEK_CLIENT_SECRET = process.env.CDEK_CLIENT_SECRET?.trim() ?? "";
const CDEK_TIMEOUT_MS = Number(process.env.CDEK_API_TIMEOUT_MS ?? "10000");
const CDEK_DEFAULT_TARIFF_CODE = Number(process.env.CDEK_TARIFF_CODE ?? "136");
const CDEK_DEFAULT_PACKAGE_WEIGHT = Number(process.env.CDEK_PACKAGE_WEIGHT_GRAMS ?? "1000");
const CDEK_DEFAULT_PACKAGE_LENGTH = Number(process.env.CDEK_PACKAGE_LENGTH_CM ?? "20");
const CDEK_DEFAULT_PACKAGE_WIDTH = Number(process.env.CDEK_PACKAGE_WIDTH_CM ?? "15");
const CDEK_DEFAULT_PACKAGE_HEIGHT = Number(process.env.CDEK_PACKAGE_HEIGHT_CM ?? "10");
const CDEK_SENDER_NAME = process.env.CDEK_SENDER_NAME?.trim() || "Demo seller";
const CDEK_SENDER_PHONE = process.env.CDEK_SENDER_PHONE?.trim() || "+79990000000";

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isCdekConfigured(): boolean {
  return Boolean(CDEK_CLIENT_ID && CDEK_CLIENT_SECRET);
}

function cdekBaseUrl(): string {
  return CDEK_API_BASE_URL.replace(/\/+$/u, "");
}

function buildCdekTrackingUrl(trackingNumber: string): string {
  return `https://www.cdek.ru/ru/tracking?order_id=${encodeURIComponent(trackingNumber)}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? Math.max(2_000, timeoutMs) : 10_000,
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function firstCdekError(payload: unknown): string {
  const root = asObject(payload);
  const requests = Array.isArray(root?.requests) ? root.requests : [];
  for (const request of requests) {
    const requestObject = asObject(request);
    const errors = Array.isArray(requestObject?.errors) ? requestObject.errors : [];
    for (const error of errors) {
      const message = asString(asObject(error)?.message);
      if (message) return message;
    }
  }
  return "";
}

async function getCdekToken(): Promise<string> {
  if (!isCdekConfigured()) {
    throw new Error("CDEK credentials are not configured");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CDEK_CLIENT_ID,
    client_secret: CDEK_CLIENT_SECRET,
  });
  const response = await fetchWithTimeout(
    `${cdekBaseUrl()}/oauth/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    },
    CDEK_TIMEOUT_MS,
  );
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(`CDEK auth failed (${response.status})`);
  }
  const root = asObject(payload);
  const accessToken = asString(root?.access_token);
  if (!accessToken) {
    throw new Error("CDEK auth did not return access_token");
  }
  const expiresIn = Number(root?.expires_in ?? 3600);
  cachedToken = {
    value: accessToken,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  };
  return accessToken;
}

async function cdekRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const token = await getCdekToken();
  const response = await fetchWithTimeout(
    `${cdekBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`,
    {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers as Record<string, string> | undefined),
      },
    },
    CDEK_TIMEOUT_MS,
  );
  const payload = await readJson(response);
  if (!response.ok) {
    const message = firstCdekError(payload);
    throw new Error(message || `CDEK request failed (${response.status})`);
  }
  return payload;
}

function formatCdekWorkHours(raw: unknown): string {
  const direct = asString(raw);
  if (direct) return direct;
  const root = asObject(raw);
  const weekdays = asString(root?.weekdays);
  const saturday = asString(root?.saturday);
  const sunday = asString(root?.sunday);
  return [weekdays, saturday, sunday].filter(Boolean).join("; ") || "По расписанию";
}

export async function loadCdekDeliveryPoints(params: {
  cityCode?: number;
  postalCode?: string;
  countryCode?: string;
  size?: number;
  page?: number;
}): Promise<CdekDeliveryPoint[]> {
  if (!isCdekConfigured()) return [];

  const search = new URLSearchParams({
    type: "PVZ",
    lang: "rus",
    is_handout: "true",
    size: String(Math.min(Math.max(Math.floor(params.size ?? 300), 1), 1000)),
    page: String(Math.max(Math.floor(params.page ?? 0), 0)),
  });
  if (params.cityCode) search.set("city_code", String(params.cityCode));
  if (params.postalCode) search.set("postal_code", params.postalCode);
  if (params.countryCode) search.set("country_code", params.countryCode);

  const payload = await cdekRequest(`/deliverypoints?${search.toString()}`);
  const entries = Array.isArray(payload) ? payload : [];
  const points: CdekDeliveryPoint[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const item = asObject(entry);
    if (!item) continue;
    const code = asString(item.code);
    if (!code || seen.has(code)) continue;
    const coordinates = asObject(item.location) ?? asObject(item.coordinates);
    const lat = asNumber(coordinates?.latitude);
    const lng = asNumber(coordinates?.longitude);
    if (lat === null || lng === null) continue;

    const location = asObject(item.location);
    const addressObject = asObject(item.address);
    const city = asString(location?.city) || asString(addressObject?.city);
    const addressComment =
      asString(location?.address_full) ||
      asString(location?.address) ||
      asString(item.address) ||
      [
        city,
        asString(addressObject?.street),
        asString(addressObject?.house),
      ]
        .filter(Boolean)
        .join(", ");
    const address = addressComment || [city, asString(location?.address)].filter(Boolean).join(", ");
    if (!address) continue;

    seen.add(code);
    points.push({
      id: code,
      name: asString(item.name) || `ПВЗ СДЭК ${code}`,
      address,
      city,
      lat,
      lng,
      workHours: asString(item.work_time) || formatCdekWorkHours(item.work_time_list),
    });
  }

  return points;
}

export async function findCdekCities(query: string): Promise<CdekCity[]> {
  if (!isCdekConfigured()) return [];
  const normalized = normalizeTextField(query);
  if (!normalized) return [];
  const search = new URLSearchParams({
    city: normalized,
    country_codes: "RU",
    size: "10",
    lang: "rus",
  });
  const payload = await cdekRequest(`/location/cities?${search.toString()}`);
  const entries = Array.isArray(payload) ? payload : [];
  return entries
    .map((entry) => {
      const item = asObject(entry);
      const code = Number(item?.code);
      return {
        code,
        city: asString(item?.city),
      };
    })
    .filter((item) => Number.isInteger(item.code) && item.code > 0 && item.city);
}

function normalizePhone(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("8")) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith("7")) return `+${digits}`;
  if (digits.length === 10) return `+7${digits}`;
  return "+79990000000";
}

function orderRawStatus(payload: unknown): string {
  const root = asObject(payload);
  const entity = asObject(root?.entity);
  const statuses = Array.isArray(entity?.statuses) ? entity.statuses : [];
  const normalizedStatuses = statuses
    .map((status) => asObject(status))
    .filter((status): status is Record<string, unknown> => Boolean(status));
  const latestStatus = normalizedStatuses[normalizedStatuses.length - 1];
  return (
    asString(latestStatus?.code) ||
    asString(entity?.status) ||
    asString(root?.status) ||
    asString(root?.state)
  );
}

function extractCdekNumber(payload: unknown): string {
  const root = asObject(payload);
  const entity = asObject(root?.entity);
  const relatedEntities = Array.isArray(root?.related_entities) ? root.related_entities : [];
  const relatedNumber = relatedEntities
    .map((item) => asString(asObject(item)?.cdek_number))
    .find(Boolean);
  return (
    asString(entity?.cdek_number) ||
    relatedNumber ||
    asString(root?.cdek_number) ||
    ""
  );
}

export async function createCdekOrder(
  params: CdekOrderCreateParams,
): Promise<CdekOrderCreateResult> {
  if (!isCdekConfigured()) {
    throw new Error("CDEK credentials are not configured");
  }

  const packages = [
    {
      number: `${params.orderPublicId}-1`,
      weight: CDEK_DEFAULT_PACKAGE_WEIGHT,
      length: CDEK_DEFAULT_PACKAGE_LENGTH,
      width: CDEK_DEFAULT_PACKAGE_WIDTH,
      height: CDEK_DEFAULT_PACKAGE_HEIGHT,
      items: params.items.map((item, index) => ({
        name: normalizeTextField(item.name) || `Товар ${index + 1}`,
        ware_key: `${params.orderPublicId}-${index + 1}`,
        payment: { value: 0 },
        cost: Math.max(1, item.price),
        weight: Math.max(1, Math.floor(CDEK_DEFAULT_PACKAGE_WEIGHT / Math.max(params.items.length, 1))),
        amount: Math.max(1, item.quantity),
      })),
    },
  ];

  const payload = await cdekRequest("/orders", {
    method: "POST",
    body: JSON.stringify({
      type: 2,
      number: params.orderPublicId,
      tariff_code: CDEK_DEFAULT_TARIFF_CODE,
      comment: "Тестовая доставка из дипломного marketplace-контура",
      shipment_point: params.shipmentPoint,
      delivery_point: params.deliveryPoint,
      sender: {
        name: CDEK_SENDER_NAME,
        phones: [{ number: normalizePhone(CDEK_SENDER_PHONE) }],
      },
      recipient: {
        name: normalizeTextField(params.recipientName) || "Получатель",
        email: normalizeTextField(params.recipientEmail),
        phones: [{ number: normalizePhone(params.recipientPhone) }],
      },
      packages,
    }),
  });

  const root = asObject(payload);
  const entity = asObject(root?.entity);
  const uuid = asString(entity?.uuid) || null;
  const immediateCdekNumber = extractCdekNumber(payload);
  const trackingNumber = immediateCdekNumber || uuid || params.orderPublicId;
  if (!trackingNumber) {
    const message = firstCdekError(payload);
    throw new Error(message || "CDEK did not return order identifier");
  }

  return {
    uuid,
    trackingNumber,
    trackingUrl: buildCdekTrackingUrl(trackingNumber),
    rawStatus: orderRawStatus(payload) || "CREATED",
  };
}

function mapCdekRawStatus(raw: string): CdekTrackingResult["status"] {
  const normalized = raw.trim().toUpperCase();
  if (!normalized) return "UNKNOWN";
  if (normalized.includes("CANCEL")) return "CANCELLED";
  if (
    normalized.includes("DELIVERED") ||
    normalized.includes("RECEIVED") ||
    normalized.includes("ВРУЧ")
  ) {
    return "ISSUED";
  }
  if (
    normalized.includes("READY_FOR_DELIVERY") ||
    normalized.includes("ARRIVED") ||
    normalized.includes("ПВЗ") ||
    normalized.includes("ОЖИДАЕТ")
  ) {
    return "DELIVERED";
  }
  if (
    normalized.includes("ACCEPTED") ||
    normalized.includes("CREATED") ||
    normalized.includes("IN_") ||
    normalized.includes("TRANSIT") ||
    normalized.includes("СОРТИР")
  ) {
    return "IN_TRANSIT";
  }
  return "UNKNOWN";
}

export async function fetchCdekOrderStatus(
  trackingNumber: string,
): Promise<CdekTrackingResult | null> {
  const normalized = normalizeTextField(trackingNumber);
  if (!normalized || !isCdekConfigured()) return null;

  const queries = [
    /^\d+$/u.test(normalized) ? `cdek_number=${encodeURIComponent(normalized)}` : "",
    `im_number=${encodeURIComponent(normalized)}`,
    `uuid=${encodeURIComponent(normalized)}`,
  ].filter(Boolean);

  for (const query of queries) {
    try {
      const payload = await cdekRequest(`/orders?${query}`, { method: "GET" });
      const rawStatus = orderRawStatus(payload);
      const cdekNumber = extractCdekNumber(payload) || normalized;
      return {
        status: mapCdekRawStatus(rawStatus),
        rawStatus: rawStatus || undefined,
        trackingUrl: buildCdekTrackingUrl(cdekNumber),
      };
    } catch {
      // Try another lookup form.
    }
  }

  if (/^[0-9a-f-]{20,}$/iu.test(normalized)) {
    try {
      const payload = await cdekRequest(`/orders/${encodeURIComponent(normalized)}`, {
        method: "GET",
      });
      const rawStatus = orderRawStatus(payload);
      const cdekNumber = extractCdekNumber(payload) || normalized;
      return {
        status: mapCdekRawStatus(rawStatus),
        rawStatus: rawStatus || undefined,
        trackingUrl: buildCdekTrackingUrl(cdekNumber),
      };
    } catch {
      return null;
    }
  }

  return null;
}
