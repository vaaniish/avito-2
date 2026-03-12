-- Squashed migration: 20260306193155 + 20260308200000_align_legacy_schema + 20260311143000_complaint_sanctions

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_QUESTION', 'ORDER_STATUS', 'SYSTEM', 'INFO');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('PRODUCT', 'SERVICE');

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
CREATE TYPE "PaymentProvider" AS ENUM ('CASH', 'YOOMONEY', 'STRIPE', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SellerType" AS ENUM ('COMPANY', 'PRIVATE', 'INDIVIDUAL');

-- CreateTable
CREATE TABLE "AppUser" (
    "id" SERIAL PRIMARY KEY,
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
    "city_id" INTEGER,
    "avatar" TEXT,
    "block_reason" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "average_response_minutes" INTEGER,
    "commission_tier_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "UserAddress" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "city_id" INTEGER NOT NULL,
    "street" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "CatalogCategory" (
    "id" SERIAL PRIMARY KEY,
    "public_id" TEXT NOT NULL,
    "type" "ListingType" NOT NULL,
    "name" TEXT NOT NULL,
    "icon_key" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "CatalogSubcategory" (
    "id" SERIAL PRIMARY KEY,
    "category_id" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" SERIAL PRIMARY KEY,
    "subcategory_id" INTEGER NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" SERIAL PRIMARY KEY,
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
    "city_id" INTEGER NOT NULL,
    "shipping_by_seller" BOOLEAN NOT NULL DEFAULT true,
    "sku" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" SERIAL PRIMARY KEY,
    "listing_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- CreateTable
CREATE TABLE "ListingAttribute" (
    "id" SERIAL PRIMARY KEY,
    "listing_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0

);

-- CreateTable
CREATE TABLE "ListingReview" (
    "id" SERIAL PRIMARY KEY,
    "listing_id" INTEGER NOT NULL,
    "author_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- CreateTable
CREATE TABLE "ListingQuestion" (
    "id" SERIAL PRIMARY KEY,
    "public_id" TEXT NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "status" "QuestionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3)

);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "listing_id" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- CreateTable
CREATE TABLE "MarketOrder" (
    "id" SERIAL PRIMARY KEY,
    "public_id" TEXT NOT NULL,
    "buyer_id" INTEGER NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "delivery_type" "DeliveryType" NOT NULL,
    "delivery_address" TEXT,
    "total_price" INTEGER NOT NULL,
    "delivery_cost" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "MarketOrderItem" (
    "id" SERIAL PRIMARY KEY,
    "order_id" INTEGER NOT NULL,
    "listing_id" INTEGER,
    "name" TEXT NOT NULL,
    "image" TEXT,
    "price" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL

);

-- CreateTable
CREATE TABLE "PlatformTransaction" (
    "id" SERIAL PRIMARY KEY,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" SERIAL PRIMARY KEY,
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
    "action_taken" TEXT

);

-- CreateTable
CREATE TABLE "KycRequest" (
    "id" SERIAL PRIMARY KEY,
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
    "rejection_reason" TEXT

);

-- CreateTable
CREATE TABLE "CommissionTier" (
    "id" SERIAL PRIMARY KEY,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min_sales" INTEGER NOT NULL,
    "max_sales" INTEGER,
    "commission_rate" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL

);

-- CreateTable
CREATE TABLE "PartnershipRequest" (
    "id" SERIAL PRIMARY KEY,
    "public_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "seller_type" "SellerType" NOT NULL,
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- CreateTable
CREATE TABLE "OrderStatusHistory" (
    "id" SERIAL PRIMARY KEY,
    "order_id" INTEGER NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "changed_by_id" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL PRIMARY KEY,
    "public_id" TEXT NOT NULL,
    "actor_user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_public_id" TEXT,
    "details" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP

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
CREATE INDEX "City_region_name_idx" ON "City"("region", "name");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_region_key" ON "City"("name", "region");

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
CREATE UNIQUE INDEX "MarketplaceListing_public_id_key" ON "MarketplaceListing"("public_id");

-- CreateIndex
CREATE INDEX "MarketplaceListing_seller_id_idx" ON "MarketplaceListing"("seller_id");

-- CreateIndex
CREATE INDEX "MarketplaceListing_item_id_idx" ON "MarketplaceListing"("item_id");

-- CreateIndex
CREATE INDEX "MarketplaceListing_city_id_idx" ON "MarketplaceListing"("city_id");

-- CreateIndex
CREATE INDEX "MarketplaceListing_type_status_moderation_status_idx" ON "MarketplaceListing"("type", "status", "moderation_status");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_moderation_status_created_at_idx" ON "MarketplaceListing"("status", "moderation_status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ListingImage_listing_id_sort_order_key" ON "ListingImage"("listing_id", "sort_order");

-- CreateIndex
CREATE INDEX "ListingAttribute_listing_id_idx" ON "ListingAttribute"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "ListingAttribute_listing_id_attr_key" ON "ListingAttribute"("listing_id", "key");

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
CREATE INDEX "MarketOrderItem_order_id_idx" ON "MarketOrderItem"("order_id");

-- CreateIndex
CREATE INDEX "MarketOrderItem_listing_id_idx" ON "MarketOrderItem"("listing_id");

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
CREATE UNIQUE INDEX "KycRequest_public_id_key" ON "KycRequest"("public_id");

-- CreateIndex
CREATE INDEX "KycRequest_status_created_at_idx" ON "KycRequest"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTier_public_id_key" ON "CommissionTier"("public_id");

-- CreateIndex
CREATE INDEX "CommissionTier_min_sales_max_sales_idx" ON "CommissionTier"("min_sales", "max_sales");

-- CreateIndex
CREATE UNIQUE INDEX "PartnershipRequest_public_id_key" ON "PartnershipRequest"("public_id");

-- CreateIndex
CREATE INDEX "PartnershipRequest_created_at_idx" ON "PartnershipRequest"("created_at");

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
ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerProfile" ADD CONSTRAINT "SellerProfile_commission_tier_id_fkey" FOREIGN KEY ("commission_tier_id") REFERENCES "CommissionTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogSubcategory" ADD CONSTRAINT "CatalogSubcategory_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingAttribute" ADD CONSTRAINT "ListingAttribute_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycRequest" ADD CONSTRAINT "KycRequest_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnershipRequest" ADD CONSTRAINT "PartnershipRequest_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderStatusHistory" ADD CONSTRAINT "OrderStatusHistory_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraints
ALTER TABLE "SellerProfile"
ADD CONSTRAINT "SellerProfile_average_response_minutes_chk"
CHECK ("average_response_minutes" IS NULL OR "average_response_minutes" >= 0);

ALTER TABLE "MarketplaceListing"
ADD CONSTRAINT "MarketplaceListing_price_chk"
CHECK ("price" > 0),
ADD CONSTRAINT "MarketplaceListing_sale_price_chk"
CHECK ("sale_price" IS NULL OR ("sale_price" >= 0 AND "sale_price" <= "price")),
ADD CONSTRAINT "MarketplaceListing_rating_chk"
CHECK ("rating" >= 0 AND "rating" <= 5),
ADD CONSTRAINT "MarketplaceListing_views_chk"
CHECK ("views" >= 0);

ALTER TABLE "ListingImage"
ADD CONSTRAINT "ListingImage_sort_order_chk"
CHECK ("sort_order" >= 0);

ALTER TABLE "ListingAttribute"
ADD CONSTRAINT "ListingAttribute_sort_order_chk"
CHECK ("sort_order" >= 0);

ALTER TABLE "ListingReview"
ADD CONSTRAINT "ListingReview_rating_chk"
CHECK ("rating" >= 1 AND "rating" <= 5);

ALTER TABLE "MarketOrder"
ADD CONSTRAINT "MarketOrder_total_price_chk"
CHECK ("total_price" >= 0),
ADD CONSTRAINT "MarketOrder_delivery_cost_chk"
CHECK ("delivery_cost" >= 0),
ADD CONSTRAINT "MarketOrder_discount_chk"
CHECK ("discount" >= 0);

ALTER TABLE "MarketOrderItem"
ADD CONSTRAINT "MarketOrderItem_price_chk"
CHECK ("price" >= 0),
ADD CONSTRAINT "MarketOrderItem_quantity_chk"
CHECK ("quantity" > 0);

ALTER TABLE "PlatformTransaction"
ADD CONSTRAINT "PlatformTransaction_amount_chk"
CHECK ("amount" >= 0),
ADD CONSTRAINT "PlatformTransaction_commission_chk"
CHECK ("commission" >= 0),
ADD CONSTRAINT "PlatformTransaction_commission_rate_chk"
CHECK ("commission_rate" >= 0 AND "commission_rate" <= 100);

ALTER TABLE "CommissionTier"
ADD CONSTRAINT "CommissionTier_min_sales_chk"
CHECK ("min_sales" >= 0),
ADD CONSTRAINT "CommissionTier_max_sales_chk"
CHECK ("max_sales" IS NULL OR "max_sales" >= "min_sales"),
ADD CONSTRAINT "CommissionTier_commission_rate_chk"
CHECK ("commission_rate" >= 0 AND "commission_rate" <= 100);

-- One default address per user
CREATE UNIQUE INDEX "UserAddress_one_default_per_user_idx"
ON "UserAddress" ("user_id")
WHERE "is_default" = true;


-- Legacy alignment part from previous migration

-- Align legacy text-based schema with current Prisma schema without data loss.

-- Create missing enum types if they do not exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('BUYER', 'SELLER', 'ADMIN');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserStatus') THEN
    CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationType') THEN
    CREATE TYPE "NotificationType" AS ENUM ('NEW_QUESTION', 'ORDER_STATUS', 'SYSTEM', 'INFO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingType') THEN
    CREATE TYPE "ListingType" AS ENUM ('PRODUCT', 'SERVICE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingCondition') THEN
    CREATE TYPE "ListingCondition" AS ENUM ('NEW', 'USED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ListingStatus') THEN
    CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MODERATION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ModerationStatus') THEN
    CREATE TYPE "ModerationStatus" AS ENUM ('APPROVED', 'REJECTED', 'PENDING');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QuestionStatus') THEN
    CREATE TYPE "QuestionStatus" AS ENUM ('PENDING', 'ANSWERED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatus') THEN
    CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'PAID', 'PROCESSING', 'PREPARED', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryType') THEN
    CREATE TYPE "DeliveryType" AS ENUM ('PICKUP', 'DELIVERY');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TransactionStatus') THEN
    CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'HELD', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentProvider') THEN
    CREATE TYPE "PaymentProvider" AS ENUM ('CASH', 'YOOMONEY', 'STRIPE', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ComplaintStatus') THEN
    CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'PENDING', 'APPROVED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KycStatus') THEN
    CREATE TYPE "KycStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SellerType') THEN
    CREATE TYPE "SellerType" AS ENUM ('COMPANY', 'PRIVATE', 'INDIVIDUAL');
  END IF;
END $$;

-- Add complaint sanctions and blocked-until support (from 20260311143000_complaint_sanctions).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ComplaintSanctionLevel'
  ) THEN
    CREATE TYPE "ComplaintSanctionLevel" AS ENUM (
      'WARNING',
      'TEMP_3_DAYS',
      'TEMP_30_DAYS',
      'PERMANENT'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'ComplaintSanctionStatus'
  ) THEN
    CREATE TYPE "ComplaintSanctionStatus" AS ENUM (
      'ACTIVE',
      'COMPLETED'
    );
  END IF;
END $$;

ALTER TABLE "AppUser"
ADD COLUMN IF NOT EXISTS "blocked_until" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ComplaintSanction" (
  "id" SERIAL PRIMARY KEY,
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
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ComplaintSanction_public_id_key"
ON "ComplaintSanction"("public_id");

CREATE UNIQUE INDEX IF NOT EXISTS "ComplaintSanction_complaint_id_key"
ON "ComplaintSanction"("complaint_id");

CREATE INDEX IF NOT EXISTS "ComplaintSanction_seller_id_status_created_at_idx"
ON "ComplaintSanction"("seller_id", "status", "created_at");

CREATE INDEX IF NOT EXISTS "ComplaintSanction_created_by_id_idx"
ON "ComplaintSanction"("created_by_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintSanction_complaint_id_fkey'
  ) THEN
    ALTER TABLE "ComplaintSanction"
      ADD CONSTRAINT "ComplaintSanction_complaint_id_fkey"
      FOREIGN KEY ("complaint_id") REFERENCES "Complaint"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintSanction_seller_id_fkey'
  ) THEN
    ALTER TABLE "ComplaintSanction"
      ADD CONSTRAINT "ComplaintSanction_seller_id_fkey"
      FOREIGN KEY ("seller_id") REFERENCES "AppUser"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ComplaintSanction_created_by_id_fkey'
  ) THEN
    ALTER TABLE "ComplaintSanction"
      ADD CONSTRAINT "ComplaintSanction_created_by_id_fkey"
      FOREIGN KEY ("created_by_id") REFERENCES "AppUser"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Convert legacy text columns to enum columns.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AppUser' AND column_name = 'role' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "AppUser"
      ALTER COLUMN "role" TYPE "UserRole"
      USING UPPER("role")::"UserRole";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'AppUser' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "AppUser" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "AppUser"
      ALTER COLUMN "status" TYPE "UserStatus"
      USING UPPER("status")::"UserStatus";
    ALTER TABLE "AppUser" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Notification' AND column_name = 'type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Notification"
      ALTER COLUMN "type" TYPE "NotificationType"
      USING UPPER("type")::"NotificationType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'CatalogCategory' AND column_name = 'type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "CatalogCategory"
      ALTER COLUMN "type" TYPE "ListingType"
      USING UPPER("type")::"ListingType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "type" TYPE "ListingType"
      USING UPPER("type")::"ListingType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'condition' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "condition" TYPE "ListingCondition"
      USING UPPER("condition")::"ListingCondition";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "status" TYPE "ListingStatus"
      USING UPPER("status")::"ListingStatus";
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketplaceListing' AND column_name = 'moderation_status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "moderation_status" DROP DEFAULT;
    ALTER TABLE "MarketplaceListing"
      ALTER COLUMN "moderation_status" TYPE "ModerationStatus"
      USING UPPER("moderation_status")::"ModerationStatus";
    ALTER TABLE "MarketplaceListing" ALTER COLUMN "moderation_status" SET DEFAULT 'APPROVED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ListingQuestion' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "ListingQuestion" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "ListingQuestion"
      ALTER COLUMN "status" TYPE "QuestionStatus"
      USING UPPER("status")::"QuestionStatus";
    ALTER TABLE "ListingQuestion" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketOrder' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketOrder" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "MarketOrder"
      ALTER COLUMN "status" TYPE "OrderStatus"
      USING UPPER("status")::"OrderStatus";
    ALTER TABLE "MarketOrder" ALTER COLUMN "status" SET DEFAULT 'CREATED';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'MarketOrder' AND column_name = 'delivery_type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "MarketOrder"
      ALTER COLUMN "delivery_type" TYPE "DeliveryType"
      USING UPPER("delivery_type")::"DeliveryType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PlatformTransaction' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "PlatformTransaction"
      ALTER COLUMN "status" TYPE "TransactionStatus"
      USING UPPER("status")::"TransactionStatus";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PlatformTransaction' AND column_name = 'payment_provider' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "PlatformTransaction"
      ALTER COLUMN "payment_provider" TYPE "PaymentProvider"
      USING (
        CASE UPPER("payment_provider")
          WHEN 'CASH' THEN 'CASH'
          WHEN 'YOOMONEY' THEN 'YOOMONEY'
          WHEN 'STRIPE' THEN 'STRIPE'
          ELSE 'OTHER'
        END
      )::"PaymentProvider";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Complaint' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "Complaint" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Complaint"
      ALTER COLUMN "status" TYPE "ComplaintStatus"
      USING UPPER("status")::"ComplaintStatus";
    ALTER TABLE "Complaint" ALTER COLUMN "status" SET DEFAULT 'NEW';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'KycRequest' AND column_name = 'status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "KycRequest" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "KycRequest"
      ALTER COLUMN "status" TYPE "KycStatus"
      USING UPPER("status")::"KycStatus";
    ALTER TABLE "KycRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'PartnershipRequest' AND column_name = 'seller_type' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "PartnershipRequest"
      ALTER COLUMN "seller_type" TYPE "SellerType"
      USING UPPER("seller_type")::"SellerType";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'OrderStatusHistory' AND column_name = 'from_status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ALTER COLUMN "from_status" TYPE "OrderStatus"
      USING CASE WHEN "from_status" IS NULL THEN NULL ELSE UPPER("from_status")::"OrderStatus" END;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'OrderStatusHistory' AND column_name = 'to_status' AND udt_name = 'text'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ALTER COLUMN "to_status" TYPE "OrderStatus"
      USING UPPER("to_status")::"OrderStatus";
  END IF;
END $$;

-- Create missing tables introduced in current schema.
CREATE TABLE IF NOT EXISTS "OrderStatusHistory" (
  "id" SERIAL PRIMARY KEY,
  "order_id" INTEGER NOT NULL,
  "from_status" "OrderStatus",
  "to_status" "OrderStatus" NOT NULL,
  "changed_by_id" INTEGER,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL PRIMARY KEY,
  "public_id" TEXT NOT NULL,
  "actor_user_id" INTEGER,
  "action" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_public_id" TEXT,
  "details" JSONB,
  "ip_address" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "OrderStatusHistory_order_id_created_at_idx"
  ON "OrderStatusHistory"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "OrderStatusHistory_changed_by_id_idx"
  ON "OrderStatusHistory"("changed_by_id");

CREATE UNIQUE INDEX IF NOT EXISTS "AuditLog_public_id_key"
  ON "AuditLog"("public_id");
CREATE INDEX IF NOT EXISTS "AuditLog_actor_user_id_created_at_idx"
  ON "AuditLog"("actor_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_type_entity_public_id_idx"
  ON "AuditLog"("entity_type", "entity_public_id");
CREATE INDEX IF NOT EXISTS "AuditLog_action_created_at_idx"
  ON "AuditLog"("action", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderStatusHistory_order_id_fkey'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ADD CONSTRAINT "OrderStatusHistory_order_id_fkey"
      FOREIGN KEY ("order_id") REFERENCES "MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderStatusHistory_changed_by_id_fkey'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ADD CONSTRAINT "OrderStatusHistory_changed_by_id_fkey"
      FOREIGN KEY ("changed_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actor_user_id_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_actor_user_id_fkey"
      FOREIGN KEY ("actor_user_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;


