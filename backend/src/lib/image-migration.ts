import { createHash } from "node:crypto";
import type { ImageObjectMetadata, ImageStorage } from "./image-storage";
import { deterministicImageKey } from "./image-storage";

export type InlineImage = {
  bytes: Buffer;
  contentType: ImageObjectMetadata["contentType"];
  checksumSha256: string;
};

export function decodeInlineImage(value: string): InlineImage | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.toString("base64") !== match[2]) return null;
  return {
    bytes,
    contentType: match[1] as InlineImage["contentType"],
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export async function migrateInlineListingImage(input: {
  listingPublicId: string;
  currentUrl: string;
  storage: ImageStorage;
  persist: (result: ImageObjectMetadata & { publicUrl: string }) => Promise<void>;
}): Promise<{ migrated: boolean; metadata?: ImageObjectMetadata }> {
  const inline = decodeInlineImage(input.currentUrl);
  if (!inline) return { migrated: false };
  if (input.storage.driver === "inline") {
    throw new Error("Commit migration requires a non-inline ImageStorage adapter");
  }
  const key = deterministicImageKey({
    listingPublicId: input.listingPublicId,
    checksumSha256: inline.checksumSha256,
    contentType: inline.contentType,
  });
  const expected: ImageObjectMetadata = {
    key,
    checksumSha256: inline.checksumSha256,
    contentType: inline.contentType,
    byteSize: inline.bytes.byteLength,
  };
  const existing = await input.storage.head(key);
  const metadata = existing ?? await input.storage.put({ ...expected, body: inline.bytes });
  if (metadata.checksumSha256 !== expected.checksumSha256 || metadata.byteSize !== expected.byteSize) {
    throw new Error("Stored image verification failed");
  }
  await input.persist({ ...metadata, publicUrl: input.storage.getPublicUrl(key) });
  return { migrated: true, metadata };
}
