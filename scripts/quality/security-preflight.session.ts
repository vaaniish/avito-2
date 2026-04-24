import "dotenv/config";
import { assertSessionTokenConfiguration } from "../../backend/src/lib/session-token";

function fail(message: string): never {
  throw new Error(`[security-preflight] ${message}`);
}

function validateOptionalTrimmedString(name: string): void {
  if (!(name in process.env)) {
    return;
  }

  const value = process.env[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${name} is set but empty`);
  }
}

function validateOptionalPositiveInteger(name: string): void {
  if (!(name in process.env)) {
    return;
  }

  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    fail(`${name} is set but empty`);
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${name} must be a positive integer when provided`);
  }
}

function main(): void {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    assertSessionTokenConfiguration();
    validateOptionalTrimmedString("SESSION_TOKEN_ISSUER");
    validateOptionalTrimmedString("SESSION_TOKEN_AUDIENCE");
    validateOptionalPositiveInteger("SESSION_TOKEN_TTL_MS");
  } finally {
    if (typeof originalNodeEnv === "undefined") {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }

  console.log("[security-preflight] PASS: production session-token configuration is valid");
}

main();
