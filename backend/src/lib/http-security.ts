import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";

const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function parseCorsAllowedOrigins(rawValue: string | undefined): string[] {
  return (rawValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function isCorsOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
): boolean {
  if (!origin) return true;
  if (allowedOrigins.length === 0) {
    return LOCALHOST_ORIGIN_PATTERN.test(origin);
  }
  return allowedOrigins.includes(origin);
}

export function parseTrustProxySetting(
  rawValue: string | undefined,
): boolean | number | string | string[] {
  const normalized = rawValue?.trim();
  if (!normalized || normalized.toLowerCase() === "false") {
    return false;
  }
  if (normalized.toLowerCase() === "true") {
    return true;
  }

  const parsedNumber = Number(normalized);
  if (Number.isInteger(parsedNumber) && parsedNumber >= 0) {
    return parsedNumber;
  }

  if (normalized.includes(",")) {
    return normalized
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return normalized;
}

export function createJsonRateLimit(params: {
  windowMs: number;
  max: number;
  message: string;
}): RequestHandler {
  return rateLimit({
    windowMs: params.windowMs,
    max: params.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).json({ error: params.message });
    },
  });
}

export function applyToMutationMethods(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }

    middleware(req, res, next);
  };
}

export function getAuthLoginRateLimit() {
  return createJsonRateLimit({
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_AUTH_LOGIN_WINDOW_MS,
      15 * 60 * 1000,
    ),
    max: parsePositiveInt(process.env.RATE_LIMIT_AUTH_LOGIN_MAX, 20),
    message: "Too many login attempts. Please try again later.",
  });
}

export function getAuthSignupRateLimit() {
  return createJsonRateLimit({
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_AUTH_SIGNUP_WINDOW_MS,
      60 * 60 * 1000,
    ),
    max: parsePositiveInt(process.env.RATE_LIMIT_AUTH_SIGNUP_MAX, 10),
    message: "Too many signup attempts. Please try again later.",
  });
}

export function getCheckoutRateLimit() {
  return createJsonRateLimit({
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_CHECKOUT_WINDOW_MS,
      10 * 60 * 1000,
    ),
    max: parsePositiveInt(process.env.RATE_LIMIT_CHECKOUT_MAX, 30),
    message: "Too many checkout requests. Please try again later.",
  });
}

export function getPartnerWriteRateLimit() {
  return createJsonRateLimit({
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_PARTNER_WRITE_WINDOW_MS,
      5 * 60 * 1000,
    ),
    max: parsePositiveInt(process.env.RATE_LIMIT_PARTNER_WRITE_MAX, 60),
    message: "Too many partner update requests. Please try again later.",
  });
}

export function getAdminWriteRateLimit() {
  return createJsonRateLimit({
    windowMs: parsePositiveInt(
      process.env.RATE_LIMIT_ADMIN_WRITE_WINDOW_MS,
      5 * 60 * 1000,
    ),
    max: parsePositiveInt(process.env.RATE_LIMIT_ADMIN_WRITE_MAX, 120),
    message: "Too many admin update requests. Please try again later.",
  });
}
