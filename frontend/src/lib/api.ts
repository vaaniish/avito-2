export type SessionRole = "regular" | "partner" | "admin";

export type SessionUser = {
  id: number;
  public_id: string;
  role: SessionRole;
  name: string;
  email: string;
};

const SESSION_STORAGE_KEY = "ecomm_session_user";

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
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload !== null && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "Request failed")
        : "Request failed";
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
