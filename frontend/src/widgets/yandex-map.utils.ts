export const YANDEX_MAPS_KEY =
  ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env
    ?.VITE_YANDEX_MAPS_API_KEY as string | undefined)
    ?.toString()
    .trim() ?? "";
export const YANDEX_SUGGEST_KEY =
  ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env
    ?.VITE_YANDEX_SUGGEST_API_KEY as string | undefined)
    ?.toString()
    .trim() ??
  ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env
    ?.VITE_YANDEX_GEOSUGGEST_API_KEY as string | undefined)
    ?.toString()
    .trim() ??
  "";

const FEDERAL_DISTRICT_RE = /\u0444\u0435\u0434\u0435\u0440\u0430\u043b\u044c\u043d\p{L}*\s+\u043e\u043a\u0440\u0443\u0433/iu;
const MUNICIPAL_FORMATION_RE =
  /\u043c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b\u044c\u043d\p{L}*\s+\u043e\u0431\u0440\u0430\u0437\u043e\u0432\u0430\u043d\p{L}*/iu;
const REGION_LEVEL_RE =
  /(?:\u043e\u0431\u043b\u0430\u0441\u0442\p{L}*|\u043a\u0440\u0430\u0439|\u0440\u0435\u0441\u043f\u0443\u0431\u043b\u0438\u043a\p{L}*|\u0430\u0432\u0442\u043e\u043d\u043e\u043c\p{L}*\s+\u043e\u0431\u043b\u0430\u0441\u0442\p{L}*|\u0430\u0432\u0442\u043e\u043d\u043e\u043c\p{L}*\s+\u043e\u043a\u0440\u0443\u0433)/iu;
const RUSSIAN_COUNTRY_RE = /(?:^|\b)(?:\u0440\u043e\u0441\u0441\u0438\p{L}*|russia|russian\s+federation)(?:$|\b)/iu;

export const MAX_RENDERED_MARKERS = 800;

const normalizeAdministrativeLabel = (value: string) =>
  value.toLowerCase().replace(/\u0451/g, "\u0435").replace(/\s+/g, " ").trim();

export const isFederalDistrict = (value: string) => {
  const normalized = normalizeAdministrativeLabel(value);
  return FEDERAL_DISTRICT_RE.test(value) || (normalized.includes("\u0444\u0435\u0434\u0435\u0440\u0430\u043b") && normalized.includes("\u043e\u043a\u0440\u0443\u0433"));
};

export const isMunicipalFormation = (value: string) => {
  const normalized = normalizeAdministrativeLabel(value);
  return MUNICIPAL_FORMATION_RE.test(value) || (normalized.includes("\u043c\u0443\u043d\u0438\u0446\u0438\u043f\u0430\u043b") && normalized.includes("\u043e\u0431\u0440\u0430\u0437\u043e\u0432"));
};

export const isBroadAdministrativeUnit = (value: string) =>
  isFederalDistrict(value) || isMunicipalFormation(value);

export const isRussianCountry = (value: string | null | undefined) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return true;
  return RUSSIAN_COUNTRY_RE.test(normalized);
};

export const sanitizeHouseValue = (value: string | null | undefined) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/^\s*(?:дом|д\.?)\s*/iu, "")
    .replace(/\s*,?\s*(?:кв\.?|квартира)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .replace(/\s*,?\s*(?:под[ъь]?езд|под\.?\s*езд)\s*[0-9a-zа-я/-]+.*$/iu, "")
    .trim();
};

export function markerPreset(provider?: string, selected = false): string {
  if (selected && provider === "yandex_pvz") return "islands#darkBlueShoppingCircleIcon";
  if (selected) return "islands#darkBlueIcon";
  if (provider === "yandex_pvz") return "islands#blueShoppingCircleIcon";
  if (provider === "russian_post") return "islands#orangeIcon";
  if (provider === "ozon") return "islands#violetIcon";
  return "islands#blueIcon";
}

export function markerCaption(title: string): string {
  const normalized = String(title ?? "").trim();
  if (!normalized) return "";
  return normalized.length > 36 ? `${normalized.slice(0, 33)}...` : normalized;
}

export function regionFromCandidates(province: string, area: string) {
  const regionCandidates = [province, area]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .filter((item) => !isBroadAdministrativeUnit(item));
  return regionCandidates.find((item) => REGION_LEVEL_RE.test(item)) || regionCandidates[0] || "";
}
