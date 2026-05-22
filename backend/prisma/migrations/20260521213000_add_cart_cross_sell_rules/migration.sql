CREATE TABLE "CartCrossSellRule" (
    "id" SERIAL NOT NULL,
    "source_category_id" INTEGER,
    "source_subcategory_id" INTEGER,
    "source_item_id" INTEGER,
    "source_brand" TEXT,
    "source_model" TEXT,
    "target_category_id" INTEGER,
    "target_subcategory_id" INTEGER,
    "target_item_id" INTEGER,
    "target_brand" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartCrossSellRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CartCrossSellRule_is_active_priority_idx" ON "CartCrossSellRule"("is_active", "priority" DESC);
CREATE INDEX "CartCrossSellRule_source_item_id_is_active_priority_idx" ON "CartCrossSellRule"("source_item_id", "is_active", "priority" DESC);
CREATE INDEX "CartCrossSellRule_source_subcategory_id_is_active_prior_idx" ON "CartCrossSellRule"("source_subcategory_id", "is_active", "priority" DESC);
CREATE INDEX "CartCrossSellRule_source_category_id_is_active_priority_idx" ON "CartCrossSellRule"("source_category_id", "is_active", "priority" DESC);
CREATE INDEX "CartCrossSellRule_target_item_id_is_active_idx" ON "CartCrossSellRule"("target_item_id", "is_active");
CREATE INDEX "CartCrossSellRule_target_subcategory_id_is_active_idx" ON "CartCrossSellRule"("target_subcategory_id", "is_active");
CREATE INDEX "CartCrossSellRule_target_category_id_is_active_idx" ON "CartCrossSellRule"("target_category_id", "is_active");
