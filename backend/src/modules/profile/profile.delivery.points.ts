import { promises as fs } from "fs";
import {
  DELIVERY_PROVIDER_LABELS,
  DeliveryProviderCode,
  DeliveryProviderFilter,
  YANDEX_DELIVERY_BASE_URL,
  YANDEX_DELIVERY_OPERATOR_IDS,
  YANDEX_DELIVERY_TIMEOUT_MS,
  YANDEX_DELIVERY_TOKEN,
  fetchWithTimeout,
} from "./profile.delivery.shared";
import { normalizeTextField } from "./profile.shared";

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
  source?: string;
  sourceExternalId?: string;
  verificationLevel?: "provider_feed" | "indexed_by_yandex";
};

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
const YANDEX_ORG_SEARCH_BASE_URL =
  process.env.YANDEX_ORG_SEARCH_BASE_URL?.trim() ||
  "https://search-maps.yandex.ru/v1/";
const YANDEX_ORG_SEARCH_API_KEY =
  process.env.YANDEX_ORG_SEARCH_API_KEY?.trim() ||
  process.env.VITE_YANDEX_ORG_SEARCH_API_KEY?.trim() ||
  "";
const YANDEX_ORG_SEARCH_TIMEOUT_MS = Number(
  process.env.YANDEX_ORG_SEARCH_TIMEOUT_MS ?? "7000",
);
const YANDEX_ORG_SEARCH_RESULTS_PER_QUERY = Number(
  process.env.YANDEX_ORG_SEARCH_RESULTS_PER_QUERY ?? "18",
);
const RUSSIAN_POST_DBF_PATH =
  process.env.RUSSIAN_POST_DBF_PATH?.trim() || "backend/data/PIndx05.dbf";
const RUSSIAN_POST_DBF_ENCODING =
  process.env.RUSSIAN_POST_DBF_ENCODING?.trim() || "ibm866";
const RUSSIAN_POST_DBF_CITY_MATCH_LIMIT = Number(
  process.env.RUSSIAN_POST_DBF_CITY_MATCH_LIMIT ?? "5000",
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
  region: string;
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
  tags?: unknown[];
  uri?: string;
  value?: string;
  displayName?: string;
};

const russianPostFallbackPointCache = new Map<string, DeliveryPoint | null>();
let yandexOrgSearchKeyRejected = false;

type DemoProviderCode = Extract<
  DeliveryProviderCode,
  "ozon" | "wildberries" | "cdek"
>;

type DemoProviderSearchConfig = {
  provider: DemoProviderCode;
  queryPhrases: string[];
  positivePatterns: RegExp[];
  negativePatterns: RegExp[];
};

type YandexOrganizationFeature = {
  properties?: {
    name?: unknown;
    description?: unknown;
    uri?: unknown;
    CompanyMetaData?: {
      id?: unknown;
      name?: unknown;
      address?: unknown;
      Address?: {
        formatted?: unknown;
        postal_code?: unknown;
        Components?: unknown;
      };
      Categories?: Array<{ class?: unknown; name?: unknown }>;
      Hours?: { text?: unknown };
    };
  };
  geometry?: {
    coordinates?: unknown;
  };
};

const DEMO_PROVIDER_SEARCH_CONFIGS: Record<
  DemoProviderCode,
  DemoProviderSearchConfig
> = {
  ozon: {
    provider: "ozon",
    queryPhrases: ["Ozon пункт выдачи", "Озон пункт выдачи"],
    positivePatterns: [/\bozon\b/iu, /озон/iu],
    negativePatterns: [
      /склад/iu,
      /сортиров/iu,
      /даркстор/iu,
      /офис/iu,
      /фулфилл/iu,
      /логист/iu,
    ],
  },
  wildberries: {
    provider: "wildberries",
    queryPhrases: ["Wildberries пункт выдачи", "Вайлдберриз пункт выдачи"],
    positivePatterns: [/\bwildberries\b/iu, /вайлдбер/iu, /\bwb\b/iu],
    negativePatterns: [
      /склад/iu,
      /сортиров/iu,
      /логист/iu,
      /офис/iu,
      /фулфилл/iu,
    ],
  },
  cdek: {
    provider: "cdek",
    queryPhrases: ["СДЭК пункт выдачи", "CDEK пункт выдачи"],
    positivePatterns: [/\bcdek\b/iu, /сдэк/iu],
    negativePatterns: [
      /склад/iu,
      /сортиров/iu,
      /логист/iu,
      /фулфилл/iu,
      /офис(?!\s+выдачи)/iu,
    ],
  },
};

function isAdministrativeNoiseName(value: string): boolean {
  return (
    /федеральн\p{L}*\s+округ/iu.test(value) ||
    /муниципальн\p{L}*\s+образован\p{L}*/iu.test(value)
  );
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

function isPointWithinBounds(
  lat: number,
  lng: number,
  bounds: GeoBounds | null | undefined,
): boolean {
  if (!bounds) return true;
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

function extractYandexCity(components: unknown): string {
  if (!Array.isArray(components)) return "";

  const entries = components.filter(
    (item): item is { kind?: unknown; name?: unknown } =>
      Boolean(item) && typeof item === "object",
  );

  const locality = entries.find(
    (entry) =>
      typeof entry.kind === "string" &&
      entry.kind === "locality" &&
      typeof entry.name === "string" &&
      entry.name.trim(),
  );
  if (locality && typeof locality.name === "string") {
    return locality.name.trim();
  }

  const provinces = entries
    .filter(
      (entry) =>
        typeof entry.kind === "string" &&
        entry.kind === "province" &&
        typeof entry.name === "string" &&
        entry.name.trim(),
    )
    .map((entry) => String(entry.name).trim())
    .filter((name) => !isAdministrativeNoiseName(name));
  if (provinces.length > 0) {
    return provinces[provinces.length - 1];
  }

  const area = entries.find(
    (entry) =>
      typeof entry.kind === "string" &&
      entry.kind === "area" &&
      typeof entry.name === "string" &&
      entry.name.trim() &&
      !isAdministrativeNoiseName(entry.name),
  );
  if (area && typeof area.name === "string") {
    return area.name.trim();
  }

  return "";
}

function extractYandexRegion(components: unknown): string {
  if (!Array.isArray(components)) return "";

  const entries = components.filter(
    (item): item is { kind?: unknown; name?: unknown } =>
      Boolean(item) && typeof item === "object",
  );
  const provinces = entries
    .filter(
      (entry) =>
        typeof entry.kind === "string" &&
        entry.kind === "province" &&
        typeof entry.name === "string" &&
        entry.name.trim(),
    )
    .map((entry) => String(entry.name).trim())
    .filter((name) => !isAdministrativeNoiseName(name));

  if (provinces.length > 0) {
    return provinces[0];
  }

  const area = entries.find(
    (entry) =>
      typeof entry.kind === "string" &&
      entry.kind === "area" &&
      typeof entry.name === "string" &&
      entry.name.trim(),
  );
  return area && typeof area.name === "string" ? area.name.trim() : "";
}

function extractLocationSuggestionText(
  value: LocationSuggestion["title"] | LocationSuggestion["subtitle"] | unknown,
): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { text?: unknown }).text === "string"
  ) {
    return ((value as { text: string }).text || "").trim();
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

export async function loadLocationSuggestionsByYandex(
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
                boundedBy?: {
                  Envelope?: { lowerCorner?: string; upperCorner?: string };
                };
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
      const parsedRegion = extractYandexRegion(components);

      const label =
        geoObject?.metaDataProperty?.GeocoderMetaData?.text?.trim() ||
        geoObject?.description?.trim() ||
        geoObject?.name?.trim() ||
        normalizedQuery;
      const bounds = parseYandexBounds(
        geoObject?.boundedBy ??
          geoObject?.metaDataProperty?.GeocoderMetaData?.boundedBy,
      );

      return {
        query: normalizedQuery,
        label,
        city: parsedCity || normalizedQuery,
        region: parsedRegion || parsedCity || normalizedQuery,
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

function normalizeProviderMatchText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/ё/giu, "е")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function buildEffectiveBounds(
  viewportBounds: GeoBounds | null | undefined,
  locationBounds: GeoBounds | null | undefined,
): GeoBounds | null {
  return viewportBounds ?? locationBounds ?? null;
}

function buildDemoQueryCandidates(
  provider: DemoProviderCode,
  query: string,
  location: GeocodedLocation,
): string[] {
  const config = DEMO_PROVIDER_SEARCH_CONFIGS[provider];
  const queryText = String(query ?? "").trim();
  const locationHints = Array.from(
    new Set(
      [
        queryText,
        location.label,
        location.city,
        location.region && location.city && location.region !== location.city
          ? `${location.city}, ${location.region}`
          : "",
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );

  const queryAlreadyMentionsProvider = config.positivePatterns.some((pattern) =>
    pattern.test(queryText),
  );
  const queries = new Set<string>();
  if (queryAlreadyMentionsProvider) {
    queries.add(queryText);
  }
  for (const phrase of config.queryPhrases) {
    for (const hint of locationHints.slice(0, 2)) {
      queries.add(`${phrase} ${hint}`.trim());
    }
  }
  return Array.from(queries).slice(0, 4);
}

function extractCoordinatesFromOrgFeature(feature: YandexOrganizationFeature): {
  lat: number;
  lng: number;
} | null {
  const raw = feature.geometry?.coordinates;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const lng = Number(raw[0]);
  const lat = Number(raw[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function computeStablePointId(seed: string): string {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return `demo_${Math.abs(hash)}`;
}

function matchesDemoProviderFeature(
  provider: DemoProviderCode,
  feature: YandexOrganizationFeature | LocationSuggestion,
): boolean {
  const config = DEMO_PROVIDER_SEARCH_CONFIGS[provider];
  const orgFeature = "properties" in feature ? feature : null;
  const suggestion = orgFeature ? null : (feature as LocationSuggestion);
  const title = normalizeProviderMatchText(
    orgFeature
      ? orgFeature.properties?.name
      : extractLocationSuggestionText(suggestion?.title),
  );
  const description = normalizeProviderMatchText(
    orgFeature
      ? orgFeature.properties?.description
      : extractLocationSuggestionText(suggestion?.subtitle),
  );
  const companyMeta = orgFeature?.properties?.CompanyMetaData;
  const address = normalizeProviderMatchText(
    orgFeature
      ? companyMeta?.Address?.formatted || companyMeta?.address
      : suggestion?.address?.formatted_address,
  );
  const categories = normalizeProviderMatchText(
    Array.isArray(companyMeta?.Categories)
      ? companyMeta?.Categories.map((category) => category?.name).join(" ")
      : "",
  );
  const combined = [title, description, address, categories].filter(Boolean).join(" ");
  if (!combined) return false;
  if (!config.positivePatterns.some((pattern) => pattern.test(combined))) {
    return false;
  }
  return !config.negativePatterns.some((pattern) => pattern.test(combined));
}

async function searchOrganizationsByYandex(params: {
  text: string;
  bounds?: GeoBounds | null;
  skip?: number;
  results?: number;
}): Promise<YandexOrganizationFeature[]> {
  if (!YANDEX_ORG_SEARCH_API_KEY || yandexOrgSearchKeyRejected) {
    return [];
  }

  try {
    const url = new URL(YANDEX_ORG_SEARCH_BASE_URL);
    url.searchParams.set("apikey", YANDEX_ORG_SEARCH_API_KEY);
    url.searchParams.set("text", params.text);
    url.searchParams.set("type", "biz");
    url.searchParams.set("lang", "ru_RU");
    const results =
      Number.isFinite(params.results) && Number(params.results) > 0
        ? Math.min(Math.floor(Number(params.results)), 50)
        : Math.min(Math.max(YANDEX_ORG_SEARCH_RESULTS_PER_QUERY, 1), 50);
    url.searchParams.set("results", String(results));
    const skip =
      Number.isFinite(params.skip) && Number(params.skip) > 0
        ? Math.floor(Number(params.skip))
        : 0;
    if (skip > 0) {
      url.searchParams.set("skip", String(skip));
    }

    if (params.bounds) {
      url.searchParams.set(
        "bbox",
        `${params.bounds.minLng},${params.bounds.minLat}~${params.bounds.maxLng},${params.bounds.maxLat}`,
      );
      url.searchParams.set("rspn", "1");
    }

    const response = await fetchWithTimeout(
      url.toString(),
      { method: "GET" },
      YANDEX_ORG_SEARCH_TIMEOUT_MS,
    );
    if (response.status === 403) {
      yandexOrgSearchKeyRejected = true;
      console.warn(
        "Yandex Organization Search key was rejected. Demo provider points will use fallback sources only.",
      );
      return [];
    }
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { features?: unknown[] };
    if (!Array.isArray(payload.features)) {
      return [];
    }

    return payload.features.filter(
      (item): item is YandexOrganizationFeature =>
        Boolean(item) && typeof item === "object",
    );
  } catch {
    return [];
  }
}

function mapOrgFeatureToDeliveryPoint(
  provider: DemoProviderCode,
  feature: YandexOrganizationFeature,
): DeliveryPoint | null {
  const coords = extractCoordinatesFromOrgFeature(feature);
  if (!coords) return null;

  const companyMeta = feature.properties?.CompanyMetaData;
  const address = normalizeTextField(
    companyMeta?.Address?.formatted || companyMeta?.address,
  );
  if (!address) return null;

  const name =
    normalizeTextField(companyMeta?.name) ||
    normalizeTextField(feature.properties?.name);
  if (!name) return null;

  const addressComponents = companyMeta?.Address?.Components;
  const city = extractYandexCity(addressComponents) || normalizeTextField(feature.properties?.description);
  const externalId =
    normalizeTextField(companyMeta?.id) ||
    normalizeTextField(feature.properties?.uri) ||
    computeStablePointId(`${provider}|${name}|${coords.lat}|${coords.lng}`);

  return {
    id: externalId,
    provider,
    providerLabel: DELIVERY_PROVIDER_LABELS[provider],
    name,
    address,
    city: city || address,
    lat: coords.lat,
    lng: coords.lng,
    workHours: normalizeTextField(companyMeta?.Hours?.text) || "По расписанию",
    etaDays: 2,
    cost: 0,
    source: "yandex_org_search",
    sourceExternalId: externalId,
    verificationLevel: "indexed_by_yandex",
  };
}

async function loadDemoProviderPointsViaSuggestFallback(params: {
  provider: DemoProviderCode;
  query: string;
  location: GeocodedLocation;
  bounds?: GeoBounds | null;
}): Promise<DeliveryPoint[]> {
  const pointsByKey = new Map<string, DeliveryPoint>();
  for (const searchQuery of buildDemoQueryCandidates(
    params.provider,
    params.query,
    params.location,
  )) {
    const suggestions = await loadLocationSuggestionsByYandex(searchQuery, 10);
    for (const suggestion of suggestions) {
      if (!matchesDemoProviderFeature(params.provider, suggestion)) {
        continue;
      }
      const geocodeTarget =
        normalizeTextField(suggestion.uri) ||
        normalizeTextField(suggestion.address?.formatted_address) ||
        normalizeTextField(suggestion.value) ||
        [
          extractLocationSuggestionText(suggestion.title),
          extractLocationSuggestionText(suggestion.subtitle),
        ]
          .filter(Boolean)
          .join(", ");
      if (!geocodeTarget) continue;
      const geocoded = await geocodeLocationByYandex(geocodeTarget);
      if (!geocoded) continue;
      if (!isPointWithinBounds(geocoded.lat, geocoded.lng, params.bounds)) {
        continue;
      }

      const title = extractLocationSuggestionText(suggestion.title);
      const key =
        normalizeTextField(suggestion.uri) ||
        computeStablePointId(
          `${params.provider}|${title}|${geocoded.lat}|${geocoded.lng}`,
        );
      if (pointsByKey.has(key)) continue;

      pointsByKey.set(key, {
        id: key,
        provider: params.provider,
        providerLabel: DELIVERY_PROVIDER_LABELS[params.provider],
        name: title || DELIVERY_PROVIDER_LABELS[params.provider],
        address:
          normalizeTextField(suggestion.address?.formatted_address) ||
          geocoded.label ||
          params.location.label,
        city: geocoded.city || params.location.city || params.query,
        lat: geocoded.lat,
        lng: geocoded.lng,
        workHours: "По расписанию",
        etaDays: 2,
        cost: 0,
        source: "yandex_suggest_fallback",
        sourceExternalId: key,
        verificationLevel: "indexed_by_yandex",
      });
    }
  }

  return Array.from(pointsByKey.values());
}

async function loadDemoProviderPoints(params: {
  provider: DemoProviderCode;
  query: string;
  location: GeocodedLocation;
  bounds?: GeoBounds | null;
}): Promise<DeliveryPoint[]> {
  const pointsByKey = new Map<string, DeliveryPoint>();

  for (const searchQuery of buildDemoQueryCandidates(
    params.provider,
    params.query,
    params.location,
  )) {
    const features = await searchOrganizationsByYandex({
      text: searchQuery,
      bounds: params.bounds,
      results: YANDEX_ORG_SEARCH_RESULTS_PER_QUERY,
    });
    for (const feature of features) {
      if (!matchesDemoProviderFeature(params.provider, feature)) {
        continue;
      }
      const point = mapOrgFeatureToDeliveryPoint(params.provider, feature);
      if (!point) continue;
      if (!isPointWithinBounds(point.lat, point.lng, params.bounds)) {
        continue;
      }
      pointsByKey.set(`${params.provider}:${point.sourceExternalId || point.id}`, point);
    }
  }

  if (pointsByKey.size > 0) {
    return Array.from(pointsByKey.values());
  }

  return loadDemoProviderPointsViaSuggestFallback(params);
}

function toFiniteCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

let russianPostDbfRowsCache: RussianPostDbfRow[] | null = null;
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
  "федеральный",
  "округ",
  "муниципальное",
  "образование",
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
  "\u0444\u0435\u0434\u0435\u0440\u0430\u043b\u044c\u043d\u044b\u0439",
  "\u043e\u043a\u0440\u0443\u0433",
  "\u043c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b\u044c\u043d\u043e\u0435",
  "\u043e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u043d\u0438\u0435",
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
  regionHint = "",
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
  const regionHintTokens = tokenize(regionHint);
  const primaryTokens = Array.from(
    new Set(queryTokens.length > 0 ? queryTokens : hintTokens),
  );
  const regionTokens = Array.from(
    new Set([...regionHintTokens, ...queryTokens, ...hintTokens]),
  );
  if (primaryTokens.length === 0 && regionTokens.length === 0) {
    return [];
  }

  const exactCityMatches: RussianPostDbfRow[] = [];
  const cityContainsMatches: RussianPostDbfRow[] = [];
  const regionMatches: RussianPostDbfRow[] = [];
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

    const hasExactCity = primaryTokens.some(
      (token) => city === token || city1 === token,
    );
    if (hasExactCity) {
      exactCityMatches.push(row);
      continue;
    }

    const hasCityContains = primaryTokens.some(
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

    const hasRegionMatch = regionTokens.some(
      (token) =>
        region === token ||
        region.startsWith(`${token} `) ||
        region.includes(` ${token} `) ||
        region.endsWith(` ${token}`) ||
        region.includes(token),
    );
    if (hasRegionMatch) {
      regionMatches.push(row);
      continue;
    }

    const hasAreaMatch = primaryTokens.some(
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
        : regionMatches.length > 0
          ? regionMatches
        : allowAreaFallback
          ? areaMatches
          : [];

  const uniqueByIndex = new Map<string, RussianPostDbfRow>();
  for (const row of matched) {
    if (!uniqueByIndex.has(row.index)) {
      uniqueByIndex.set(row.index, row);
    }
  }

  const normalizedCityHint = normalizeSearchToken(cityHint);
  const normalizedRegionHint = normalizeSearchToken(regionHint);
  const normalizedQueryTokenSet = new Set(primaryTokens);
  const normalizedRegionTokenSet = new Set(regionTokens);
  const deduped = Array.from(uniqueByIndex.values())
    .map((row) => {
      const city = normalizeSearchToken(row.city);
      const city1 = normalizeSearchToken(row.city1);
      const region = normalizeSearchToken(row.region);
      const opsName = normalizeSearchToken(row.opsName);
      let score = 0;

      if ([...normalizedQueryTokenSet].some((token) => city === token || city1 === token)) {
        score += 1000;
      } else if (
        [...normalizedQueryTokenSet].some(
          (token) => city.includes(token) || city1.includes(token),
        )
      ) {
        score += 500;
      }

      if ([...normalizedRegionTokenSet].some((token) => region === token)) {
        score += 300;
      } else if ([...normalizedRegionTokenSet].some((token) => region.includes(token))) {
        score += 150;
      }

      if (normalizedCityHint) {
        if (city === normalizedCityHint || city1 === normalizedCityHint) {
          score += 120;
        } else if (city.includes(normalizedCityHint) || city1.includes(normalizedCityHint)) {
          score += 60;
        }
      }

      if (normalizedRegionHint) {
        if (region === normalizedRegionHint) {
          score += 80;
        } else if (region.includes(normalizedRegionHint)) {
          score += 40;
        }
      }

      if (opsName === normalizedCityHint) {
        score += 40;
      }
      if (normalizedQuery && opsName.includes(normalizeSearchToken(normalizedQuery))) {
        score += 30;
      }

      return { row, score };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.row.index.localeCompare(right.row.index, "ru"),
    )
    .map((entry) => entry.row);
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
      russianPostOfficeDetailsCache.set(index, null);
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
      russianPostOfficeDetailsCache.set(index, null);
      return null;
    }

    const lat = toFiniteCoordinate(office.latitude);
    const lng = toFiniteCoordinate(office.longitude);
    if (lat === null || lng === null || !isLikelyRussianCoordinate(lat, lng)) {
      russianPostOfficeDetailsCache.set(index, null);
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

function buildRussianPostSuggestQueries(
  row: RussianPostDbfRow,
  cityHint: string,
  regionHint: string,
): string[] {
  const localityCandidates = [
    cleanRussianPostText(cityHint),
    cleanRussianPostText(row.city),
    cleanRussianPostText(row.city1),
    cleanRussianPostText(row.region),
  ].filter(Boolean);

  const locality = localityCandidates[0] || cleanRussianPostText(row.region);
  const region = cleanRussianPostText(regionHint) || cleanRussianPostText(row.region);
  return Array.from(
    new Set(
      [
        locality && region
          ? `Почта России ${row.index} ${locality} ${region}`
          : "",
        locality ? `Почта России ${row.index} ${locality}` : "",
        locality && region
          ? `Отделение почтовой связи № ${row.index} ${locality} ${region}`
          : "",
        locality ? `Отделение почтовой связи № ${row.index} ${locality}` : "",
        `Почта России ${row.index}`,
        `Отделение почтовой связи № ${row.index}`,
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function isMatchingRussianPostSuggestion(
  row: RussianPostDbfRow,
  suggestion: LocationSuggestion,
): boolean {
  const title = extractLocationSuggestionText(suggestion.title).toLowerCase();
  const subtitle = extractLocationSuggestionText(suggestion.subtitle).toLowerCase();
  const formattedAddress = normalizeTextField(suggestion.address?.formatted_address).toLowerCase();
  const tags = Array.isArray(suggestion.tags)
    ? suggestion.tags
        .map((tag) => normalizeTextField(tag).toLowerCase())
        .filter(Boolean)
    : [];
  const hasIndex =
    title.includes(row.index) ||
    subtitle.includes(row.index) ||
    formattedAddress.includes(row.index);
  const hasPostOfficeTag =
    tags.includes("post office") ||
    tags.includes("office service") ||
    title.includes("почтов") ||
    subtitle.includes("почтов");

  return hasIndex && hasPostOfficeTag;
}

async function loadRussianPostFallbackPoint(
  row: RussianPostDbfRow,
  cityHint: string,
  regionHint: string,
): Promise<DeliveryPoint | null> {
  if (russianPostFallbackPointCache.has(row.index)) {
    return russianPostFallbackPointCache.get(row.index) ?? null;
  }

  const geocodeQueries = new Set<string>();
  for (const query of buildRussianPostSuggestQueries(row, cityHint, regionHint)) {
    const suggestions = await loadLocationSuggestionsByYandex(query, 5);
    for (const suggestion of suggestions) {
      if (!isMatchingRussianPostSuggestion(row, suggestion)) {
        continue;
      }
      const formattedAddress = normalizeTextField(
        suggestion.address?.formatted_address,
      );
      if (!formattedAddress) {
        continue;
      }
      geocodeQueries.add(formattedAddress);
    }
  }

  const fallbackAddress = buildRussianPostDbfAddress(
    row,
    cityHint || row.city || row.city1 || "",
  );
  if (fallbackAddress) {
    geocodeQueries.add(fallbackAddress);
  }

  for (const query of geocodeQueries) {
    const geocoded = await geocodeLocationByYandex(query);
    if (!geocoded || !isLikelyRussianCoordinate(geocoded.lat, geocoded.lng)) {
      continue;
    }

    const point: DeliveryPoint = {
      id: row.index,
      provider: "russian_post",
      providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
      name: buildRussianPostDbfName(row),
      address: query,
      city: geocoded.city || row.city || row.city1 || cityHint || "",
      lat: geocoded.lat,
      lng: geocoded.lng,
      workHours: "По расписанию",
      etaDays: 2,
      cost: 0,
      source: "russian_post_existing",
      sourceExternalId: row.index,
      verificationLevel: "provider_feed",
    };
    russianPostFallbackPointCache.set(row.index, point);
    return point;
  }

  russianPostFallbackPointCache.set(row.index, null);
  return null;
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

async function loadRussianPostDeliveryPointsDbf(params: {
  query: string;
  cityHint?: string;
  regionHint?: string;
  locationBounds?: GeoBounds;
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
    params.regionHint ?? "",
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
  const officeFetchLimit =
    Number.isFinite(RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT) &&
    RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT > 0
      ? Math.floor(RUSSIAN_POST_DBF_OFFICE_FETCH_LIMIT)
      : 1500;
  const scanWindow = Math.min(
    matchedDbfRows.length - start,
    officeFetchLimit,
    Math.max(safeLimit * 20, safeLimit),
  );
  const end = Math.min(start + scanWindow, matchedDbfRows.length);
  const rowsForOfficeFetch = matchedDbfRows.slice(start, end);
  const rowOrderByIndex = new Map(
    rowsForOfficeFetch.map((row, index) => [row.index, index]),
  );

  const pointsByIndex = new Map<string, DeliveryPoint>();
  await mapWithConcurrency(
    rowsForOfficeFetch,
    RUSSIAN_POST_OFFICE_CONCURRENCY,
    async (row) => {
      const office = await loadRussianPostOfficeDetailsByIndex(row.index);
      if (office) {
        if (!isRussianPostOfficeType(office.typeCode || row.opsType)) return;

        pointsByIndex.set(row.index, {
          id: row.index,
          provider: "russian_post",
          providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
          name: office.name || buildRussianPostDbfName(row),
          address:
            office.address ||
            buildRussianPostDbfAddress(row, office.city || params.cityHint || ""),
          city: office.city || row.city || row.city1 || params.cityHint || "",
          lat: office.lat,
          lng: office.lng,
          workHours: office.workHours || "По расписанию",
          etaDays: 2,
          cost: 0,
          source: "russian_post_existing",
          sourceExternalId: row.index,
          verificationLevel: "provider_feed",
        });
        if (
          !isPointWithinBounds(
            office.lat,
            office.lng,
            params.locationBounds,
          )
        ) {
          pointsByIndex.delete(row.index);
        }
        return;
      }

      const fallbackPoint = await loadRussianPostFallbackPoint(
        row,
        params.cityHint ?? "",
        params.regionHint ?? "",
      );
      if (
        fallbackPoint &&
        isPointWithinBounds(
          fallbackPoint.lat,
          fallbackPoint.lng,
          params.locationBounds,
        )
      ) {
        pointsByIndex.set(row.index, fallbackPoint);
      }
    },
  );

  const points = Array.from(pointsByIndex.values())
    .sort((a, b) => {
      const orderDiff =
        (rowOrderByIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rowOrderByIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER);
      return orderDiff || a.id.localeCompare(b.id, "ru");
    })
    .slice(0, safeLimit);
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
      available_for_pickup?: unknown;
      position?: { latitude?: unknown; longitude?: unknown };
      address?: {
        full_address?: unknown;
        locality?: unknown;
      };
      schedule?: {
        restrictions?: unknown[];
      };
    };

    const canUseForPickup =
      point.available_for_dropoff === true || point.available_for_pickup === true;
    if (!canUseForPickup) continue;

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
      source: "yandex_delivery_existing",
      sourceExternalId: id,
      verificationLevel: "provider_feed",
    });
  }

  return points;
}

async function loadYandexPickupPoints(
  location: GeocodedLocation,
): Promise<DeliveryPoint[]> {
  if (!YANDEX_DELIVERY_TOKEN) {
    throw new Error(
      "Yandex delivery token is not configured (YANDEX_DELIVERY_TOKEN)",
    );
  }

  const runRequest = async (
    includeOperatorIds: boolean,
    availabilityMode: "pickup" | "dropoff" | "any",
  ): Promise<DeliveryPoint[]> => {
    const body: Record<string, unknown> = {
      type: "pickup_point",
      payment_method: "already_paid",
    };
    if (availabilityMode === "pickup") {
      body.available_for_pickup = true;
    } else if (availabilityMode === "dropoff") {
      body.available_for_dropoff = true;
    }
    if (includeOperatorIds && YANDEX_DELIVERY_OPERATOR_IDS.length > 0) {
      body.operator_ids = YANDEX_DELIVERY_OPERATOR_IDS;
    }

    const response = await fetchWithTimeout(
      `${YANDEX_DELIVERY_BASE_URL.replace(/\/+$/u, "")}/api/b2b/platform/pickup-points/list`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${YANDEX_DELIVERY_TOKEN}`,
          "Accept-Language": "ru",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      YANDEX_DELIVERY_TIMEOUT_MS,
    );

    if (!response.ok) {
      throw new Error(`Failed to load Yandex pickup points (${response.status})`);
    }

    const payload = (await response.json()) as { points?: unknown[] };
    return mapYandexPickupPoints(payload.points, location);
  };

  const attempts: Array<{
    includeOperatorIds: boolean;
    availabilityMode: "pickup" | "dropoff" | "any";
    label: string;
  }> = [
    {
      includeOperatorIds: true,
      availabilityMode: "pickup",
      label: "operator_ids + available_for_pickup",
    },
    {
      includeOperatorIds: false,
      availabilityMode: "pickup",
      label: "available_for_pickup",
    },
    {
      includeOperatorIds: true,
      availabilityMode: "dropoff",
      label: "operator_ids + available_for_dropoff",
    },
    {
      includeOperatorIds: false,
      availabilityMode: "dropoff",
      label: "available_for_dropoff",
    },
    {
      includeOperatorIds: false,
      availabilityMode: "any",
      label: "without availability filter",
    },
  ];

  let lastError: unknown = null;
  for (const attempt of attempts) {
    if (
      attempt.includeOperatorIds &&
      YANDEX_DELIVERY_OPERATOR_IDS.length === 0
    ) {
      continue;
    }
    try {
      const points = await runRequest(
        attempt.includeOperatorIds,
        attempt.availabilityMode,
      );
      if (points.length > 0) {
        return points;
      }
      console.warn(
        `Yandex pickup points request returned empty list (${attempt.label})`,
      );
    } catch (error) {
      lastError = error;
      console.warn(
        `Yandex pickup points request failed (${attempt.label}):`,
        error,
      );
    }
  }

  if (lastError) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to load Yandex pickup points");
  }
  return [];

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

export async function getDeliveryPoints(
  query: string,
  providerFilter: DeliveryProviderFilter = "all",
  options?: { cursor?: number; limit?: number; bounds?: GeoBounds },
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
    const resolvedLocation = await geocodeLocationByYandex(normalizedQuery);
    const effectiveBounds = buildEffectiveBounds(
      options?.bounds,
      resolvedLocation?.bounds,
    );
    const cursorRaw = Number(options?.cursor ?? 0);
    const safeCursor =
      Number.isFinite(cursorRaw) && cursorRaw > 0 ? Math.floor(cursorRaw) : 0;
    const russianPost = await loadRussianPostDeliveryPointsDbf({
      query: normalizedQuery,
      cityHint: resolvedLocation?.city || normalizedQuery,
      regionHint: resolvedLocation?.region || "",
      locationBounds: effectiveBounds ?? undefined,
      cursor: safeCursor,
      limit: options?.limit,
    });

    if (russianPost.total === 0) {
      return {
        location: {
          query: normalizedQuery,
          label: resolvedLocation?.label || normalizedQuery,
          city: resolvedLocation?.city || normalizedQuery,
          region: resolvedLocation?.region || resolvedLocation?.city || normalizedQuery,
          lat: resolvedLocation?.lat ?? 55.751574,
          lng: resolvedLocation?.lng ?? 37.573856,
        },
        points: [],
        pagination: {
          total: 0,
          cursor: safeCursor,
          nextCursor: null,
          hasMore: false,
        },
      };
    }

    return {
      location: {
        query: normalizedQuery,
        label: resolvedLocation?.label || normalizedQuery,
        city:
          resolvedLocation?.city ||
          russianPost.points[0]?.city ||
          normalizedQuery,
        region: resolvedLocation?.region || resolvedLocation?.city || normalizedQuery,
        lat: resolvedLocation?.lat ?? russianPost.points[0]?.lat ?? 55.751574,
        lng: resolvedLocation?.lng ?? russianPost.points[0]?.lng ?? 37.573856,
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
  const effectiveBounds = buildEffectiveBounds(options?.bounds, location.bounds);

  const loaders: Array<{
    provider: DeliveryProviderCode;
    run: () => Promise<DeliveryPoint[]>;
  }> = [];

  if (providerFilter === "all" || providerFilter === "yandex_pvz") {
    loaders.push({
      provider: "yandex_pvz",
      run: async () =>
        (await loadYandexPickupPoints(location)).filter((point) =>
          isPointWithinBounds(point.lat, point.lng, effectiveBounds),
        ),
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
            regionHint: location.region,
            locationBounds: effectiveBounds ?? undefined,
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

  const demoProviders: DemoProviderCode[] = [];

  for (const provider of demoProviders) {
    loaders.push({
      provider,
      run: () =>
        loadDemoProviderPoints({
          provider,
          query: normalizedQuery,
          location,
          bounds: effectiveBounds,
        }),
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
    } else if (loader.provider === "russian_post") {
      console.warn("Failed to load Russian Post pickup points:", result.reason);
    } else {
      console.warn(
        `Failed to load demo pickup points for ${loader.provider}:`,
        result.reason,
      );
    }
  }

  return {
    location,
    points: points.sort((left, right) => {
      const providerOrder = [
        "yandex_pvz",
        "russian_post",
        "ozon",
        "wildberries",
        "cdek",
      ] as const;
      const providerDiff =
        providerOrder.indexOf(left.provider) - providerOrder.indexOf(right.provider);
      if (providerDiff !== 0) return providerDiff;
      return `${left.name} ${left.address}`.localeCompare(
        `${right.name} ${right.address}`,
        "ru",
      );
    }),
  };
}
