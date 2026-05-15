import assert from "node:assert/strict";
import test from "node:test";
import { getQuarterWindow } from "../../../backend/src/modules/finance/commission-program.service";
import {
  buildCatalogBranchHints,
  matchListingByHierarchicalQuery,
} from "../../../backend/src/modules/catalog/catalog-search.shared";

test("stage1 search: precise model queries do not mix adjacent generations", () => {
  const iphone15 = {
    id: 1,
    title: "Apple iPhone 15 128GB",
    description: "Новый смартфон Apple",
    sku: "APL-IP15-128",
    item: {
      id: 11,
      name: "Смартфоны",
      subcategory: {
        id: 12,
        name: "Смартфоны и гаджеты",
        category: {
          id: 13,
          name: "Смартфоны и фототехника",
        },
      },
    },
    attributes: [
      { key: "brand", value: "Apple" },
      { key: "model", value: "iPhone 15" },
      { key: "memory", value: "128 GB" },
    ],
  };
  const iphone13 = {
    ...iphone15,
    id: 2,
    title: "Apple iPhone 13 128GB",
    sku: "APL-IP13-128",
    attributes: [
      { key: "brand", value: "Apple" },
      { key: "model", value: "iPhone 13" },
      { key: "memory", value: "128 GB" },
    ],
  };

  const match15 = matchListingByHierarchicalQuery(iphone15, "iPhone 15 128", []);
  const match13 = matchListingByHierarchicalQuery(iphone13, "iPhone 15 128", []);

  assert.equal(match15.matches, true);
  assert.equal(match13.matches, false);
});

test("stage1 search: apple brand is inferred from title families", () => {
  const listing = {
    id: 1,
    title: "iPhone 15 Pro 256GB",
    description: "Новый смартфон в идеальном состоянии",
    sku: "APL-IP15PRO-256",
    item: {
      id: 11,
      name: "Смартфоны",
      subcategory: {
        id: 12,
        name: "Смартфоны и гаджеты",
        category: {
          id: 13,
          name: "Смартфоны и фототехника",
        },
      },
    },
    attributes: [{ key: "memory", value: "256 GB" }],
  };

  const match = matchListingByHierarchicalQuery(listing, "apple", []);
  assert.equal(match.matches, true);
});

test("stage1 search: branch hints recognize watches even without active listing matches", () => {
  const hints = buildCatalogBranchHints(
    "часы",
    [
      {
        id: 47,
        public_id: "ITM-047",
        name: "Смарт-часы и браслеты",
        subcategory: {
          id: 12,
          public_id: "SUB-001",
          name: "Смартфоны и гаджеты",
          category: {
            id: 13,
            public_id: "CAT-001",
            name: "Смартфоны и фототехника",
          },
        },
      },
    ],
    [],
  );

  assert.equal(hints.length > 0, true);
  assert.equal(hints[0]?.itemName, "Смарт-часы и браслеты");
});

test("stage1 commission: quarter window is anchored to Moscow quarter boundaries", () => {
  const window = getQuarterWindow(new Date("2026-04-01T00:30:00.000Z"));

  assert.equal(window.periodKey, "2026-Q2");
  assert.equal(window.periodStart.toISOString(), "2026-03-31T21:00:00.000Z");
  assert.equal(window.resetsAt.toISOString(), "2026-06-30T21:00:00.000Z");
});
