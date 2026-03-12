export type SessionRole = "regular" | "partner" | "admin";

export type SessionUser = {
  id: number;
  public_id: string;
  role: SessionRole;
  name: string;
  email: string;
};

const SESSION_STORAGE_KEY = "ecomm_session_user";
const UTF8_DECODER = new TextDecoder("utf-8");

const CP1251_SPECIAL_CHAR_TO_BYTE: Record<number, number> = {
  0x0402: 0x80,
  0x0403: 0x81,
  0x201a: 0x82,
  0x0453: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x20ac: 0x88,
  0x2030: 0x89,
  0x0409: 0x8a,
  0x2039: 0x8b,
  0x040a: 0x8c,
  0x040c: 0x8d,
  0x040b: 0x8e,
  0x040f: 0x8f,
  0x0452: 0x90,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x2122: 0x99,
  0x0459: 0x9a,
  0x203a: 0x9b,
  0x045a: 0x9c,
  0x045c: 0x9d,
  0x045b: 0x9e,
  0x045f: 0x9f,
  0x040e: 0xa1,
  0x045e: 0xa2,
  0x0408: 0xa3,
  0x00a4: 0xa4,
  0x0490: 0xa5,
  0x00a6: 0xa6,
  0x00a7: 0xa7,
  0x0401: 0xa8,
  0x00a9: 0xa9,
  0x0404: 0xaa,
  0x00ab: 0xab,
  0x00ac: 0xac,
  0x00ad: 0xad,
  0x00ae: 0xae,
  0x0407: 0xaf,
  0x00b0: 0xb0,
  0x00b1: 0xb1,
  0x0406: 0xb2,
  0x0456: 0xb3,
  0x0491: 0xb4,
  0x00b5: 0xb5,
  0x00b6: 0xb6,
  0x00b7: 0xb7,
  0x0451: 0xb8,
  0x2116: 0xb9,
  0x0454: 0xba,
  0x00bb: 0xbb,
  0x0458: 0xbc,
  0x0405: 0xbd,
  0x0455: 0xbe,
  0x0457: 0xbf,
};

const MOJIBAKE_WEIRD_RE = /[ЃЉЊЋЌЎЏђѓ‚„…†‡€‰™љњћќўџ]/u;

function looksLikeMojibake(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  if (/^\?{3,}$/.test(text.replace(/\s+/g, ""))) return true;
  if (MOJIBAKE_WEIRD_RE.test(text)) return true;
  if (text.length >= 8) {
    const rsCount = (text.match(/[РС]/g) ?? []).length;
    if (rsCount / text.length > 0.28) return true;
  }
  return false;
}

function toCp1251Bytes(value: string): Uint8Array | null {
  const bytes: number[] = [];

  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (!codePoint) return null;

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
      continue;
    }

    if (codePoint >= 0x0410 && codePoint <= 0x044f) {
      bytes.push(codePoint - 0x0350);
      continue;
    }

    const special = CP1251_SPECIAL_CHAR_TO_BYTE[codePoint];
    if (special !== undefined) {
      bytes.push(special);
      continue;
    }

    return null;
  }

  return Uint8Array.from(bytes);
}

function normalizePossiblyBrokenText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/^\?{3,}$/.test(trimmed.replace(/\s+/g, ""))) return "Без названия";
  if (!looksLikeMojibake(trimmed)) return value;

  const bytes = toCp1251Bytes(trimmed);
  if (!bytes) return value;

  const decoded = UTF8_DECODER.decode(bytes).trim();
  if (!decoded || decoded.includes("�")) return value;
  if (/^\?{3,}$/.test(decoded.replace(/\s+/g, ""))) return "Без названия";
  return decoded;
}

function normalizePayload(value: unknown): unknown {
  if (typeof value === "string") {
    return normalizePossiblyBrokenText(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizePayload(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      normalizePayload(nested),
    ]);
    return Object.fromEntries(entries);
  }

  return value;
}

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.toString().replace(/\/+$/, "") ||
  "http://localhost:3001/api";

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (typeof parsed?.id !== "number") return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

export function saveSessionUser(user: SessionUser): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
}

export function clearSessionUser(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const session = getSessionUser();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (session?.id) {
    headers["x-user-id"] = String(session.id);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch (_error) {
      payload = text;
    }
  }
  payload = normalizePayload(payload);

  if (!response.ok) {
    if (response.status === 401) {
      clearSessionUser();
      throw new Error("Сессия истекла. Войдите снова.");
    }

    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "Ошибка запроса")
        : typeof payload === "string" && payload.trim().length > 0
          ? payload
          : "Ошибка запроса";
    throw new Error(message);
  }

  return payload as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: "GET", signal });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", body });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "PATCH", body });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}
