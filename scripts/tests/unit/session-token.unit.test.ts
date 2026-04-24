import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSessionTokenConfiguration,
  signSessionToken,
  verifySessionToken,
} from "../../../backend/src/lib/session-token";

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const snapshot: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    snapshot[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("session token: sign + verify roundtrip", () => {
  const now = Date.now();
  const token = withEnv(
    {
      NODE_ENV: "test",
      SESSION_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
      SESSION_TOKEN_ISSUER: "test-issuer",
      SESSION_TOKEN_AUDIENCE: "test-audience",
      SESSION_TOKEN_TTL_MS: "60000",
    },
    () => signSessionToken(123, now),
  );

  const verified = withEnv(
    {
      NODE_ENV: "test",
      SESSION_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
      SESSION_TOKEN_ISSUER: "test-issuer",
      SESSION_TOKEN_AUDIENCE: "test-audience",
    },
    () => verifySessionToken(token, now + 5_000),
  );

  assert.equal(verified, 123);
});

test("session token: invalid signature is rejected", () => {
  const now = Date.now();
  const token = withEnv(
    {
      NODE_ENV: "test",
      SESSION_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
      SESSION_TOKEN_ISSUER: "test-issuer",
      SESSION_TOKEN_AUDIENCE: "test-audience",
    },
    () => signSessionToken(42, now),
  );

  const broken = `${token}broken`;
  const verified = withEnv(
    {
      NODE_ENV: "test",
      SESSION_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
      SESSION_TOKEN_ISSUER: "test-issuer",
      SESSION_TOKEN_AUDIENCE: "test-audience",
    },
    () => verifySessionToken(broken, now + 1_000),
  );

  assert.equal(verified, null);
});

test("session token: expired token is rejected", () => {
  const now = Date.now();
  const token = withEnv(
    {
      NODE_ENV: "test",
      SESSION_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
      SESSION_TOKEN_ISSUER: "test-issuer",
      SESSION_TOKEN_AUDIENCE: "test-audience",
      SESSION_TOKEN_TTL_MS: "1000",
    },
    () => signSessionToken(11, now),
  );

  const verified = withEnv(
    {
      NODE_ENV: "test",
      SESSION_TOKEN_SECRET: "abcdefghijklmnopqrstuvwxyz012345",
      SESSION_TOKEN_ISSUER: "test-issuer",
      SESSION_TOKEN_AUDIENCE: "test-audience",
    },
    () => verifySessionToken(token, now + 10_000),
  );

  assert.equal(verified, null);
});

test("session token config: production requires strong secret", () => {
  assert.throws(
    () =>
      withEnv(
        {
          NODE_ENV: "production",
          SESSION_TOKEN_SECRET: "short-secret",
        },
        () => assertSessionTokenConfiguration(),
      ),
    /SESSION_TOKEN_SECRET must be at least 32 characters/,
  );
});
