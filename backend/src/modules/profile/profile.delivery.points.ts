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
