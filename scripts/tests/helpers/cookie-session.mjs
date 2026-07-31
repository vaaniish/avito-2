export function encodeCookieSession(headers, payload) {
  const csrfToken = typeof payload?.csrfToken === "string" ? payload.csrfToken : "";
  const setCookie = headers.get("set-cookie") ?? "";
  const match = /(?:^|[,;]\s*)(?:__Host-)?ecomm_session=([^;]+)/.exec(setCookie);
  if (!match?.[1] || !csrfToken) throw new Error("Login response is missing session cookie or CSRF token");
  return Buffer.from(JSON.stringify({ cookie: decodeURIComponent(match[1]), csrfToken }), "utf8").toString("base64url");
}

export function cookieSessionHeaders(encoded) {
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof value.cookie === "string" && typeof value.csrfToken === "string") {
      return {
        cookie: `ecomm_session=${encodeURIComponent(value.cookie)}`,
        origin: "http://localhost:3000",
        "x-csrf-token": value.csrfToken,
      };
    }
  } catch {}
  return { cookie: `ecomm_session=${encodeURIComponent(encoded)}`, origin: "http://localhost:3000" };
}
