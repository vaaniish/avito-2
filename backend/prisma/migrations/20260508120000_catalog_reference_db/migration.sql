-- Runtime catalog reference tables for brand/model/variant/characteristic data.
-- These tables intentionally omit DNS URLs, raw card text, prices, ratings, and parser-only metadata.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "CatalogReferenceBrand" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "item_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogReferenceBrand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogReferenceModel" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "brand_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogReferenceModel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogReferenceVariant" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "model_id" INTEGER NOT NULL,
  "external_product_id" TEXT,
  "title" TEXT NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogReferenceVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogReferenceCharacteristic" (
  "id" SERIAL NOT NULL,
  "variant_id" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "raw_value" TEXT NOT NULL,
  "source_group_index" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'bracketGroups',
  "order_index" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CatalogReferenceCharacteristic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogReferenceBrand_public_id_key"
ON "CatalogReferenceBrand"("public_id");

CREATE UNIQUE INDEX "CatalogReferenceBrand_item_id_name_key"
ON "CatalogReferenceBrand"("item_id", "name");

CREATE INDEX "CatalogReferenceBrand_item_id_order_index_idx"
ON "CatalogReferenceBrand"("item_id", "order_index");

CREATE INDEX "CatalogReferenceBrand_name_idx"
ON "CatalogReferenceBrand"("name");

CREATE INDEX "CatalogReferenceBrand_name_trgm_idx"
ON "CatalogReferenceBrand" USING GIN ("name" gin_trgm_ops);

CREATE UNIQUE INDEX "CatalogReferenceModel_public_id_key"
ON "CatalogReferenceModel"("public_id");

CREATE UNIQUE INDEX "CatalogReferenceModel_brand_id_name_key"
ON "CatalogReferenceModel"("brand_id", "name");

CREATE INDEX "CatalogReferenceModel_brand_id_order_index_idx"
ON "CatalogReferenceModel"("brand_id", "order_index");

CREATE INDEX "CatalogReferenceModel_name_idx"
ON "CatalogReferenceModel"("name");

CREATE INDEX "CatalogReferenceModel_name_trgm_idx"
ON "CatalogReferenceModel" USING GIN ("name" gin_trgm_ops);

CREATE UNIQUE INDEX "CatalogReferenceVariant_public_id_key"
ON "CatalogReferenceVariant"("public_id");

CREATE UNIQUE INDEX "CatalogReferenceVariant_model_id_external_product_id_key"
ON "CatalogReferenceVariant"("model_id", "external_product_id");

CREATE INDEX "CatalogReferenceVariant_model_id_order_index_idx"
ON "CatalogReferenceVariant"("model_id", "order_index");

CREATE INDEX "CatalogReferenceVariant_title_idx"
ON "CatalogReferenceVariant"("title");

CREATE INDEX "CatalogReferenceVariant_title_trgm_idx"
ON "CatalogReferenceVariant" USING GIN ("title" gin_trgm_ops);

CREATE INDEX "CatalogReferenceCharacteristic_variant_id_order_index_idx"
ON "CatalogReferenceCharacteristic"("variant_id", "order_index");

CREATE INDEX "CatalogReferenceCharacteristic_key_idx"
ON "CatalogReferenceCharacteristic"("key");

CREATE INDEX "CatalogReferenceCharacteristic_value_idx"
ON "CatalogReferenceCharacteristic"("value");

ALTER TABLE "CatalogReferenceBrand"
ADD CONSTRAINT "CatalogReferenceBrand_item_id_fkey"
FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogReferenceModel"
ADD CONSTRAINT "CatalogReferenceModel_brand_id_fkey"
FOREIGN KEY ("brand_id") REFERENCES "CatalogReferenceBrand"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogReferenceVariant"
ADD CONSTRAINT "CatalogReferenceVariant_model_id_fkey"
FOREIGN KEY ("model_id") REFERENCES "CatalogReferenceModel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogReferenceCharacteristic"
ADD CONSTRAINT "CatalogReferenceCharacteristic_variant_id_fkey"
FOREIGN KEY ("variant_id") REFERENCES "CatalogReferenceVariant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
