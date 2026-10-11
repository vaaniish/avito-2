import assert from "node:assert/strict";
import test from "node:test";
import {
  getCatalogRuntimeCache,
  invalidateCatalogRuntimeCachePrefixes,
  invalidateCatalogRuntimeCaches,
} from "../../../backend/src/modules/catalog/catalog-runtime-cache";

test("catalog runtime cache: concurrent identical reads use one loader", async () => {
  invalidateCatalogRuntimeCaches();
  let loads = 0;
  let release!: (value: string) => void;
  const source = new Promise<string>((resolve) => {
    release = resolve;
  });
  const loader = async () => {
    loads += 1;
    return source;
  };

  const first = getCatalogRuntimeCache("test:single-flight", loader);
  const second = getCatalogRuntimeCache("test:single-flight", loader);
  release("same-response");

  assert.deepEqual(await Promise.all([first, second]), ["same-response", "same-response"]);
  assert.equal(loads, 1);
  assert.equal(
    await getCatalogRuntimeCache("test:single-flight", async () => "unexpected"),
    "same-response",
  );
  invalidateCatalogRuntimeCaches();
});

test("catalog runtime cache: prefix invalidation cannot restore an obsolete in-flight value", async () => {
  invalidateCatalogRuntimeCaches();
  let releaseObsolete!: (value: string) => void;
  const obsoleteSource = new Promise<string>((resolve) => {
    releaseObsolete = resolve;
  });
  const obsolete = getCatalogRuntimeCache("categories:products", () => obsoleteSource);

  invalidateCatalogRuntimeCachePrefixes(["categories:"]);
  const fresh = await getCatalogRuntimeCache("categories:products", async () => "fresh");
  releaseObsolete("obsolete");

  assert.equal(fresh, "fresh");
  assert.equal(await obsolete, "obsolete");
  assert.equal(
    await getCatalogRuntimeCache("categories:products", async () => "unexpected"),
    "fresh",
  );
  invalidateCatalogRuntimeCaches();
});

test("catalog runtime cache: prefix invalidation leaves unrelated reference data intact", async () => {
  invalidateCatalogRuntimeCaches();
  let categoryLoads = 0;
  let referenceLoads = 0;
  const categoryLoader = async () => `category-${++categoryLoads}`;
  const referenceLoader = async () => `reference-${++referenceLoads}`;

  assert.equal(await getCatalogRuntimeCache("categories:products", categoryLoader), "category-1");
  assert.equal(
    await getCatalogRuntimeCache("catalog-reference-item:phone", referenceLoader),
    "reference-1",
  );

  invalidateCatalogRuntimeCachePrefixes(["categories:"]);

  assert.equal(await getCatalogRuntimeCache("categories:products", categoryLoader), "category-2");
  assert.equal(
    await getCatalogRuntimeCache("catalog-reference-item:phone", referenceLoader),
    "reference-1",
  );
  assert.equal(referenceLoads, 1);
  invalidateCatalogRuntimeCaches();
});
