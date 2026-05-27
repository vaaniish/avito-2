import assert from "node:assert/strict";
import test from "node:test";
import {
  makeAuditPublicId,
  makeOpaquePublicId,
} from "../../../backend/src/common/domain/public-id";

test("public id: helper preserves normalized prefix format", () => {
  const publicId = makeOpaquePublicId(" ord ", 12);

  assert.match(publicId, /^ORD-[0-9A-F]{12}$/);
});

test("public id: audit helper keeps AUD prefix", () => {
  const publicId = makeAuditPublicId();

  assert.match(publicId, /^AUD-[0-9A-F]{20}$/);
});

test("public id: parallel generation stays unique", async () => {
  const generated = await Promise.all(
    Array.from({ length: 2_000 }, async () => makeOpaquePublicId("txn", 20)),
  );

  assert.equal(new Set(generated).size, generated.length);
});
