-- Phase B: listing quality fields + moderation history events

CREATE TYPE "ListingModerationActorType" AS ENUM ('SYSTEM', 'ADMIN');
CREATE TYPE "ListingModerationDecision" AS ENUM ('QUEUED', 'AUTO_APPROVED', 'AUTO_REVIEW', 'APPROVED', 'REJECTED');

ALTER TABLE "MarketplaceListing"
ADD COLUMN "tech_grade" TEXT,
ADD COLUMN "tech_battery_health" INTEGER,
ADD COLUMN "tech_defects" TEXT,
ADD COLUMN "tech_included" TEXT,
ADD COLUMN "photo_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "photo_front_present" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "photo_back_present" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "photo_left_present" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "photo_right_present" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MarketplaceListing"
ADD CONSTRAINT "MarketplaceListing_photo_count_non_negative"
CHECK ("photo_count" >= 0);

ALTER TABLE "MarketplaceListing"
ADD CONSTRAINT "MarketplaceListing_tech_battery_health_range"
CHECK (
  "tech_battery_health" IS NULL
  OR ("tech_battery_health" >= 1 AND "tech_battery_health" <= 100)
);

CREATE TABLE "ListingModerationEvent" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "listing_id" INTEGER NOT NULL,
  "actor_user_id" INTEGER,
  "actor_type" "ListingModerationActorType" NOT NULL,
  "decision" "ListingModerationDecision" NOT NULL,
  "reason_code" TEXT NOT NULL,
  "reason_note" TEXT,
  "risk_score" INTEGER,
  "signals" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingModerationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingModerationEvent_public_id_key"
ON "ListingModerationEvent"("public_id");

CREATE INDEX "ListingModerationEvent_listing_created_id_idx"
ON "ListingModerationEvent" ("listing_id", "created_at" DESC, "id" DESC);

CREATE INDEX "ListingModerationEvent_decision_created_id_idx"
ON "ListingModerationEvent" ("decision", "created_at" DESC, "id" DESC);

CREATE INDEX "ListingModerationEvent_reason_code_idx"
ON "ListingModerationEvent" ("reason_code");

ALTER TABLE "ListingModerationEvent"
ADD CONSTRAINT "ListingModerationEvent_listing_id_fkey"
FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ListingModerationEvent"
ADD CONSTRAINT "ListingModerationEvent_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
