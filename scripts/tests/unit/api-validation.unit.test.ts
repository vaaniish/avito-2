import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { mutationSchemaRegistry, validateMutationRequest } from "../../../backend/src/lib/api-validation";

function validate(path: string, body: unknown, method = "POST", headers: Record<string, string> = {}) {
  let result: { status?: number; payload?: unknown; next: boolean } = { next: false };
  const req = {
    method,
    path,
    body,
    header: (name: string) => headers[name.toLowerCase()],
  } as any;
  const res = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: unknown) {
      result.payload = payload;
      return this;
    },
  } as any;
  validateMutationRequest(req, res, () => { result.next = true; });
  return result;
}

async function listRouterFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRouterFiles(target);
    return entry.isFile() && entry.name.endsWith(".router.ts") ? [target] : [];
  }));
  return nested.flat();
}

function apiPrefix(file: string): string | null {
  const normalized = file.replaceAll(path.sep, "/");
  if (normalized.includes("/modules/admin/")) return "/api/admin";
  if (normalized.endsWith("/recommendations/http/admin-recommendations.router.ts")) return "/api/admin";
  if (normalized.includes("/modules/profile/")) return "/api/profile";
  if (normalized.includes("/modules/partner/")) return "/api/partner";
  if (normalized.includes("/modules/auth/")) return "/api/auth";
  if (normalized.includes("/modules/catalog/")) return "/api/catalog";
  if (normalized.endsWith("/recommendations/http/recommendations.router.ts")) return "/api/recommendations";
  return null;
}

test("API validation: rejects unknown top-level mutation fields", () => {
  const result = validate("/api/catalog/listings/LST/questions", {
    question: "Корректный вопрос",
    injectedRole: "ADMIN",
  });
  assert.equal(result.status, 400);
  assert.equal((result.payload as any).code, "VALIDATION_ERROR");
  assert.equal(result.next, false);
});

test("API validation: rejects SVG data URLs and duplicate images", () => {
  const svg = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
  const result = validate("/api/partner/listings", {
    title: "Listing",
    price: 100,
    images: [svg, svg],
  });
  assert.equal(result.status, 400);
  assert.equal((result.payload as any).code, "VALIDATION_ERROR");
});

test("API validation: accepts HTTPS image URLs for a listing mutation", () => {
  const result = validate("/api/partner/listings", {
    title: "Listing",
    price: 100,
    images: ["https://cdn.example.test/image.webp"],
  });
  assert.equal(result.next, true);
});

test("API validation: accepts complaint payload on catalog listing route", () => {
  const result = validate("/api/catalog/listings/LST-001/complaints", {
    complaintType: "FRAUD",
    description: "Описание жалобы",
  });
  assert.equal(result.next, true);
  assert.equal(result.status, undefined);
});

test("API validation: every mutation route has exactly one schema", async () => {
  const routerFiles = await listRouterFiles(path.resolve("backend/src/modules"));
  const discovered: string[] = [];
  const routePattern = /router\s*\.\s*(post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g;
  for (const file of routerFiles) {
    const prefix = apiPrefix(file);
    if (!prefix) continue;
    const source = await fs.readFile(file, "utf8");
    for (const match of source.matchAll(routePattern)) {
      discovered.push(`${match[1].toUpperCase()} ${prefix}${match[2]}`);
    }
  }
  const registered = mutationSchemaRegistry.map((entry) => `${entry.method} ${entry.template}`);
  assert.equal(discovered.length, 78);
  assert.deepEqual([...new Set(registered)].sort(), [...new Set(discovered)].sort());
});

test("API validation: requires a safe idempotency key for checkout", () => {
  const body = {
    items: [{ listingId: "LST-001", quantity: 1 }],
    deliveryType: "pickup",
    paymentMethod: "card",
  };
  assert.equal(validate("/api/profile/orders", body).status, 400);
  assert.equal(validate("/api/profile/orders", body, "POST", { "idempotency-key": "checkout:test:1" }).next, true);
});

test("API validation: rejects invalid positive numeric params", () => {
  const result = validate("/api/profile/addresses/0", {}, "DELETE");
  assert.equal(result.status, 400);
  assert.equal((result.payload as any).code, "VALIDATION_ERROR");
});

test("API validation: validates enums and nested listing draft images", () => {
  const invalidMode = validate("/api/partner/listings/catalog-requests", {
    mode: "arbitrary",
    categoryName: "Категория",
    subcategoryName: "Подкатегория",
    itemName: "Товар",
    brand: "",
    model: "",
    importantAttributes: "",
    comment: "",
    link: "",
    email: "",
    photoName: "",
    photoLabel: "",
    title: "",
  });
  assert.equal(invalidMode.status, 400);

  const nestedSvg = validate("/api/partner/listing-drafts", {
    type: "products",
    payload: { images: ["data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="] },
  });
  assert.equal(nestedSvg.status, 400);
  assert.deepEqual((nestedSvg.payload as any).fields.images, ["Invalid images"]);
});

test("API validation: validates meaningful mutation headers", () => {
  const payload = { status: "approved", actionTaken: "Проверено" };
  assert.equal(validate("/api/admin/complaints/CMP-001/status", payload, "PATCH").status, 400);
  assert.equal(validate(
    "/api/admin/complaints/CMP-001/status",
    payload,
    "PATCH",
    { "idempotency-key": "complaint:CMP-001:approved" },
  ).next, true);
  assert.equal(validate(
    "/api/admin/complaints/CMP-001/status",
    payload,
    "PATCH",
    { "idempotency-key": "contains spaces" },
  ).status, 400);
});

test("API validation: rejects oversized arrays and invalid catalog IDs", () => {
  const oversizedScope = validate("/api/admin/promos", {
    code: "PROMO",
    discountType: "percent",
    discountValue: 10,
    minSubtotal: 0,
    maxActivations: 100,
    perUserLimit: 1,
    startsAt: "2026-07-30T00:00:00.000Z",
    endsAt: "2026-08-30T00:00:00.000Z",
    isEnabled: true,
    allCatalog: false,
    categoryIds: Array.from({ length: 501 }, (_, index) => `CAT-${index}`),
    subcategoryIds: [],
    itemIds: [],
  });
  assert.equal(oversizedScope.status, 400);

  const invalidId = validate("/api/admin/catalog/subcategories", {
    categoryId: "contains a space",
    name: "Подкатегория",
  });
  assert.equal(invalidId.status, 400);
});
