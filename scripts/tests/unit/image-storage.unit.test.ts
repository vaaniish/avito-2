import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  InlineImageStorage,
  deterministicImageKey,
  type ImageStorage,
  type PutImageInput,
} from "../../../backend/src/lib/image-storage";
import { decodeInlineImage, migrateInlineListingImage } from "../../../backend/src/lib/image-migration";

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const checksum = createHash("sha256").update(pngBytes).digest("hex");

test("image storage: inline adapter verifies checksum and round-trips bytes", async () => {
  const storage = new InlineImageStorage();
  const key = deterministicImageKey({ listingPublicId: "LST-001", checksumSha256: checksum, contentType: "image/png" });
  await storage.put({ key, checksumSha256: checksum, contentType: "image/png", byteSize: pngBytes.byteLength, body: pngBytes });
  assert.deepEqual(await storage.head(key), { key, checksumSha256: checksum, contentType: "image/png", byteSize: pngBytes.byteLength });
  assert.equal(decodeInlineImage(storage.getPublicUrl(key))?.checksumSha256, checksum);
  await storage.delete(key);
  assert.equal(await storage.head(key), null);
});

test("image storage: migration is idempotent through head verification", async () => {
  const objects = new Map<string, PutImageInput>();
  let putCalls = 0;
  const storage: ImageStorage = {
    driver: "test-object-storage",
    async put(input) { putCalls += 1; objects.set(input.key, input); return input; },
    async head(key) { return objects.get(key) ?? null; },
    getPublicUrl(key) { return `https://storage.example.test/${key}`; },
    async delete(key) { objects.delete(key); },
  };
  const currentUrl = `data:image/png;base64,${pngBytes.toString("base64")}`;
  const persisted: string[] = [];
  const run = () => migrateInlineListingImage({
    listingPublicId: "LST-001",
    currentUrl,
    storage,
    persist: async (result) => { persisted.push(result.publicUrl); },
  });
  await run();
  await run();
  assert.equal(putCalls, 1);
  assert.equal(persisted.length, 2);
  assert.equal(persisted[0], persisted[1]);
});

test("image storage: commit is rejected for inline driver", async () => {
  await assert.rejects(() => migrateInlineListingImage({
    listingPublicId: "LST-001",
    currentUrl: `data:image/png;base64,${pngBytes.toString("base64")}`,
    storage: new InlineImageStorage(),
    persist: async () => undefined,
  }), /non-inline/);
});
