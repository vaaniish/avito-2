UPDATE "ListingDraft"
SET "item_id" = NULL
WHERE "item_id" IN (
  SELECT "id"
  FROM "CatalogItem"
  WHERE "name" = 'Товары для обслуживания ПК'
);

DELETE FROM "CatalogItem"
WHERE "name" = 'Товары для обслуживания ПК';
