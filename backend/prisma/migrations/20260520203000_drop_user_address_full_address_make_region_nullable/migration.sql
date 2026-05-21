ALTER TABLE "UserAddress"
ALTER COLUMN "region" DROP NOT NULL;

ALTER TABLE "UserAddress"
DROP COLUMN "full_address";
