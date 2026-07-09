ALTER TABLE "MarketplaceListing"
ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "MarketplaceListing_deleted_at_idx"
ON "MarketplaceListing"("deleted_at");
