CREATE TABLE "ListingDraft" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "seller_id" INTEGER NOT NULL,
  "type" "ListingType" NOT NULL,
  "title" TEXT,
  "category_id" INTEGER,
  "subcategory_id" INTEGER,
  "item_id" INTEGER,
  "payload" JSONB NOT NULL,
  "current_screen" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ListingDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingDraft_public_id_key"
ON "ListingDraft"("public_id");

CREATE INDEX "ListingDraft_seller_id_updated_at_idx"
ON "ListingDraft"("seller_id", "updated_at");

CREATE INDEX "ListingDraft_seller_id_type_idx"
ON "ListingDraft"("seller_id", "type");

CREATE INDEX "ListingDraft_item_id_idx"
ON "ListingDraft"("item_id");

ALTER TABLE "ListingDraft"
ADD CONSTRAINT "ListingDraft_seller_id_fkey"
FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
