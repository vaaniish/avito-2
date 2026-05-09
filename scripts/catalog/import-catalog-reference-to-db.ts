import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const CATALOG_REFERENCE_PATH = path.resolve(
  process.cwd(),
  "data/catalog-reference/generated/catalog-reference.json",
);

type CatalogReferenceCharacteristicSeed = {
  key: string;
  label: string;
  value: string;
  rawValue?: string;
  sourceGroupIndex?: number;
  source?: "bracketGroups" | "titleFallback";
};

type CatalogReferenceVariantSeed = {
  productId?: string;
  title: string;
  characteristics?: CatalogReferenceCharacteristicSeed[];
};

type CatalogReferenceModelSeed = {
  model: string;
  variants?: CatalogReferenceVariantSeed[];
};

type CatalogReferenceBrandSeed = {
  brand: string;
  models?: CatalogReferenceModelSeed[];
};

type CatalogReferenceItemSeed = {
  categoryName: string;
  subcategoryName: string;
  itemName: string;
  brands?: CatalogReferenceBrandSeed[];
};

type CatalogReferenceSeed = {
  items?: CatalogReferenceItemSeed[];
};

type SeedCatalogItemRow = {
  id: number;
  public_id: string;
  name: string;
  subcategory: {
    name: string;
    category: {
      name: string;
    };
  };
};

type MergedCatalogReferenceModelSeed = {
  model: string;
  variants: CatalogReferenceVariantSeed[];
};

type MergedCatalogReferenceBrandSeed = {
  brand: string;
  models: MergedCatalogReferenceModelSeed[];
};

const OFFICIAL_BRAND_NAMES_BY_KEY = new Map(
  [
    "a4tech",
    "a-data",
    "adata",
    "amd",
    "aoc",
    "apc",
    "asus",
    "benq",
    "cbr",
    "cnd",
    "cwt",
    "d-link",
    "dexp",
    "digma",
    "dji",
    "hp",
    "htc",
    "ibm",
    "inzoi",
    "lg",
    "msi",
    "nvidia",
    "oklick",
    "pny",
    "rvi",
    "tdk",
    "tp-link",
    "tws",
    "u2c",
    "ubiquiti",
    "wd",
    "zte",
  ].map((name) => [name, name.toLocaleUpperCase("ru-RU")]),
);

const BRAND_DISPLAY_NAME_OVERRIDES = new Map<string, string>([
  ["a4tech", "A4Tech"],
  ["acer", "Acer"],
  ["apple", "Apple"],
  ["be quiet!", "be quiet!"],
  ["blackview", "Blackview"],
  ["honor", "HONOR"],
  ["huawei", "HUAWEI"],
  ["inno3d", "Inno3D"],
  ["intel", "Intel"],
  ["kingston", "Kingston"],
  ["lenovo", "Lenovo"],
  ["philips", "Philips"],
  ["samsung", "Samsung"],
  ["sandisk", "SanDisk"],
  ["sapphire", "Sapphire"],
  ["xiaomi", "Xiaomi"],
  ["zotac", "Zotac"],
]);

function normalizeReferenceKey(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function isAllUpperCaseDisplayName(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, "");
  return letters.length > 0 && letters === letters.toLocaleUpperCase("ru-RU");
}

function canonicalBrandDisplayName(names: string[]): string {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  const key = normalizeReferenceKey(cleaned[0] ?? "");
  const override = BRAND_DISPLAY_NAME_OVERRIDES.get(key) ?? OFFICIAL_BRAND_NAMES_BY_KEY.get(key);
  if (override) return override;

  return cleaned.find((name) => !isAllUpperCaseDisplayName(name)) ?? cleaned[0] ?? "";
}

function canonicalModelDisplayName(current: string, next: string): string {
  if (!current) return next;
  if (!next) return current;
  if (isAllUpperCaseDisplayName(current) && !isAllUpperCaseDisplayName(next)) return next;
  return current;
}

function mergeReferenceBrands(
  brands: CatalogReferenceBrandSeed[] = [],
): MergedCatalogReferenceBrandSeed[] {
  const brandGroups = new Map<
    string,
    { names: string[]; brands: CatalogReferenceBrandSeed[] }
  >();

  for (const brand of brands) {
    const brandName = brand.brand.trim();
    if (!brandName) continue;
    const key = normalizeReferenceKey(brandName);
    const existing = brandGroups.get(key);
    if (existing) {
      existing.names.push(brandName);
      existing.brands.push(brand);
    } else {
      brandGroups.set(key, { names: [brandName], brands: [brand] });
    }
  }

  return Array.from(brandGroups.entries()).map(([brandKey, group]) => {
    const modelsByKey = new Map<string, MergedCatalogReferenceModelSeed>();

    for (const brand of group.brands) {
      for (const model of brand.models ?? []) {
        const modelName = model.model.trim();
        if (!modelName) continue;
        const modelKey = normalizeReferenceKey(modelName);
        const existing = modelsByKey.get(modelKey);
        if (existing) {
          existing.model = canonicalModelDisplayName(existing.model, modelName);
          existing.variants.push(...(model.variants ?? []));
        } else {
          modelsByKey.set(modelKey, {
            model: modelName,
            variants: [...(model.variants ?? [])],
          });
        }
      }
    }

    return {
      brand: canonicalBrandDisplayName(group.names) || brandKey,
      models: Array.from(modelsByKey.values()),
    };
  });
}

function referenceScopeKey(
  categoryName: string,
  subcategoryName: string,
  itemName: string,
): string {
  return [categoryName, subcategoryName, itemName]
    .map(normalizeReferenceKey)
    .join("::");
}

async function createManyInChunks<T>(
  modelName: string,
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  chunkSize = 5_000,
): Promise<void> {
  for (let index = 0; index < rows.length; index += chunkSize) {
    await insert(rows.slice(index, index + chunkSize));
  }
  console.log(`${modelName}: ${rows.length}`);
}

async function main(): Promise<void> {
  if (!fs.existsSync(CATALOG_REFERENCE_PATH)) {
    throw new Error(`Catalog reference import source not found: ${CATALOG_REFERENCE_PATH}`);
  }

  const reference = JSON.parse(
    fs.readFileSync(CATALOG_REFERENCE_PATH, "utf8"),
  ) as CatalogReferenceSeed;

  const items = await prisma.catalogItem.findMany({
    select: {
      id: true,
      public_id: true,
      name: true,
      subcategory: {
        select: {
          name: true,
          category: { select: { name: true } },
        },
      },
    },
  });

  const itemByScope = new Map<string, SeedCatalogItemRow>();
  const itemsByName = new Map<string, SeedCatalogItemRow[]>();
  for (const item of items) {
    itemByScope.set(
      referenceScopeKey(item.subcategory.category.name, item.subcategory.name, item.name),
      item,
    );
    const nameKey = normalizeReferenceKey(item.name);
    const namedItems = itemsByName.get(nameKey) ?? [];
    namedItems.push(item);
    itemsByName.set(nameKey, namedItems);
  }

  await prisma.catalogReferenceCharacteristic.deleteMany();
  await prisma.catalogReferenceVariant.deleteMany();
  await prisma.catalogReferenceModel.deleteMany();
  await prisma.catalogReferenceBrand.deleteMany();

  const brandRows: Array<{
    public_id: string;
    item_id: number;
    name: string;
    order_index: number;
  }> = [];
  const modelDrafts: Array<{
    publicId: string;
    itemId: number;
    brandName: string;
    name: string;
    orderIndex: number;
    variants: CatalogReferenceVariantSeed[];
  }> = [];

  let skippedItems = 0;
  for (const [itemIndex, referenceItem] of (reference.items ?? []).entries()) {
    const scopedItem =
      itemByScope.get(
        referenceScopeKey(
          referenceItem.categoryName,
          referenceItem.subcategoryName,
          referenceItem.itemName,
        ),
      ) ??
      (() => {
        const byName = itemsByName.get(normalizeReferenceKey(referenceItem.itemName)) ?? [];
        return byName.length === 1 ? byName[0] : null;
      })();

    if (!scopedItem) {
      skippedItems += 1;
      continue;
    }

    for (const [brandIndex, brand] of mergeReferenceBrands(referenceItem.brands).entries()) {
      const brandName = brand.brand.trim();
      if (!brandName) continue;
      const brandPublicId = `CRB-${scopedItem.public_id}-${String(brandIndex + 1).padStart(4, "0")}`;
      brandRows.push({
        public_id: brandPublicId,
        item_id: scopedItem.id,
        name: brandName,
        order_index: brandIndex + 1,
      });

      for (const [modelIndex, model] of brand.models.entries()) {
        const modelName = model.model.trim();
        if (!modelName) continue;
        modelDrafts.push({
          publicId: `CRM-${scopedItem.public_id}-${String(brandIndex + 1).padStart(4, "0")}-${String(modelIndex + 1).padStart(5, "0")}`,
          itemId: scopedItem.id,
          brandName,
          name: modelName,
          orderIndex: modelIndex + 1,
          variants: model.variants ?? [],
        });
      }
    }

    if ((itemIndex + 1) % 50 === 0) {
      console.log(`Prepared ${itemIndex + 1} reference items`);
    }
  }

  if (skippedItems > 0) {
    console.warn(`Skipped reference items outside current catalog: ${skippedItems}`);
  }

  await createManyInChunks("CatalogReferenceBrand", brandRows, (chunk) =>
    prisma.catalogReferenceBrand.createMany({ data: chunk, skipDuplicates: true }),
  );

  const brandIdByItemAndName = new Map(
    (
      await prisma.catalogReferenceBrand.findMany({
        select: { id: true, item_id: true, name: true },
      })
    ).map((brand) => [`${brand.item_id}::${brand.name}`, brand.id]),
  );

  const modelRows = modelDrafts
    .map((model) => {
      const brandId = brandIdByItemAndName.get(`${model.itemId}::${model.brandName}`);
      if (!brandId) return null;
      return {
        public_id: model.publicId,
        brand_id: brandId,
        name: model.name,
        order_index: model.orderIndex,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await createManyInChunks("CatalogReferenceModel", modelRows, (chunk) =>
    prisma.catalogReferenceModel.createMany({ data: chunk, skipDuplicates: true }),
  );

  const modelIdByPublicId = new Map(
    (
      await prisma.catalogReferenceModel.findMany({
        select: { id: true, public_id: true },
      })
    ).map((model) => [model.public_id, model.id]),
  );

  const variantDrafts: Array<{
    publicId: string;
    modelPublicId: string;
    productId: string | null;
    title: string;
    orderIndex: number;
    characteristics: CatalogReferenceCharacteristicSeed[];
  }> = [];
  for (const model of modelDrafts) {
    for (const [variantIndex, variant] of model.variants.entries()) {
      const title = variant.title.trim();
      if (!title) continue;
      variantDrafts.push({
        publicId: `CRV-${model.publicId.replace(/^CRM-/, "")}-${String(variantIndex + 1).padStart(4, "0")}`,
        modelPublicId: model.publicId,
        productId: variant.productId?.trim() || null,
        title,
        orderIndex: variantIndex + 1,
        characteristics: variant.characteristics ?? [],
      });
    }
  }

  const variantRows = variantDrafts
    .map((variant) => {
      const modelId = modelIdByPublicId.get(variant.modelPublicId);
      if (!modelId) return null;
      return {
        public_id: variant.publicId,
        model_id: modelId,
        external_product_id: variant.productId,
        title: variant.title,
        order_index: variant.orderIndex,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await createManyInChunks("CatalogReferenceVariant", variantRows, (chunk) =>
    prisma.catalogReferenceVariant.createMany({ data: chunk, skipDuplicates: true }),
  );

  const variantIdByPublicId = new Map(
    (
      await prisma.catalogReferenceVariant.findMany({
        select: { id: true, public_id: true },
      })
    ).map((variant) => [variant.public_id, variant.id]),
  );

  const characteristicRows = variantDrafts.flatMap((variant) => {
    const variantId = variantIdByPublicId.get(variant.publicId);
    if (!variantId) return [];
    return variant.characteristics
      .map((characteristic, index) => ({
        variant_id: variantId,
        key: characteristic.key.trim(),
        label: characteristic.label.trim(),
        value: characteristic.value.trim(),
        raw_value: (characteristic.rawValue ?? characteristic.value).trim(),
        source_group_index: characteristic.sourceGroupIndex ?? 0,
        source: characteristic.source ?? "bracketGroups",
        order_index: index + 1,
      }))
      .filter(
        (characteristic) =>
          characteristic.key &&
          characteristic.label &&
          characteristic.value &&
          characteristic.raw_value,
      );
  });

  await createManyInChunks("CatalogReferenceCharacteristic", characteristicRows, (chunk) =>
    prisma.catalogReferenceCharacteristic.createMany({ data: chunk }),
  );

  const controlItems = [
    "Видеокарты",
    "Процессоры",
    "Материнские платы",
    "Встраиваемые кофемашины",
  ];
  for (const itemName of controlItems) {
    const found = await prisma.catalogItem.findFirst({
      where: { name: { equals: itemName, mode: "insensitive" } },
      select: {
        name: true,
        _count: { select: { reference_brands: true } },
      },
    });
    if (!found || found._count.reference_brands === 0) {
      throw new Error(`Control catalog reference item was not imported: ${itemName}`);
    }
  }

  const [duplicateBrandGroups, duplicateModelGroups] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT item_id, lower(btrim(name))
        FROM "CatalogReferenceBrand"
        GROUP BY item_id, lower(btrim(name))
        HAVING COUNT(*) > 1
      ) duplicates
    `,
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT brand_id, lower(btrim(name))
        FROM "CatalogReferenceModel"
        GROUP BY brand_id, lower(btrim(name))
        HAVING COUNT(*) > 1
      ) duplicates
    `,
  ]);
  const brandDuplicateCount = Number(duplicateBrandGroups[0]?.count ?? 0);
  const modelDuplicateCount = Number(duplicateModelGroups[0]?.count ?? 0);
  if (brandDuplicateCount > 0 || modelDuplicateCount > 0) {
    throw new Error(
      `Catalog reference import produced normalized duplicates: brands=${brandDuplicateCount}, models=${modelDuplicateCount}`,
    );
  }

  console.log("Catalog reference import completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
