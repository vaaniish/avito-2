-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "AppUser" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
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
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
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
    "city_id" INTEGER NOT NULL,
    "street" TEXT NOT NULL,
    "building" TEXT NOT NULL,
    "postal_code" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogCategory" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
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
CREATE TABLE "MarketplaceListing" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "seller_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "item_id" INTEGER,
    "price" INTEGER NOT NULL,
    "sale_price" INTEGER,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 4.5,
    "condition" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "moderation_status" TEXT NOT NULL DEFAULT 'APPROVED',
    "views" INTEGER NOT NULL DEFAULT 0,
    "city_id" INTEGER NOT NULL,
    "shipping_by_seller" BOOLEAN NOT NULL DEFAULT true,
    "sku" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
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
    "status" TEXT NOT NULL DEFAULT 'PENDING',
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
    "status" TEXT NOT NULL,
    "delivery_type" TEXT NOT NULL,
    "delivery_address" TEXT,
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
    "status" TEXT NOT NULL,
    "commission_rate" DOUBLE PRECISION NOT NULL,
    "commission" INTEGER NOT NULL,
    "payment_provider" TEXT NOT NULL,
    "payment_intent_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'NEW',
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
CREATE TABLE "KycRequest" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
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
CREATE TABLE "PartnershipRequest" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "seller_type" TEXT NOT NULL,
    "name" TEXT TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "inn" TEXT,
    "geography" TEXT,
    "social_profile" TEXT,
    "credibility" TEXT,
    "why_us" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnershipRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_public_id_key" ON "AppUser"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "Notification_user_id_is_read_idx" ON "Notification"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_user_id_key" ON "SellerProfile"("user_id");

-- CreateIndex
CREATE INDEX "SellerProfile_commission_tier_id_idx" ON "SellerProfile"("commission_tier_id");

-- CreateIndex
CREATE UNIQUE INDEX "City_name_key" ON "City"("name");

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
CREATE UNIQUE INDEX "ListingImage_listing_id_sort_order_key" ON "ListingImage"("listing_id", "sort_order");   

-- CreateIndex
CREATE INDEX "ListingAttribute_listing_id_idx" ON "ListingAttribute"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "ListingReview_listing_id_author_id_key" ON "ListingReview"("listing_id", "author_id");   

-- CreateIndex
CREATE UNIQUE INDEX "ListingQuestion_public_id_key" ON "ListingQuestion"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "WishlistItem_user_id_listing_id_key" ON "WishlistItem"("user_id", "listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "MarketOrder_public_id_key" ON "MarketOrder"("public_id");

-- CreateIndex
CREATE INDEX "MarketOrder_buyer_id_idx" ON "MarketOrder"("buyer_id");

-- CreateIndex
CREATE INDEX "MarketOrder_seller_id_idx" ON "MarketOrder"("seller_id");

-- CreateIndex
CREATE INDEX "MarketOrderItem_order_id_idx" ON "MarketOrderItem"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTransaction_public_id_key" ON "PlatformTransaction"("public_id");

-- CreateIndex
CREATE INDEX "PlatformTransaction_order_id_idx" ON "PlatformTransaction"("order_id");

-- CreateIndex
CREATE INDEX "PlatformTransaction_buyer_id_idx" ON "PlatformTransaction"("buyer_id");

-- CreateIndex
CREATE INDEX "PlatformTransaction_seller_id_idx" ON "PlatformTransaction"("seller_id");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_public_id_key" ON "Complaint"("public_id");

-- CreateIndex
CREATE INDEX "Complaint_status_idx" ON "Complaint"("status");

-- CreateIndex
CREATE INDEX "Complaint_listing_id_idx" ON "Complaint"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "KycRequest_public_id_key" ON "KycRequest"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionTier_public_id_key" ON "CommissionTier"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "PartnershipRequest_public_id_key" ON "PartnershipRequest"("public_id");

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