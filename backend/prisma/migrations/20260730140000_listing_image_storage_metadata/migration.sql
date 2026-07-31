ALTER TABLE "ListingImage"
ADD COLUMN "object_key" TEXT,
ADD COLUMN "checksum_sha256" TEXT,
ADD COLUMN "mime_type" TEXT,
ADD COLUMN "byte_size" INTEGER;

CREATE INDEX "ListingImage_object_key_idx" ON "ListingImage"("object_key");
CREATE INDEX "ListingImage_checksum_sha256_idx" ON "ListingImage"("checksum_sha256");
