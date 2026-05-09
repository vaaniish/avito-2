import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backendSeed = readFileSync("backend/prisma/seed.ts", "utf8");
const frontendPage = readFileSync(
  "frontend/src/components/pages/PartnerListingsPage.tsx",
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
const frontendPsuBlock = extractBlock(
  frontendPage,
  '"Блок питания": makeFallbackSchema({',
  "  PlayStation:",
);
const frontendGpuBlock = extractBlock(
  frontendPage,
  "  Видеокарта: makeFallbackSchema({",
  "  Процессор:",
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
const expectedFrontendGpuKeys = ["brand", "model"];
const mvpItems = [
  "iPhone",
  "Ноутбук",
  "Видеокарта",
  "Блок питания",
  "Apple Watch",
  "Холодильник",
  "Стиральная машина",
  "Духовой шкаф",
  "Кофемашина",
  "Робот-пылесос",
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

test("catalog item schema: graphics card frontend fallback mirrors backend fields", () => {
  const keys = extractKeys(
    frontendGpuBlock,
    /\b(selectField|numberField|textField|textareaField)\(\s*"([^"]+)"/g,
  );

  assert.deepEqual(keys, expectedFrontendGpuKeys);
  assert.match(frontendPage, /<CatalogReferenceCascadeEditor/);
  assert.match(frontendGpuBlock, /textField\("brand", "Бренд"\)/);
  assert.match(frontendGpuBlock, /textField\("model", "Модель"\)/);
  assert.doesNotMatch(frontendGpuBlock, /producerCode|Код производителя/);
  assert.doesNotMatch(
    frontendGpuBlock,
    /\b(socket|chipset|cpu_power_connector|atx_version|screen_size|capacity)\b/,
  );
  assert.doesNotMatch(
    frontendGpuBlock,
    /"Apple"|"Samsung"|"Xiaomi"|"Seasonic"|"Corsair"|"PowerColor"/,
  );
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

test("catalog item schema: power supply frontend fallback mirrors backend fields", () => {
  const keys = extractKeys(
    frontendPsuBlock,
    /\b(selectField|numberField|textField|textareaField)\(\s*"([^"]+)"/g,
  );

  assert.deepEqual(keys, expectedPsuKeys);
  assert.match(frontendPsuBlock, /selectField\("manufacturer"/);
  assert.match(frontendPsuBlock, /"Corsair"/);
  assert.match(frontendPsuBlock, /"80 PLUS Gold"/);
  assert.match(frontendPsuBlock, /"Нет части модульных кабелей"/);
  assert.doesNotMatch(
    frontendPsuBlock,
    /\b(socket|chipset|memory_type|gpu_chip|screen_size)\b/,
  );
  assert.doesNotMatch(frontendPsuBlock, /"Apple"|"Samsung"|"Xiaomi"/);
});

test("catalog item schema: product condition is only the system listing state", () => {
  assert.doesNotMatch(adminRoutes, /key:\s*"condition_grade"/);
  assert.match(frontendPage, /isSystemBackedCharacteristicField/);
  assert.match(frontendPage, /key === "condition_grade"/);
});

test("catalog creation: frontend no longer gates product characteristics by MVP item list", () => {
  const partnerCatalogBlock = extractBlock(
    frontendPage,
    "const PARTNER_CATALOG:",
    "  services:",
  );

  for (const item of mvpItems) {
    assert.match(partnerCatalogBlock, new RegExp(`"${item}"`));
  }
  assert.doesNotMatch(frontendPage, /SUPPORTED_MVP_ITEMS/);
  assert.match(frontendPage, /if \(type === "products"\) return \[\];/);
  assert.match(frontendPage, /form\.type === "services" && characteristicFields\.length > 0/);
});

test("catalog creation: backend binds existing product items without deferred MVP mode", () => {
  const comprehensiveBlock = extractBlock(
    backendSeed,
    "const comprehensiveItemAttributes",
    "const expandedProductAttributes",
  );
  const partnerRoutes = readFileSync(
    "backend/src/modules/partner/partner.routes.ts",
    "utf8",
  );

  assert.match(comprehensiveBlock, /mvpItemIds\.has\(item\)/);
  assert.match(backendSeed, /"sub-pc-laptops-accessories::Ноутбуки", "ITM-003"/);
  assert.match(backendSeed, /const mvpItemIds = new Set/);
  assert.doesNotMatch(partnerRoutes, /isDeferredItem/);
  assert.doesNotMatch(partnerRoutes, /!MVP_PRODUCT_ITEM_PUBLIC_IDS\.has\(item\.public_id\)/);
  assert.match(partnerRoutes, /const isCustomItem = Boolean\(customItemName\) \|\| !item;/);
});

test("catalog custom flow: category, subcategory, item and attribute values go to suggestions", () => {
  const partnerRoutes = readFileSync(
    "backend/src/modules/partner/partner.routes.ts",
    "utf8",
  );

  assert.match(partnerRoutes, /entityType: "CATEGORY"/);
  assert.match(partnerRoutes, /entityType: "SUBCATEGORY"/);
  assert.match(partnerRoutes, /entityType: "ITEM"/);
  assert.match(partnerRoutes, /entityType: definition\.key === "manufacturer" \? "MANUFACTURER" : "ATTRIBUTE_VALUE"/);
  assert.match(partnerRoutes, /CUSTOM_VALUE_OPTION/);
  assert.match(partnerRoutes, /LISTING_ATTRIBUTE_COMBINATION_INVALID/);
  assert.match(partnerRoutes, /\/listings\/catalog-reference/);
  assert.match(partnerRoutes, /validateCatalogReferenceCombination/);
});

test("catalog creation suggestions: backend searches generic catalog item names", () => {
  const partnerRoutes = readFileSync(
    "backend/src/modules/partner/partner.routes.ts",
    "utf8",
  );

  assert.match(partnerRoutes, /findGenericCreateSuggestionItems/);
  assert.match(partnerRoutes, /genericCatalogItemScore/);
  assert.match(partnerRoutes, /prisma\.catalogItem\.findMany/);
  assert.match(partnerRoutes, /name:\s*\{\s*contains: token,\s*mode: "insensitive"/);
  assert.match(partnerRoutes, /findCatalogReferenceCreateSuggestions\(query, type\)/);
  assert.match(partnerRoutes, /catalogReferenceTitleSuggestions\(query, referenceSuggestions\)/);
  assert.match(partnerRoutes, /titleSuggestions/);
  assert.doesNotMatch(partnerRoutes, /videoCardScore|videoCardChips/);
});
