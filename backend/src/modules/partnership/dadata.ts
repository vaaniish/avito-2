import { parsePartnershipLegalType, hasValidInnChecksum } from "./onboarding";

export type DadataLegalLookupRequest = {
  inn: unknown;
  legalType: unknown;
};

export type DadataLegalLookupResult = {
  inn: string;
  ogrn: string;
  kpp: string | null;
  legalName: string;
  registeredAddress: string;
  taxRegion: string;
  registrationStatus: "active" | "inactive";
  dadataType: "LEGAL" | "INDIVIDUAL";
  managementName: string | null;
  managementPost: string | null;
};

export type DadataLegalLookupResponse =
  | { ok: true; result: DadataLegalLookupResult }
  | { ok: false; status: number; error: string; details?: string[] };

type DadataPartySuggestion = {
  value?: unknown;
  unrestricted_value?: unknown;
  data?: {
    inn?: unknown;
    ogrn?: unknown;
    kpp?: unknown;
    type?: unknown;
    name?: {
      full_with_opf?: unknown;
      short_with_opf?: unknown;
    };
    fio?: {
      surname?: unknown;
      name?: unknown;
      patronymic?: unknown;
      source?: unknown;
    };
    management?: {
      name?: unknown;
      post?: unknown;
    };
    state?: {
      status?: unknown;
    };
    address?: {
      value?: unknown;
      unrestricted_value?: unknown;
      data?: {
        region_with_type?: unknown;
        region?: unknown;
      };
    };
  };
};

type DadataPartyResponse = {
  suggestions?: DadataPartySuggestion[];
};

const DEFAULT_DADATA_API_BASE_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs";
const DEFAULT_DADATA_TIMEOUT_MS = 7000;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function onlyDigits(value: unknown): string {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms).unref?.();
  return controller.signal;
}

function buildLegalName(suggestion: DadataPartySuggestion): string {
  const data = suggestion.data;
  const fio = [text(data?.fio?.surname), text(data?.fio?.name), text(data?.fio?.patronymic)]
    .filter(Boolean)
    .join(" ");

  return (
    text(data?.name?.short_with_opf) ||
    text(data?.name?.full_with_opf) ||
    text(data?.fio?.source) ||
    fio ||
    text(suggestion.value) ||
    text(suggestion.unrestricted_value)
  );
}

export function mapDadataPartySuggestion(
  suggestion: DadataPartySuggestion,
): DadataLegalLookupResult | null {
  const data = suggestion.data;
  if (!data) return null;

  const dadataType = text(data.type) === "INDIVIDUAL" ? "INDIVIDUAL" : "LEGAL";
  const legalName = buildLegalName(suggestion);
  const inn = onlyDigits(data.inn);
  const ogrn = onlyDigits(data.ogrn);
  const registeredAddress = text(data.address?.unrestricted_value) || text(data.address?.value);
  const taxRegion = text(data.address?.data?.region_with_type) || text(data.address?.data?.region);
  const isActive = text(data.state?.status).toUpperCase() === "ACTIVE";

  if (!inn || !ogrn || !legalName || !registeredAddress) return null;

  return {
    inn,
    ogrn,
    kpp: text(data.kpp) || null,
    legalName,
    registeredAddress,
    taxRegion,
    registrationStatus: isActive ? "active" : "inactive",
    dadataType,
    managementName: text(data.management?.name) || null,
    managementPost: text(data.management?.post) || null,
  };
}

export async function lookupDadataParty(
  body: DadataLegalLookupRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DadataLegalLookupResponse> {
  const legalType = parsePartnershipLegalType(body.legalType);
  const inn = onlyDigits(body.inn);
  const expectedInnLength = legalType === "IP" ? 12 : 10;

  if (!legalType) {
    return { ok: false, status: 400, error: "Выберите тип продавца." };
  }
  if (!inn || inn.length !== expectedInnLength || !hasValidInnChecksum(inn)) {
    return {
      ok: false,
      status: 400,
      error: legalType === "IP" ? "Укажите корректный ИНН ИП из 12 цифр." : "Укажите корректный ИНН юрлица из 10 цифр.",
    };
  }

  const apiKey = process.env.DADATA_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, error: "DaData is not configured." };
  }

  const baseUrl = (process.env.DADATA_API_BASE_URL?.trim() || DEFAULT_DADATA_API_BASE_URL).replace(/\/+$/u, "");
  const timeoutMs = Math.max(
    1000,
    Number(process.env.DADATA_TIMEOUT_MS ?? DEFAULT_DADATA_TIMEOUT_MS) || DEFAULT_DADATA_TIMEOUT_MS,
  );
  const dadataType = legalType === "IP" ? "INDIVIDUAL" : "LEGAL";
  const payload: Record<string, unknown> = {
    query: inn,
    count: 1,
    type: dadataType,
  };
  if (dadataType === "LEGAL") payload.branch_type = "MAIN";

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/findById/party`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: withTimeout(timeoutMs),
    });
  } catch (_error) {
    return { ok: false, status: 502, error: "Не удалось проверить ИНН. Попробуйте позже." };
  }

  if (!response.ok) {
    return { ok: false, status: 502, error: "Не удалось проверить ИНН. Попробуйте позже." };
  }

  const data = (await response.json()) as DadataPartyResponse;
  const result = data.suggestions?.map(mapDadataPartySuggestion).find(Boolean) ?? null;
  if (!result) {
    return { ok: false, status: 404, error: "Компания или ИП с таким ИНН не найдены." };
  }

  return { ok: true, result };
}
