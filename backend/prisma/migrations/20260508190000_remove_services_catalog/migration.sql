-- Remove the service listing/catalog mode. Existing service records are discarded
-- because the product now supports товарные объявления only.

DELETE FROM "ListingDraft" WHERE "type" = 'SERVICE';
DELETE FROM "CatalogSuggestion" WHERE "type" = 'SERVICE';
DELETE FROM "CatalogAttributeDefinition" WHERE "type" = 'SERVICE';
DELETE FROM "MarketplaceListing" WHERE "type" = 'SERVICE';
DELETE FROM "CatalogCategory" WHERE "type" = 'SERVICE';

ALTER TYPE "ListingType" RENAME TO "ListingType_old";
CREATE TYPE "ListingType" AS ENUM ('PRODUCT');

ALTER TABLE "CatalogCategory"
  ALTER COLUMN "type" TYPE "ListingType"
  USING "type"::text::"ListingType";

ALTER TABLE "MarketplaceListing"
  ALTER COLUMN "type" TYPE "ListingType"
  USING "type"::text::"ListingType";

ALTER TABLE "CatalogAttributeDefinition"
  ALTER COLUMN "type" TYPE "ListingType"
  USING "type"::text::"ListingType";

ALTER TABLE "CatalogSuggestion"
  ALTER COLUMN "type" TYPE "ListingType"
  USING "type"::text::"ListingType";

ALTER TABLE "ListingDraft"
  ALTER COLUMN "type" TYPE "ListingType"
  USING "type"::text::"ListingType";

DROP TYPE "ListingType_old";
