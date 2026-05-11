import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogOffsetRange,
  buildCatalogRequestKey,
  CATALOG_BACKWARD_WINDOW_PAGES,
  CATALOG_FORWARD_WINDOW_PAGES,
  getCatalogWindowOffsets,
  trimCatalogOffsets,
} from "../../../frontend/src/app/app.catalog.utils";
import { getCatalogRenderWindow } from "../../../frontend/src/entities/product-grid.virtualization";
import { readFileSync } from "node:fs";

test("catalog windowing: request key changes when filters or sort change", () => {
  const baseFilters = {
    categories: [],
    priceRange: [0, 500000] as [number, number],
    minRating: 0,
    searchQuery: "",
    showOnlySale: false,
    condition: "all" as const,
    includeWords: "",
    excludeWords: "",
  };

  const firstKey = buildCatalogRequestKey({
    filters: baseFilters,
    selectedCatalogItemId: null,
    sortBy: "popular",
  });
  const secondKey = buildCatalogRequestKey({
    filters: { ...baseFilters, searchQuery: "iphone" },
    selectedCatalogItemId: null,
    sortBy: "popular",
  });
  const thirdKey = buildCatalogRequestKey({
    filters: baseFilters,
    selectedCatalogItemId: null,
    sortBy: "price-asc",
  });

  assert.notEqual(firstKey, secondKey);
  assert.notEqual(firstKey, thirdKey);
});

test("catalog windowing: offsets are trimmed to 3 pages back and 3 pages forward", () => {
  const totalOffsets = buildCatalogOffsetRange(240);
  assert.deepEqual(totalOffsets, [0, 24, 48, 72, 96, 120, 144, 168, 192, 216]);

  const windowOffsets = getCatalogWindowOffsets({
    activeOffset: 96,
    totalCount: 240,
  });
  assert.equal(windowOffsets.length, CATALOG_BACKWARD_WINDOW_PAGES + 1 + CATALOG_FORWARD_WINDOW_PAGES);
  assert.deepEqual(windowOffsets, [24, 48, 72, 96, 120, 144, 168]);

  const retained = trimCatalogOffsets(totalOffsets, {
    activeOffset: 96,
    totalCount: 240,
  });
  assert.deepEqual(retained, windowOffsets);
});

test("catalog windowing: render window returns stable visible slice and spacers", () => {
  const result = getCatalogRenderWindow({
    viewportWidth: 1440,
    scrollY: 3200,
    viewportHeight: 1100,
    gridTop: 600,
    leadingItemCount: 48,
    loadedItemCount: 120,
  });

  assert.equal(result.columns, 4);
  assert.ok(result.rowHeight > 0);
  assert.ok(result.visibleStartIndex >= 0);
  assert.ok(result.visibleEndIndex > result.visibleStartIndex);
  assert.ok(result.topSpacerHeight >= 0);
  assert.ok(result.bottomSpacerHeight >= 0);
});

test("session hydration: admin session no longer auto-opens admin panel from home", () => {
  const sessionHooksSource = readFileSync(
    "frontend/src/app/app.session.hooks.ts",
    "utf8",
  );

  assert.doesNotMatch(sessionHooksSource, /shouldAutoOpenAdminPanel/);
  assert.doesNotMatch(
    sessionHooksSource,
    /existingSession\.role === "admin"[\s\S]*onSetCurrentView\("adminPanel"\)/,
  );
  assert.match(sessionHooksSource, /hydrate-passive/);
});
