-- AlterTable
ALTER TABLE "MarketplaceListing"
ADD COLUMN "seller_warranty_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "seller_warranty_days" INTEGER,
ADD COLUMN "has_multiple_stock" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "available_quantity" INTEGER NOT NULL DEFAULT 1;
