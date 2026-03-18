-- Remove normalized City entity and all foreign keys to it.
ALTER TABLE "MarketplaceListing"
  DROP CONSTRAINT IF EXISTS "MarketplaceListing_city_id_fkey";

DROP INDEX IF EXISTS "MarketplaceListing_city_id_idx";

ALTER TABLE "MarketplaceListing"
  DROP COLUMN IF EXISTS "city_id";

ALTER TABLE "AppUser"
  DROP CONSTRAINT IF EXISTS "AppUser_city_id_fkey";

ALTER TABLE "AppUser"
  DROP COLUMN IF EXISTS "city_id";

DROP TABLE IF EXISTS "City";
