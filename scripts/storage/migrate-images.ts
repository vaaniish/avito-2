import "dotenv/config";
import { prisma } from "../../backend/src/lib/prisma";
import { createImageStorage } from "../../backend/src/lib/image-storage";
import { migrateInlineListingImage } from "../../backend/src/lib/image-migration";

async function main(): Promise<void> {
const commit = process.argv.includes("--commit");
if (!commit) {
  process.stdout.write("[storage-migrate] dry-run only; use storage:audit-images for the report\n");
  await prisma.$disconnect();
  process.exit(0);
}
if (process.env.IMAGE_MIGRATION_CONFIRM !== "MIGRATE_VERIFIED_IMAGES") {
  throw new Error("Set IMAGE_MIGRATION_CONFIRM=MIGRATE_VERIFIED_IMAGES to enable commit");
}
const storage = createImageStorage();
if (storage.driver === "inline") {
  throw new Error("Commit remains disabled until a non-inline ImageStorage adapter is selected");
}

const images = await prisma.listingImage.findMany({
  where: { url: { startsWith: "data:" } },
  include: { listing: { select: { public_id: true } } },
  orderBy: { id: "asc" },
});
let migrated = 0;
for (const image of images) {
  const result = await migrateInlineListingImage({
    listingPublicId: image.listing.public_id,
    currentUrl: image.url,
    storage,
    persist: async (stored) => {
      await prisma.listingImage.update({
        where: { id: image.id },
        data: {
          url: stored.publicUrl,
          object_key: stored.key,
          checksum_sha256: stored.checksumSha256,
          mime_type: stored.contentType,
          byte_size: stored.byteSize,
        },
      });
    },
  });
  if (result.migrated) migrated += 1;
}
await prisma.$disconnect();
process.stdout.write(`[storage-migrate] migrated ${migrated} images\n`);
}

void main().catch(async (error) => {
  await prisma.$disconnect().catch(() => undefined);
  throw error;
});
