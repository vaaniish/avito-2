import assert from "node:assert/strict";
import test from "node:test";
import {
  applyToMutationMethods,
  isCorsOriginAllowed,
  parseCorsAllowedOrigins,
  parseTrustProxySetting,
} from "../../../backend/src/lib/http-security";
import { getRequestIpFromExpressLike, getRequestMetaFromExpressLike } from "../../../backend/src/common/http/request-meta";

test("http security: explicit CORS allowlist is parsed and matched exactly", () => {
  const allowedOrigins = parseCorsAllowedOrigins(
    "https://market.example, https://admin.example ,http://localhost:3000",
  );

  assert.deepEqual(allowedOrigins, [
    "https://market.example",
    "https://admin.example",
    "http://localhost:3000",
  ]);
  assert.equal(isCorsOriginAllowed("https://market.example", allowedOrigins), true);
  assert.equal(isCorsOriginAllowed("https://unknown.example", allowedOrigins), false);
});

test("http security: empty CORS allowlist falls back to localhost origins only", () => {
  const allowedOrigins = parseCorsAllowedOrigins(undefined);

  assert.equal(isCorsOriginAllowed(undefined, allowedOrigins), true);
  assert.equal(isCorsOriginAllowed("http://localhost:3000", allowedOrigins), true);
  assert.equal(isCorsOriginAllowed("https://127.0.0.1:5173", allowedOrigins), true);
  assert.equal(isCorsOriginAllowed("https://example.com", allowedOrigins), false);
});

test("http security: trust proxy parser supports booleans, numbers and CSV values", () => {
  assert.equal(parseTrustProxySetting(undefined), false);
  assert.equal(parseTrustProxySetting("false"), false);
  assert.equal(parseTrustProxySetting("true"), true);
  assert.equal(parseTrustProxySetting("2"), 2);
  assert.deepEqual(parseTrustProxySetting("loopback, linklocal"), [
    "loopback",
    "linklocal",
  ]);
  assert.equal(parseTrustProxySetting("uniquelocal"), "uniquelocal");
});

test("request meta: x-forwarded-for is normalized and wins over req.ip", () => {
  const req = {
    header(name: string) {
      if (name === "x-forwarded-for") {
        return " ::ffff:203.0.113.7, 10.0.0.1 ";
      }
      if (name === "user-agent") {
        return "  unit-test-agent  ";
      }
      return undefined;
    },
    ip: "::ffff:127.0.0.1",
  };

  assert.equal(getRequestIpFromExpressLike(req), "203.0.113.7");
  assert.deepEqual(getRequestMetaFromExpressLike(req), {
    ipAddress: "203.0.113.7",
    userAgent: "unit-test-agent",
  });
});

test("request meta: req.ip fallback is normalized when forwarded header is absent", () => {
  const req = {
    header() {
      return undefined;
    },
    ip: "::ffff:198.51.100.24",
  };

  assert.equal(getRequestIpFromExpressLike(req), "198.51.100.24");
});

test("http security: mutation wrapper skips GET and runs for POST", () => {
  let executed = 0;
  const middleware = applyToMutationMethods((_req, _res, next) => {
    executed += 1;
    next();
  });
  const nextCalls: string[] = [];
  const next = () => {
    nextCalls.push("next");
  };

  middleware({ method: "GET" } as never, {} as never, next);
  middleware({ method: "POST" } as never, {} as never, next);

  assert.equal(executed, 1);
  assert.equal(nextCalls.length, 2);
});
