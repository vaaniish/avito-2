import type { CookieOptions, Request, Response } from "express";

const DEV_COOKIE_NAME = "ecomm_session";
const PROD_COOKIE_NAME = "__Host-ecomm_session";
const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REMEMBERED_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function parseDuration(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 60_000 || parsed > 365 * 24 * 60 * 60 * 1000) {
    return fallback;
  }
  return parsed;
}

export function getSessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? PROD_COOKIE_NAME : DEV_COOKIE_NAME;
}

export function getSessionTtlMs(rememberMe: boolean): number {
  return rememberMe
    ? parseDuration(
        process.env.AUTH_REMEMBERED_SESSION_TTL_MS,
        DEFAULT_REMEMBERED_SESSION_TTL_MS,
      )
    : parseDuration(process.env.AUTH_SESSION_TTL_MS, DEFAULT_SESSION_TTL_MS);
}

function cookieOptions(rememberMe: boolean): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  if (rememberMe) {
    options.maxAge = getSessionTtlMs(true);
  }
  return options;
}

export function setSessionCookie(
  res: Response,
  token: string,
  rememberMe: boolean,
): void {
  res.cookie(getSessionCookieName(), token, cookieOptions(rememberMe));
}

export function clearSessionCookie(res: Response): void {
  const base: CookieOptions = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  res.clearCookie(DEV_COOKIE_NAME, { ...base, secure: false });
  res.clearCookie(PROD_COOKIE_NAME, { ...base, secure: true });
}

export function readSessionCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const raw = cookies?.[getSessionCookieName()];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
