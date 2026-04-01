import {
  AppUser,
  ListingImage,
  MarketOrder,
  MarketOrderItem,
  MarketplaceListing,
  UserAddress,
  WishlistItem,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import {
  toClientCondition,
  toClientRole,
  toProfileOrderStatus,
} from "../../utils/format";

const profileRouter = Router();
const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

type YooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
};

type YooKassaWebhookPayload = {
  event?: unknown;
  object?: {
    id?: unknown;
    status?: unknown;
  } | null;
};

type YooKassaConfig = {
  shopId: string;
  secretKey: string;
  returnUrl: string;
  apiUrl: string;
};

type DeliveryProviderCode = "russian_post" | "yandex_pvz";
type DeliveryProviderFilter = DeliveryProviderCode | "all";

type DeliveryPoint = {
  id: string;
  provider: DeliveryProviderCode;
  providerLabel: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  workHours: string;
  etaDays: number;
  cost: number;
};

const DELIVERY_PROVIDER_LABELS: Record<DeliveryProviderCode, string> = {
  russian_post: "РџРѕС‡С‚Р° Р РѕСЃСЃРёРё",
  yandex_pvz: "Яндекс ПВЗ",
};

DELIVERY_PROVIDER_LABELS.russian_post = "Почта России";
DELIVERY_PROVIDER_LABELS.yandex_pvz = "Яндекс ПВЗ";


const DELIVERY_PROVIDERS: Array<{ code: DeliveryProviderCode; label: string }> =
  [
    {
      code: "yandex_pvz",
      label: DELIVERY_PROVIDER_LABELS.yandex_pvz,
    },
    {
      code: "russian_post",
      label: DELIVERY_PROVIDER_LABELS.russian_post,
    },
  ];

function parseDeliveryProviderFilter(value: unknown): DeliveryProviderFilter {
  if (typeof value !== "string") return "all";
  const normalized = value.trim();
  if (
    normalized === "all" ||
    normalized === "yandex_pvz" ||
    normalized === "russian_post"
  ) {
    return normalized;
  }
  return "all";
}

function normalizePickupProvider(value: unknown): DeliveryProviderCode {
  if (value === "russian_post") return "russian_post";
  return "yandex_pvz";
}

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const cause = (error as { cause?: unknown }).cause as
    | { code?: unknown }
    | undefined;
  const code = typeof cause?.code === "string" ? cause.code : "";
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toLocalizedDeliveryDate(date: Date): string {
  const deliveryDate = new Date(date.getTime());
  deliveryDate.setDate(deliveryDate.getDate() + 3);
  return deliveryDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

function getYooKassaConfig(): YooKassaConfig {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

  if (!shopId || !secretKey) {
    throw new Error(
      "YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.",
    );
  }

  return {
    shopId,
    secretKey,
    returnUrl:
      process.env.YOOKASSA_RETURN_URL?.trim() ||
      "http://localhost:3000/payment-return",
    apiUrl: process.env.YOOKASSA_API_URL?.trim() || "https://api.yookassa.ru/v3",
  };
}

async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  metadata: Record<string, string>;
  paymentMethod: "card" | "sbp";
}): Promise<YooKassaPayment> {
  const config = getYooKassaConfig();
  const authToken = Buffer.from(
    `${config.shopId}:${config.secretKey}`,
    "utf8",
  ).toString("base64");

  const payloadBody = JSON.stringify({
    amount: {
      value: params.amountRub.toFixed(2),
      currency: "RUB",
    },
    capture: true,
    payment_method_data: {
      type: params.paymentMethod === "sbp" ? "sbp" : "bank_card",
    },
    save_payment_method: false,
    confirmation: {
      type: "redirect",
      return_url: config.returnUrl,
    },
    description: params.description,
    metadata: params.metadata,
  });

  let response: globalThis.Response | null = null;
  let lastError: unknown = null;
  const maxAttempts = 3;
  const idempotenceKey = randomUUID();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${config.apiUrl}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authToken}`,
          "Content-Type": "application/json",
          "Idempotence-Key": idempotenceKey,
        },
        body: payloadBody,
      });
      break;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }
      await delay(300 * attempt);
    }
  }

  if (!response) {
    if (isRetryableNetworkError(lastError)) {
      throw new Error(
        "YooKassa is temporarily unavailable (DNS/network). Check internet, VPN/proxy, and DNS settings.",
      );
    }
    throw new Error("YooKassa request failed");
  }

  const rawBody = await response.text();
  const payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "description" in payload &&
      typeof (payload as { description?: unknown }).description === "string"
        ? (payload as { description: string }).description
        : `YooKassa request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { id?: unknown }).id !== "string" ||
    typeof (payload as { status?: unknown }).status !== "string"
  ) {
    throw new Error("Invalid YooKassa response");
  }

  return payload as YooKassaPayment;
}

function extractYooKassaPaymentBaseId(paymentIntentId: string): string {
  const normalized = paymentIntentId.trim();
  if (!normalized) return "";
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0) return normalized;
  return normalized.slice(0, separatorIndex).trim();
}

async function fetchYooKassaPaymentById(
  paymentId: string,
): Promise<YooKassaPayment | null> {
  if (!paymentId.trim()) {
    return null;
  }

  const config = getYooKassaConfig();
  const authToken = Buffer.from(
    `${config.shopId}:${config.secretKey}`,
    "utf8",
  ).toString("base64");

  const response = await fetch(
    `${config.apiUrl}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${authToken}`,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { id?: unknown }).id !== "string" ||
    typeof (payload as { status?: unknown }).status !== "string"
  ) {
    return null;
  }

  return payload as YooKassaPayment;
}

const YANDEX_GEOCODER_BASE_URL =
  process.env.YANDEX_GEOCODER_BASE_URL?.trim() ||
  "https://geocode-maps.yandex.ru/1.x/";
const YANDEX_GEOCODER_API_KEY =
  process.env.YANDEX_GEOCODER_API_KEY?.trim() ||
  process.env.VITE_YANDEX_MAPS_API_KEY?.trim() ||
  "";
const YANDEX_GEOCODER_TIMEOUT_MS = Number(
  process.env.YANDEX_GEOCODER_TIMEOUT_MS ?? "7000",
);
const YANDEX_SUGGEST_BASE_URL =
  process.env.YANDEX_SUGGEST_BASE_URL?.trim() ||
  "https://suggest-maps.yandex.ru/v1/suggest";
const YANDEX_SUGGEST_API_KEY =
  process.env.YANDEX_SUGGEST_API_KEY?.trim() ||
  process.env.VITE_YANDEX_GEOSUGGEST_API_KEY?.trim() ||
  process.env.VITE_YANDEX_MAPS_API_KEY?.trim() ||
  "";
const YANDEX_SUGGEST_TIMEOUT_MS = Number(
  process.env.YANDEX_SUGGEST_TIMEOUT_MS ?? "5000",
);
const RUSSIAN_POST_POINTS_API_URL =
  process.env.RUSSIAN_POST_POINTS_API_URL?.trim() ||
  "https://www.pochta.ru/suggestions/v2/postoffices.find-from-rectangle";
const RUSSIAN_POST_POINTS_TIMEOUT_MS = Number(
  process.env.RUSSIAN_POST_POINTS_TIMEOUT_MS ?? "15000",
);
const RUSSIAN_POST_PAGE_LIMIT = Number(
  process.env.RUSSIAN_POST_PAGE_LIMIT ?? "50000",
);
const RUSSIAN_POST_MAX_PAGES = Number(
  process.env.RUSSIAN_POST_MAX_PAGES ?? "50",
);
const RUSSIAN_POST_SEARCH_PADDING_DEG = Number(
  process.env.RUSSIAN_POST_SEARCH_PADDING_DEG ?? "0.05",
);
const RUSSIAN_POST_FALLBACK_SPAN_LAT = Number(
  process.env.RUSSIAN_POST_FALLBACK_SPAN_LAT ?? "0.3",
);
const RUSSIAN_POST_FALLBACK_SPAN_LNG = Number(
  process.env.RUSSIAN_POST_FALLBACK_SPAN_LNG ?? "0.3",
);
const RUSSIAN_POST_EXT_FILTERS = [
  "NOT_TEMPORARY_CLOSED",
  "NOT_PRIVATE",
  "NOT_CLOSED",
] as const;
const RUSSIAN_POST_DBF_PATH =
  process.env.RUSSIAN_POST_DBF_PATH?.trim() || "backend/data/PIndx05.dbf";
const RUSSIAN_POST_DBF_ENCODING =
  process.env.RUSSIAN_POST_DBF_ENCODING?.trim() || "ibm866";
const RUSSIAN_POST_DBF_CITY_MATCH_LIMIT = Number(
  process.env.RUSSIAN_POST_DBF_CITY_MATCH_LIMIT ?? "5000",
);
const RUSSIAN_POST_DBF_GEOCODE_LIMIT = Number(
  process.env.RUSSIAN_POST_DBF_GEOCODE_LIMIT ?? "2000",
);
const RUSSIAN_POST_DBF_GEOCODE_CONCURRENCY = Number(
  process.env.RUSSIAN_POST_DBF_GEOCODE_CONCURRENCY ?? "20",
);
const RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT = Number(
  process.env.RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT ?? "1500",
);
const RUSSIAN_POST_OFFICE_PAGE_BASE_URL =
  process.env.RUSSIAN_POST_OFFICE_PAGE_BASE_URL?.trim() ||
  "https://www.pochta.ru/offices";
const RUSSIAN_POST_OFFICE_TIMEOUT_MS = Number(
  process.env.RUSSIAN_POST_OFFICE_TIMEOUT_MS ?? "12000",
);
const RUSSIAN_POST_OFFICE_CONCURRENCY = Number(
  process.env.RUSSIAN_POST_OFFICE_CONCURRENCY ?? "12",
);
const RUSSIAN_POST_PAGE_SIZE_DEFAULT = Number(
  process.env.RUSSIAN_POST_PAGE_SIZE_DEFAULT ?? "250",
);
const RUSSIAN_POST_PAGE_SIZE_MAX = Number(
  process.env.RUSSIAN_POST_PAGE_SIZE_MAX ?? "600",
);
const YANDEX_DELIVERY_TEST_BASE_URL =
  process.env.YANDEX_DELIVERY_TEST_BASE_URL?.trim() ||
  "https://b2b.taxi.tst.yandex.net";
const YANDEX_DELIVERY_TEST_TOKEN =
  process.env.YANDEX_DELIVERY_TEST_TOKEN?.trim() ||
  "";
const YANDEX_DELIVERY_TEST_TIMEOUT_MS = Number(
  process.env.YANDEX_DELIVERY_TEST_TIMEOUT_MS ?? "10000",
);
const YANDEX_DELIVERY_TEST_SOURCE_STATION_ID =
  process.env.YANDEX_DELIVERY_TEST_SOURCE_STATION_ID?.trim() ||
  "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924";
const YANDEX_DELIVERY_TEST_MERCHANT_ID =
  process.env.YANDEX_DELIVERY_TEST_MERCHANT_ID?.trim() ||
  "290587090cfc4943856851c8c3b2eebf";

type GeoBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type GeocodedLocation = {
  query: string;
  label: string;
  city: string;
  lat: number;
  lng: number;
  bounds?: GeoBounds;
};

type RussianPostDbfRow = {
  index: string;
  opsName: string;
  opsType: string;
  region: string;
  area: string;
  city: string;
  city1: string;
};

type RussianPostOfficeDetails = {
  index: string;
  typeCode: string;
  name: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  workHours: string;
};

type LocationSuggestion = {
  title?: { text?: string } | string;
  subtitle?: { text?: string } | string;
  address?: { formatted_address?: string };
  uri?: string;
  value?: string;
  displayName?: string;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? Math.max(2000, timeoutMs) : 7000,
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseYandexPos(pos: string): { lat: number; lng: number } | null {
  const [lngRaw, latRaw] = String(pos).trim().split(/\s+/);
  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}

function parseYandexBounds(rawBounds: {
  Envelope?: { lowerCorner?: string; upperCorner?: string };
} | null | undefined): GeoBounds | null {
  const lowerRaw = rawBounds?.Envelope?.lowerCorner;
  const upperRaw = rawBounds?.Envelope?.upperCorner;
  if (!lowerRaw || !upperRaw) return null;

  const lower = parseYandexPos(lowerRaw);
  const upper = parseYandexPos(upperRaw);
  if (!lower || !upper) return null;

  const minLat = Math.min(lower.lat, upper.lat);
  const maxLat = Math.max(lower.lat, upper.lat);
  const minLng = Math.min(lower.lng, upper.lng);
  const maxLng = Math.max(lower.lng, upper.lng);

  if (
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLat) ||
    !Number.isFinite(minLng) ||
    !Number.isFinite(maxLng)
  ) {
    return null;
  }

  return { minLat, maxLat, minLng, maxLng };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function extractYandexCity(components: unknown): string {
  if (!Array.isArray(components)) return "";

  const entries = components.filter(
    (item): item is { kind?: unknown; name?: unknown } =>
      Boolean(item) && typeof item === "object",
  );

  const byKinds = ["locality", "province", "area"];
  for (const kind of byKinds) {
    const found = entries.find(
      (entry) =>
        typeof entry.kind === "string" &&
        entry.kind === kind &&
        typeof entry.name === "string" &&
        entry.name.trim(),
    );
    if (found && typeof found.name === "string") {
      return found.name.trim();
    }
  }

  return "";
}

function parseCoordinateQuery(query: string): { lat: number; lng: number } | null {
  const cleaned = query
    .trim()
    .replace(/[;|]/g, ",")
    .replace(/\s+/g, " ");
  if (!cleaned) return null;

  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  if (parts.length !== 2) return null;

  const first = Number(parts[0]);
  const second = Number(parts[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  // Lat,Lng
  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { lat: first, lng: second };
  }

  // Lng,Lat
  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { lat: second, lng: first };
  }

  return null;
}

function buildGeocodeQueryVariants(normalizedQuery: string): string[] {
  const query = normalizedQuery.trim();
  if (!query) return [];

  // Allow direct geocode by Yandex object URI from Suggest API.
  if (/^(?:ymapsbm1|ymaps):\/\//i.test(query)) {
    return [query];
  }

  const variants: string[] = [];
  const coordinates = parseCoordinateQuery(query);
  if (coordinates) {
    variants.push(`${coordinates.lng},${coordinates.lat}`);
    variants.push(`${coordinates.lat},${coordinates.lng}`);
    return Array.from(new Set(variants));
  }

  variants.push(query);
  if (!/(?:^|\b)(?:russia|\u0440\u043e\u0441\u0441\u0438\u044f)(?:$|\b)/iu.test(query)) {
    variants.unshift(`${query}, \u0420\u043e\u0441\u0441\u0438\u044f`);
  }

  return Array.from(new Set(variants));
}

async function loadLocationSuggestionsByYandex(
  query: string,
  limit = 8,
): Promise<LocationSuggestion[]> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];
  const safeLimit = Math.min(Math.max(limit, 1), 10);

  try {
    const url = new URL(YANDEX_SUGGEST_BASE_URL);
    if (YANDEX_SUGGEST_API_KEY) {
      url.searchParams.set("apikey", YANDEX_SUGGEST_API_KEY);
    }
    url.searchParams.set("text", normalizedQuery);
    url.searchParams.set("lang", "ru_RU");
    url.searchParams.set("results", String(safeLimit));
    url.searchParams.set("types", "biz,geo");
    url.searchParams.set("attrs", "uri");
    url.searchParams.set("print_address", "1");
    url.searchParams.set("org_address_kind", "house");

    const response = await fetchWithTimeout(
      url.toString(),
      { method: "GET" },
      YANDEX_SUGGEST_TIMEOUT_MS,
    );
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      results?: unknown[];
    };
    if (!Array.isArray(payload.results)) return [];

    return payload.results
      .filter(
        (entry): entry is LocationSuggestion =>
          Boolean(entry) && typeof entry === "object",
      )
      .slice(0, safeLimit);
  } catch {
    return [];
  }
}

async function geocodeLocationByYandex(
  query: string,
): Promise<GeocodedLocation | null> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return null;

  try {
    const queryVariants = buildGeocodeQueryVariants(normalizedQuery);

    for (const geocodeQuery of queryVariants) {
      const url = new URL(YANDEX_GEOCODER_BASE_URL);
      if (YANDEX_GEOCODER_API_KEY) {
        url.searchParams.set("apikey", YANDEX_GEOCODER_API_KEY);
      }
      url.searchParams.set("format", "json");
      url.searchParams.set("lang", "ru_RU");
      url.searchParams.set("results", "1");
      url.searchParams.set("geocode", geocodeQuery);

      const response = await fetchWithTimeout(
        url.toString(),
        { method: "GET" },
        YANDEX_GEOCODER_TIMEOUT_MS,
      );
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as {
        response?: {
          GeoObjectCollection?: {
            featureMember?: Array<{
              GeoObject?: {
                Point?: { pos?: string };
                name?: string;
                description?: string;
                metaDataProperty?: {
                  GeocoderMetaData?: {
                    text?: string;
                    boundedBy?: {
                      Envelope?: { lowerCorner?: string; upperCorner?: string };
                    };
                    Address?: {
                      Components?: unknown;
                    };
                  };
                };
              };
            }>;
          };
        };
      };

      const geoObject =
        payload.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
      const posRaw = geoObject?.Point?.pos;
      if (!posRaw) {
        continue;
      }

      const coords = parseYandexPos(posRaw);
      if (!coords) {
        continue;
      }

      const components =
        geoObject?.metaDataProperty?.GeocoderMetaData?.Address?.Components;
      const parsedCity = extractYandexCity(components);

      const label =
        geoObject?.metaDataProperty?.GeocoderMetaData?.text?.trim() ||
        geoObject?.description?.trim() ||
        geoObject?.name?.trim() ||
        normalizedQuery;
      const bounds = parseYandexBounds(
        geoObject?.metaDataProperty?.GeocoderMetaData?.boundedBy,
      );

      return {
        query: normalizedQuery,
        label,
        city: parsedCity || normalizedQuery,
        lat: coords.lat,
        lng: coords.lng,
        bounds: bounds ?? undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function toFiniteCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildRussianPostBounds(location: GeocodedLocation): GeoBounds {
  const baseBounds = location.bounds ?? {
    minLat: location.lat - RUSSIAN_POST_FALLBACK_SPAN_LAT,
    maxLat: location.lat + RUSSIAN_POST_FALLBACK_SPAN_LAT,
    minLng: location.lng - RUSSIAN_POST_FALLBACK_SPAN_LNG,
    maxLng: location.lng + RUSSIAN_POST_FALLBACK_SPAN_LNG,
  };

  const latHalfSpan = Math.max(
    Math.abs(baseBounds.maxLat - baseBounds.minLat) / 2 + RUSSIAN_POST_SEARCH_PADDING_DEG,
    RUSSIAN_POST_FALLBACK_SPAN_LAT,
  );
  const lngHalfSpan = Math.max(
    Math.abs(baseBounds.maxLng - baseBounds.minLng) / 2 + RUSSIAN_POST_SEARCH_PADDING_DEG,
    RUSSIAN_POST_FALLBACK_SPAN_LNG,
  );

  return {
    minLat: clampNumber(location.lat - latHalfSpan, -90, 90),
    maxLat: clampNumber(location.lat + latHalfSpan, -90, 90),
    minLng: clampNumber(location.lng - lngHalfSpan, -180, 180),
    maxLng: clampNumber(location.lng + lngHalfSpan, -180, 180),
  };
}

let russianPostDbfRowsCache: RussianPostDbfRow[] | null = null;
const russianPostIndexGeoCache = new Map<
  string,
  {
    lat: number;
    lng: number;
    label: string;
    city: string;
  }
>();
const russianPostOfficeDetailsCache = new Map<string, RussianPostOfficeDetails | null>();
const RUSSIAN_MATCH_STOP_WORDS = new Set([
  "россия",
  "рф",
  "область",
  "обл",
  "край",
  "республика",
  "респ",
  "город",
  "г",
  "район",
  "рн",
  "почта",
  "почтовой",
  "почтовое",
  "отделение",
  "связи",
  "пункт",
  "выдачи",
  "индекс",
  "пвз",
]);

const RUSSIAN_MATCH_STOP_WORDS_NORMALIZED = new Set([
  "\u0440\u043e\u0441\u0441\u0438\u044f",
  "\u0440\u0444",
  "\u043e\u0431\u043b\u0430\u0441\u0442\u044c",
  "\u043e\u0431\u043b",
  "\u043a\u0440\u0430\u0439",
  "\u0440\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a\u0430",
  "\u0440\u0435\u0441\u043f",
  "\u0433\u043e\u0440\u043e\u0434",
  "\u0433",
  "\u0440\u0430\u0439\u043e\u043d",
  "\u0440\u043d",
  "\u043f\u043e\u0447\u0442\u0430",
  "\u043f\u043e\u0447\u0442\u043e\u0432\u043e\u0439",
  "\u043f\u043e\u0447\u0442\u043e\u0432\u043e\u0435",
  "\u043e\u0442\u0434\u0435\u043b\u0435\u043d\u0438\u0435",
  "\u0441\u0432\u044f\u0437\u0438",
  "\u043f\u0443\u043d\u043a\u0442",
  "\u0432\u044b\u0434\u0430\u0447\u0438",
  "\u0438\u043d\u0434\u0435\u043a\u0441",
  "\u043f\u0432\u0437",
]);

function normalizeSearchToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/giu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function cleanRussianPostText(value: string): string {
  return value.replace(/\u0000/gu, "").replace(/\s+/gu, " ").trim();
}

function toDbfFieldName(value: string): string {
  return value.trim().toUpperCase();
}

async function loadRussianPostDbfRows(): Promise<RussianPostDbfRow[]> {
  if (russianPostDbfRowsCache) {
    return russianPostDbfRowsCache;
  }

  try {
    const fileBuffer = await fs.readFile(RUSSIAN_POST_DBF_PATH);
    if (fileBuffer.length < 64) {
      russianPostDbfRowsCache = [];
      return [];
    }

    const recordsCount = fileBuffer.readUInt32LE(4);
    const headerLength = fileBuffer.readUInt16LE(8);
    const recordLength = fileBuffer.readUInt16LE(10);
    if (recordsCount <= 0 || headerLength <= 0 || recordLength <= 1) {
      russianPostDbfRowsCache = [];
      return [];
    }

    const decoder = new TextDecoder(RUSSIAN_POST_DBF_ENCODING, { fatal: false });
    const fields: Array<{ name: string; offset: number; length: number }> = [];
    let cursor = 32;
    let offset = 1;
    while (cursor + 32 <= headerLength) {
      const firstByte = fileBuffer[cursor];
      if (firstByte === 0x0d) break;
      const descriptor = fileBuffer.subarray(cursor, cursor + 32);
      const rawName = descriptor.subarray(0, 11).toString("ascii");
      const name = toDbfFieldName(rawName.replace(/\u0000/gu, ""));
      const length = descriptor[16];
      if (name && length > 0) {
        fields.push({ name, offset, length });
      }
      offset += length;
      cursor += 32;
    }

    const required = {
      index: fields.find((field) => field.name === "INDEX"),
      opsName: fields.find((field) => field.name === "OPSNAME"),
      opsType: fields.find((field) => field.name === "OPSTYPE"),
      region: fields.find((field) => field.name === "REGION"),
      area: fields.find((field) => field.name === "AREA"),
      city: fields.find((field) => field.name === "CITY"),
      city1: fields.find((field) => field.name === "CITY_1"),
    };
    if (!required.index) {
      russianPostDbfRowsCache = [];
      return [];
    }

    const rows: RussianPostDbfRow[] = [];
    for (let i = 0; i < recordsCount; i += 1) {
      const base = headerLength + i * recordLength;
      if (base + recordLength > fileBuffer.length) break;
      const deletedFlag = fileBuffer[base];
      if (deletedFlag === 0x2a) continue;

      const readField = (field?: { offset: number; length: number }): string => {
        if (!field) return "";
        const raw = fileBuffer.subarray(
          base + field.offset,
          base + field.offset + field.length,
        );
        return cleanRussianPostText(decoder.decode(raw));
      };

      const index = readField(required.index);
      if (!/^\d{6}$/u.test(index)) continue;

      rows.push({
        index,
        opsName: readField(required.opsName),
        opsType: readField(required.opsType),
        region: readField(required.region),
        area: readField(required.area),
        city: readField(required.city),
        city1: readField(required.city1),
      });
    }

    russianPostDbfRowsCache = rows;
    return rows;
  } catch (error) {
    console.warn("Failed to read Russian Post DBF indexes:", error);
    russianPostDbfRowsCache = [];
    return [];
  }
}

function selectRussianPostDbfRowsByLocation(
  rows: RussianPostDbfRow[],
  locationQuery: string,
  cityHint = "",
): RussianPostDbfRow[] {
  const tokenize = (value: string): string[] =>
    normalizeSearchToken(value)
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter(
        (token) =>
          token.length >= 3 &&
          !RUSSIAN_MATCH_STOP_WORDS_NORMALIZED.has(token) &&
          !RUSSIAN_MATCH_STOP_WORDS.has(token),
      );

  const normalizedQuery = String(locationQuery ?? "").trim();
  const embeddedIndexMatch = normalizedQuery.match(/(?:^|\D)(\d{6})(?:\D|$)/u);
  const indexQuery = /^\d{6}$/u.test(normalizedQuery)
    ? normalizedQuery
    : embeddedIndexMatch?.[1] ?? "";
  if (indexQuery) {
    return rows.filter(
      (row) => row.index === indexQuery && isRussianPostOfficeType(row.opsType),
    );
  }

  const queryTokens = tokenize(normalizedQuery);
  const hintTokens = tokenize(cityHint);
  const tokens = Array.from(new Set([...hintTokens, ...queryTokens]));
  if (tokens.length === 0) {
    return [];
  }

  const exactCityMatches: RussianPostDbfRow[] = [];
  const cityContainsMatches: RussianPostDbfRow[] = [];
  const areaMatches: RussianPostDbfRow[] = [];
  const allowAreaFallback =
    /(?:\u043e\u0431\u043b|(?:\u043a\u0440\u0430\u0439)|(?:\u0440\u0435\u0441\u043f)|(?:\u0440\u0430\u0439\u043e\u043d)|(?:\u043e\u043a\u0440\u0443\u0433))/iu.test(
      normalizedQuery,
    );

  for (const row of rows) {
    if (!isRussianPostOfficeType(row.opsType)) {
      continue;
    }

    const city = normalizeSearchToken(row.city);
    const city1 = normalizeSearchToken(row.city1);
    const area = normalizeSearchToken(row.area);
    const region = normalizeSearchToken(row.region);

    const hasExactCity = tokens.some((token) => city === token || city1 === token);
    if (hasExactCity) {
      exactCityMatches.push(row);
      continue;
    }

    const hasCityContains = tokens.some(
      (token) =>
        city.startsWith(`${token} `) ||
        city1.startsWith(`${token} `) ||
        city.includes(` ${token} `) ||
        city1.includes(` ${token} `) ||
        city.endsWith(` ${token}`) ||
        city1.endsWith(` ${token}`) ||
        city.includes(token) ||
        city1.includes(token),
    );
    if (hasCityContains) {
      cityContainsMatches.push(row);
      continue;
    }

    const hasAreaMatch = tokens.some(
      (token) =>
        area === token ||
        area.startsWith(`${token} `) ||
        region === token ||
        region.startsWith(`${token} `),
    );
    if (hasAreaMatch) {
      areaMatches.push(row);
    }
  }

  const matched =
    exactCityMatches.length > 0
      ? exactCityMatches
      : cityContainsMatches.length > 0
        ? cityContainsMatches
        : allowAreaFallback
          ? areaMatches
          : [];

  const uniqueByIndex = new Map<string, RussianPostDbfRow>();
  for (const row of matched) {
    if (!uniqueByIndex.has(row.index)) {
      uniqueByIndex.set(row.index, row);
    }
  }

  const deduped = Array.from(uniqueByIndex.values()).sort((a, b) =>
    a.index.localeCompare(b.index, "ru"),
  );
  const limit =
    Number.isFinite(RUSSIAN_POST_DBF_CITY_MATCH_LIMIT) &&
    RUSSIAN_POST_DBF_CITY_MATCH_LIMIT > 0
      ? Math.floor(RUSSIAN_POST_DBF_CITY_MATCH_LIMIT)
      : 5000;
  return deduped.slice(0, limit);
}

function buildRussianPostDbfAddress(
  row: RussianPostDbfRow,
  fallbackCity: string,
): string {
  const city = row.city || row.city1 || fallbackCity;
  return [row.region, row.area, city, row.opsName]
    .map((value) => cleanRussianPostText(value))
    .filter(Boolean)
    .join(", ");
}

function buildRussianPostDbfName(row: RussianPostDbfRow): string {
  const type = cleanRussianPostText(row.opsType).toLowerCase();
  const prefix = type.includes("почтомат")
    ? "Почтомат"
    : type.includes("пункт")
      ? "Пункт выдачи"
      : "Отделение";
  return `${prefix} № ${row.index}`;
}

function isRussianPostOfficeType(value: string): boolean {
  const normalized = cleanRussianPostText(value).toUpperCase();
  if (!normalized) return false;
  if (
    normalized.includes("POSTAMAT") ||
    normalized.includes("PICKUP") ||
    normalized.includes("PVZ") ||
    normalized.includes("POINT")
  ) {
    return false;
  }
  if (normalized === "OPS" || normalized === "GOPS" || normalized === "SOPS") {
    return true;
  }
  if (normalized.includes("ПОЧТОМАТ") || normalized.includes("ПУНКТ")) {
    return false;
  }
  return (
    normalized === "О" ||
    normalized === "ОПС" ||
    normalized === "ГОПС" ||
    normalized === "СОПС"
  );
}

function isLikelyRussianCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < 41 || lat > 82) return false;
  return lng >= 19 || lng <= -160;
}

function parseRussianPostOfficeName(index: string, typeCode: string): string {
  const normalizedType = cleanRussianPostText(typeCode).toUpperCase();
  if (normalizedType.includes("ПОЧТОМАТ")) {
    return `Почтомат № ${index}`;
  }
  if (normalizedType.includes("ПУНКТ")) {
    return `Пункт выдачи № ${index}`;
  }
  return `Отделение № ${index}`;
}

function extractNextDataJsonFromHtml(html: string): unknown | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/u,
  );
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

async function loadRussianPostOfficeDetailsByIndex(
  index: string,
): Promise<RussianPostOfficeDetails | null> {
  if (russianPostOfficeDetailsCache.has(index)) {
    return russianPostOfficeDetailsCache.get(index) ?? null;
  }

  const officeUrl = `${RUSSIAN_POST_OFFICE_PAGE_BASE_URL}/${encodeURIComponent(index)}`;
  try {
    const response = await fetchWithTimeout(
      officeUrl,
      {
        method: "GET",
        headers: {
          Accept: "text/html",
        },
      },
      RUSSIAN_POST_OFFICE_TIMEOUT_MS,
    );
    if (!response.ok) {
      if (response.status === 404) {
        russianPostOfficeDetailsCache.set(index, null);
      }
      return null;
    }

    const html = await response.text();
    const payload = extractNextDataJsonFromHtml(html) as
      | {
          props?: {
            pageProps?: {
              office?: {
                postalCode?: unknown;
                typeCode?: unknown;
                settlement?: unknown;
                latitude?: unknown;
                longitude?: unknown;
                addressSource?: unknown;
                address?: {
                  fullAddress?: unknown;
                  shortAddress?: unknown;
                  settlementOrCity?: unknown;
                  city?: unknown;
                };
                workingHours?: unknown;
              };
            };
          };
        }
      | null;
    const office = payload?.props?.pageProps?.office;
    if (!office || typeof office !== "object") {
      return null;
    }

    const lat = toFiniteCoordinate(office.latitude);
    const lng = toFiniteCoordinate(office.longitude);
    if (lat === null || lng === null || !isLikelyRussianCoordinate(lat, lng)) {
      return null;
    }

    const postalCode = normalizeTextField(office.postalCode) || index;
    const city =
      normalizeTextField(office.settlement) ||
      normalizeTextField(office.address?.settlementOrCity) ||
      normalizeTextField(office.address?.city);
    const address =
      normalizeTextField(office.address?.fullAddress) ||
      normalizeTextField(office.addressSource) ||
      normalizeTextField(office.address?.shortAddress);

    const details: RussianPostOfficeDetails = {
      index: postalCode,
      typeCode: normalizeTextField(office.typeCode),
      name: parseRussianPostOfficeName(postalCode, normalizeTextField(office.typeCode)),
      address,
      city,
      lat,
      lng,
      workHours: mapRussianPostWorkHoursSafe(office.workingHours),
    };

    russianPostOfficeDetailsCache.set(index, details);
    return details;
  } catch {
    return null;
  }
}

async function geocodeRussianPostIndex(
  index: string,
  cityHint: string,
): Promise<{
  lat: number;
  lng: number;
  city: string;
  label: string;
} | null> {
  const cached = russianPostIndexGeoCache.get(index);
  if (cached) return cached;

  const query = cityHint
    ? `${index}, ${cityHint}, Россия`
    : `${index}, Россия`;
  const fallbackQuery = cityHint
    ? `${index}, ${cityHint}, Russia`
    : `${index}, Russia`;
  const location =
    (await geocodeLocationByYandex(query)) ??
    (query === fallbackQuery ? null : await geocodeLocationByYandex(fallbackQuery));
  if (!location) return null;
  if (!isLikelyRussianCoordinate(location.lat, location.lng)) return null;

  const mapped = {
    lat: location.lat,
    lng: location.lng,
    city: location.city,
    label: location.label,
  };
  russianPostIndexGeoCache.set(index, mapped);
  return mapped;
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const safeConcurrency =
    Number.isFinite(concurrency) && concurrency > 0
      ? Math.floor(concurrency)
      : 10;

  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(safeConcurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = items[nextIndex];
      nextIndex += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function mapRussianPostWorkHours(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "";

  const currentWeekday = (() => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  })();

  const today = value.find(
    (item) =>
      item &&
      typeof item === "object" &&
      Number((item as { weekDayId?: unknown }).weekDayId) === currentWeekday,
  ) as
    | {
        beginWorkTime?: unknown;
        endWorkTime?: unknown;
      }
    | undefined;

  const begin = normalizeTextField(today?.beginWorkTime);
  const end = normalizeTextField(today?.endWorkTime);
  if (begin && end) {
    if (
      (begin === "00:00" || begin === "00:00:00") &&
      (end === "00:00" || end === "00:00:00")
    ) {
      return "РљСЂСѓРіР»РѕСЃСѓС‚РѕС‡РЅРѕ";
    }
    return `${begin}-${end}`;
  }
  if (begin || end) return begin || end;
  return "РџРѕ СЂР°СЃРїРёСЃР°РЅРёСЋ";
}

function mapRussianPostWorkHoursSafe(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) return "По расписанию";

  const currentWeekday = (() => {
    const day = new Date().getDay();
    return day === 0 ? 7 : day;
  })();

  const today = value.find(
    (item) =>
      item &&
      typeof item === "object" &&
      Number((item as { weekDayId?: unknown }).weekDayId) === currentWeekday,
  ) as
    | {
        beginWorkTime?: unknown;
        endWorkTime?: unknown;
      }
    | undefined;

  const begin = normalizeTextField(today?.beginWorkTime);
  const end = normalizeTextField(today?.endWorkTime);
  if (begin && end) {
    if (
      (begin === "00:00" || begin === "00:00:00") &&
      (end === "00:00" || end === "00:00:00")
    ) {
      return "Круглосуточно";
    }
    return `${begin}-${end}`;
  }
  if (begin || end) return begin || end;
  return "По расписанию";
}

function buildRussianPostOfficeName(postalCode: string): string {
  return postalCode
    ? `Отделение № ${postalCode}`
    : "Отделение Почты России";
}

async function loadRussianPostDeliveryPoints(
  location: GeocodedLocation,
): Promise<DeliveryPoint[]> {
  const bounds = buildRussianPostBounds(location);
  const safeLimit =
    Number.isFinite(RUSSIAN_POST_PAGE_LIMIT) && RUSSIAN_POST_PAGE_LIMIT > 0
      ? Math.min(Math.floor(RUSSIAN_POST_PAGE_LIMIT), 50000)
      : 50000;
  const maxPages =
    Number.isFinite(RUSSIAN_POST_MAX_PAGES) && RUSSIAN_POST_MAX_PAGES > 0
      ? Math.floor(RUSSIAN_POST_MAX_PAGES)
      : 50;

  const points: DeliveryPoint[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchWithTimeout(
      RUSSIAN_POST_POINTS_API_URL,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topLeftPoint: {
            latitude: bounds.maxLat,
            longitude: bounds.minLng,
          },
          bottomRightPoint: {
            latitude: bounds.minLat,
            longitude: bounds.maxLng,
          },
          precision: 11,
          onlyCoordinate: false,
          extFilters: RUSSIAN_POST_EXT_FILTERS,
          offset,
          limit: safeLimit,
        }),
      },
      RUSSIAN_POST_POINTS_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Failed to load Russian Post points (${response.status})`);
    }

    const payload = (await response.json()) as {
      postOffices?: unknown[];
    };
    const postOffices = Array.isArray(payload.postOffices) ? payload.postOffices : [];
    if (postOffices.length === 0) break;

    for (const rawOffice of postOffices) {
      if (!rawOffice || typeof rawOffice !== "object") continue;
      const office = rawOffice as {
        id?: unknown;
        officeId?: unknown;
        postalCode?: unknown;
        settlement?: unknown;
        addressSource?: unknown;
        latitude?: unknown;
        longitude?: unknown;
        lat?: unknown;
        lng?: unknown;
        workingHours?: unknown;
        address?: {
          shortAddress?: unknown;
          fullAddress?: unknown;
          settlementOrCity?: unknown;
          city?: unknown;
        };
      };

      const lat =
        toFiniteCoordinate(office.latitude) ??
        toFiniteCoordinate(office.lat);
      const lng =
        toFiniteCoordinate(office.longitude) ??
        toFiniteCoordinate(office.lng);
      if (lat === null || lng === null || !isLikelyRussianCoordinate(lat, lng)) continue;

      const postalCode = normalizeTextField(office.postalCode);
      const address =
        normalizeTextField(office.addressSource) ||
        normalizeTextField(office.address?.fullAddress) ||
        normalizeTextField(office.address?.shortAddress);
      if (!address) continue;

      const city =
        normalizeTextField(office.settlement) ||
        normalizeTextField(office.address?.settlementOrCity) ||
        normalizeTextField(office.address?.city) ||
        location.city ||
        location.query;

      const officeId =
        normalizeTextField(office.officeId) || normalizeTextField(office.id);
      const id = postalCode || officeId || `${lat.toFixed(6)}:${lng.toFixed(6)}`;
      const dedupeKey = postalCode
        ? `postal:${postalCode}`
        : officeId
          ? `office:${officeId}`
          : `${lat.toFixed(6)}|${lng.toFixed(6)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      points.push({
        id,
        provider: "russian_post",
        providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
        name: postalCode ? `РћС‚РґРµР»РµРЅРёРµ в„– ${postalCode}` : "РћС‚РґРµР»РµРЅРёРµ РџРѕС‡С‚С‹ Р РѕСЃСЃРёРё",
        address,
        city,
        lat,
        lng,
        workHours: mapRussianPostWorkHoursSafe(office.workingHours),
        etaDays: 2,
        cost: 0,
      });
      const createdPoint = points[points.length - 1];
      if (createdPoint) {
        createdPoint.providerLabel = DELIVERY_PROVIDER_LABELS.russian_post;
        createdPoint.name = buildRussianPostOfficeName(postalCode);
      }
    }

    if (postOffices.length < safeLimit) {
      break;
    }
    offset += postOffices.length;
  }

  const dbfRows = await loadRussianPostDbfRows();
  if (dbfRows.length === 0) {
    return points;
  }

  const matchedDbfRows = selectRussianPostDbfRowsByLocation(
    dbfRows,
    location.query || location.city,
    location.city,
  );
  if (matchedDbfRows.length === 0) {
    return points;
  }

  const byIndex = new Map<string, DeliveryPoint>();
  const extraPoints: DeliveryPoint[] = [];
  for (const point of points) {
    if (/^\d{6}$/u.test(point.id)) {
      byIndex.set(point.id, point);
    } else {
      extraPoints.push(point);
    }
  }

  const missingRows: RussianPostDbfRow[] = [];
  for (const row of matchedDbfRows) {
    const existing = byIndex.get(row.index);
    if (existing) {
      existing.name = buildRussianPostDbfName(row);
      if (!existing.address || existing.address.length < 8) {
        existing.address = buildRussianPostDbfAddress(row, location.city);
      }
      continue;
    }
    missingRows.push(row);
  }

  const officeFetchLimit =
    Number.isFinite(RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT) &&
    RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT > 0
      ? Math.floor(RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT)
      : 1500;
  const rowsForOfficeFetch = missingRows.slice(0, officeFetchLimit);
  const unresolvedRows: RussianPostDbfRow[] = [];

  await mapWithConcurrency(
    rowsForOfficeFetch,
    RUSSIAN_POST_OFFICE_CONCURRENCY,
    async (row) => {
      const office = await loadRussianPostOfficeDetailsByIndex(row.index);
      if (!office) {
        unresolvedRows.push(row);
        return;
      }

      byIndex.set(row.index, {
        id: row.index,
        provider: "russian_post",
        providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
        name: office.name || buildRussianPostDbfName(row),
        address:
          office.address ||
          buildRussianPostDbfAddress(row, office.city || location.city),
        city: office.city || row.city || row.city1 || location.city,
        lat: office.lat,
        lng: office.lng,
        workHours: office.workHours || "По расписанию",
        etaDays: 2,
        cost: 0,
      });
    },
  );

  const geocodeLimit =
    Number.isFinite(RUSSIAN_POST_DBF_GEOCODE_LIMIT) &&
    RUSSIAN_POST_DBF_GEOCODE_LIMIT > 0
      ? Math.floor(RUSSIAN_POST_DBF_GEOCODE_LIMIT)
      : 2000;
  const rowsForGeocoding = unresolvedRows.slice(0, geocodeLimit);

  await mapWithConcurrency(
    rowsForGeocoding,
    RUSSIAN_POST_DBF_GEOCODE_CONCURRENCY,
    async (row) => {
      const locationByIndex = await geocodeRussianPostIndex(
        row.index,
        row.city || row.city1 || location.city,
      );
      if (!locationByIndex) return;

      const point: DeliveryPoint = {
        id: row.index,
        provider: "russian_post",
        providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
        name: buildRussianPostDbfName(row),
        address:
          buildRussianPostDbfAddress(row, locationByIndex.city || location.city) ||
          locationByIndex.label,
        city: row.city || row.city1 || locationByIndex.city || location.city,
        lat: locationByIndex.lat,
        lng: locationByIndex.lng,
        workHours: "По расписанию",
        etaDays: 2,
        cost: 0,
      };

      byIndex.set(row.index, point);
    },
  );

  const merged = [...byIndex.values(), ...extraPoints];
  merged.sort((a, b) => a.id.localeCompare(b.id, "ru"));
  return merged;
}

async function loadRussianPostDeliveryPointsDbf(params: {
  query: string;
  cityHint?: string;
  cursor?: number;
  limit?: number;
}): Promise<{
  points: DeliveryPoint[];
  total: number;
  nextCursor: number | null;
}> {
  const dbfRows = await loadRussianPostDbfRows();
  if (dbfRows.length === 0) {
    return { points: [], total: 0, nextCursor: null };
  }

  const matchedDbfRows = selectRussianPostDbfRowsByLocation(
    dbfRows,
    params.query,
    params.cityHint ?? "",
  );
  if (matchedDbfRows.length === 0) {
    return { points: [], total: 0, nextCursor: null };
  }

  const safeCursorRaw = Number(params.cursor ?? 0);
  const safeCursor =
    Number.isFinite(safeCursorRaw) && safeCursorRaw > 0
      ? Math.floor(safeCursorRaw)
      : 0;
  const defaultPageSize =
    Number.isFinite(RUSSIAN_POST_PAGE_SIZE_DEFAULT) && RUSSIAN_POST_PAGE_SIZE_DEFAULT > 0
      ? Math.floor(RUSSIAN_POST_PAGE_SIZE_DEFAULT)
      : 250;
  const maxPageSize =
    Number.isFinite(RUSSIAN_POST_PAGE_SIZE_MAX) && RUSSIAN_POST_PAGE_SIZE_MAX > 0
      ? Math.floor(RUSSIAN_POST_PAGE_SIZE_MAX)
      : 600;
  const requestedLimitRaw = Number(params.limit ?? defaultPageSize);
  const safeLimit =
    Number.isFinite(requestedLimitRaw) && requestedLimitRaw > 0
      ? Math.min(Math.floor(requestedLimitRaw), maxPageSize)
      : defaultPageSize;

  const start = Math.min(safeCursor, matchedDbfRows.length);
  const end = Math.min(start + safeLimit, matchedDbfRows.length);
  const rowsChunk = matchedDbfRows.slice(start, end);
  const officeFetchLimit =
    Number.isFinite(RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT) &&
    RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT > 0
      ? Math.floor(RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT)
      : 1500;
  const rowsForOfficeFetch = rowsChunk.slice(0, officeFetchLimit);

  const pointsByIndex = new Map<string, DeliveryPoint>();
  await mapWithConcurrency(
    rowsForOfficeFetch,
    RUSSIAN_POST_OFFICE_CONCURRENCY,
    async (row) => {
      const office = await loadRussianPostOfficeDetailsByIndex(row.index);
      if (!office) return;
      if (!isRussianPostOfficeType(office.typeCode || row.opsType)) return;

      pointsByIndex.set(row.index, {
        id: row.index,
        provider: "russian_post",
        providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
        name: office.name || buildRussianPostDbfName(row),
        address:
          office.address || buildRussianPostDbfAddress(row, office.city || params.cityHint || ""),
        city: office.city || row.city || row.city1 || params.cityHint || "",
        lat: office.lat,
        lng: office.lng,
        workHours: office.workHours || "По расписанию",
        etaDays: 2,
        cost: 0,
      });
    },
  );

  const points = Array.from(pointsByIndex.values()).sort((a, b) =>
    a.id.localeCompare(b.id, "ru"),
  );
  const nextCursor = end < matchedDbfRows.length ? end : null;
  return {
    points,
    total: matchedDbfRows.length,
    nextCursor,
  };
}

function formatYandexScheduleRestriction(rawRestriction: unknown): string {
  if (!rawRestriction || typeof rawRestriction !== "object") return "";

  const restriction = rawRestriction as {
    days?: unknown;
    time_from?: { hours?: unknown; minutes?: unknown };
    time_to?: { hours?: unknown; minutes?: unknown };
  };

  const days = Array.isArray(restriction.days)
    ? restriction.days
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    : [];
  const fromHours = Number(restriction.time_from?.hours);
  const fromMinutes = Number(restriction.time_from?.minutes);
  const toHours = Number(restriction.time_to?.hours);
  const toMinutes = Number(restriction.time_to?.minutes);

  if (
    !Number.isFinite(fromHours) ||
    !Number.isFinite(fromMinutes) ||
    !Number.isFinite(toHours) ||
    !Number.isFinite(toMinutes)
  ) {
    return "";
  }

  const dayLabel =
    days.length > 0
      ? `${Math.min(...days)}-${Math.max(...days)}`
      : "1-7";
  const fromLabel = `${String(fromHours).padStart(2, "0")}:${String(
    fromMinutes,
  ).padStart(2, "0")}`;
  const toLabel = `${String(toHours).padStart(2, "0")}:${String(
    toMinutes,
  ).padStart(2, "0")}`;
  return `${dayLabel} ${fromLabel}-${toLabel}`;
}

function mapYandexPickupPoints(
  rawPoints: unknown,
  location: GeocodedLocation,
): DeliveryPoint[] {
  const entries = Array.isArray(rawPoints) ? rawPoints : [];
  const points: DeliveryPoint[] = [];
  const seen = new Set<string>();

  for (const rawPoint of entries) {
    if (!rawPoint || typeof rawPoint !== "object") continue;
    const point = rawPoint as {
      id?: unknown;
      name?: unknown;
      available_for_dropoff?: unknown;
      position?: { latitude?: unknown; longitude?: unknown };
      address?: {
        full_address?: unknown;
        locality?: unknown;
      };
      schedule?: {
        restrictions?: unknown[];
      };
    };

    if (point.available_for_dropoff !== true) continue;

    const id = normalizeTextField(point.id);
    if (!id || seen.has(id)) continue;

    const lat = toFiniteCoordinate(point.position?.latitude);
    const lng = toFiniteCoordinate(point.position?.longitude);
    const address = normalizeTextField(point.address?.full_address);
    if (lat === null || lng === null || !address) continue;
    seen.add(id);

    const city =
      normalizeTextField(point.address?.locality) ||
      location.city ||
      location.query;

    const restrictions = Array.isArray(point.schedule?.restrictions)
      ? point.schedule?.restrictions ?? []
      : [];
    const workHours =
      restrictions
        .map((entry) => formatYandexScheduleRestriction(entry))
        .filter(Boolean)
        .slice(0, 3)
        .join("; ") || "По расписанию ПВЗ";

    points.push({
      id,
      provider: "yandex_pvz",
      providerLabel: DELIVERY_PROVIDER_LABELS.yandex_pvz,
      name: normalizeTextField(point.name) || "Пункт выдачи заказов Яндекса",
      address,
      city,
      lat: lat ?? 0,
      lng: lng ?? 0,
      workHours,
      etaDays: 1,
      cost: 500,
    });
  }

  return points;
}

async function loadYandexPickupPoints(
  location: GeocodedLocation,
): Promise<DeliveryPoint[]> {
  if (!YANDEX_DELIVERY_TEST_TOKEN) {
    throw new Error("Yandex delivery test token is not configured");
  }

  const response = await fetchWithTimeout(
    `${YANDEX_DELIVERY_TEST_BASE_URL.replace(/\/+$/u, "")}/api/b2b/platform/pickup-points/list`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${YANDEX_DELIVERY_TEST_TOKEN}`,
        "Accept-Language": "ru",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "pickup_point",
        payment_method: "already_paid",
        available_for_dropoff: true,
        operator_ids: ["market_l4g"],
      }),
    },
    YANDEX_DELIVERY_TEST_TIMEOUT_MS,
  );

  if (!response.ok) {
    throw new Error(`Failed to load Yandex pickup points (${response.status})`);
  }

  const payload = (await response.json()) as { points?: unknown[] };
  return mapYandexPickupPoints(payload.points, location);

  /* legacy parser (disabled, kept only for reference)
  const points: DeliveryPoint[] = [];
  const seen = new Set<string>();
  for (const rawPoint of [] as unknown[]) {
    if (!rawPoint || typeof rawPoint !== "object") continue;
    const point = rawPoint as {
      id?: unknown;
      name?: unknown;
      available_for_dropoff?: unknown;
      position?: { latitude?: unknown; longitude?: unknown };
      address?: {
        full_address?: unknown;
        locality?: unknown;
      };
      schedule?: {
        restrictions?: unknown[];
      };
    };

    if (point.available_for_dropoff !== true) continue;

    const id = normalizeTextField(point.id);
    if (!id || seen.has(id)) continue;

    const lat = toFiniteCoordinate(point.position?.latitude);
    const lng = toFiniteCoordinate(point.position?.longitude);
    const address = normalizeTextField(point.address?.full_address);
    if (lat === null || lng === null || !address) continue;
    seen.add(id);

    const city =
      normalizeTextField(point.address?.locality) ||
      location.city ||
      location.query;

    const restrictions = Array.isArray(point.schedule?.restrictions)
      ? point.schedule?.restrictions ?? []
      : [];
    const workHours =
      restrictions
        .map((entry) => formatYandexScheduleRestriction(entry))
        .filter(Boolean)
        .slice(0, 3)
        .join("; ") || "По расписанию ПВЗ";

    points.push({
      id,
      provider: "yandex_pvz",
      providerLabel: DELIVERY_PROVIDER_LABELS.yandex_pvz,
      name:
        normalizeTextField(point.name) || "Пункт выдачи заказов Яндекса",
      address,
      city,
      lat: lat ?? 0,
      lng: lng ?? 0,
      workHours,
      etaDays: 1,
      cost: 500,
    });
  }

  return points;
  */
}

type YandexRequestCreateResult = {
  requestId: string | null;
  status: string;
  sharingUrl: string | null;
};
const PICKUP_POINT_TAG_RE = /\[PICKUP_ID:([^\]]+)\]/u;
const PICKUP_PROVIDER_TAG_RE = /\[PICKUP_PROVIDER:([^\]]+)\]/u;

function createYandexDeliveryHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${YANDEX_DELIVERY_TEST_TOKEN}`,
    "Accept-Language": "ru",
    "Content-Type": "application/json",
  };
}

function formatUtcIsoWithMicros(value: Date): string {
  const base = value.toISOString().replace("Z", "");
  return `${base.replace(/\.\d{3}$/u, ".000000")}Z`;
}

async function fetchYandexRequestInfoById(
  requestId: string,
): Promise<YandexRequestCreateResult | null> {
  if (!requestId.trim()) return null;
  if (!YANDEX_DELIVERY_TEST_TOKEN) return null;

  const url = new URL(
    `${YANDEX_DELIVERY_TEST_BASE_URL.replace(/\/+$/u, "")}/api/b2b/platform/request/info`,
  );
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("slim", "true");

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "GET",
      headers: createYandexDeliveryHeaders(),
    },
    YANDEX_DELIVERY_TEST_TIMEOUT_MS,
  );

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    request_id?: unknown;
    state?: {
      status?: unknown;
    };
    sharing_url?: unknown;
  };

  return {
    requestId:
      typeof payload.request_id === "string" ? payload.request_id.trim() : null,
    status:
      payload.state && typeof payload.state.status === "string"
        ? payload.state.status.trim()
        : "CREATED",
    sharingUrl:
      typeof payload.sharing_url === "string"
        ? payload.sharing_url.trim()
        : null,
  };
}

async function createYandexDeliveryRequestForOrder(params: {
  orderPublicId: string;
  totalPrice: number;
  pickupPointId: string;
  buyerName: string;
  buyerEmail: string;
}): Promise<YandexRequestCreateResult | null> {
  if (!YANDEX_DELIVERY_TEST_TOKEN) return null;

  const now = new Date();
  const intervalFrom = new Date(now.getTime() + 10 * 60 * 1000);
  const intervalTo = new Date(intervalFrom.getTime() + 60 * 60 * 1000);

  const buyerNameParts = params.buyerName
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const firstName = buyerNameParts[0] || "Покупатель";
  const lastName = buyerNameParts.slice(1).join(" ") || "Ecomm";

  const createBody = {
    info: {
      operator_request_id: params.orderPublicId,
      merchant_id: YANDEX_DELIVERY_TEST_MERCHANT_ID,
      comment: `Order ${params.orderPublicId} (sandbox)`,
    },
    source: {
      platform_station: {
        platform_id: YANDEX_DELIVERY_TEST_SOURCE_STATION_ID,
      },
      interval_utc: {
        from: formatUtcIsoWithMicros(intervalFrom),
        to: formatUtcIsoWithMicros(intervalTo),
      },
    },
    destination: {
      type: "platform_station",
      platform_station: {
        platform_id: params.pickupPointId,
      },
      custom_location: null,
      interval_utc: null,
    },
    items: [
      {
        count: 1,
        name: `Order ${params.orderPublicId}`,
        article: params.orderPublicId,
        billing_details: {
          inn: "9715386101",
          nds: 22,
          unit_price: params.totalPrice,
          assessed_unit_price: params.totalPrice,
        },
        physical_dims: {
          dx: 10,
          dy: 10,
          dz: 10,
          predefined_volume: 20,
        },
        place_barcode: `PL-${params.orderPublicId}`,
        cargo_types: "[\"80\"]",
        fitting: false,
      },
    ],
    places: [
      {
        physical_dims: {
          weight_gross: 100,
          dx: 10,
          dy: 10,
          dz: 10,
        },
        barcode: `PL-${params.orderPublicId}`,
      },
    ],
    billing_info: {
      payment_method: "already_paid",
      delivery_cost: 0,
    },
    recipient_info: {
      first_name: firstName,
      last_name: lastName,
      phone: "+79990000000",
      email: params.buyerEmail || "buyer@example.com",
    },
    last_mile_policy: "self_pickup",
    particular_items_refuse: false,
    forbid_unboxing: false,
  };

  const createResponse = await fetchWithTimeout(
    `${YANDEX_DELIVERY_TEST_BASE_URL.replace(/\/+$/u, "")}/api/b2b/platform/request/create?send_unix=false`,
    {
      method: "POST",
      headers: createYandexDeliveryHeaders(),
      body: JSON.stringify(createBody),
    },
    YANDEX_DELIVERY_TEST_TIMEOUT_MS,
  );

  if (!createResponse.ok) {
    return null;
  }

  const createPayload = (await createResponse.json()) as {
    request_id?: unknown;
    state?: {
      status?: unknown;
    };
    sharing_url?: unknown;
  };
  const requestId =
    typeof createPayload.request_id === "string"
      ? createPayload.request_id.trim()
      : "";
  if (!requestId) return null;

  const info = await fetchYandexRequestInfoById(requestId);
  if (info) return info;

  return {
    requestId,
    status:
      createPayload.state && typeof createPayload.state.status === "string"
        ? createPayload.state.status.trim()
        : "CREATED",
    sharingUrl:
      typeof createPayload.sharing_url === "string"
        ? createPayload.sharing_url.trim()
        : null,
  };
}

function appendPickupPointMetaToAddress(
  address: string,
  pickupPointId: string | null,
  pickupProvider: DeliveryProviderCode,
): string {
  const base = address.trim();
  const pointId = (pickupPointId ?? "").trim();
  const tags: string[] = [];
  if (pointId) {
    tags.push(`[PICKUP_ID:${pointId}]`);
  }
  tags.push(`[PICKUP_PROVIDER:${pickupProvider}]`);
  const cleanBase = base
    .replace(PICKUP_POINT_TAG_RE, "")
    .replace(PICKUP_PROVIDER_TAG_RE, "")
    .trim();
  return [cleanBase, ...tags].filter(Boolean).join(" ").trim();
}

function extractPickupPointIdFromAddress(address: string | null): string {
  const raw = normalizeTextField(address);
  if (!raw) return "";
  const match = raw.match(PICKUP_POINT_TAG_RE);
  if (!match) return "";
  return String(match[1] ?? "").trim();
}

function extractPickupProviderFromAddress(address: string | null): DeliveryProviderCode {
  const raw = normalizeTextField(address);
  if (!raw) return "yandex_pvz";
  const match = raw.match(PICKUP_PROVIDER_TAG_RE);
  if (!match) return "yandex_pvz";
  return normalizePickupProvider(String(match[1] ?? "").trim());
}

function stripPickupPointTag(address: string | null): string {
  const raw = normalizeTextField(address);
  if (!raw) return "";
  return raw
    .replace(PICKUP_POINT_TAG_RE, "")
    .replace(PICKUP_PROVIDER_TAG_RE, "")
    .trim();
}

async function ensureYandexTrackingForOrders(orderIds: number[]): Promise<void> {
  if (orderIds.length === 0) return;

  const orders = await prisma.marketOrder.findMany({
    where: {
      id: { in: orderIds },
      delivery_type: "DELIVERY",
      tracking_number: null,
      status: { in: ["PAID", "PREPARED", "PROCESSING"] },
    },
    include: {
      buyer: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  for (const order of orders) {
    const pickupProvider = extractPickupProviderFromAddress(order.delivery_address);
    if (pickupProvider !== "yandex_pvz") {
      await prisma.marketOrder.update({
        where: { id: order.id },
        data: {
          tracking_provider: pickupProvider,
        },
      });
      continue;
    }

    const pickupPointId = extractPickupPointIdFromAddress(order.delivery_address);
    if (!pickupPointId) {
      continue;
    }

    let createdRequest: YandexRequestCreateResult | null = null;
    try {
      createdRequest = await createYandexDeliveryRequestForOrder({
        orderPublicId: order.public_id,
        totalPrice: order.total_price,
        pickupPointId,
        buyerName: order.buyer.name,
        buyerEmail: order.buyer.email,
      });
    } catch (error) {
      console.warn(
        `Unable to create Yandex delivery request for ${order.public_id}:`,
        error,
      );
    }

    const fallbackTrackingNumber = `YND-${order.public_id}`;
    const trackingNumber = createdRequest?.requestId || fallbackTrackingNumber;
    const trackingUrl =
      createdRequest?.sharingUrl ||
      `https://dostavka.yandex.ru/route/${encodeURIComponent(trackingNumber)}`;

    await prisma.marketOrder.update({
      where: { id: order.id },
      data: {
        tracking_provider: "yandex_pvz",
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        delivery_ext_status: createdRequest?.status || "CREATED",
      },
    });
  }
}

async function getDeliveryPoints(
  query: string,
  providerFilter: DeliveryProviderFilter = "all",
  options?: { cursor?: number; limit?: number },
): Promise<{
  location: GeocodedLocation;
  points: DeliveryPoint[];
  pagination?: {
    total: number;
    cursor: number;
    nextCursor: number | null;
    hasMore: boolean;
  };
}> {
  const normalizedQuery = query.trim();
  if (providerFilter === "russian_post") {
    const cursorRaw = Number(options?.cursor ?? 0);
    const safeCursor =
      Number.isFinite(cursorRaw) && cursorRaw > 0 ? Math.floor(cursorRaw) : 0;
    const russianPost = await loadRussianPostDeliveryPointsDbf({
      query: normalizedQuery,
      cityHint: normalizedQuery,
      cursor: safeCursor,
      limit: options?.limit,
    });

    if (russianPost.total === 0) {
      throw new Error("Delivery points not available");
    }

    return {
      location: {
        query: normalizedQuery,
        label: normalizedQuery,
        city: russianPost.points[0]?.city || normalizedQuery,
        lat: russianPost.points[0]?.lat ?? 55.751574,
        lng: russianPost.points[0]?.lng ?? 37.573856,
      },
      points: russianPost.points,
      pagination: {
        total: russianPost.total,
        cursor: safeCursor,
        nextCursor: russianPost.nextCursor,
        hasMore: russianPost.nextCursor !== null,
      },
    };
  }
  const geocodeQuery = /^\d{6}$/u.test(normalizedQuery)
    ? `Россия, ${normalizedQuery}`
    : normalizedQuery;
  const location = await geocodeLocationByYandex(geocodeQuery);
  if (!location) {
    throw new Error("Location not found");
  }

  const loaders: Array<{
    provider: DeliveryProviderCode;
    run: () => Promise<DeliveryPoint[]>;
  }> = [];

  if (providerFilter === "all" || providerFilter === "yandex_pvz") {
    loaders.push({
      provider: "yandex_pvz",
      run: () => loadYandexPickupPoints(location),
    });
  }

  if (providerFilter === "all") {
    loaders.push({
      provider: "russian_post",
      run: async () =>
        (
          await loadRussianPostDeliveryPointsDbf({
            query: normalizedQuery,
            cityHint: location.city,
            cursor: 0,
            limit: Math.min(
              Number.isFinite(RUSSIAN_POST_PAGE_SIZE_DEFAULT)
                ? Math.floor(RUSSIAN_POST_PAGE_SIZE_DEFAULT)
                : 250,
              300,
            ),
          })
        ).points,
    });
  }

  const results = await Promise.allSettled(loaders.map((loader) => loader.run()));

  const points: DeliveryPoint[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const loader = loaders[index];
    if (result.status === "fulfilled") {
      points.push(...result.value);
      continue;
    }
    if (loader.provider === "yandex_pvz") {
      console.warn("Failed to load Yandex pickup points:", result.reason);
      continue;
    }
    console.warn("Failed to load Russian Post pickup points:", result.reason);
  }

  if (points.length === 0) {
    throw new Error("Delivery points not available");
  }

  return {
    location,
    points,
  };
}

function normalizeTextField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseLegacyBuilding(value: string): {
  house: string;
  apartment: string;
  entrance: string;
} {
  const raw = value.trim();
  if (!raw) {
    return {
      house: "",
      apartment: "",
      entrance: "",
    };
  }

  const houseMatch = raw.match(/(?:^|,\s*)(?:Рґ(?:РѕРј)?\.?)\s*([^,]+)/iu);
  const apartmentMatch = raw.match(/(?:^|,\s*)(?:РєРІ(?:Р°СЂС‚РёСЂР°)?\.?)\s*([^,]+)/iu);
  const entranceMatch = raw.match(/(?:^|,\s*)(?:РїРѕРґ[СЉСЊ]?РµР·Рґ)\s*([^,]+)/iu);

  const fallbackHouse = raw.split(",")[0]?.trim() ?? "";
  return {
    house: (houseMatch?.[1] ?? fallbackHouse).trim(),
    apartment: (apartmentMatch?.[1] ?? "").trim(),
    entrance: (entranceMatch?.[1] ?? "").trim(),
  };
}

function buildAddressFullAddress(parts: {
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  entrance?: string;
}): string {
  const region = normalizeTextField(parts.region);
  const city = normalizeTextField(parts.city);
  const street = normalizeTextField(parts.street);
  const house = normalizeTextField(parts.house);
  const apartment = normalizeTextField(parts.apartment);
  const entrance = normalizeTextField(parts.entrance);

  const housePart = house ? `Рґ. ${house}` : "";
  const entrancePart = entrance ? `РїРѕРґСЉРµР·Рґ ${entrance}` : "";
  const apartmentPart = apartment ? `РєРІ. ${apartment}` : "";

  return [region, city, street, housePart, entrancePart, apartmentPart]
    .filter(Boolean)
    .join(", ");
}

function buildAddressBuildingLabel(parts: {
  house?: string;
  apartment?: string;
  entrance?: string;
}): string {
  const house = normalizeTextField(parts.house);
  const apartment = normalizeTextField(parts.apartment);
  const entrance = normalizeTextField(parts.entrance);

  return [
    house ? `Рґ. ${house}` : "",
    entrance ? `РїРѕРґСЉРµР·Рґ ${entrance}` : "",
    apartment ? `РєРІ. ${apartment}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function mapUserAddressToDto(address: UserAddress) {
  const fullAddress =
    normalizeTextField(address.full_address) ||
    buildAddressFullAddress({
      region: address.region,
      city: address.city,
      street: address.street,
      house: address.house,
      apartment: address.apartment ?? "",
      entrance: address.entrance ?? "",
    });

  return {
    id: String(address.id),
    name: address.label,
    label: address.label,
    fullAddress,
    region: address.region,
    city: address.city,
    street: address.street,
    house: address.house,
    apartment: address.apartment ?? "",
    entrance: address.entrance ?? "",
    building: buildAddressBuildingLabel({
      house: address.house,
      apartment: address.apartment ?? "",
      entrance: address.entrance ?? "",
    }),
    postalCode: address.postal_code,
    lat: address.lat ?? null,
    lon: address.lon ?? null,
    isDefault: address.is_default,
  };
}

function extractPrimaryCityFromAddresses(addresses: Array<{ city: string }>): string | null {
  const city = addresses[0]?.city?.trim();
  return city || null;
}

profileRouter.get("/me", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const user = await prisma.appUser.findUnique({
      where: { id: session.user.id },
      include: {
        addresses: {
          orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        },
        wishlist_items: {
          include: {
            listing: {
              include: {
                seller: {
                  include: {
                    addresses: {
                      select: {
                        city: true,
                      },
                      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                      take: 1,
                    },
                  },
                },
                images: {
                  orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                },
              },
            },
          },
          orderBy: [{ added_at: "desc" }],
        },
        orders_as_buyer: {
          include: {
            seller: {
              include: {
                addresses: {
                  select: {
                    city: true,
                  },
                  orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                  take: 1,
                },
              },
            },
            items: {
              include: {
                listing: {
                  select: {
                    public_id: true,
                  },
                },
              },
            },
          },
          orderBy: [{ created_at: "desc" }],
        },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Type for AppUser with included relations
    type UserWithRelations = AppUser & {
      addresses: UserAddress[];
      orders_as_buyer: (MarketOrder & {
        seller: AppUser & { addresses: Array<{ city: string }> };
        items: (MarketOrderItem & { listing: { public_id: string } | null })[];
      })[];
      wishlist_items: (WishlistItem & {
        listing: MarketplaceListing & {
          seller: AppUser & { addresses: Array<{ city: string }> };
          images: ListingImage[];
        };
      })[];
    };

    const userWithRelations = user as UserWithRelations;

    res.json({
      user: {
        id: userWithRelations.id,
        public_id: userWithRelations.public_id,
        role: toClientRole(userWithRelations.role),
        firstName: userWithRelations.first_name ?? "",
        lastName: userWithRelations.last_name ?? "",
        displayName: userWithRelations.display_name ?? userWithRelations.name,
        name: userWithRelations.name,
        email: userWithRelations.email,
        avatar: userWithRelations.avatar,
        city: extractPrimaryCityFromAddresses(userWithRelations.addresses),
        joinDate: userWithRelations.joined_at.getFullYear().toString(),
      },
      addresses: userWithRelations.addresses.map((address) => ({
        ...mapUserAddressToDto(address),
      })),
      orders: userWithRelations.orders_as_buyer.map(
        (order) => ({
          id: String(order.id),
          orderNumber: `#${order.public_id}`,
          date: order.created_at,
          status: toProfileOrderStatus(order.status),
          total: order.total_price,
          deliveryDate: toLocalizedDeliveryDate(order.created_at),
          deliveryAddress:
            stripPickupPointTag(order.delivery_address) || "РђРґСЂРµСЃ РЅРµ СѓРєР°Р·Р°РЅ",
          deliveryCost: order.delivery_cost,
          discount: order.discount,
          seller: {
            name: order.seller.name,
            avatar: order.seller.avatar,
            phone: order.seller.phone ?? "",
            address: `${extractPrimaryCityFromAddresses(order.seller.addresses) ?? "Р“РѕСЂРѕРґ РЅРµ СѓРєР°Р·Р°РЅ"}`,
            workingHours: "РїРЅ вЂ” РІСЃ: 9:00-21:00",
          },
          items: order.items.map((item) => ({
            id: String(item.id),
            listingPublicId: item.listing?.public_id ?? "",
            name: item.name,
            image: item.image ?? "",
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      ),
      wishlist: userWithRelations.wishlist_items.map(
        (item) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location: extractPrimaryCityFromAddresses(item.listing.seller.addresses) ?? "",
          condition: toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        }),
      ),
    });
  } catch (error) {
    console.error("Error fetching profile data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.patch("/me", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as {
      firstName?: unknown;
      lastName?: unknown;
      displayName?: unknown;
      email?: unknown;
      oldPassword?: unknown;
      newPassword?: unknown;
    };

    const user = await prisma.appUser.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : undefined;
    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : undefined;
    const displayName =
      typeof body.displayName === "string"
        ? body.displayName.trim()
        : undefined;
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : undefined;
    const oldPassword =
      typeof body.oldPassword === "string" ? body.oldPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (newPassword && oldPassword !== user.password) {
      res.status(400).json({ error: "РЎС‚Р°СЂС‹Р№ РїР°СЂРѕР»СЊ СѓРєР°Р·Р°РЅ РЅРµРІРµСЂРЅРѕ" });
      return;
    }

    const updated = await prisma.appUser.update({
      where: { id: session.user.id },
      data: {
        first_name: firstName ?? undefined,
        last_name: lastName ?? undefined,
        display_name: displayName ?? undefined,
        email: email ?? undefined,
        name:
          displayName ||
          [firstName, lastName].filter(Boolean).join(" ") ||
          undefined,
        password: newPassword || undefined,
      },
      select: {
        id: true,
        public_id: true,
        role: true,
        first_name: true,
        last_name: true,
        display_name: true,
        email: true,
        name: true,
      },
    });

    res.json({
      success: true,
      user: {
        id: updated.id,
        public_id: updated.public_id,
        role: toClientRole(updated.role),
        firstName: updated.first_name ?? "",
        lastName: updated.last_name ?? "",
        displayName: updated.display_name ?? updated.name,
        email: updated.email,
      },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.get("/addresses", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const addresses = await prisma.userAddress.findMany({
      where: { user_id: session.user.id },
      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
    });

    res.json(
      addresses.map((address) => mapUserAddressToDto(address)),
    );
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post("/addresses", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as {
      name?: unknown;
      label?: unknown;
      fullAddress?: unknown;
      region?: unknown;
      city?: unknown;
      street?: unknown;
      house?: unknown;
      apartment?: unknown;
      entrance?: unknown;
      postalCode?: unknown;
      lat?: unknown;
      lon?: unknown;
      isDefault?: unknown;
      // legacy payload compatibility
      cityName?: unknown;
      regionName?: unknown;
      building?: unknown;
    };

    const label = normalizeTextField(body.name ?? body.label);
    const fullAddress = normalizeTextField(body.fullAddress);
    const region = normalizeTextField(body.region ?? body.regionName);
    const city = normalizeTextField(body.city ?? body.cityName);
    const street = normalizeTextField(body.street);
    const postalCode = normalizeTextField(body.postalCode);
    const legacyBuilding = normalizeTextField(body.building);

    const parsedLegacyBuilding = parseLegacyBuilding(legacyBuilding);
    const house = normalizeTextField(body.house) || parsedLegacyBuilding.house;
    const apartment =
      normalizeTextField(body.apartment) || parsedLegacyBuilding.apartment;
    const entrance =
      normalizeTextField(body.entrance) || parsedLegacyBuilding.entrance;

    const lat =
      typeof body.lat === "number" && Number.isFinite(body.lat)
        ? body.lat
        : null;
    const lon =
      typeof body.lon === "number" && Number.isFinite(body.lon)
        ? body.lon
        : null;
    const isDefault = Boolean(body.isDefault);

    const normalizedFullAddress =
      fullAddress ||
      buildAddressFullAddress({
        region,
        city,
        street,
        house,
        apartment,
        entrance,
      }) ||
      [region, city, street, house].filter(Boolean).join(", ");

    if (!label) {
      res.status(400).json({ error: "Address label is required" });
      return;
    }

    if (!normalizedFullAddress) {
      res.status(400).json({ error: "Address text is required" });
      return;
    }

    if (lat === null || lon === null) {
      res.status(400).json({ error: "Address coordinates are required" });
      return;
    }

    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { user_id: session.user.id },
        data: { is_default: false },
      });
    }

    const created = await prisma.userAddress.create({
      data: {
        user_id: session.user.id,
        label,
        full_address: normalizedFullAddress,
        region: region || "",
        city: city || "",
        street: street || "",
        house: house || "",
        apartment,
        entrance,
        postal_code: postalCode || "",
        lat,
        lon,
        is_default: isDefault,
      },
    });

    res.status(201).json(mapUserAddressToDto(created));
  } catch (error) {
    console.error("Error creating address:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.patch("/addresses/:id", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid address id" });
      return;
    }

    const existing = await prisma.userAddress.findFirst({
      where: { id, user_id: session.user.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    const body = (req.body ?? {}) as {
      name?: unknown;
      label?: unknown;
      fullAddress?: unknown;
      region?: unknown;
      city?: unknown;
      street?: unknown;
      house?: unknown;
      apartment?: unknown;
      entrance?: unknown;
      postalCode?: unknown;
      lat?: unknown;
      lon?: unknown;
      isDefault?: unknown;
      // legacy payload compatibility
      building?: unknown;
    };

    const hasIsDefault = typeof body.isDefault === "boolean";
    const isDefault = hasIsDefault ? Boolean(body.isDefault) : undefined;
    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { user_id: session.user.id },
        data: { is_default: false },
      });
    }

    const legacyBuilding = normalizeTextField(body.building);
    const parsedLegacyBuilding = parseLegacyBuilding(legacyBuilding);

    const updated = await prisma.userAddress.update({
      where: { id: existing.id },
      data: {
        label: normalizeTextField(body.name ?? body.label) || undefined,
        full_address: normalizeTextField(body.fullAddress) || undefined,
        region: normalizeTextField(body.region) || undefined,
        city: normalizeTextField(body.city) || undefined,
        street:
          typeof body.street === "string" ? body.street.trim() : undefined,
        house:
          normalizeTextField(body.house) ||
          parsedLegacyBuilding.house ||
          undefined,
        apartment:
          normalizeTextField(body.apartment) ||
          parsedLegacyBuilding.apartment ||
          undefined,
        entrance:
          normalizeTextField(body.entrance) ||
          parsedLegacyBuilding.entrance ||
          undefined,
        postal_code:
          typeof body.postalCode === "string"
            ? body.postalCode.trim()
            : undefined,
        lat:
          typeof body.lat === "number" && Number.isFinite(body.lat)
            ? body.lat
            : undefined,
        lon:
          typeof body.lon === "number" && Number.isFinite(body.lon)
            ? body.lon
            : undefined,
        is_default: isDefault,
      },
    });

    res.json(mapUserAddressToDto(updated));
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.delete("/addresses/:id", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid address id" });
      return;
    }

    const existing = await prisma.userAddress.findFirst({
      where: { id, user_id: session.user.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    if (existing.is_default) {
      res.status(400).json({ error: "Default address cannot be deleted" });
      return;
    }

    await prisma.userAddress.delete({
      where: { id: existing.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post(
  "/addresses/:id/default",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid address id" });
        return;
      }

      const existing = await prisma.userAddress.findFirst({
        where: { id, user_id: session.user.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      await prisma.$transaction([
        prisma.userAddress.updateMany({
          where: { user_id: session.user.id },
          data: { is_default: false },
        }),
        prisma.userAddress.update({
          where: { id: existing.id },
          data: { is_default: true },
        }),
      ]);

      res.json({ success: true });
    } catch (error) {
      console.error("Error changing default address:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.get("/location/suggest", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const rawQuery =
      typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : 8;
    const limit =
      Number.isInteger(limitRaw) && limitRaw > 0
        ? Math.min(limitRaw, 10)
        : 8;

    if (!rawQuery) {
      res.json({ query: "", suggestions: [] });
      return;
    }

    const suggestions = await loadLocationSuggestionsByYandex(rawQuery, limit);
    res.json({
      query: rawQuery,
      suggestions,
    });
  } catch (error) {
    console.error("Error loading location suggestions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.get("/delivery-points", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const locationQuery =
      typeof req.query.city === "string" ? req.query.city.trim() : "";
    if (!locationQuery) {
      res.status(400).json({ error: "City query is required" });
      return;
    }

    const providerFilter = parseDeliveryProviderFilter(req.query.provider);
    const cursorRaw =
      typeof req.query.cursor === "string" ? Number(req.query.cursor) : 0;
    const limitRaw =
      typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const cursor =
      Number.isFinite(cursorRaw) && cursorRaw > 0 ? Math.floor(cursorRaw) : 0;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.floor(limitRaw)
        : undefined;
    const { location, points, pagination } = await getDeliveryPoints(
      locationQuery,
      providerFilter,
      { cursor, limit },
    );

    res.json({
      city: location.city,
      location: {
        label: location.label,
        lat: location.lat,
        lng: location.lng,
      },
      providers: DELIVERY_PROVIDERS,
      activeProvider: providerFilter === "all" ? "yandex_pvz" : providerFilter,
      points,
      pagination: pagination ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Location not found") {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    if (
      error instanceof Error &&
      error.message === "Delivery points not available"
    ) {
      res.status(503).json({ error: "Delivery points are temporarily unavailable" });
      return;
    }
    console.error("Error loading delivery points:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post(
  "/payments/yookassa/webhook",
  async (req: Request, res: Response) => {
    try {
      const payload = (req.body ?? {}) as YooKassaWebhookPayload;
      const event =
        typeof payload.event === "string" ? payload.event.trim() : "";
      const paymentId =
        payload.object && typeof payload.object.id === "string"
          ? payload.object.id.trim()
          : "";
      const webhookStatus =
        payload.object && typeof payload.object.status === "string"
          ? payload.object.status.trim()
          : "";

      if (!paymentId) {
        res.status(200).json({ success: true, ignored: true });
        return;
      }

      let effectiveStatus = webhookStatus;
      try {
        const remotePayment = await fetchYooKassaPaymentById(paymentId);
        if (remotePayment?.status) {
          effectiveStatus = remotePayment.status;
        }
      } catch (error) {
        // Keep webhook fast and idempotent even if YooKassa lookup is temporarily unavailable.
        console.warn("Unable to validate YooKassa payment in webhook:", error);
      }

      const isSucceeded =
        event === "payment.succeeded" || effectiveStatus === "succeeded";
      const isCanceled =
        event === "payment.canceled" || effectiveStatus === "canceled";

      if (!isSucceeded && !isCanceled) {
        res.status(200).json({ success: true, ignored: true });
        return;
      }

      const txStatus = isSucceeded ? "SUCCESS" : "FAILED";
      const orderStatus = isSucceeded ? "PAID" : "CANCELLED";
      let affectedOrderIds: number[] = [];

      await prisma.$transaction(async (tx) => {
        const matched = await tx.platformTransaction.findMany({
          where: {
            payment_provider: "YOOMONEY",
            OR: [
              { payment_intent_id: paymentId },
              { payment_intent_id: { startsWith: `${paymentId}:` } },
            ],
          },
          select: {
            id: true,
            order_id: true,
          },
        });

        if (matched.length === 0) {
          return;
        }

        const txIds = matched.map((row) => row.id);
        const orderIds = matched.map((row) => row.order_id);
        affectedOrderIds = orderIds;

        await tx.platformTransaction.updateMany({
          where: {
            id: { in: txIds },
            status: { in: ["HELD", "PENDING"] },
          },
          data: {
            status: txStatus,
          },
        });

        await tx.marketOrder.updateMany({
          where: {
            id: { in: orderIds },
            status: "CREATED",
          },
          data: {
            status: orderStatus,
          },
        });
      });

      if (isSucceeded && affectedOrderIds.length > 0) {
        await ensureYandexTrackingForOrders(affectedOrderIds);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error in YooKassa webhook:", error);
      // Return 200 to avoid aggressive retries on transient local issues in test mode.
      res.status(200).json({ success: false });
    }
  },
);

profileRouter.get("/orders/payment-status", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const rawOrderIds = Array.isArray(req.query.orderIds)
      ? req.query.orderIds.join(",")
      : typeof req.query.orderIds === "string"
        ? req.query.orderIds
        : "";

    const orderPublicIds = [
      ...new Set(
        rawOrderIds
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];

    if (orderPublicIds.length === 0) {
      res.status(400).json({ error: "orderIds query is required" });
      return;
    }

    let orders = await prisma.marketOrder.findMany({
      where: {
        buyer_id: session.user.id,
        public_id: { in: orderPublicIds },
      },
      include: {
        transactions: {
          orderBy: [{ created_at: "desc" }],
          take: 1,
        },
      },
    });

    const latestTransactions = orders
      .map((order) => order.transactions[0] ?? null)
      .filter(
        (
          tx,
        ): tx is NonNullable<typeof tx> =>
          tx !== null &&
          tx.payment_provider === "YOOMONEY" &&
          (tx.status === "HELD" || tx.status === "PENDING"),
      );

    if (latestTransactions.length > 0) {
      const groupedByBasePaymentId = new Map<
        string,
        Array<{ txId: number; orderId: number }>
      >();

      for (const tx of latestTransactions) {
        const basePaymentId = extractYooKassaPaymentBaseId(tx.payment_intent_id);
        if (!basePaymentId) {
          continue;
        }
        const current = groupedByBasePaymentId.get(basePaymentId) ?? [];
        current.push({ txId: tx.id, orderId: tx.order_id });
        groupedByBasePaymentId.set(basePaymentId, current);
      }

      const succeededTxIds: number[] = [];
      const succeededOrderIds: number[] = [];
      const failedTxIds: number[] = [];
      const failedOrderIds: number[] = [];

      const lookupResults = await Promise.all(
        Array.from(groupedByBasePaymentId.entries()).map(
          async ([basePaymentId, refs]) => {
            try {
              const payment = await fetchYooKassaPaymentById(basePaymentId);
              return {
                refs,
                status: payment?.status ?? "",
              };
            } catch {
              return {
                refs,
                status: "",
              };
            }
          },
        ),
      );

      for (const result of lookupResults) {
        if (result.status === "succeeded") {
          for (const ref of result.refs) {
            succeededTxIds.push(ref.txId);
            succeededOrderIds.push(ref.orderId);
          }
          continue;
        }
        if (result.status === "canceled") {
          for (const ref of result.refs) {
            failedTxIds.push(ref.txId);
            failedOrderIds.push(ref.orderId);
          }
        }
      }

      if (succeededTxIds.length > 0 || failedTxIds.length > 0) {
        await prisma.$transaction(async (tx) => {
          if (succeededTxIds.length > 0) {
            await tx.platformTransaction.updateMany({
              where: {
                id: { in: succeededTxIds },
                status: { in: ["HELD", "PENDING"] },
              },
              data: {
                status: "SUCCESS",
              },
            });
            await tx.marketOrder.updateMany({
              where: {
                id: { in: succeededOrderIds },
                status: "CREATED",
              },
              data: {
                status: "PAID",
              },
            });
          }

          if (failedTxIds.length > 0) {
            await tx.platformTransaction.updateMany({
              where: {
                id: { in: failedTxIds },
                status: { in: ["HELD", "PENDING"] },
              },
              data: {
                status: "FAILED",
              },
            });
            await tx.marketOrder.updateMany({
              where: {
                id: { in: failedOrderIds },
                status: "CREATED",
              },
              data: {
                status: "CANCELLED",
              },
            });
          }
        });

        if (succeededOrderIds.length > 0) {
          await ensureYandexTrackingForOrders(succeededOrderIds);
        }

        orders = await prisma.marketOrder.findMany({
          where: {
            buyer_id: session.user.id,
            public_id: { in: orderPublicIds },
          },
          include: {
            transactions: {
              orderBy: [{ created_at: "desc" }],
              take: 1,
            },
          },
        });
      }
    }

    const paymentOrders = orders.map((order) => ({
      orderId: order.public_id,
      orderStatus: order.status,
      paymentStatus: order.transactions[0]?.status ?? null,
      paymentProvider: order.transactions[0]?.payment_provider ?? null,
      paymentIntentId: order.transactions[0]?.payment_intent_id ?? null,
    }));

    const hasFailed = paymentOrders.some(
      (order) =>
        order.orderStatus === "CANCELLED" ||
        order.paymentStatus === "FAILED" ||
        order.paymentStatus === "CANCELLED",
    );
    const isPaid =
      paymentOrders.length > 0 &&
      paymentOrders.every(
        (order) =>
          order.orderStatus === "PAID" || order.paymentStatus === "SUCCESS",
      );
    const summary = hasFailed ? "failed" : isPaid ? "paid" : "pending";

    res.json({
      summary,
      orders: paymentOrders,
    });
  } catch (error) {
    console.error("Error fetching order payment status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post("/orders", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const body = (req.body ?? {}) as {
      items?: unknown;
      addressId?: unknown;
      customAddress?: unknown;
      pickupPointId?: unknown;
      pickupPointProvider?: unknown;
      deliveryType?: unknown;
      paymentMethod?: unknown;
    };

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const parsedItems = rawItems
      .map((item) => item as { listingId?: unknown; quantity?: unknown })
      .map((item: { listingId?: unknown; quantity?: unknown }) => ({
        listingId: typeof item.listingId === "string" ? item.listingId : "",
        quantity: Number(item.quantity ?? 0),
      }))
      .filter(
        (item) =>
          item.listingId &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      );

    if (parsedItems.length === 0) {
      res
        .status(400)
        .json({ error: "РљРѕСЂР·РёРЅР° РїСѓСЃС‚Р° РёР»Рё СЃРѕРґРµСЂР¶РёС‚ РЅРµРєРѕСЂСЂРµРєС‚РЅС‹Рµ РїРѕР·РёС†РёРё" });
      return;
    }

    const listingPublicIds = [
      ...new Set(
        parsedItems.map((item: { listingId: string }) => item.listingId),
      ),
    ];
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        public_id: { in: listingPublicIds },
        moderation_status: "APPROVED",
        status: "ACTIVE",
      },
      include: {
        images: {
          select: { url: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          take: 1,
        },
      },
    });

    if (listings.length !== listingPublicIds.length) {
      res
        .status(400)
        .json({ error: "РќРµРєРѕС‚РѕСЂС‹Рµ С‚РѕРІР°СЂС‹ РЅРµРґРѕСЃС‚СѓРїРЅС‹ РґР»СЏ Р·Р°РєР°Р·Р°" });
      return;
    }

    const listingByPublicId = new Map<string, {
      id: number;
      public_id: string;
      seller_id: number;
      title: string;
      images: Array<{ url: string }>;
      price: number;
    }>(
      listings.map((listing: {
        id: number;
        public_id: string;
        seller_id: number;
        title: string;
        images: Array<{ url: string }>;
        price: number;
      }) => [listing.public_id, listing]),
    );
    const groupedBySeller = new Map<
      number,
      Array<{
        listing_id: number;
        name: string;
        image: string | null;
        price: number;
        quantity: number;
      }>
    >();

    for (const item of parsedItems) {
      const listing = listingByPublicId.get(item.listingId);
      if (!listing) {
        res.status(400).json({ error: `РўРѕРІР°СЂ ${item.listingId} РЅРµ РЅР°Р№РґРµРЅ` });
        return;
      }

      const current = groupedBySeller.get(listing.seller_id) ?? [];
      current.push({
        listing_id: listing.id,
        name: listing.title,
        image: listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
        price: listing.price,
        quantity: item.quantity,
      });
      groupedBySeller.set(listing.seller_id, current);
    }

    const deliveryType =
      body.deliveryType === "pickup" ? "PICKUP" : "DELIVERY";
    const requestedPaymentMethod =
      typeof body.paymentMethod === "string" ? body.paymentMethod : "card";
    if (requestedPaymentMethod !== "card" && requestedPaymentMethod !== "sbp") {
      res.status(400).json({ error: "Unsupported payment method" });
      return;
    }

    const customAddress =
      typeof body.customAddress === "string" ? body.customAddress.trim() : "";
    const pickupPointId =
      typeof body.pickupPointId === "string" ? body.pickupPointId.trim() : "";
    const pickupPointProvider = normalizePickupProvider(body.pickupPointProvider);
    const addressId = Number(body.addressId ?? 0);

    let deliveryAddress = customAddress;
    if (!deliveryAddress && Number.isInteger(addressId) && addressId > 0) {
      const selectedAddress = await prisma.userAddress.findFirst({
        where: {
          id: addressId,
          user_id: session.user.id,
        },
      });
      if (selectedAddress) {
        deliveryAddress =
          normalizeTextField(selectedAddress.full_address) ||
          buildAddressFullAddress({
            region: selectedAddress.region,
            city: selectedAddress.city,
            street: selectedAddress.street,
            house: selectedAddress.house,
            apartment: selectedAddress.apartment ?? "",
            entrance: selectedAddress.entrance ?? "",
          });
      }
    }

    if (!deliveryAddress) {
      const defaultAddress = await prisma.userAddress.findFirst({
        where: {
          user_id: session.user.id,
          is_default: true,
        },
      });
      if (defaultAddress) {
        deliveryAddress =
          normalizeTextField(defaultAddress.full_address) ||
          buildAddressFullAddress({
            region: defaultAddress.region,
            city: defaultAddress.city,
            street: defaultAddress.street,
            house: defaultAddress.house,
            apartment: defaultAddress.apartment ?? "",
            entrance: defaultAddress.entrance ?? "",
          });
      }
    }

    if (deliveryType === "DELIVERY" && !deliveryAddress) {
      res.status(400).json({ error: "РЈРєР°Р¶РёС‚Рµ Р°РґСЂРµСЃ РґРѕСЃС‚Р°РІРєРё" });
      return;
    }

    if (deliveryType === "DELIVERY" && !pickupPointId) {
      res.status(400).json({ error: "Pickup point id is required for delivery" });
      return;
    }

    const preparedOrders = Array.from(groupedBySeller.entries()).map(
      ([sellerId, items], index) => {
        const subtotal = items.reduce(
          (sum: number, item: { price: number; quantity: number }) =>
            sum + item.price * item.quantity,
          0,
        );
        const deliveryCost = deliveryType === "DELIVERY" ? 500 : 0;
        const discount = 0;
        const totalPrice = subtotal + deliveryCost - discount;
        const publicId = `ORD-${Date.now()}-${index + 1}`;
        return {
          sellerId,
          items,
          subtotal,
          deliveryCost,
          discount,
          totalPrice,
          publicId,
        };
      },
    );

    const totalAmount = preparedOrders.reduce(
      (sum, order) => sum + order.totalPrice,
      0,
    );
    const yookassaPayment = await createYooKassaPayment({
      amountRub: totalAmount,
      description: `РћРїР»Р°С‚Р° Р·Р°РєР°Р·Р° РІ Ecomm (${preparedOrders.length} С€С‚.)`,
      metadata: {
        source: "avito-2",
        buyer_id: String(session.user.id),
        orders_count: String(preparedOrders.length),
      },
      paymentMethod: requestedPaymentMethod,
    });

    if (!yookassaPayment?.confirmation?.confirmation_url) {
      throw new Error(
        "YooKassa did not return confirmation URL for redirect payment",
      );
    }

    const createdOrders = await prisma.$transaction(async (tx) => {
      const result: Array<{
        db_id: number;
        order_id: string;
        total_price: number;
      }> = [];

      let sequence = 0;
      for (const preparedOrder of preparedOrders) {
        sequence += 1;
        const order = await tx.marketOrder.create({
          data: {
            public_id: preparedOrder.publicId,
            buyer_id: session.user.id,
            seller_id: preparedOrder.sellerId,
            status: "CREATED",
            delivery_type: deliveryType,
            delivery_address:
              deliveryType === "DELIVERY" ? deliveryAddress : "РЎР°РјРѕРІС‹РІРѕР·",
            total_price: preparedOrder.totalPrice,
            delivery_cost: preparedOrder.deliveryCost,
            discount: preparedOrder.discount,
            items: {
              create: preparedOrder.items.map((item) => ({
                listing_id: item.listing_id,
                name: item.name,
                image: item.image,
                price: item.price,
                quantity: item.quantity,
              })),
            },
          },
        });

        if (deliveryType === "DELIVERY") {
          await tx.marketOrder.update({
            where: { id: order.id },
            data: {
              delivery_address: appendPickupPointMetaToAddress(
                order.delivery_address ?? deliveryAddress,
                pickupPointId,
                pickupPointProvider,
              ),
            },
          });
        }

        const commissionRate = 3.5;
        const commission = Math.round(
          (preparedOrder.totalPrice * commissionRate) / 100,
        );
        const paymentIntentIdBase =
          yookassaPayment?.id ?? `pay_${Date.now()}`;
        const paymentIntentId = `${paymentIntentIdBase}:${sequence}`;
        await tx.platformTransaction.create({
          data: {
            public_id: `TXN-${Date.now()}-${sequence}`,
            order_id: order.id,
            buyer_id: session.user.id,
            seller_id: preparedOrder.sellerId,
            amount: preparedOrder.totalPrice,
            status: "HELD",
            commission_rate: commissionRate,
            commission,
            payment_provider: "YOOMONEY",
            payment_intent_id: paymentIntentId,
          },
        });

        result.push({
          db_id: order.id,
          order_id: order.public_id,
          total_price: preparedOrder.totalPrice,
        });
      }

      return result;
    });

    res.status(201).json({
      success: true,
      orders: createdOrders.map((order) => ({
        order_id: order.order_id,
        total_price: order.total_price,
      })),
      total: createdOrders.reduce(
        (sum: number, order: { total_price: number }) => sum + order.total_price,
        0,
      ),
      payment: {
        provider: "yoomoney",
        paymentId: yookassaPayment?.id ?? null,
        status: yookassaPayment?.status ?? null,
        confirmationUrl:
          yookassaPayment?.confirmation?.confirmation_url ?? null,
      },
    });
  } catch (error) {
    console.error("Error creating orders:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message.includes("YooKassa") || message.includes("YooMoney")) {
      res.status(502).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.get("/orders", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const orders = await prisma.marketOrder.findMany({
      where: { buyer_id: session.user.id },
      include: {
        seller: {
          include: {
            addresses: {
              select: {
                city: true,
              },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        items: true,
      },
      orderBy: [{ created_at: "desc" }],
    });

    res.json(
      orders.map(
        (
          order: MarketOrder & { seller: AppUser & { addresses: Array<{ city: string }> }; items: MarketOrderItem[] },
        ) => ({
          id: String(order.id),
          orderNumber: `#${order.public_id}`,
          date: order.created_at,
          status: toProfileOrderStatus(order.status),
          total: order.total_price,
          deliveryDate: toLocalizedDeliveryDate(order.created_at),
          deliveryAddress:
            stripPickupPointTag(order.delivery_address) || "РђРґСЂРµСЃ РЅРµ СѓРєР°Р·Р°РЅ",
          deliveryCost: order.delivery_cost,
          discount: order.discount,
          seller: {
            name: order.seller.name,
            avatar: order.seller.avatar,
            phone: order.seller.phone ?? "",
            address: `${extractPrimaryCityFromAddresses(order.seller.addresses) ?? "Р“РѕСЂРѕРґ РЅРµ СѓРєР°Р·Р°РЅ"}`,
            workingHours: "РїРЅ вЂ” РІСЃ: 9:00-21:00",
          },
          items: order.items.map((item: MarketOrderItem) => ({
            id: String(item.id),
            name: item.name,
            image: item.image ?? "",
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.get("/wishlist", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [
      ROLE_BUYER,
      ROLE_SELLER,
      ROLE_ADMIN,
    ]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const wishlist = await prisma.wishlistItem.findMany({
      where: { user_id: session.user.id },
      include: {
        listing: {
          include: {
            seller: {
              include: {
                addresses: {
                  select: {
                    city: true,
                  },
                  orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                  take: 1,
                },
              },
            },
            images: {
              orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            },
          },
        },
      },
      orderBy: [{ added_at: "desc" }],
    });

    res.json(
      wishlist.map(
        (
          item: WishlistItem & {
            listing: MarketplaceListing & {
              seller: AppUser & { addresses: Array<{ city: string }> };
              images: ListingImage[];
            };
          },
        ) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location: extractPrimaryCityFromAddresses(item.listing.seller.addresses) ?? "",
          condition: toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post(
  "/wishlist/:listingPublicId",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { listingPublicId } = req.params;
      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true, seller_id: true },
      });
      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      await prisma.wishlistItem.upsert({
        where: {
          user_id_listing_id: {
            user_id: session.user.id,
            listing_id: listing.id,
          },
        },
        create: {
          user_id: session.user.id,
          listing_id: listing.id,
        },
        update: {},
      });

      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error adding wishlist item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.delete(
  "/wishlist/:listingPublicId",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { listingPublicId } = req.params;
      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true, seller_id: true },
      });
      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      await prisma.wishlistItem.deleteMany({
        where: {
          user_id: session.user.id,
          listing_id: listing.id,
        },
      });


      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting wishlist item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.post(
  "/partnership-requests",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        sellerType?: unknown;
        name?: unknown;
        email?: unknown;
        contact?: unknown;
        link?: unknown;
        category?: unknown;
        inn?: unknown;
        geography?: unknown;
        socialProfile?: unknown;
        credibility?: unknown;
        whyUs?: unknown;
      };

      const sellerTypeRaw =
        typeof body.sellerType === "string" ? body.sellerType : "company";
      const sellerType = sellerTypeRaw === "private" ? "PRIVATE" : "COMPANY";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const contact =
        typeof body.contact === "string" ? body.contact.trim() : "";
      const link = typeof body.link === "string" ? body.link.trim() : "";
      const category =
        typeof body.category === "string" ? body.category.trim() : "";
      const whyUs = typeof body.whyUs === "string" ? body.whyUs.trim() : "";

      if (!name || !email || !contact || !link || !category || !whyUs) {
        res.status(400).json({ error: "Р—Р°РїРѕР»РЅРёС‚Рµ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рµ РїРѕР»СЏ Р·Р°СЏРІРєРё" });
        return;
      }

      const created = await prisma.partnershipRequest.create({
        data: {
          public_id: `PRQ-${Date.now()}`,
          user_id: session.user.id,
          seller_type: sellerType,
          name,
          email,
          contact,
          link,
          category,
          inn: typeof body.inn === "string" ? body.inn.trim() : null,
          geography:
            typeof body.geography === "string" ? body.geography.trim() : null,
          social_profile:
            typeof body.socialProfile === "string"
              ? body.socialProfile.trim()
              : null,
          credibility:
            typeof body.credibility === "string"
              ? body.credibility.trim()
              : null,
          why_us: whyUs,
        },
      });

      res.status(201).json({
        success: true,
        request_id: created.public_id,
      });
    } catch (error) {
      console.error("Error creating partnership request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.post(
  "/listings/:listingPublicId/review",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_BUYER]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { listingPublicId } = req.params;
      const body = (req.body ?? {}) as { rating?: unknown; comment?: unknown };
      const rating = Number(body.rating);
      const comment =
        typeof body.comment === "string" ? body.comment.trim() : "";

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        res.status(400).json({ error: "Rating must be an integer from 1 to 5" });
        return;
      }

      if (comment.length < 3) {
        res.status(400).json({ error: "Comment is too short" });
        return;
      }

      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true, seller_id: true },
      });

      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      // Verify the user has purchased this item
      const orderCount = await prisma.marketOrder.count({
        where: {
          buyer_id: session.user.id,
          status: "COMPLETED",
          items: {
            some: {
              listing_id: listing.id,
            },
          },
        },
      });

      if (orderCount === 0) {
        res.status(403).json({ error: "You can only review items you have purchased." });
        return;
      }

      // Verify the user has not already reviewed this item
      const existingReview = await prisma.listingReview.findUnique({
        where: {
          listing_id_author_id: {
            listing_id: listing.id,
            author_id: session.user.id,
          },
        },
      });

      if (existingReview) {
        res.status(409).json({ error: "You have already reviewed this item." });
        return;
      }

      const newReview = await prisma.listingReview.create({
        data: {
          listing_id: listing.id,
          author_id: session.user.id,
          rating,
          comment,
        },
        include: {
          author: {
            select: {
              display_name: true,
              avatar: true,
            },
          },
        },
      });

      // Recalculate average rating for the seller and sync it to all seller listings.
      const sellerReviews = await prisma.listingReview.findMany({
        where: {
          listing: {
            seller_id: listing.seller_id,
          },
        },
        select: {
          rating: true,
        },
      });

      const sellerRating =
        sellerReviews.length === 0
          ? 0
          : Number(
              (
                sellerReviews.reduce((sum, item) => sum + item.rating, 0) /
                sellerReviews.length
              ).toFixed(1),
            );

      await prisma.marketplaceListing.updateMany({
        where: { seller_id: listing.seller_id },
        data: {
          rating: sellerRating,
        },
      });

      res.status(201).json({
        id: String(newReview.id),
        author: newReview.author.display_name ?? "РђРЅРѕРЅРёРј",
        rating: newReview.rating,
        date: newReview.created_at,
        comment: newReview.comment,
        avatar: newReview.author.avatar,
      });
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.get("/notifications", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      return res.status(session.status).json({ error: session.message });
    }

    const notifications = await prisma.notification.findMany({
      where: { user_id: session.user.id },
      orderBy: { created_at: "desc" },
    });

    const unreadCount = await prisma.notification.count({
      where: { user_id: session.user.id, is_read: false },
    });

    return res.json({
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        url: n.target_url,
        isRead: n.is_read,
        date: n.created_at,
      })),
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.patch("/notifications/mark-as-read", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      return res.status(session.status).json({ error: session.message });
    }

    await prisma.notification.updateMany({
      where: { user_id: session.user.id, is_read: false },
      data: { is_read: true },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { profileRouter };
