export function encodeCookieSession(headers: Headers, payload: unknown): string {
  const csrfToken =
    payload && typeof payload === "object" && typeof (payload as { csrfToken?: unknown }).csrfToken === "string"
      ? (payload as { csrfToken: string }).csrfToken
      : "";
  const setCookie = headers.get("set-cookie") ?? "";
  const match = /(?:^|[,;]\s*)(?:__Host-)?ecomm_session=([^;]+)/.exec(setCookie);
  if (!match?.[1] || !csrfToken) throw new Error("Login response is missing session cookie or CSRF token");
  return Buffer.from(JSON.stringify({ cookie: decodeURIComponent(match[1]), csrfToken }), "utf8").toString("base64url");
}

export function cookieSessionHeaders(encoded: string): Record<string, string> {
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as {
      cookie?: unknown;
      csrfToken?: unknown;
    };
    if (typeof value.cookie === "string" && typeof value.csrfToken === "string") {
      return {
        cookie: `ecomm_session=${encodeURIComponent(value.cookie)}`,
        origin: "http://localhost:3000",
        "x-csrf-token": value.csrfToken,
      };
    }
  } catch {
    // Malformed-session tests deliberately use arbitrary values.
  }
  return { cookie: `ecomm_session=${encodeURIComponent(encoded)}`, origin: "http://localhost:3000" };
}
