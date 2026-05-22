-- CreateEnum
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PromoScopeTargetType" AS ENUM ('CATEGORY', 'SUBCATEGORY', 'ITEM', 'LISTING');

-- CreateEnum
CREATE TYPE "PromoActivationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- AlterTable
ALTER TABLE "MarketOrder"
ADD COLUMN "promo_code_id" INTEGER,
ADD COLUMN "checkout_group_key" TEXT;

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" SERIAL NOT NULL,
    "public_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discount_type" "PromoDiscountType" NOT NULL,
    "discount_value" INTEGER NOT NULL,
    "min_subtotal" INTEGER NOT NULL DEFAULT 0,
    "max_activations" INTEGER NOT NULL,
    "per_user_limit" INTEGER NOT NULL DEFAULT 1,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "all_catalog" BOOLEAN NOT NULL DEFAULT false,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "legacy_rule" TEXT,
    "created_by_id" INTEGER,
    "updated_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoScopeTarget" (
    "id" SERIAL NOT NULL,
    "promo_code_id" INTEGER NOT NULL,
    "target_type" "PromoScopeTargetType" NOT NULL,
    "category_id" INTEGER,
    "subcategory_id" INTEGER,
    "item_id" INTEGER,
    "listing_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoScopeTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoActivation" (
    "id" SERIAL NOT NULL,
    "promo_code_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "order_id" INTEGER,
    "checkout_group_key" TEXT NOT NULL,
    "status" "PromoActivationStatus" NOT NULL DEFAULT 'RESERVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_public_id_key" ON "PromoCode"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_is_enabled_starts_at_ends_at_idx" ON "PromoCode"("is_enabled", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "PromoCode_created_at_idx" ON "PromoCode"("created_at");

-- CreateIndex
CREATE INDEX "PromoScopeTarget_promo_code_id_target_type_idx" ON "PromoScopeTarget"("promo_code_id", "target_type");

-- CreateIndex
CREATE INDEX "PromoScopeTarget_category_id_idx" ON "PromoScopeTarget"("category_id");

-- CreateIndex
CREATE INDEX "PromoScopeTarget_subcategory_id_idx" ON "PromoScopeTarget"("subcategory_id");

-- CreateIndex
CREATE INDEX "PromoScopeTarget_item_id_idx" ON "PromoScopeTarget"("item_id");

-- CreateIndex
CREATE INDEX "PromoScopeTarget_listing_id_idx" ON "PromoScopeTarget"("listing_id");

-- CreateIndex
CREATE UNIQUE INDEX "PromoActivation_promo_group_unique" ON "PromoActivation"("promo_code_id", "checkout_group_key");

-- CreateIndex
CREATE INDEX "PromoActivation_promo_code_id_status_idx" ON "PromoActivation"("promo_code_id", "status");

-- CreateIndex
CREATE INDEX "PromoActivation_user_id_promo_code_id_status_idx" ON "PromoActivation"("user_id", "promo_code_id", "status");

-- CreateIndex
CREATE INDEX "PromoActivation_checkout_group_key_status_idx" ON "PromoActivation"("checkout_group_key", "status");

-- CreateIndex
CREATE INDEX "PromoActivation_order_id_idx" ON "PromoActivation"("order_id");

-- CreateIndex
CREATE INDEX "MarketOrder_promo_code_id_idx" ON "MarketOrder"("promo_code_id");

-- CreateIndex
CREATE INDEX "MarketOrder_checkout_group_key_idx" ON "MarketOrder"("checkout_group_key");

-- AddForeignKey
ALTER TABLE "PromoCode"
ADD CONSTRAINT "PromoCode_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode"
ADD CONSTRAINT "PromoCode_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoScopeTarget"
ADD CONSTRAINT "PromoScopeTarget_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoScopeTarget"
ADD CONSTRAINT "PromoScopeTarget_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "CatalogCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoScopeTarget"
ADD CONSTRAINT "PromoScopeTarget_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "CatalogSubcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoScopeTarget"
ADD CONSTRAINT "PromoScopeTarget_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoScopeTarget"
ADD CONSTRAINT "PromoScopeTarget_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoActivation"
ADD CONSTRAINT "PromoActivation_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoActivation"
ADD CONSTRAINT "PromoActivation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoActivation"
ADD CONSTRAINT "PromoActivation_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "MarketOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketOrder"
ADD CONSTRAINT "MarketOrder_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
