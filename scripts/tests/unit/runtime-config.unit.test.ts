import assert from "node:assert/strict";
import test from "node:test";
import { assertRuntimeConfiguration } from "../../../backend/src/lib/runtime-config";

function withEnv(overrides: Record<string, string | undefined>, callback: () => void): void {
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("runtime config: production requires HTTPS CORS origin", () => {
  withEnv({ NODE_ENV: "production", CORS_ALLOWED_ORIGINS: "http://example.com" }, () => {
    assert.throws(() => assertRuntimeConfiguration(), /must use HTTPS/);
  });
});

test("runtime config: rejects obsolete JWT configuration", () => {
  withEnv({ NODE_ENV: "test", SESSION_TOKEN_SECRET: "obsolete" }, () => {
    assert.throws(() => assertRuntimeConfiguration(), /obsolete/);
  });
});

test("runtime config: rejects known demo credentials in production", () => {
  withEnv({
    NODE_ENV: "production",
    CORS_ALLOWED_ORIGINS: "https://market.example",
    YOOKASSA_SECRET_KEY: "demo-secret",
  }, () => {
    assert.throws(() => assertRuntimeConfiguration(), /known demo\/default credential/);
  });
});
