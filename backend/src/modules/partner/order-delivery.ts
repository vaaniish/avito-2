export type DeliveryProviderCode = "russian_post" | "yandex_pvz";

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
  | "ISSUED"
  | "CANCELLED";

export type DeliveryStatusResult = {
  status: DeliveryExternalStatus;
  trackingUrl?: string;
  rawStatus?: string;
};

const DEFAULT_PROVIDER: DeliveryProviderCode = "yandex_pvz";
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
const RUSSIAN_POST_SOAP_URL =
  process.env.RUSSIAN_POST_SOAP_URL?.trim() ?? "https://tracking.russianpost.ru/rtm34";
const RUSSIAN_POST_LOGIN = process.env.RUSSIAN_POST_LOGIN?.trim() ?? "";
const RUSSIAN_POST_PASSWORD = process.env.RUSSIAN_POST_PASSWORD?.trim() ?? "";
const YANDEX_DELIVERY_TEST_BASE_URL =
  process.env.YANDEX_DELIVERY_TEST_BASE_URL?.trim() ??
  "https://b2b.taxi.tst.yandex.net";
const YANDEX_DELIVERY_TEST_TOKEN =
  process.env.YANDEX_DELIVERY_TEST_TOKEN?.trim() ??
  "";
const YANDEX_DELIVERY_TEST_TIMEOUT_MS = Number(
  process.env.YANDEX_DELIVERY_TEST_TIMEOUT_MS ?? "10000",
);

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
  if (provider === "yandex_pvz") {
    return `https://dostavka.yandex.ru/route/${encodeURIComponent(trackingNumber)}`;
  }
  if (provider === "russian_post") {
    return `https://www.pochta.ru/tracking#${encodeURIComponent(trackingNumber)}`;
  }
  return "";
}

function normalizeProvider(value: unknown): DeliveryProviderCode {
  if (value === "russian_post") return "russian_post";
  if (value === "yandex_pvz") return "yandex_pvz";
  return DEFAULT_PROVIDER;
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
  if (raw === "cancelled" || raw === "canceled") {
    return "CANCELLED";
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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function collectXmlTagValues(xml: string, tagName: string): string[] {
  const pattern = new RegExp(
    `<(?:\\w+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tagName}>`,
    "giu",
  );
  const values: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    const rawValue = (match[1] ?? "").replace(/<[^>]+>/gu, "").trim();
    if (!rawValue) continue;
    values.push(decodeXmlEntities(rawValue));
  }
  return values;
}

function collectXmlNestedTagValues(
  xml: string,
  parentTagName: string,
  childTagName: string,
): string[] {
  const parentPattern = new RegExp(
    `<(?:\\w+:)?${parentTagName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${parentTagName}>`,
    "giu",
  );
  const values: string[] = [];
  for (const parentMatch of xml.matchAll(parentPattern)) {
    const parentBlock = parentMatch[1] ?? "";
    const nestedValues = collectXmlTagValues(parentBlock, childTagName);
    values.push(...nestedValues);
  }
  return values;
}

function getLastValue(values: string[]): string | null {
  if (values.length === 0) return null;
  const candidate = values[values.length - 1];
  return typeof candidate === "string" && candidate.trim() ? candidate : null;
}

function detectRussianPostStatus(payload: Record<string, unknown>): DeliveryExternalStatus {
  const snapshot = JSON.stringify(payload).toLowerCase();
  const includesAny = (hints: string[]) => hints.some((hint) => snapshot.includes(hint));

  if (
    includesAny([
      "\u0432\u0440\u0443\u0447\u0435\u043d",
      "\u0432\u044b\u0434\u0430\u043d",
      "\u043f\u043e\u043b\u0443\u0447\u0435\u043d",
      "delivered_to_recipient",
      "issued",
      "picked_up",
      "handed_over",
      "completed",
    ])
  ) {
    return "ISSUED";
  }
  if (
    includesAny([
      "\u0434\u043e\u0441\u0442\u0430\u0432\u043b\u0435\u043d",
      "\u043f\u0440\u0438\u0431\u044b\u043b",
      "\u0433\u043e\u0442\u043e\u0432 \u043a \u0432\u044b\u0434\u0430\u0447\u0435",
      "ready_for_pickup",
      "arrived",
      "available_for_pickup",
    ])
  ) {
    return "DELIVERED";
  }
  if (
    includesAny([
      "\u0432 \u043f\u0443\u0442\u0438",
      "\u0442\u0440\u0430\u043d\u0437\u0438\u0442",
      "\u0441\u043e\u0440\u0442\u0438\u0440",
      "\u043f\u043e\u043a\u0438\u043d\u0443\u043b",
      "\u043f\u0440\u0438\u043d\u044f\u0442",
      "in_transit",
      "transit",
      "moving",
      "shipped",
    ])
  ) {
    return "IN_TRANSIT";
  }
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
    ["soapLatestOperation"],
    ["soapLatestEvent"],
    ["soapFaultReason"],
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
  const snapshot = JSON.stringify(payload).toLowerCase();
  return (
    snapshot.includes("\u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d") ||
    snapshot.includes("\u043d\u0435 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u0435\u0442") ||
    snapshot.includes("\u043d\u0435\u0432\u0435\u0440\u043d") ||
    snapshot.includes("not found") ||
    snapshot.includes("invalid") ||
    snapshot.includes("authorizationfaultreason")
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

function mapYandexStatusToExternal(status: string): DeliveryExternalStatus {
  const normalized = status.trim().toUpperCase();
  if (!normalized) return "UNKNOWN";

  if (
    normalized === "DELIVERY_TRANSMITTED_TO_RECIPIENT" ||
    normalized === "DELIVERY_DELIVERED" ||
    normalized === "FINISHED"
  ) {
    return "ISSUED";
  }

  if (
    normalized === "DELIVERY_ARRIVED_PICKUP_POINT" ||
    normalized === "DELIVERY_STORAGE_PERIOD_EXTENDED" ||
    normalized === "CONFIRMATION_CODE_RECEIVED"
  ) {
    return "DELIVERED";
  }

  if (normalized === "CANCELLED" || normalized === "CANCELED") {
    return "CANCELLED";
  }

  if (
    normalized === "CREATED" ||
    normalized === "DELIVERY_PROCESSING_STARTED" ||
    normalized === "DELIVERY_TRACK_RECIEVED" ||
    normalized === "SORTING_CENTER_PROCESSING_STARTED" ||
    normalized === "SORTING_CENTER_TRACK_RECEIVED" ||
    normalized === "SORTING_CENTER_TRACK_LOADED" ||
    normalized === "DELIVERY_LOADED" ||
    normalized === "SORTING_CENTER_LOADED" ||
    normalized === "SORTING_CENTER_AT_START" ||
    normalized === "SORTING_CENTER_PREPARED" ||
    normalized === "SORTING_CENTER_TRANSMITTED" ||
    normalized === "DELIVERY_AT_START" ||
    normalized === "DELIVERY_AT_START_SORT" ||
    normalized === "DELIVERY_TRANSPORTATION" ||
    normalized === "DELIVERY_TRANSPORTATION_RECIPIENT"
  ) {
    return "IN_TRANSIT";
  }

  return "UNKNOWN";
}

async function requestYandexDeliveryRequestInfo(
  requestId: string,
): Promise<{
  status: DeliveryExternalStatus;
  rawStatus?: string;
  trackingUrl?: string;
} | null> {
  if (!YANDEX_DELIVERY_TEST_TOKEN || !requestId.trim()) {
    return null;
  }

  const url = new URL(
    `${YANDEX_DELIVERY_TEST_BASE_URL.replace(/\/+$/u, "")}/api/b2b/platform/request/info`,
  );
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("slim", "true");

  try {
    const response = await fetchWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${YANDEX_DELIVERY_TEST_TOKEN}`,
          "Accept-Language": "ru",
          "Content-Type": "application/json",
        },
      },
      Number.isFinite(YANDEX_DELIVERY_TEST_TIMEOUT_MS)
        ? Math.max(2000, YANDEX_DELIVERY_TEST_TIMEOUT_MS)
        : 10000,
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      state?: {
        status?: unknown;
      };
      sharing_url?: unknown;
    };
    const rawStatus =
      payload.state && typeof payload.state.status === "string"
        ? payload.state.status.trim()
        : "";
    const sharingUrl =
      typeof payload.sharing_url === "string" ? payload.sharing_url.trim() : "";

    return {
      status: mapYandexStatusToExternal(rawStatus),
      rawStatus: rawStatus || undefined,
      trackingUrl: sharingUrl || buildTrackingUrl("yandex_pvz", requestId),
    };
  } catch {
    return null;
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

async function requestRussianPostTrackingJson(
  trackingNumber: string,
): Promise<Record<string, unknown> | null> {
  if (!RUSSIAN_POST_API_BASE_URL) return null;
  if (!RUSSIAN_POST_ACCESS_TOKEN && !RUSSIAN_POST_USER_AUTH) return null;

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

function buildRussianPostSoapRequest(
  trackingNumber: string,
  login: string,
  password: string,
): string {
  return [
    `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:oper="http://russianpost.org/operationhistory" xmlns:data="http://russianpost.org/operationhistory/data" xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">`,
    "<soap:Header/>",
    "<soap:Body>",
    "<oper:getOperationHistory>",
    "<data:OperationHistoryRequest>",
    `<data:Barcode>${escapeXml(trackingNumber)}</data:Barcode>`,
    "<data:MessageType>0</data:MessageType>",
    "<data:Language>RUS</data:Language>",
    "</data:OperationHistoryRequest>",
    '<data:AuthorizationHeader soapenv:mustUnderstand="1">',
    `<data:login>${escapeXml(login)}</data:login>`,
    `<data:password>${escapeXml(password)}</data:password>`,
    "</data:AuthorizationHeader>",
    "</oper:getOperationHistory>",
    "</soap:Body>",
    "</soap:Envelope>",
  ].join("");
}

async function requestRussianPostTrackingSoap(
  trackingNumber: string,
): Promise<Record<string, unknown> | null> {
  if (!RUSSIAN_POST_SOAP_URL) return null;
  if (!RUSSIAN_POST_LOGIN || !RUSSIAN_POST_PASSWORD) return null;

  const soapPayload = buildRussianPostSoapRequest(
    trackingNumber,
    RUSSIAN_POST_LOGIN,
    RUSSIAN_POST_PASSWORD,
  );

  try {
    const response = await fetchWithTimeout(
      RUSSIAN_POST_SOAP_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml;charset=UTF-8",
          Accept: "application/soap+xml, text/xml",
          "User-Agent": "avito-2/1.0 (tracking)",
        },
        body: soapPayload,
      },
      Number.isFinite(RUSSIAN_POST_API_TIMEOUT_MS)
        ? Math.max(2_000, RUSSIAN_POST_API_TIMEOUT_MS)
        : 8_000,
    );

    const responseText = await response.text();
    if (!responseText.trim()) return null;

    const normalizedXml = responseText.replace(/\s+/gu, " ").trim();
    const latestOperationType = getLastValue(
      collectXmlNestedTagValues(responseText, "OperType", "Name"),
    );
    const latestOperationAttr = getLastValue(
      collectXmlNestedTagValues(responseText, "OperAttr", "Name"),
    );
    const combinedOperation = [latestOperationType, latestOperationAttr]
      .filter((value): value is string => Boolean(value))
      .join(", ");
    const explicitOperation = getLastValue(collectXmlTagValues(responseText, "OperName"));
    const latestOperation = explicitOperation ?? (combinedOperation || null);
    const latestEvent = getLastValue(collectXmlTagValues(responseText, "PlaceName"));
    const latestDate = getLastValue(collectXmlTagValues(responseText, "OperDate"));
    const faultReason =
      collectXmlTagValues(responseText, "AuthorizationFaultReason")[0] ??
      collectXmlTagValues(responseText, "Text")[0] ??
      null;

    if (responseText.includes("AuthorizationFaultReason")) {
      return null;
    }

    if (!response.ok && !latestOperation && !latestEvent) {
      return null;
    }

    if (faultReason && /ошибк\p{L}*\s+авторизац\p{L}*/iu.test(faultReason)) {
      return null;
    }

    return {
      source: "russian_post_soap",
      soapLatestOperation: latestOperation,
      soapLatestEvent: latestEvent,
      soapLatestDate: latestDate,
      soapFaultReason: faultReason,
      soapPayload: normalizedXml.slice(0, 10_000),
    };
  } catch (_error) {
    return null;
  }
}

async function requestRussianPostTracking(
  trackingNumber: string,
): Promise<Record<string, unknown> | null> {
  const jsonPayload = await requestRussianPostTrackingJson(trackingNumber);
  if (jsonPayload) return jsonPayload;
  return requestRussianPostTrackingSoap(trackingNumber);
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

  if (provider === "yandex_pvz") {
    const yandexInfo = await requestYandexDeliveryRequestInfo(normalizedTrackingNumber);
    if (yandexInfo) {
      return {
        valid: true,
        normalizedTrackingNumber,
        trackingUrl: yandexInfo.trackingUrl || buildTrackingUrl(provider, normalizedTrackingNumber),
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
    valid: provider === "yandex_pvz" ? Boolean(normalizedTrackingNumber) : valid,
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

  if (provider === "yandex_pvz") {
    const yandexInfo = await requestYandexDeliveryRequestInfo(normalizedTrackingNumber);
    if (yandexInfo) {
      return {
        status: yandexInfo.status,
        trackingUrl: yandexInfo.trackingUrl || buildTrackingUrl(provider, normalizedTrackingNumber),
        rawStatus: yandexInfo.rawStatus,
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
