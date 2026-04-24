import { createHmac, timingSafeEqual } from "node:crypto";

type JwtHeader = {
  alg: "HS256";
  typ: "JWT";
};

type SessionTokenPayload = {
  sub: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  v: 1;
};

const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_VERSION = 1 as const;
const SESSION_TOKEN_ALG = "HS256" as const;
const SESSION_TOKEN_TYP = "JWT" as const;
const DEFAULT_SESSION_TOKEN_ISSUER = "avito-2-backend";
const DEFAULT_SESSION_TOKEN_AUDIENCE = "avito-2-frontend";
const DEV_FALLBACK_SESSION_TOKEN_SECRET = "dev-local-session-secret-change-me";
const MIN_PRODUCTION_SESSION_TOKEN_SECRET_LENGTH = 32;

function toBase64Url(input: Buffer | string): string {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return raw
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Buffer | null {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  try {
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function getSessionTokenSecret(): string {
  const fromEnv = process.env.SESSION_TOKEN_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (fromEnv) {
    if (
      isProduction &&
      fromEnv.length < MIN_PRODUCTION_SESSION_TOKEN_SECRET_LENGTH
    ) {
      throw new Error(
        `SESSION_TOKEN_SECRET must be at least ${MIN_PRODUCTION_SESSION_TOKEN_SECRET_LENGTH} characters in production`,
      );
    }

    if (isProduction && fromEnv === DEV_FALLBACK_SESSION_TOKEN_SECRET) {
      throw new Error(
        "SESSION_TOKEN_SECRET cannot use the built-in development fallback secret in production",
      );
    }

    return fromEnv;
  }

  if (isProduction) {
    throw new Error("SESSION_TOKEN_SECRET is required in production");
  }

  return DEV_FALLBACK_SESSION_TOKEN_SECRET;
}

function getSessionTokenIssuer(): string {
  return (
    process.env.SESSION_TOKEN_ISSUER?.trim() || DEFAULT_SESSION_TOKEN_ISSUER
  );
}

function getSessionTokenAudience(): string {
  return (
    process.env.SESSION_TOKEN_AUDIENCE?.trim() || DEFAULT_SESSION_TOKEN_AUDIENCE
  );
}

function getSessionTokenTtlMs(): number {
  const raw = Number(process.env.SESSION_TOKEN_TTL_MS ?? DEFAULT_SESSION_TTL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SESSION_TTL_MS;
  return Math.floor(raw);
}

function signPayload(encodedPayload: string): string {
  const signature = createHmac("sha256", getSessionTokenSecret())
    .update(encodedPayload)
    .digest();
  return toBase64Url(signature);
}

function parseJwtHeader(encodedHeader: string): JwtHeader | null {
  const decodedBuffer = fromBase64Url(encodedHeader);
  if (!decodedBuffer) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedBuffer.toString("utf8")) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const header = parsed as { alg?: unknown; typ?: unknown };
  if (header.alg !== SESSION_TOKEN_ALG) return null;
  if (header.typ !== SESSION_TOKEN_TYP) return null;
  return {
    alg: SESSION_TOKEN_ALG,
    typ: SESSION_TOKEN_TYP,
  };
}

function parsePayload(encodedPayload: string): SessionTokenPayload | null {
  const decodedBuffer = fromBase64Url(encodedPayload);
  if (!decodedBuffer) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decodedBuffer.toString("utf8")) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const payload = parsed as {
    sub?: unknown;
    iat?: unknown;
    exp?: unknown;
    iss?: unknown;
    aud?: unknown;
    v?: unknown;
  };

  if (typeof payload.sub !== "string") return null;
  const parsedUserId = Number(payload.sub);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    return null;
  }
  if (typeof payload.iat !== "number" || !Number.isInteger(payload.iat) || payload.iat <= 0) {
    return null;
  }
  if (typeof payload.exp !== "number" || !Number.isInteger(payload.exp) || payload.exp <= 0) {
    return null;
  }
  if (typeof payload.iss !== "string" || payload.iss !== getSessionTokenIssuer()) {
    return null;
  }
  if (typeof payload.aud !== "string" || payload.aud !== getSessionTokenAudience()) {
    return null;
  }
  if (payload.v !== SESSION_TOKEN_VERSION) return null;

  return {
    sub: payload.sub,
    iat: payload.iat,
    exp: payload.exp,
    iss: payload.iss,
    aud: payload.aud,
    v: SESSION_TOKEN_VERSION,
  };
}

export function signSessionToken(userId: number, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = Math.floor((now + getSessionTokenTtlMs()) / 1000);
  const header: JwtHeader = {
    alg: SESSION_TOKEN_ALG,
    typ: SESSION_TOKEN_TYP,
  };
  const payload: SessionTokenPayload = {
    sub: String(userId),
    iat: issuedAt,
    exp: expiresAt,
    iss: getSessionTokenIssuer(),
    aud: getSessionTokenAudience(),
    v: SESSION_TOKEN_VERSION,
  };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signPayload(signingInput);
  return `${signingInput}.${signature}`;
}

export function verifySessionToken(token: string, now = Date.now()): number | null {
  const normalized = token.trim();
  if (!normalized) return null;

  const parts = normalized.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) return null;

  if (!parseJwtHeader(encodedHeader)) return null;

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signPayload(signingInput);
  const provided = fromBase64Url(encodedSignature);
  const expected = fromBase64Url(expectedSignature);
  if (!provided || !expected) return null;
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  const payload = parsePayload(encodedPayload);
  if (!payload) return null;

  const nowSeconds = Math.floor(now / 1000);
  if (payload.exp <= nowSeconds) return null;
  if (payload.iat > nowSeconds + 120) return null;

  return Number(payload.sub);
}

export function assertSessionTokenConfiguration(): void {
  void getSessionTokenSecret();
}
