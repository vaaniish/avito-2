ALTER TABLE "CatalogSearchRule"
  DROP COLUMN "brand_name",
  DROP COLUMN "model_name",
  DROP COLUMN "is_generated";

ALTER TABLE "MarketplaceListing"
  DROP COLUMN "photo_count",
  DROP COLUMN "photo_front_present",
  DROP COLUMN "photo_back_present",
  DROP COLUMN "photo_left_present",
  DROP COLUMN "photo_right_present";
