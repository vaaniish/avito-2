type ImportMetaEnvLike = Record<string, unknown>;

function getViteEnvValue(key: string): string {
  const metaEnv = (import.meta as ImportMeta & { env?: ImportMetaEnvLike }).env;
  const raw = metaEnv?.[key];
  if (typeof raw !== "string") return "";
  return raw.trim();
}

export const YANDEX_GEOSUGGEST_API_KEY =
  getViteEnvValue("VITE_YANDEX_GEOSUGGEST_API_KEY");

const FEDERAL_DISTRICT_RE = /федеральн\p{L}*\s+округ/iu;
const MUNICIPAL_FORMATION_RE =
  /муниципальн\p{L}*\s+образован\p{L}*/iu;
export const REGION_LEVEL_RE =
  /(?:област\p{L}*|край|республик\p{L}*|автоном\p{L}*\s+област\p{L}*|автоном\p{L}*\s+округ)/iu;
const RUSSIAN_COUNTRY_RE =
  /(?:^|\b)(?:росси\p{L}*|russia|russian\s+federation)(?:$|\b)/iu;

export const RUSSIA_BOUNDS: number[][] = [
  [41.185, 19.6389],
  [81.8587, 180],
];

export const RUSSIA_BBOX = "19.6389,41.185~180,81.8587";

function normalizeAdministrativeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

function isFederalDistrict(value: string): boolean {
  const normalized = normalizeAdministrativeLabel(value);
  return (
    FEDERAL_DISTRICT_RE.test(value) ||
    (normalized.includes("федерал") && normalized.includes("округ"))
  );
}

function isMunicipalFormation(value: string): boolean {
  const normalized = normalizeAdministrativeLabel(value);
  return (
    MUNICIPAL_FORMATION_RE.test(value) ||
    (normalized.includes("муниципал") && normalized.includes("образов"))
  );
}

export function isBroadAdministrativeUnit(value: string): boolean {
  return isFederalDistrict(value) || isMunicipalFormation(value);
}

export function isRussianCountry(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").trim();
  if (!normalized) return true;
  return RUSSIAN_COUNTRY_RE.test(normalized);
}
