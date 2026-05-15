-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_QUESTION', 'ORDER_STATUS', 'SYSTEM', 'INFO');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('PRODUCT');

-- CreateEnum
CREATE TYPE "ListingCondition" AS ENUM ('NEW', 'USED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MODERATION');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('APPROVED', 'REJECTED', 'PENDING');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'ANSWERED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAID', 'PROCESSING', 'PREPARED', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'HELD', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('YOOMONEY', 'STRIPE', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintSanctionLevel" AS ENUM ('WARNING', 'TEMP_3_DAYS', 'TEMP_30_DAYS', 'PERMANENT');

-- CreateEnum
CREATE TYPE "ComplaintSanctionStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('COMPANY', 'PRIVATE', 'INDIVIDUAL', 'IP', 'BRAND', 'ADMIN_APPROVED');

-- CreateEnum
CREATE TYPE "PartnershipRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LEGAL_REVIEW', 'REPRESENTATIVE_REVIEW', 'PAYOUT_REVIEW', 'QUALITY_REVIEW', 'APPROVED_LIMITED', 'NEEDS_MORE_INFO', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PolicyScope" AS ENUM ('CHECKOUT', 'PARTNERSHIP');

-- CreateEnum
CREATE TYPE "PayoutProfileStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ListingModerationActorType" AS ENUM ('SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "ListingModerationDecision" AS ENUM ('QUEUED', 'AUTO_APPROVED', 'AUTO_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CatalogSuggestionEntityType" AS ENUM ('CATEGORY', 'SUBCATEGORY', 'ITEM', 'MANUFACTURER', 'MODEL', 'ATTRIBUTE_VALUE', 'ATTRIBUTE_SCHEMA');

-- CreateEnum
CREATE TYPE "CatalogSuggestionStatus" AS ENUM ('PENDING', 'AUTO_APPROVED', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "display_name" TEXT,
    "username" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "block_reason" TEXT,
    "blocked_until" TIMESTAMP(3),
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "average_response_minutes" INTEGER,
    "commission_tier_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "full_address" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "house" TEXT NOT NULL,
    "apartment" TEXT DEFAULT '',
    "entrance" TEXT DEFAULT '',
    "postal_code" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogCategory" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "name" TEXT NOT NULL,
    "icon_key" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSubcategory" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" SERIAL NOT NULL,
    "subcategory_id" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSearchRule" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "normalized_phrase" TEXT NOT NULL,
    "category_id" INTEGER,
    "subcategory_id" INTEGER,
    "item_id" INTEGER,
    "brand_name" TEXT,
    "normalized_brand" TEXT,
    "model_name" TEXT,
    "normalized_model" TEXT,
    "characteristic_key" TEXT,
    "characteristic_value" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "is_generated" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSearchRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogReferenceBrand" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "item_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogReferenceBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogReferenceModel" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "brand_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogReferenceModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogReferenceVariant" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "model_id" INTEGER NOT NULL,
    "external_product_id" TEXT,
    "title" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogReferenceVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogReferenceCharacteristic" (
    "id" SERIAL NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "raw_value" TEXT NOT NULL,
    "source_group_index" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'bracketGroups',
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogReferenceCharacteristic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogAttributeDefinition" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "category_id" INTEGER,
    "subcategory_id" INTEGER,
    "item_id" INTEGER,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "input_type" TEXT NOT NULL DEFAULT 'text',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" JSONB,
    "unit" TEXT,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "default_value" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogAttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogSuggestion" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "entity_type" "CatalogSuggestionEntityType" NOT NULL,
    "status" "CatalogSuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "type" "ListingType" NOT NULL,
    "category_id" INTEGER,
    "subcategory_id" INTEGER,
    "item_id" INTEGER,
    "proposed_by_id" INTEGER,
    "raw_value" TEXT NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "admin_note" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "usage_count" INTEGER NOT NULL DEFAULT 1,
    "merged_target_public_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "type" "ListingType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "item_id" INTEGER,
    "price" INTEGER NOT NULL,
    "sale_price" INTEGER,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "condition" "ListingCondition" NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
    "views" INTEGER NOT NULL DEFAULT 0,
    "shipping_by_seller" BOOLEAN NOT NULL DEFAULT true,
    "sku" TEXT,
    "tech_grade" TEXT,
    "tech_battery_health" INTEGER,
    "tech_defects" TEXT,
    "tech_included" TEXT,
    "photo_count" INTEGER NOT NULL DEFAULT 0,
    "photo_front_present" BOOLEAN NOT NULL DEFAULT false,
    "photo_back_present" BOOLEAN NOT NULL DEFAULT false,
    "photo_left_present" BOOLEAN NOT NULL DEFAULT false,
    "photo_right_present" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingSearchKeyword" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "phrase" TEXT NOT NULL,
    "normalized_phrase" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "source" TEXT NOT NULL DEFAULT 'derived',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingSearchKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingDraft" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "type" "ListingType" NOT NULL,
    "title" TEXT,
    "category_id" INTEGER,
    "subcategory_id" INTEGER,
    "item_id" INTEGER,
    "payload" JSONB NOT NULL,
    "current_screen" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingAttribute" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "ListingReview" (
    "id" SERIAL NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingQuestion" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),

    CONSTRAINT "ListingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "delivery_type" "DeliveryType" NOT NULL,
    "delivery_address" TEXT,
    "tracking_provider" TEXT,
    "tracking_number" TEXT,
    "tracking_url" TEXT,
    "delivery_ext_status" TEXT,
    "delivery_checked_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "issued_at" TIMESTAMP(3),
    "total_price" INTEGER NOT NULL,
    "delivery_cost" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketOrderItem" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "listing_id" INTEGER,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "MarketOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTransaction" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "commission_rate" DOUBLE PRECISION NOT NULL,
    "commission" INTEGER NOT NULL,
    "payment_provider" "PaymentProvider" NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'NEW',
    "complaint_type" TEXT NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "reporter_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "checked_at" TIMESTAMP(3),
    "checked_by_id" INTEGER,
    "action_taken" TEXT,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEvent" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "actor_user_id" INTEGER,
    "event_type" TEXT NOT NULL,
    "from_status" "ComplaintStatus",
    "to_status" "ComplaintStatus",
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminIdempotencyKey" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutIdempotencyKey" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "actor_user_id" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutIdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintSanction" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "complaint_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "level" "ComplaintSanctionLevel" NOT NULL,
    "status" "ComplaintSanctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplaintSanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycRequest" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "seller_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "inn" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "documents" TEXT,
    "notes" TEXT,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,

    CONSTRAINT "KycRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_sales" INTEGER NOT NULL,
    "max_sales" INTEGER,
    "commission_rate" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerCommissionPeriodStat" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "period_key" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "gross" INTEGER NOT NULL DEFAULT 0,
    "commission_total" INTEGER NOT NULL DEFAULT 0,
    "seller_profit" INTEGER NOT NULL DEFAULT 0,
    "payable" INTEGER NOT NULL DEFAULT 0,
    "held" INTEGER NOT NULL DEFAULT 0,
    "refunded_cancelled" INTEGER NOT NULL DEFAULT 0,
    "qualified_gmv" INTEGER NOT NULL DEFAULT 0,
    "completed_orders" INTEGER NOT NULL DEFAULT 0,
    "successful_transactions" INTEGER NOT NULL DEFAULT 0,
    "total_transactions" INTEGER NOT NULL DEFAULT 0,
    "current_tier_id" INTEGER,
    "next_tier_id" INTEGER,
    "sales_to_next_tier" INTEGER NOT NULL DEFAULT 0,
    "percent_to_next_tier" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commission_rate_at_period_end" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snapshot_finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerCommissionPeriodStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnershipRequest" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "seller_type" "SellerType" NOT NULL,
    "status" "PartnershipRequestStatus" NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "inn" TEXT,
    "geography" TEXT,
    "social_profile" TEXT,
    "credibility" TEXT,
    "why_us" TEXT NOT NULL,
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "admin_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOnboardingProfile" (
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "PolicyAcceptance" (
    "id" SERIAL NOT NULL,
    "policy_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_ip" TEXT,
    "accepted_ua" TEXT,

    CONSTRAINT "PolicyAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "changed_by_id" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "actor_user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_public_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_public_id_key" ON "AppUser"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_username_key" ON "AppUser"("username");

-- CreateIndex
CREATE INDEX "AppUser_role_status_idx" ON "AppUser"("role", "status");

-- CreateIndex
CREATE INDEX "AppUser_created_at_idx" ON "AppUser"("created_at");

-- CreateIndex
CREATE INDEX "Notification_user_id_is_read_idx" ON "Notification"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_user_id_key" ON "SellerProfile"("user_id");

-- CreateIndex
CREATE INDEX "SellerProfile_commission_tier_id_idx" ON "SellerProfile"("commission_tier_id");

-- CreateIndex
CREATE INDEX "UserAddress_user_id_is_default_idx" ON "UserAddress"("user_id", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "UserAddress_user_id_label_key" ON "UserAddress"("user_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCategory_public_id_key" ON "CatalogCategory"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogCategory_type_name_key" ON "CatalogCategory"("type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSubcategory_public_id_key" ON "CatalogSubcategory"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSubcategory_category_id_name_key" ON "CatalogSubcategory"("category_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_public_id_key" ON "CatalogItem"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_subcategory_id_name_key" ON "CatalogItem"("subcategory_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSearchRule_public_id_key" ON "CatalogSearchRule"("public_id");

-- CreateIndex
CREATE INDEX "CatalogSearchRule_normalized_phrase_idx" ON "CatalogSearchRule"("normalized_phrase");

-- CreateIndex
CREATE INDEX "CatalogSearchRule_category_id_subcategory_id_item_id_idx" ON "CatalogSearchRule"("category_id", "subcategory_id", "item_id");

-- CreateIndex
CREATE INDEX "CatalogSearchRule_normalized_brand_normalized_model_idx" ON "CatalogSearchRule"("normalized_brand", "normalized_model");

-- CreateIndex
CREATE INDEX "CatalogSearchRule_characteristic_key_idx" ON "CatalogSearchRule"("characteristic_key");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSearchRule_scope_phrase_unique" ON "CatalogSearchRule"("normalized_phrase", "category_id", "subcategory_id", "item_id", "normalized_brand", "normalized_model");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogReferenceBrand_public_id_key" ON "CatalogReferenceBrand"("public_id");

-- CreateIndex
CREATE INDEX "CatalogReferenceBrand_item_id_order_index_idx" ON "CatalogReferenceBrand"("item_id", "order_index");

-- CreateIndex
CREATE INDEX "CatalogReferenceBrand_name_idx" ON "CatalogReferenceBrand"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogReferenceBrand_item_id_name_key" ON "CatalogReferenceBrand"("item_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogReferenceModel_public_id_key" ON "CatalogReferenceModel"("public_id");

-- CreateIndex
CREATE INDEX "CatalogReferenceModel_brand_id_order_index_idx" ON "CatalogReferenceModel"("brand_id", "order_index");

-- CreateIndex
CREATE INDEX "CatalogReferenceModel_name_idx" ON "CatalogReferenceModel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogReferenceModel_brand_id_name_key" ON "CatalogReferenceModel"("brand_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogReferenceVariant_public_id_key" ON "CatalogReferenceVariant"("public_id");

-- CreateIndex
CREATE INDEX "CatalogReferenceVariant_model_id_order_index_idx" ON "CatalogReferenceVariant"("model_id", "order_index");

-- CreateIndex
CREATE INDEX "CatalogReferenceVariant_title_idx" ON "CatalogReferenceVariant"("title");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogReferenceVariant_model_id_external_product_id_key" ON "CatalogReferenceVariant"("model_id", "external_product_id");

-- CreateIndex
CREATE INDEX "CatalogReferenceCharacteristic_variant_id_order_index_idx" ON "CatalogReferenceCharacteristic"("variant_id", "order_index");

-- CreateIndex
CREATE INDEX "CatalogReferenceCharacteristic_key_idx" ON "CatalogReferenceCharacteristic"("key");

-- CreateIndex
CREATE INDEX "CatalogReferenceCharacteristic_value_idx" ON "CatalogReferenceCharacteristic"("value");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogAttributeDefinition_public_id_key" ON "CatalogAttributeDefinition"("public_id");

-- CreateIndex
CREATE INDEX "CatalogAttributeDefinition_type_category_id_idx" ON "CatalogAttributeDefinition"("type", "category_id");

-- CreateIndex
CREATE INDEX "CatalogAttributeDefinition_type_subcategory_id_idx" ON "CatalogAttributeDefinition"("type", "subcategory_id");

-- CreateIndex
CREATE INDEX "CatalogAttributeDefinition_type_item_id_idx" ON "CatalogAttributeDefinition"("type", "item_id");

-- CreateIndex
CREATE INDEX "CatalogAttributeDefinition_key_idx" ON "CatalogAttributeDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSuggestion_public_id_key" ON "CatalogSuggestion"("public_id");

-- CreateIndex
CREATE INDEX "CatalogSuggestion_status_created_at_idx" ON "CatalogSuggestion"("status", "created_at");

-- CreateIndex
CREATE INDEX "CatalogSuggestion_entity_type_type_idx" ON "CatalogSuggestion"("entity_type", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogSuggestion_scope_value" ON "CatalogSuggestion"("entity_type", "type", "category_id", "subcategory_id", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_public_id_key" ON "MarketplaceListing"("public_id");

-- CreateIndex
CREATE INDEX "MarketplaceListing_seller_id_idx" ON "MarketplaceListing"("seller_id");

-- CreateIndex
CREATE INDEX "MarketplaceListing_item_id_idx" ON "MarketplaceListing"("item_id");

-- CreateIndex
CREATE INDEX "MarketplaceListing_type_status_moderation_status_idx" ON "MarketplaceListing"("type", "status", "moderation_status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_moderation_status_created_at_idx" ON "MarketplaceListing"("status", "moderation_status", "created_at");

-- CreateIndex
CREATE INDEX "MarketplaceListing_type_status_moderation_created_id_idx" ON "MarketplaceListing"("type", "status", "moderation_status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ListingSearchKeyword_listing_id_weight_idx" ON "ListingSearchKeyword"("listing_id", "weight" DESC);

-- CreateIndex
CREATE INDEX "ListingSearchKeyword_normalized_phrase_idx" ON "ListingSearchKeyword"("normalized_phrase");

-- CreateIndex
CREATE UNIQUE INDEX "ListingSearchKeyword_listing_phrase_unique" ON "ListingSearchKeyword"("listing_id", "normalized_phrase");

-- CreateIndex
CREATE UNIQUE INDEX "ListingDraft_public_id_key" ON "ListingDraft"("public_id");

-- CreateIndex
CREATE INDEX "ListingDraft_seller_id_updated_at_idx" ON "ListingDraft"("seller_id", "updated_at");

-- CreateIndex
CREATE INDEX "ListingDraft_seller_id_type_idx" ON "ListingDraft"("seller_id", "type");

-- CreateIndex
CREATE INDEX "ListingDraft_item_id_idx" ON "ListingDraft"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "ListingImage_listing_id_sort_order_key" ON "ListingImage"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "ListingAttribute_listing_id_idx" ON "ListingAttribute"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "ListingAttribute_listing_id_attr_key" ON "ListingAttribute"("listing_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ListingModerationEvent_public_id_key" ON "ListingModerationEvent"("public_id");

-- CreateIndex
CREATE INDEX "ListingModerationEvent_listing_created_id_idx" ON "ListingModerationEvent"("listing_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ListingModerationEvent_decision_created_id_idx" ON "ListingModerationEvent"("decision", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "ListingModerationEvent_reason_code_idx" ON "ListingModerationEvent"("reason_code");

-- CreateIndex
CREATE INDEX "ListingReview_listing_id_created_at_idx" ON "ListingReview"("listing_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ListingReview_listing_id_author_id_key" ON "ListingReview"("listing_id", "author_id");

-- CreateIndex
CREATE UNIQUE INDEX "ListingQuestion_public_id_key" ON "ListingQuestion"("public_id");

-- CreateIndex
CREATE INDEX "ListingQuestion_listing_id_created_at_idx" ON "ListingQuestion"("listing_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_user_id_listing_id_key" ON "WishlistItem"("user_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketOrder_public_id_key" ON "MarketOrder"("public_id");

-- CreateIndex
CREATE INDEX "MarketOrder_buyer_id_idx" ON "MarketOrder"("buyer_id");

-- CreateIndex
CREATE INDEX "MarketOrder_seller_id_idx" ON "MarketOrder"("seller_id");

-- CreateIndex
CREATE INDEX "MarketOrder_status_created_at_idx" ON "MarketOrder"("status", "created_at");

-- CreateIndex
CREATE INDEX "MarketOrder_delivery_type_status_delivery_checked_at_idx" ON "MarketOrder"("delivery_type", "status", "delivery_checked_at");

-- CreateIndex
CREATE INDEX "MarketOrderItem_order_id_idx" ON "MarketOrderItem"("order_id");

-- CreateIndex
CREATE INDEX "MarketOrderItem_listing_id_idx" ON "MarketOrderItem"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketOrderItem_order_listing_unique" ON "MarketOrderItem"("order_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTransaction_public_id_key" ON "PlatformTransaction"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTransaction_payment_intent_id_key" ON "PlatformTransaction"("payment_intent_id");

-- CreateIndex
CREATE INDEX "PlatformTransaction_order_id_idx" ON "PlatformTransaction"("order_id");

-- CreateIndex
CREATE INDEX "PlatformTransaction_buyer_id_idx" ON "PlatformTransaction"("buyer_id");

-- CreateIndex
CREATE INDEX "PlatformTransaction_seller_id_idx" ON "PlatformTransaction"("seller_id");

-- CreateIndex
CREATE INDEX "PlatformTransaction_status_created_at_idx" ON "PlatformTransaction"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_public_id_key" ON "Complaint"("public_id");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_listing_id_idx" ON "Complaint"("listing_id");

-- CreateIndex
CREATE INDEX "Complaint_status_created_at_id_idx" ON "Complaint"("status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Complaint_listing_status_created_at_id_idx" ON "Complaint"("listing_id", "status", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintEvent_public_id_key" ON "ComplaintEvent"("public_id");

-- CreateIndex
CREATE INDEX "ComplaintEvent_complaint_id_created_at_idx" ON "ComplaintEvent"("complaint_id", "created_at");

-- CreateIndex
CREATE INDEX "ComplaintEvent_actor_user_id_created_at_idx" ON "ComplaintEvent"("actor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AdminIdempotencyKey_public_id_key" ON "AdminIdempotencyKey"("public_id");

-- CreateIndex
CREATE INDEX "AdminIdempotencyKey_created_at_idx" ON "AdminIdempotencyKey"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AdminIdempotency_actor_action_key_unique" ON "AdminIdempotencyKey"("actor_user_id", "action", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIdempotencyKey_public_id_key" ON "CheckoutIdempotencyKey"("public_id");

-- CreateIndex
CREATE INDEX "CheckoutIdempotencyKey_created_at_idx" ON "CheckoutIdempotencyKey"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutIdempotency_actor_action_key_unique" ON "CheckoutIdempotencyKey"("actor_user_id", "action", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintSanction_public_id_key" ON "ComplaintSanction"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "ComplaintSanction_complaint_id_key" ON "ComplaintSanction"("complaint_id");

-- CreateIndex
CREATE INDEX "ComplaintSanction_seller_id_status_created_at_idx" ON "ComplaintSanction"("seller_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ComplaintSanction_created_by_id_idx" ON "ComplaintSanction"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "KycRequest_public_id_key" ON "KycRequest"("public_id");

-- CreateIndex
CREATE INDEX "KycRequest_status_created_at_idx" ON "KycRequest"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTier_public_id_key" ON "CommissionTier"("public_id");

-- CreateIndex
CREATE INDEX "CommissionTier_min_sales_max_sales_idx" ON "CommissionTier"("min_sales", "max_sales");

-- CreateIndex
CREATE UNIQUE INDEX "SellerCommissionPeriodStat_public_id_key" ON "SellerCommissionPeriodStat"("public_id");

-- CreateIndex
CREATE INDEX "SellerCommissionPeriodStat_seller_id_period_start_idx" ON "SellerCommissionPeriodStat"("seller_id", "period_start");

-- CreateIndex
CREATE INDEX "SellerCommissionPeriodStat_current_tier_id_idx" ON "SellerCommissionPeriodStat"("current_tier_id");

-- CreateIndex
CREATE INDEX "SellerCommissionPeriodStat_next_tier_id_idx" ON "SellerCommissionPeriodStat"("next_tier_id");

-- CreateIndex
CREATE UNIQUE INDEX "SellerCommissionPeriodStat_seller_period_key_unique" ON "SellerCommissionPeriodStat"("seller_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "PartnershipRequest_public_id_key" ON "PartnershipRequest"("public_id");

-- CreateIndex
CREATE INDEX "PartnershipRequest_status_created_at_idx" ON "PartnershipRequest"("status", "created_at");

-- CreateIndex
CREATE INDEX "PartnershipRequest_reviewed_by_id_idx" ON "PartnershipRequest"("reviewed_by_id");

-- CreateIndex
CREATE INDEX "PartnershipRequest_created_at_idx" ON "PartnershipRequest"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOnboardingProfile_public_id_key" ON "PartnerOnboardingProfile"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOnboardingProfile_request_id_key" ON "PartnerOnboardingProfile"("request_id");

-- CreateIndex
CREATE INDEX "PartnerOnboardingProfile_legal_type_inn_idx" ON "PartnerOnboardingProfile"("legal_type", "inn");

-- CreateIndex
CREATE INDEX "PartnerOnboardingProfile_registration_status_idx" ON "PartnerOnboardingProfile"("registration_status");

-- CreateIndex
CREATE INDEX "PartnerOnboardingProfile_city_region_idx" ON "PartnerOnboardingProfile"("city", "region");

-- CreateIndex
CREATE INDEX "PartnerOnboardingProfile_created_at_idx" ON "PartnerOnboardingProfile"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPolicy_public_id_key" ON "PlatformPolicy"("public_id");

-- CreateIndex
CREATE INDEX "PlatformPolicy_scope_is_active_activated_at_idx" ON "PlatformPolicy"("scope", "is_active", "activated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformPolicy_scope_version_unique" ON "PlatformPolicy"("scope", "version");

-- CreateIndex
CREATE INDEX "PolicyAcceptance_user_id_accepted_at_idx" ON "PolicyAcceptance"("user_id", "accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcceptance_policy_user_unique" ON "PolicyAcceptance"("policy_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayoutProfile_public_id_key" ON "SellerPayoutProfile"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "SellerPayoutProfile_seller_id_key" ON "SellerPayoutProfile"("seller_id");

-- CreateIndex
CREATE INDEX "SellerPayoutProfile_status_updated_at_idx" ON "SellerPayoutProfile"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "SellerPayoutProfile_verified_by_id_updated_at_idx" ON "SellerPayoutProfile"("verified_by_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "OrderStatusHistory_order_id_created_at_idx" ON "OrderStatusHistory"("order_id", "created_at");

-- CreateIndex
CREATE INDEX "OrderStatusHistory_changed_by_id_idx" ON "OrderStatusHistory"("changed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_public_id_key" ON "AuditLog"("public_id");

-- CreateIndex
CREATE INDEX "AuditLog_actor_user_id_created_at_idx" ON "AuditLog"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "AuditLog_entity_type_entity_public_id_idx" ON "AuditLog"("entity_type", "entity_public_id");

-- CreateIndex
CREATE INDEX "AuditLog_action_created_at_idx" ON "AuditLog"("action", "created_at");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_commission_tier_id_fkey" FOREIGN KEY ("commission_tier_id") REFERENCES "CommissionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSubcategory" ADD CONSTRAINT "CatalogSubcategory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSearchRule" ADD CONSTRAINT "CatalogSearchRule_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSearchRule" ADD CONSTRAINT "CatalogSearchRule_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSearchRule" ADD CONSTRAINT "CatalogSearchRule_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogReferenceBrand" ADD CONSTRAINT "CatalogReferenceBrand_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogReferenceModel" ADD CONSTRAINT "CatalogReferenceModel_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "CatalogReferenceBrand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogReferenceVariant" ADD CONSTRAINT "CatalogReferenceVariant_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "CatalogReferenceModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogReferenceCharacteristic" ADD CONSTRAINT "CatalogReferenceCharacteristic_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "CatalogReferenceVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeDefinition" ADD CONSTRAINT "CatalogAttributeDefinition_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeDefinition" ADD CONSTRAINT "CatalogAttributeDefinition_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogAttributeDefinition" ADD CONSTRAINT "CatalogAttributeDefinition_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSuggestion" ADD CONSTRAINT "CatalogSuggestion_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSuggestion" ADD CONSTRAINT "CatalogSuggestion_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSuggestion" ADD CONSTRAINT "CatalogSuggestion_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSuggestion" ADD CONSTRAINT "CatalogSuggestion_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingSearchKeyword" ADD CONSTRAINT "ListingSearchKeyword_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingDraft" ADD CONSTRAINT "ListingDraft_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAttribute" ADD CONSTRAINT "ListingAttribute_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingModerationEvent" ADD CONSTRAINT "ListingModerationEvent_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingModerationEvent" ADD CONSTRAINT "ListingModerationEvent_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingReview" ADD CONSTRAINT "ListingReview_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingReview" ADD CONSTRAINT "ListingReview_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingQuestion" ADD CONSTRAINT "ListingQuestion_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingQuestion" ADD CONSTRAINT "ListingQuestion_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder" ADD CONSTRAINT "MarketOrder_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrderItem" ADD CONSTRAINT "MarketOrderItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrderItem" ADD CONSTRAINT "MarketOrderItem_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTransaction" ADD CONSTRAINT "PlatformTransaction_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTransaction" ADD CONSTRAINT "PlatformTransaction_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformTransaction" ADD CONSTRAINT "PlatformTransaction_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_checked_by_id_fkey" FOREIGN KEY ("checked_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminIdempotencyKey" ADD CONSTRAINT "AdminIdempotencyKey_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutIdempotencyKey" ADD CONSTRAINT "CheckoutIdempotencyKey_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintSanction" ADD CONSTRAINT "ComplaintSanction_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "Complaint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintSanction" ADD CONSTRAINT "ComplaintSanction_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintSanction" ADD CONSTRAINT "ComplaintSanction_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCommissionPeriodStat" ADD CONSTRAINT "SellerCommissionPeriodStat_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCommissionPeriodStat" ADD CONSTRAINT "SellerCommissionPeriodStat_current_tier_id_fkey" FOREIGN KEY ("current_tier_id") REFERENCES "CommissionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCommissionPeriodStat" ADD CONSTRAINT "SellerCommissionPeriodStat_next_tier_id_fkey" FOREIGN KEY ("next_tier_id") REFERENCES "CommissionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOnboardingProfile" ADD CONSTRAINT "PartnerOnboardingProfile_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "PartnershipRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "PlatformPolicy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcceptance" ADD CONSTRAINT "PolicyAcceptance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayoutProfile" ADD CONSTRAINT "SellerPayoutProfile_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerPayoutProfile" ADD CONSTRAINT "SellerPayoutProfile_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

