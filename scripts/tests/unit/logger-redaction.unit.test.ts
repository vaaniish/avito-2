import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeLogValue } from "../../../backend/src/lib/logger";

test("logger redaction: removes auth, database and payout secrets recursively", () => {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://private-user:private-password@localhost/private";
  try {
    const sanitized = sanitizeLogValue({
      authorization: "Bearer secret",
      nested: {
        cookie: "session=value",
        csrfToken: "csrf",
        password: "password",
        bankAccount: "40817810000000000000",
        bankBic: "044525225",
        message: `failed ${process.env.DATABASE_URL}`,
      },
    }) as any;
    assert.equal(sanitized.authorization, "[REDACTED]");
    assert.equal(sanitized.nested.cookie, "[REDACTED]");
    assert.equal(sanitized.nested.csrfToken, "[REDACTED]");
    assert.equal(sanitized.nested.password, "[REDACTED]");
    assert.equal(sanitized.nested.bankAccount, "[REDACTED]");
    assert.equal(sanitized.nested.bankBic, "[REDACTED]");
    assert.doesNotMatch(sanitized.nested.message, /private-password/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});
