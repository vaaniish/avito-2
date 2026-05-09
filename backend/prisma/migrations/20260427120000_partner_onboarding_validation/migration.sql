ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'LEGAL_REVIEW';
ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'REPRESENTATIVE_REVIEW';
ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'PAYOUT_REVIEW';
ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'QUALITY_REVIEW';
ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'APPROVED_LIMITED';
ALTER TYPE "PartnershipRequestStatus" ADD VALUE IF NOT EXISTS 'NEEDS_MORE_INFO';

CREATE TABLE IF NOT EXISTS "PartnerOnboardingProfile" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "request_id" INTEGER NOT NULL,
  "legal_type" "SellerType" NOT NULL,
  "inn" TEXT NOT NULL,
  "ogrn" TEXT NOT NULL,
  "kpp" TEXT,
  "legal_name" TEXT NOT NULL,
  "registration_status" TEXT NOT NULL,
  "registered_address" TEXT NOT NULL,
  "tax_region" TEXT NOT NULL,
  "representative_full_name" TEXT NOT NULL,
  "representative_role" TEXT NOT NULL,
  "representative_phone" TEXT NOT NULL,
  "representative_email" TEXT NOT NULL,
  "authority_type" TEXT NOT NULL,
  "authority_document" TEXT,
  "website_url" TEXT NOT NULL,
  "business_email" TEXT NOT NULL,
  "domain_ownership_method" TEXT NOT NULL,
  "public_profile_urls" JSONB NOT NULL,
  "business_role" TEXT NOT NULL,
  "categories" JSONB NOT NULL,
  "fulfillment_model" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "warehouse_address" TEXT NOT NULL,
  "service_center_address" TEXT NOT NULL,
  "delivery_coverage_regions" JSONB NOT NULL,
  "pickup_available" BOOLEAN NOT NULL DEFAULT false,
  "return_address" TEXT NOT NULL,
  "support_phone" TEXT NOT NULL,
  "support_email" TEXT NOT NULL,
  "service_hours" TEXT NOT NULL,
  "monthly_capacity" INTEGER NOT NULL,
  "product_source_type" TEXT NOT NULL,
  "supplier_documents" TEXT NOT NULL,
  "diagnostic_process" TEXT NOT NULL,
  "grading_standard" TEXT NOT NULL,
  "warranty_days" INTEGER NOT NULL,
  "return_days" INTEGER NOT NULL,
  "serial_check_policy" TEXT NOT NULL,
  "quality_charter_accepted" BOOLEAN NOT NULL DEFAULT false,
  "legal_lookup_verified" BOOLEAN NOT NULL DEFAULT false,
  "email_verified" BOOLEAN NOT NULL DEFAULT false,
  "domain_verified" BOOLEAN NOT NULL DEFAULT false,
  "representative_verified" BOOLEAN NOT NULL DEFAULT false,
  "payout_verified" BOOLEAN NOT NULL DEFAULT false,
  "allowed_categories" JSONB,
  "listing_limit" INTEGER NOT NULL DEFAULT 20,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerOnboardingProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerOnboardingProfile_public_id_key" ON "PartnerOnboardingProfile"("public_id");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerOnboardingProfile_request_id_key" ON "PartnerOnboardingProfile"("request_id");
CREATE INDEX IF NOT EXISTS "PartnerOnboardingProfile_legal_type_inn_idx" ON "PartnerOnboardingProfile"("legal_type", "inn");
CREATE INDEX IF NOT EXISTS "PartnerOnboardingProfile_registration_status_idx" ON "PartnerOnboardingProfile"("registration_status");
CREATE INDEX IF NOT EXISTS "PartnerOnboardingProfile_city_region_idx" ON "PartnerOnboardingProfile"("city", "region");
CREATE INDEX IF NOT EXISTS "PartnerOnboardingProfile_created_at_idx" ON "PartnerOnboardingProfile"("created_at");

ALTER TABLE "PartnerOnboardingProfile"
ADD CONSTRAINT "PartnerOnboardingProfile_request_id_fkey"
FOREIGN KEY ("request_id") REFERENCES "PartnershipRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
