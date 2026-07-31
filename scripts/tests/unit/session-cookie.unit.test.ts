import assert from "node:assert/strict";
import test from "node:test";
import {
  getSessionCookieName,
  getSessionTtlMs,
  setSessionCookie,
} from "../../../backend/src/lib/session-cookie";

function withNodeEnv<T>(value: string, callback: () => T): T {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = value;
  try {
    return callback();
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
}

test("session cookie: development cookie is HttpOnly, Lax and host-only", () => {
  withNodeEnv("test", () => {
    let captured: any;
    setSessionCookie({ cookie: (...args: unknown[]) => { captured = args; } } as any, "opaque", false);
    assert.equal(getSessionCookieName(), "ecomm_session");
    assert.equal(captured[0], "ecomm_session");
    assert.equal(captured[2].httpOnly, true);
    assert.equal(captured[2].sameSite, "lax");
    assert.equal(captured[2].secure, false);
    assert.equal(captured[2].path, "/");
    assert.equal(captured[2].domain, undefined);
    assert.equal(captured[2].maxAge, undefined);
  });
});

test("session cookie: production remembered cookie uses __Host and 30-day persistence", () => {
  withNodeEnv("production", () => {
    let captured: any;
    setSessionCookie({ cookie: (...args: unknown[]) => { captured = args; } } as any, "opaque", true);
    assert.equal(getSessionCookieName(), "__Host-ecomm_session");
    assert.equal(captured[2].secure, true);
    assert.equal(captured[2].maxAge, getSessionTtlMs(true));
    assert.ok(getSessionTtlMs(true) > getSessionTtlMs(false));
  });
});
