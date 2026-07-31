import { createHash } from "node:crypto";

export type ImageObjectMetadata = {
  key: string;
  checksumSha256: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
};

export type PutImageInput = ImageObjectMetadata & {
  body: Buffer;
};

export interface ImageStorage {
  readonly driver: string;
  put(input: PutImageInput): Promise<ImageObjectMetadata>;
  head(key: string): Promise<ImageObjectMetadata | null>;
  getPublicUrl(key: string): string;
  delete(key: string): Promise<void>;
}

export class InlineImageStorage implements ImageStorage {
  readonly driver = "inline";
  private readonly objects = new Map<string, PutImageInput>();

  async put(input: PutImageInput): Promise<ImageObjectMetadata> {
    const actualChecksum = createHash("sha256").update(input.body).digest("hex");
    if (actualChecksum !== input.checksumSha256 || input.body.byteLength !== input.byteSize) {
      throw new Error("Image storage metadata does not match the supplied bytes");
    }
    this.objects.set(input.key, { ...input, body: Buffer.from(input.body) });
    return {
      key: input.key,
      checksumSha256: input.checksumSha256,
      contentType: input.contentType,
      byteSize: input.byteSize,
    };
  }

  async head(key: string): Promise<ImageObjectMetadata | null> {
    const value = this.objects.get(key);
    return value ? {
      key: value.key,
      checksumSha256: value.checksumSha256,
      contentType: value.contentType,
      byteSize: value.byteSize,
    } : null;
  }

  getPublicUrl(key: string): string {
    const value = this.objects.get(key);
    if (!value) throw new Error("Inline image object not found");
    return `data:${value.contentType};base64,${value.body.toString("base64")}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

export function createImageStorage(): ImageStorage {
  const driver = (process.env.IMAGE_STORAGE_DRIVER ?? "inline").trim().toLowerCase();
  if (driver !== "inline") {
    throw new Error(`IMAGE_STORAGE_DRIVER=${driver} is not available until an external provider is selected`);
  }
  return new InlineImageStorage();
}

export function deterministicImageKey(input: {
  listingPublicId: string;
  checksumSha256: string;
  contentType: ImageObjectMetadata["contentType"];
}): string {
  const extension = input.contentType === "image/jpeg" ? "jpg" : input.contentType.split("/")[1];
  return `listings/${input.listingPublicId}/${input.checksumSha256}.${extension}`;
}
