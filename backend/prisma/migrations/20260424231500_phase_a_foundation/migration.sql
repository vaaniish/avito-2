-- Phase A foundation: policy acceptance, partner onboarding control, payout profile, order item uniqueness

-- Extend existing enum for partner types.
ALTER TYPE "SellerType" ADD VALUE IF NOT EXISTS 'IP';
ALTER TYPE "SellerType" ADD VALUE IF NOT EXISTS 'BRAND';
ALTER TYPE "SellerType" ADD VALUE IF NOT EXISTS 'ADMIN_APPROVED';

-- New enums.
CREATE TYPE "PartnershipRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "PolicyScope" AS ENUM ('CHECKOUT', 'PARTNERSHIP');
CREATE TYPE "PayoutProfileStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- Strengthen order item uniqueness invariant inside one order.
CREATE UNIQUE INDEX "MarketOrderItem_order_listing_unique"
ON "MarketOrderItem" ("order_id", "listing_id");

-- Extend partnership requests lifecycle fields.
ALTER TABLE "PartnershipRequest"
ADD COLUMN "status" "PartnershipRequestStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reviewed_by_id" INTEGER,
ADD COLUMN "reviewed_at" TIMESTAMP(3),
ADD COLUMN "rejection_reason" TEXT,
ADD COLUMN "admin_note" TEXT;

CREATE INDEX "PartnershipRequest_status_created_at_idx"
ON "PartnershipRequest" ("status", "created_at");

CREATE INDEX "PartnershipRequest_reviewed_by_id_idx"
ON "PartnershipRequest" ("reviewed_by_id");

ALTER TABLE "PartnershipRequest"
ADD CONSTRAINT "PartnershipRequest_reviewed_by_id_fkey"
FOREIGN KEY ("reviewed_by_id") REFERENCES "AppUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Policy registry and explicit user acceptances.
CREATE TABLE "PlatformPolicy" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "scope" "PolicyScope" NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content_url" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformPolicy_public_id_key" ON "PlatformPolicy"("public_id");
CREATE UNIQUE INDEX "PlatformPolicy_scope_version_unique" ON "PlatformPolicy"("scope", "version");
CREATE INDEX "PlatformPolicy_scope_is_active_activated_at_idx"
ON "PlatformPolicy" ("scope", "is_active", "activated_at" DESC);

CREATE TABLE "PolicyAcceptance" (
  "id" SERIAL NOT NULL,
  "policy_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_ip" TEXT,
  "accepted_ua" TEXT,
  CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PolicyAcceptance_policy_user_unique"
ON "PolicyAcceptance" ("policy_id", "user_id");

CREATE INDEX "PolicyAcceptance_user_id_accepted_at_idx"
ON "PolicyAcceptance" ("user_id", "accepted_at");

ALTER TABLE "PolicyAcceptance"
ADD CONSTRAINT "PolicyAcceptance_policy_id_fkey"
FOREIGN KEY ("policy_id") REFERENCES "PlatformPolicy"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyAcceptance"
ADD CONSTRAINT "PolicyAcceptance_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "AppUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Seller payout profile for payout readiness and validation.
CREATE TABLE "SellerPayoutProfile" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "seller_id" INTEGER NOT NULL,
  "legal_type" "SellerType" NOT NULL,
  "legal_name" TEXT NOT NULL,
  "tax_id" TEXT NOT NULL,
  "bank_account" TEXT NOT NULL,
  "bank_bic" TEXT NOT NULL,
  "correspondent_account" TEXT NOT NULL,
  "bank_name" TEXT NOT NULL,
  "recipient_name" TEXT NOT NULL,
  "status" "PayoutProfileStatus" NOT NULL DEFAULT 'PENDING',
  "verified_by_id" INTEGER,
  "verified_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SellerPayoutProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerPayoutProfile_public_id_key" ON "SellerPayoutProfile"("public_id");
CREATE UNIQUE INDEX "SellerPayoutProfile_seller_id_key" ON "SellerPayoutProfile"("seller_id");
CREATE INDEX "SellerPayoutProfile_status_updated_at_idx"
ON "SellerPayoutProfile" ("status", "updated_at" DESC);
CREATE INDEX "SellerPayoutProfile_verified_by_id_updated_at_idx"
ON "SellerPayoutProfile" ("verified_by_id", "updated_at" DESC);

ALTER TABLE "SellerPayoutProfile"
ADD CONSTRAINT "SellerPayoutProfile_seller_id_fkey"
FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SellerPayoutProfile"
ADD CONSTRAINT "SellerPayoutProfile_verified_by_id_fkey"
FOREIGN KEY ("verified_by_id") REFERENCES "AppUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
