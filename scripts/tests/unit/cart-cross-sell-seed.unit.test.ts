import assert from "node:assert/strict";
import test from "node:test";
import { dnsProductCatalogSeed } from "../../../backend/prisma/dns-product-catalog.seed";
import {
  generateCartCrossSellRuleSeeds,
  type CartCrossSellCatalogItemSeed,
} from "../../../backend/src/modules/recommendations/domain/cart-cross-sell.helpers";

function buildCatalogItemsForTest(): CartCrossSellCatalogItemSeed[] {
  let categoryId = 1;
  let subcategoryId = 1;
  let itemId = 1;

  return dnsProductCatalogSeed.flatMap((category) => {
    const currentCategoryId = categoryId++;
    return category.subcategories.flatMap((subcategory) => {
      const currentSubcategoryId = subcategoryId++;
      return subcategory.products.map((product) => ({
        id: itemId,
        public_id: `TEST-${itemId++}`,
        name: product,
        subcategory: {
          id: currentSubcategoryId,
          public_id: subcategory.publicId,
          name: subcategory.name,
          category: {
            id: currentCategoryId,
            public_id: category.publicId,
            name: category.name,
          },
        },
      }));
    });
  });
}

test("cart cross-sell seed covers every catalog item cluster", () => {
  const items = buildCatalogItemsForTest();
  const rules = generateCartCrossSellRuleSeeds(items);

  const coveredSourceIds = new Set(
    rules
      .map((rule) => rule.source_item_id)
      .filter((value): value is number => Number.isInteger(value) && value > 0),
  );

  assert.equal(coveredSourceIds.size, items.length);
});

test("cart cross-sell seed links smartphones to accessories rather than to themselves", () => {
  const items = buildCatalogItemsForTest();
  const rules = generateCartCrossSellRuleSeeds(items);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const smartphones = items.find((item) => item.name === "Смартфоны");
  assert.ok(smartphones);

  const smartphoneTargets = rules
    .filter((rule) => rule.source_item_id === smartphones.id)
    .map((rule) => itemById.get(rule.target_item_id ?? -1)?.name ?? "");

  assert.ok(smartphoneTargets.includes("Защита и поддержка для смартфонов"));
  assert.ok(smartphoneTargets.includes("Зарядка и подключение для смартфонов"));
  assert.ok(!smartphoneTargets.includes("Смартфоны"));
});

test("cart cross-sell seed keeps charging accessories directional", () => {
  const items = buildCatalogItemsForTest();
  const rules = generateCartCrossSellRuleSeeds(items);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const phoneCharging = items.find((item) => item.name === "Зарядка и подключение для смартфонов");
  assert.ok(phoneCharging);

  const chargingTargets = rules
    .filter((rule) => rule.source_item_id === phoneCharging.id)
    .map((rule) => itemById.get(rule.target_item_id ?? -1)?.name ?? "");

  assert.ok(chargingTargets.length > 0);
  assert.ok(!chargingTargets.includes("Смартфоны"));
});
