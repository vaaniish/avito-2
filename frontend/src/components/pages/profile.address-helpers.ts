import {
  isBroadAdministrativeUnit,
  REGION_LEVEL_RE,
} from "./profile.address-utils";

export type AddressSuggestStage =
  | "region"
  | "city"
  | "street"
  | "house"
  | "apartment"
  | "entrance";

export function composeFullAddress(parts: {
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  entrance?: string;
}): string {
  const normalize = (value?: string) => String(value ?? "").trim();
  const region = normalize(parts.region);
  const city = normalize(parts.city);
  const street = normalize(parts.street);
  const house = normalize(parts.house);
  const apartment = normalize(parts.apartment);
  const entrance = normalize(parts.entrance);

  const cityPart =
    city &&
    region &&
    city.toLowerCase().replace(/\s+/g, " ") ===
      region.toLowerCase().replace(/\s+/g, " ")
      ? ""
      : city;

  const housePart = house ? `дом ${house}` : "";
  const entrancePart = entrance ? `подъезд ${entrance}` : "";
  const apartmentPart = apartment ? `кв. ${apartment}` : "";

  return [region, cityPart, street, housePart, entrancePart, apartmentPart]
    .filter(Boolean)
    .join(", ");
}

export function sanitizeRegion(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return isBroadAdministrativeUnit(raw) ? "" : raw;
}

export function resolvePreferredRegion(province: string, area: string): string {
  const candidates = [province, area]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
  if (candidates.length === 0) return "";

  const narrowed = candidates.filter(
    (item) => !isBroadAdministrativeUnit(item),
  );
  if (narrowed.length === 0) return "";

  const regionLevel = narrowed.find((item) => REGION_LEVEL_RE.test(item));
  return regionLevel || narrowed[0] || "";
}

export function extractRegionFromInput(value: string): string {
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const matched = parts.find(
    (item) => REGION_LEVEL_RE.test(item) && !isBroadAdministrativeUnit(item),
  );
  return matched || "";
}

export function normalizeAddressToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRegionForMatch(
  value: string | null | undefined,
): string {
  return normalizeAddressToken(String(value ?? ""))
    .replace(
      /(^|[\s,])(?:обл\.?)(?=$|[\s,])/giu,
      "$1область",
    )
    .replace(
      /(^|[\s,])(?:респ\.?)(?=$|[\s,])/giu,
      "$1республика",
    )
    .replace(
      /(^|[\s,])(?:ao|a\.o\.?|ао)(?=$|[\s,])/giu,
      "$1autonomous okrug",
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function commonPrefixLength(
  leftValue: string,
  rightValue: string,
): number {
  const left = String(leftValue ?? "");
  const right = String(rightValue ?? "");
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

export function computeRegionMatchScore(
  queryValue: string | null | undefined,
  regionValue: string | null | undefined,
): number {
  const queryNorm = normalizeRegionForMatch(queryValue);
  const regionNorm = normalizeRegionForMatch(regionValue);
  if (!queryNorm || !regionNorm) return Number.NEGATIVE_INFINITY;

  if (queryNorm === regionNorm) return 1400;

  let score = 0;
  if (regionNorm.startsWith(queryNorm)) score += 860;
  if (regionNorm.includes(queryNorm)) score += 560;
  if (queryNorm.includes(regionNorm)) score += 320;

  const queryTokens = queryNorm.split(" ").filter(Boolean);
  const regionTokens = regionNorm.split(" ").filter(Boolean);
  const queryMain = queryTokens[0] ?? "";
  const regionMain = regionTokens[0] ?? "";

  if (
    queryMain.length <= 2 &&
    queryMain &&
    regionMain &&
    !regionMain.startsWith(queryMain)
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  if (
    queryMain.length >= 3 &&
    queryMain &&
    regionMain &&
    !regionMain.includes(queryMain) &&
    commonPrefixLength(queryMain, regionMain) < 2
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  if (queryMain && regionMain) {
    const prefixLength = commonPrefixLength(queryMain, regionMain);
    const minLength = Math.min(queryMain.length, regionMain.length);
    const maxLength = Math.max(queryMain.length, regionMain.length);
    const minRatio = minLength ? prefixLength / minLength : 0;
    const maxRatio = maxLength ? prefixLength / maxLength : 0;

    if (prefixLength >= 3) score += prefixLength * 55;
    if (minRatio >= 0.75) score += 220;
    else if (minRatio >= 0.6) score += 140;
    else if (minRatio >= 0.45) score += 60;

    if (maxRatio >= 0.65) score += 100;
  }

  const sharedTokens = queryTokens.filter((token) =>
    regionTokens.includes(token),
  ).length;
  const sharedDetails = queryTokens
    .slice(1)
    .filter((token) => regionTokens.includes(token)).length;
  score += sharedTokens * 120;
  score += sharedDetails * 50;

  return score > 0 ? score : Number.NEGATIVE_INFINITY;
}

export function extractHouseNumber(value: string): string {
  const match = value.match(/(?:дом|д\.?)\s*([0-9a-zа-я/-]+)/i);
  return match?.[1]?.trim() ?? "";
}

export function extractApartmentNumber(value: string): string {
  const match = value.match(/(?:кв\.?|квартира)\s*([0-9a-zа-я/-]+)/i);
  return match?.[1]?.trim() ?? "";
}

export function extractEntranceNumber(value: string): string {
  const match = value.match(/(?:подъезд|под\.?\s*езд|подьезд)\s*([0-9a-zа-я/-]+)/iu);
  return match?.[1]?.trim() ?? "";
}

export function sanitizeHouseValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  return raw
    .replace(/^\s*(?:дом|д\.?)\s*/iu, "")
    .replace(/\s*,?\s*(?:кв\.?|квартира)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .replace(/\s*,?\s*(?:под[ъь]?езд|под\.?\s*езд)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .trim();
}

export function sanitizeStreetValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  return raw
    .replace(/(?:дом|д\.?)\s*[0-9a-zа-я/-].*$/iu, "")
    .replace(/\s*,?\s*(?:кв\.?|квартира)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .replace(/\s*,?\s*(?:под[ъь]?езд|под\.?\s*езд)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .replace(/\s+\d+[a-zа-я/-]*$/iu, "")
    .trim();
}

export function sanitizeApartmentValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^\s*(?:кв\.?|квартира)\s*/iu, "").trim();
}

export function sanitizeEntranceValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/^\s*(?:под[ъь]?езд|под\.?\s*езд)\s*/iu, "")
    .trim();
}

export function normalizeAddressDisplay(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/,\s*$/g, "")
    .trim();
}

export function sanitizeCityValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return isBroadAdministrativeUnit(raw) ? "" : raw;
}

export function stripCityPrefix(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/^\s*(?:г\.?|город)\s+/iu, "")
    .trim();
}

export function normalizeCityForMatch(value: string | null | undefined): string {
  return normalizeAddressToken(stripCityPrefix(value));
}

export function areRegionsCompatible(
  expectedRegion: string | null | undefined,
  actualRegion: string | null | undefined,
): boolean {
  const expected = normalizeAddressToken(String(expectedRegion ?? ""));
  const actual = normalizeAddressToken(String(actualRegion ?? ""));
  if (!expected || !actual) return true;
  if (actual.includes(expected) || expected.includes(actual)) return true;

  const score = computeRegionMatchScore(expectedRegion, actualRegion);
  return Number.isFinite(score) && score >= 220;
}

export function buildRegionCandidateFromQuery(value: string): string {
  const cleaned = String(value ?? "").trim().replace(/,\s*$/u, "");
  if (!cleaned) return "";
  return sanitizeRegion(
    cleaned
      .replace(/(^|[\s,])обл\.?($|[\s,])/giu, "$1область$2")
      .replace(/(^|[\s,])респ\.?($|[\s,])/giu, "$1республика$2")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function normalizeBounds(value: unknown): number[][] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const first = value[0];
  const second = value[1];
  if (!Array.isArray(first) || !Array.isArray(second) || first.length < 2 || second.length < 2) {
    return null;
  }

  const lat1 = Number(first[0]);
  const lon1 = Number(first[1]);
  const lat2 = Number(second[0]);
  const lon2 = Number(second[1]);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;

  const south = Math.min(lat1, lat2);
  const north = Math.max(lat1, lat2);
  const west = Math.min(lon1, lon2);
  const east = Math.max(lon1, lon2);
  return [
    [south, west],
    [north, east],
  ];
}

export function boundsToBbox(bounds: number[][] | null): string {
  if (!bounds) return "";
  const south = Number(bounds[0]?.[0]);
  const west = Number(bounds[0]?.[1]);
  const north = Number(bounds[1]?.[0]);
  const east = Number(bounds[1]?.[1]);
  if (![south, west, north, east].every(Number.isFinite)) return "";
  return `${west},${south}~${east},${north}`;
}

export function splitAddressInput(value: string): {
  tokens: string[];
  context: string[];
  query: string;
  hasTrailingComma: boolean;
} {
  const hasTrailingComma = /,\s*$/.test(value);
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  const stepIndex = hasTrailingComma
    ? tokens.length
    : Math.max(tokens.length - 1, 0);
  const context = tokens.slice(0, stepIndex);
  const query = hasTrailingComma ? "" : (tokens[stepIndex] ?? "");

  return {
    tokens,
    context,
    query,
    hasTrailingComma,
  };
}

export function buildAddressFromTokens(tokens: string[]): string {
  const nextTokens: string[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const cleaned = token.trim();
    if (!cleaned) continue;
    const normalized = normalizeAddressToken(cleaned);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    nextTokens.push(cleaned);
  }

  return nextTokens.join(", ");
}

export function normalizeFreeformAddressForGeocode(value: string): string {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  let next = raw;
  if (!/(?:дом|д\.?)\s*[0-9a-zа-я/-]+/iu.test(next)) {
    next = next.replace(
      /(\b\d{1,4}[a-zа-я/-]?\b)(?!.*\b\d{1,4}[a-zа-я/-]?\b)/iu,
      "дом $1",
    );
  }
  next = next
    .replace(/\bкв\b\.?\s*(\d{1,4})/iu, "кв. $1")
    .replace(/\bпод[ъь]?езд\b\.?\s*(\d{1,3})/iu, "подъезд $1");

  return next.trim();
}

export function splitCompactRegionToken(value: string): {
  region: string;
  tail: string;
} {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) {
    return { region: "", tail: "" };
  }

  const regionSuffixMatch = raw.match(
    /\b(?:область|край|автономная\s+область|автономный\s+округ)\b/iu,
  );
  if (regionSuffixMatch && Number.isInteger(regionSuffixMatch.index)) {
    const endIndex = Number(regionSuffixMatch.index) + regionSuffixMatch[0].length;
    return {
      region: sanitizeRegion(raw.slice(0, endIndex).trim()),
      tail: raw.slice(endIndex).replace(/^[,\s]+/u, "").trim(),
    };
  }

  const republicMatch = raw.match(/^(республика\s+[^,\d]+?)(?:\s+(.*))?$/iu);
  if (republicMatch) {
    return {
      region: sanitizeRegion(String(republicMatch[1] ?? "").trim()),
      tail: String(republicMatch[2] ?? "").trim(),
    };
  }

  return { region: "", tail: raw };
}

export function normalizeHouseToken(value: string): string {
  return value.replace(/(?:дом|д\.?)\s*/giu, "").trim();
}
