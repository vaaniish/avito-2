import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const removedCatalogItem = "Товары для обслуживания ПК";

const appSource = readFileSync("frontend/src/App.tsx", "utf8");
const filterPanelSource = readFileSync("frontend/src/components/FilterPanel.tsx", "utf8");
const partnerListingsSource = readFileSync(
  "frontend/src/components/pages/PartnerListingsPage.tsx",
  "utf8",
);
const catalogOverlaySource = readFileSync(
  "frontend/src/components/DnsCatalogOverlay.tsx",
  "utf8",
);
const catalogRoutesSource = readFileSync(
  "backend/src/modules/catalog/catalog.routes.ts",
  "utf8",
);
const catalogSeedSource = readFileSync(
  "backend/prisma/dns-product-catalog.seed.ts",
  "utf8",
);
const prismaSchemaSource = readFileSync("backend/prisma/schema.prisma", "utf8");
const runtimeSeedSource = readFileSync("backend/prisma/seed.ts", "utf8");
const partnerRoutesSource = readFileSync(
  "backend/src/modules/partner/partner.routes.ts",
  "utf8",
);
const catalogReferenceServiceSource = readFileSync(
  "backend/src/modules/catalog/catalog-reference.service.ts",
  "utf8",
);
const catalogReferenceMigrationSource = readFileSync(
  "backend/prisma/migrations/20260508120000_catalog_reference_db/migration.sql",
  "utf8",
);
const catalogReferenceUniqueMigrationSource = readFileSync(
  "backend/prisma/migrations/20260508164000_catalog_reference_normalized_uniques/migration.sql",
  "utf8",
);
const catalogReferenceImportSource = readFileSync(
  "scripts/catalog/import-catalog-reference-to-db.ts",
  "utf8",
);
const pcComponentsManifest = JSON.parse(
  readFileSync("data/catalog-reference/dns-pc-components/manifest.json", "utf8"),
);

test("catalog source of truth: empty DNS item is removed from seeds and reference data", () => {
  assert.doesNotMatch(catalogSeedSource, new RegExp(removedCatalogItem));
  assert.equal(
    existsSync(
      "data/catalog-reference/dns-pc-components/modding-i-obsluzhivanie/tovary-dlya-obsluzhivaniya-pk.json",
    ),
    false,
  );
  assert.equal(
    pcComponentsManifest.items.some(
      (item: { itemName?: string }) => item.itemName === removedCatalogItem,
    ),
    false,
  );
  assert.equal(
    pcComponentsManifest.summary.items.some(
      (item: { itemName?: string }) => item.itemName === removedCatalogItem,
    ),
    false,
  );
  assert.equal(pcComponentsManifest.summary.done, pcComponentsManifest.items.length);
});

test("catalog source of truth: frontend catalog surfaces read catalogItems from API data", () => {
  assert.match(appSource, /apiGet<CatalogCategory\[]>\("\/catalog\/categories\?type=products"\)/);
  assert.match(appSource, /apiGet<CatalogCategory\[]>\("\/catalog\/categories\?type=services"\)/);
  assert.match(catalogRoutesSource, /catalogItems: subcategory\.items\.map/);
  assert.match(filterPanelSource, /subcategory\.catalogItems\?\.length/);
  assert.match(catalogOverlaySource, /subcategory\.catalogItems\?\.length/);
  assert.match(partnerListingsSource, /apiGet<CatalogCategoryDto\[]>\(\s*`\/catalog\/categories\?type=\$\{type\}`/);
  assert.equal(existsSync("frontend/src/components/dnsCatalogData.ts"), false);
});

test("catalog source of truth: filters prune deleted catalog item ids after catalog refresh", () => {
  assert.match(appSource, /function catalogItemIdSet\(categories: CatalogCategory\[]\): Set<string>/);
  assert.match(appSource, /validCatalogItemIds\.has\(category\)/);
  assert.match(appSource, /setFilters\(\(prev\) => \(\{/);
  assert.match(appSource, /setSelectedCatalogItemId\(null\)/);
});

test("catalog reference source of truth: runtime reference data is persisted and searchable in dedicated DB tables", () => {
  for (const modelName of [
    "CatalogReferenceBrand",
    "CatalogReferenceModel",
    "CatalogReferenceVariant",
    "CatalogReferenceCharacteristic",
  ]) {
    assert.match(prismaSchemaSource, new RegExp(`model ${modelName} \\{`));
    assert.match(catalogReferenceMigrationSource, new RegExp(`CREATE TABLE "${modelName}"`));
  }

  assert.match(runtimeSeedSource, /seedCatalogReferenceData\(catalogReferenceItemRows\)/);
  assert.match(runtimeSeedSource, /catalogReferenceBrand\.createMany/);
  assert.match(runtimeSeedSource, /catalogReferenceModel\.createMany/);
  assert.match(runtimeSeedSource, /catalogReferenceVariant\.createMany/);
  assert.match(runtimeSeedSource, /catalogReferenceCharacteristic\.createMany/);
  assert.match(catalogReferenceMigrationSource, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(catalogReferenceMigrationSource, /CatalogReferenceBrand_name_trgm_idx/);
  assert.match(catalogReferenceMigrationSource, /CatalogReferenceModel_name_trgm_idx/);
  assert.match(catalogReferenceMigrationSource, /CatalogReferenceVariant_title_trgm_idx/);
  assert.match(catalogReferenceUniqueMigrationSource, /CatalogReferenceBrand_item_id_normalized_name_key/);
  assert.match(catalogReferenceUniqueMigrationSource, /CatalogReferenceModel_brand_id_normalized_name_key/);
});

test("catalog reference source of truth: DNS parser-only fields are not persisted", () => {
  for (const excludedColumn of [
    "dnsUrl",
    "href",
    "cardText",
    "priceText",
    "specsText",
    "totalProducts",
    "collectedAt",
  ]) {
    assert.doesNotMatch(catalogReferenceMigrationSource, new RegExp(excludedColumn));
  }

  assert.match(catalogReferenceMigrationSource, /"external_product_id" TEXT/);
  assert.match(catalogReferenceMigrationSource, /"title" TEXT NOT NULL/);
  assert.match(catalogReferenceMigrationSource, /"raw_value" TEXT NOT NULL/);
});

test("catalog reference source of truth: partner API reads runtime data only from DB", () => {
  assert.match(catalogReferenceServiceSource, /findCatalogReferenceItemFromDb/);
  assert.match(catalogReferenceServiceSource, /reference_brands/);
  assert.match(catalogReferenceServiceSource, /findCatalogReferenceCreateSuggestions/);
  assert.match(catalogReferenceServiceSource, /aggregateCatalogReferenceCharacteristics/);
  assert.match(catalogReferenceServiceSource, /normalizedCharacteristicLabel/);
  assert.match(catalogReferenceServiceSource, /catalogReferenceTitleSuggestions/);
  assert.match(partnerRoutesSource, /findCatalogReferenceCreateSuggestions\(query, type\)/);
  assert.match(partnerRoutesSource, /titleSuggestions/);
  assert.match(partnerRoutesSource, /aggregateCatalogReferenceCharacteristics\(variant\.characteristics\)/);
  assert.match(partnerRoutesSource, /isReferenceItem \? \[] : item\?\.attribute_definitions \?\? \[]/);
  assert.match(partnerRoutesSource, /partnerRouter\.get\("\/listings\/catalog-reference"/);
  assert.doesNotMatch(catalogReferenceServiceSource, /fs from "node:fs"|path from "node:path"/);
  assert.doesNotMatch(catalogReferenceServiceSource, /catalog-reference\.json/);
  assert.doesNotMatch(catalogReferenceServiceSource, /loadCatalogReferenceFallback|findCatalogReferenceFallback/);
  assert.doesNotMatch(partnerRoutesSource, /loadCatalogReferenceFallback/);
});

test("catalog reference source of truth: import canonicalizes brand and model duplicates before DB writes", () => {
  assert.match(catalogReferenceImportSource, /mergeReferenceBrands/);
  assert.match(catalogReferenceImportSource, /canonicalBrandDisplayName/);
  assert.match(catalogReferenceImportSource, /BRAND_DISPLAY_NAME_OVERRIDES/);
  assert.match(catalogReferenceImportSource, /OFFICIAL_BRAND_NAMES_BY_KEY/);
  assert.match(catalogReferenceImportSource, /HAVING COUNT\(\*\) > 1/);
});
