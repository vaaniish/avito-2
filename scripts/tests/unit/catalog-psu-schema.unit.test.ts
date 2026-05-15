import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backendSeed = readFileSync("backend/prisma/seed.ts", "utf8");
const frontendPage = readFileSync(
  "frontend/src/pages/partner-listings/PartnerListingsPage.tsx",
  "utf8",
);
const frontendCreateFlow = readFileSync(
  "frontend/src/pages/partner-listings/partner-listings.create-flow.tsx",
  "utf8",
);
const frontendApi = readFileSync(
  "frontend/src/pages/partner-listings/partner-listings.api.ts",
  "utf8",
);
const frontendUtils = readFileSync(
  "frontend/src/pages/partner-listings/partner-listings.utils.ts",
  "utf8",
);
const adminRoutes = readFileSync(
  "backend/src/modules/admin/admin.routes.ts",
  "utf8",
);

function extractBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing block start: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `missing block end: ${end}`);
  return source.slice(startIndex, endIndex);
}

function extractKeys(block: string, helperPattern: RegExp): string[] {
  return Array.from(block.matchAll(helperPattern), (match) => match[2]);
}

const backendPsuBlock = extractBlock(
  backendSeed,
  '"ITM-042": {',
  '    "ITM-043":',
);
const backendGpuBlock = extractBlock(
  backendSeed,
  '"ITM-037": {',
  '    "ITM-038":',
);
const expectedPsuKeys = [
  "manufacturer",
  "power",
  "form_factor",
  "efficiency_certificate",
  "modularity",
  "gpu_power_connector",
  "cpu_power_connector",
  "atx_version",
  "cable_set",
  "warranty_months_left",
];

const expectedBackendGpuKeys = [
  "manufacturer",
  "gpu_chip",
  "memory_size",
  "memory_type",
  "interface",
  "power_connector",
  "cooling_size",
  "length_mm",
  "mining_usage",
  "warranty_months_left",
];

test("catalog item schema: graphics card keeps a dedicated backend schema", () => {
  const keys = extractKeys(
    backendGpuBlock,
    /\b(select|number|text|textarea)\(\s*"([^"]+)"/g,
  );

  assert.deepEqual(keys, expectedBackendGpuKeys);
  assert.match(backendGpuBlock, /select\("manufacturer"/);
  assert.match(backendGpuBlock, /"Sapphire"/);
  assert.match(backendGpuBlock, /"NVIDIA GeForce RTX 50"/);
  assert.match(backendGpuBlock, /"AMD Radeon RX 9000"/);
  assert.match(backendGpuBlock, /"Intel Arc B-Series"/);
  assert.match(backendGpuBlock, /"GDDR7"/);
  assert.match(backendGpuBlock, /"12VHPWR \/ 12V-2x6"/);
  assert.doesNotMatch(
    backendGpuBlock,
    /\b(socket|chipset|cpu_power_connector|atx_version|screen_size|capacity)\b/,
  );
  assert.doesNotMatch(
    backendGpuBlock,
    /"Apple"|"Samsung"|"Xiaomi"|"Seasonic"|"Corsair"/,
  );
});

test("catalog item schema: frontend reads product characteristic schema from catalog API only", () => {
  assert.match(frontendPage, /PartnerListingCreateFlow/);
  assert.match(frontendCreateFlow, /<CatalogReferenceCascadeEditor/);
  assert.match(frontendApi, /apiGet<CatalogCategoryDto\[]>\(\s*`\/catalog\/categories\?type=\$\{type\}`/);
  assert.match(frontendUtils, /selectedSubcategory\.itemAttributeSchemas\?\.\[catalogItem\]/);
  assert.doesNotMatch(frontendPage, /makeFallbackSchema|PARTNER_CATALOG|SUPPORTED_MVP_ITEMS/);
  assert.doesNotMatch(frontendCreateFlow, /makeFallbackSchema|PARTNER_CATALOG|SUPPORTED_MVP_ITEMS/);
  assert.doesNotMatch(frontendUtils, /makeFallbackSchema|PARTNER_CATALOG|SUPPORTED_MVP_ITEMS/);
});

test("catalog item schema: power supply keeps a dedicated backend schema", () => {
  const keys = extractKeys(
    backendPsuBlock,
    /\b(select|number|text|textarea)\(\s*"([^"]+)"/g,
  );

  assert.deepEqual(keys, expectedPsuKeys);
  assert.match(backendPsuBlock, /select\("manufacturer"/);
  assert.match(backendPsuBlock, /"Seasonic"/);
  assert.match(backendPsuBlock, /"12VHPWR \/ 12V-2x6"/);
  assert.match(backendPsuBlock, /"ATX 3\.1"/);
  assert.doesNotMatch(
    backendPsuBlock,
    /\b(socket|chipset|memory_type|gpu_chip|screen_size)\b/,
  );
  assert.doesNotMatch(backendPsuBlock, /"Apple"|"Samsung"|"Xiaomi"/);
});

test("catalog item schema: product condition is only the system listing state", () => {
  assert.doesNotMatch(adminRoutes, /key:\s*"condition_grade"/);
  assert.match(frontendUtils, /isSystemBackedCharacteristicField/);
  assert.match(frontendUtils, /key === "condition_grade"/);
});

test("catalog creation: frontend no longer gates product characteristics by local lists", () => {
  assert.doesNotMatch(frontendPage, /const PARTNER_CATALOG:/);
  assert.doesNotMatch(frontendPage, /makeFallbackSchema/);
  assert.doesNotMatch(frontendPage, /SUPPORTED_MVP_ITEMS/);
  assert.match(frontendUtils, /return sortFields\(selectedSubcategory\.attributeSchema \?\? \[]\)/);
});

test("catalog creation: backend binds existing product items without deferred MVP mode", () => {
  const comprehensiveBlock = extractBlock(
    backendSeed,
    "const comprehensiveItemAttributes",
    "const expandedProductAttributes",
  );
  const partnerListingsCatalogHelper = readFileSync(
    "backend/src/modules/partner/listings/infrastructure/repositories/partner-listings-catalog.repository-helper.ts",
    "utf8",
  );

  assert.match(comprehensiveBlock, /mvpItemIds\.has\(item\)/);
  assert.match(backendSeed, /"sub-pc-laptops-accessories::Ноутбуки", "ITM-003"/);
  assert.match(backendSeed, /const mvpItemIds = new Set/);
  assert.doesNotMatch(partnerListingsCatalogHelper, /isDeferredItem/);
  assert.doesNotMatch(
    partnerListingsCatalogHelper,
    /!MVP_PRODUCT_ITEM_PUBLIC_IDS\.has\(item\.public_id\)/,
  );
  assert.match(
    partnerListingsCatalogHelper,
    /const isCustomItem = Boolean\(customItemName\) \|\| !item;/,
  );
});

test("catalog custom flow: category, subcategory, item and attribute values go to suggestions", () => {
  const partnerListingsDomainHelpers = readFileSync(
    "backend/src/modules/partner/listings/domain/partner-listings.helpers.ts",
    "utf8",
  );
  const partnerListingsCatalogHelper = readFileSync(
    "backend/src/modules/partner/listings/infrastructure/repositories/partner-listings-catalog.repository-helper.ts",
    "utf8",
  );
  const partnerListingsCatalogRepository = readFileSync(
    "backend/src/modules/partner/listings/infrastructure/repositories/partner-listings-catalog.repository.ts",
    "utf8",
  );
  const partnerListingsRouter = readFileSync(
    "backend/src/modules/partner/listings/http/partner-listings.router.ts",
    "utf8",
  );

  assert.match(partnerListingsCatalogRepository, /entityType = "CATEGORY"/);
  assert.match(partnerListingsCatalogRepository, /entityType = "SUBCATEGORY"/);
  assert.match(partnerListingsCatalogRepository, /let entityType: "CATEGORY" \| "SUBCATEGORY" \| "ITEM" = "ITEM"/);
  assert.match(
    partnerListingsCatalogHelper,
    /entityType: definition\.key === "manufacturer" \? "MANUFACTURER" : "ATTRIBUTE_VALUE"/,
  );
  assert.match(partnerListingsDomainHelpers, /CUSTOM_VALUE_OPTION/);
  assert.match(partnerListingsCatalogHelper, /LISTING_ATTRIBUTE_COMBINATION_INVALID/);
  assert.match(partnerListingsRouter, /\/listings\/catalog-reference/);
  assert.match(partnerListingsCatalogHelper, /validateCatalogReferenceCombination/);
});

test("catalog creation suggestions: backend searches generic catalog item names", () => {
  const partnerListingsSearchRepository = readFileSync(
    "backend/src/modules/partner/listings/infrastructure/repositories/partner-listings-search.repository.ts",
    "utf8",
  );

  assert.match(partnerListingsSearchRepository, /findGenericCreateSuggestionItems/);
  assert.match(partnerListingsSearchRepository, /prisma\.catalogItem\.findMany/);
  assert.match(
    partnerListingsSearchRepository,
    /name:\s*\{\s*contains: token,\s*mode: "insensitive"/,
  );
  assert.match(
    partnerListingsSearchRepository,
    /findCatalogReferenceCreateSuggestions\(query, type\)/,
  );
  assert.match(
    partnerListingsSearchRepository,
    /catalogReferenceTitleSuggestions\(query, referenceSuggestions\)/,
  );
  assert.match(partnerListingsSearchRepository, /titleSuggestions/);
  assert.doesNotMatch(partnerListingsSearchRepository, /videoCardScore|videoCardChips/);
});
