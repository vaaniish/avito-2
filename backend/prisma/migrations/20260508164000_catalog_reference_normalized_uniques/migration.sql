CREATE UNIQUE INDEX "CatalogReferenceBrand_item_id_normalized_name_key"
ON "CatalogReferenceBrand"("item_id", lower(btrim("name")));

CREATE UNIQUE INDEX "CatalogReferenceModel_brand_id_normalized_name_key"
ON "CatalogReferenceModel"("brand_id", lower(btrim("name")));
