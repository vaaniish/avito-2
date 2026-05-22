import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCatalogSortBy,
  sortCatalogCandidates,
} from "../../../backend/src/modules/catalog/domain/catalog.service";

test("catalog sort: parseCatalogSortBy accepts recommended", () => {
  assert.equal(parseCatalogSortBy("recommended"), "recommended");
  assert.equal(parseCatalogSortBy("unknown"), "popular");
});

test("catalog sort: recommended falls back to popular ordering when score map is empty", () => {
  const candidates = [
    {
      id: 1,
      price: 100,
      sale_price: null,
      rating: 4.6,
      created_at: new Date("2026-05-01T10:00:00.000Z"),
      views: 10,
      searchRank: 0,
    },
    {
      id: 2,
      price: 100,
      sale_price: null,
      rating: 4.7,
      created_at: new Date("2026-05-02T10:00:00.000Z"),
      views: 90,
      searchRank: 0,
    },
  ];

  const sorted = sortCatalogCandidates(candidates, "recommended");
  assert.deepEqual(
    sorted.map((item) => item.id),
    [2, 1],
  );
});

test("catalog sort: search relevance stays primary over recommendation score", () => {
  const candidates = [
    {
      id: 1,
      price: 100,
      sale_price: null,
      rating: 4.6,
      created_at: new Date("2026-05-01T10:00:00.000Z"),
      views: 10,
      searchRank: 120,
    },
    {
      id: 2,
      price: 100,
      sale_price: null,
      rating: 4.7,
      created_at: new Date("2026-05-02T10:00:00.000Z"),
      views: 90,
      searchRank: 250,
    },
  ];

  const sorted = sortCatalogCandidates(candidates, "recommended", {
    recommendationScores: new Map([
      [1, 9],
      [2, 1],
    ]),
  });

  assert.deepEqual(
    sorted.map((item) => item.id),
    [2, 1],
  );
});
