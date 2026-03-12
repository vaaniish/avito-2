-- Add delivery tracking fields for seller logistics workflow.
ALTER TABLE "MarketOrder"
ADD COLUMN IF NOT EXISTS "tracking_provider" TEXT,
ADD COLUMN IF NOT EXISTS "tracking_number" TEXT,
ADD COLUMN IF NOT EXISTS "tracking_url" TEXT,
ADD COLUMN IF NOT EXISTS "delivery_ext_status" TEXT,
ADD COLUMN IF NOT EXISTS "delivery_checked_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "issued_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "MarketOrder_delivery_type_status_delivery_checked_at_idx"
ON "MarketOrder"("delivery_type", "status", "delivery_checked_at");
