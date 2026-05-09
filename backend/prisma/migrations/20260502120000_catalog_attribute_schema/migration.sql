-- Catalog attribute schema + controlled catalog suggestions.
-- C7 is implemented as required attributes per category/subcategory/item, not as one fixed field list for every listing.

CREATE TYPE "CatalogSuggestionEntityType" AS ENUM (
  'CATEGORY',
  'SUBCATEGORY',
  'ITEM',
  'MANUFACTURER',
  'MODEL',
  'ATTRIBUTE_VALUE',
  'ATTRIBUTE_SCHEMA'
);

CREATE TYPE "CatalogSuggestionStatus" AS ENUM (
  'PENDING',
  'AUTO_APPROVED',
  'APPROVED',
  'REJECTED',
  'MERGED'
);

CREATE TABLE "CatalogAttributeDefinition" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "type" "ListingType" NOT NULL,
  "category_id" INTEGER,
  "subcategory_id" INTEGER,
  "item_id" INTEGER,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "input_type" TEXT NOT NULL DEFAULT 'text',
  "required" BOOLEAN NOT NULL DEFAULT false,
  "options" JSONB,
  "unit" TEXT,
  "min_value" DOUBLE PRECISION,
  "max_value" DOUBLE PRECISION,
  "default_value" TEXT,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogAttributeDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogAttributeDefinition_public_id_key"
ON "CatalogAttributeDefinition"("public_id");

CREATE INDEX "CatalogAttributeDefinition_type_category_id_idx"
ON "CatalogAttributeDefinition"("type", "category_id");

CREATE INDEX "CatalogAttributeDefinition_type_subcategory_id_idx"
ON "CatalogAttributeDefinition"("type", "subcategory_id");

CREATE INDEX "CatalogAttributeDefinition_type_item_id_idx"
ON "CatalogAttributeDefinition"("type", "item_id");

CREATE INDEX "CatalogAttributeDefinition_key_idx"
ON "CatalogAttributeDefinition"("key");

ALTER TABLE "CatalogAttributeDefinition"
ADD CONSTRAINT "CatalogAttributeDefinition_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogAttributeDefinition"
ADD CONSTRAINT "CatalogAttributeDefinition_subcategory_id_fkey"
FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogAttributeDefinition"
ADD CONSTRAINT "CatalogAttributeDefinition_item_id_fkey"
FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CatalogSuggestion" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "entity_type" "CatalogSuggestionEntityType" NOT NULL,
  "status" "CatalogSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "type" "ListingType" NOT NULL,
  "category_id" INTEGER,
  "subcategory_id" INTEGER,
  "item_id" INTEGER,
  "proposed_by_id" INTEGER,
  "raw_value" TEXT NOT NULL,
  "normalized_value" TEXT NOT NULL,
  "reason" TEXT,
  "payload" JSONB,
  "admin_note" TEXT,
  "reviewed_by_id" INTEGER,
  "reviewed_at" TIMESTAMP(3),
  "usage_count" INTEGER NOT NULL DEFAULT 1,
  "merged_target_public_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogSuggestion_public_id_key"
ON "CatalogSuggestion"("public_id");

CREATE UNIQUE INDEX "CatalogSuggestion_scope_value"
ON "CatalogSuggestion"("entity_type", "type", "category_id", "subcategory_id", "normalized_value");

CREATE INDEX "CatalogSuggestion_status_created_at_idx"
ON "CatalogSuggestion"("status", "created_at");

CREATE INDEX "CatalogSuggestion_entity_type_type_idx"
ON "CatalogSuggestion"("entity_type", "type");

ALTER TABLE "CatalogSuggestion"
ADD CONSTRAINT "CatalogSuggestion_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogSuggestion"
ADD CONSTRAINT "CatalogSuggestion_subcategory_id_fkey"
FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogSuggestion"
ADD CONSTRAINT "CatalogSuggestion_item_id_fkey"
FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CatalogSuggestion"
ADD CONSTRAINT "CatalogSuggestion_proposed_by_id_fkey"
FOREIGN KEY ("proposed_by_id") REFERENCES "AppUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
