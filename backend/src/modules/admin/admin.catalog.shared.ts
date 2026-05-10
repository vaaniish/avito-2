import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export function buildDefaultItemAttributeDefinitions(params: {
  itemId: number;
  itemPublicId: string;
  type: "PRODUCT";
}): Prisma.CatalogAttributeDefinitionCreateManyInput[] {
  return [
    {
      public_id: `${params.itemPublicId}-CAD-01`,
      type: params.type,
      item_id: params.itemId,
      key: "manufacturer",
      label: "Производитель / бренд",
      input_type: "text",
      required: true,
      order_index: 1,
    },
    {
      public_id: `${params.itemPublicId}-CAD-02`,
      type: params.type,
      item_id: params.itemId,
      key: "model",
      label: "Модель",
      input_type: "text",
      required: true,
      order_index: 2,
    },
    {
      public_id: `${params.itemPublicId}-CAD-03`,
      type: params.type,
      item_id: params.itemId,
      key: "included",
      label: "Комплект",
      input_type: "textarea",
      required: true,
      order_index: 3,
    },
    {
      public_id: `${params.itemPublicId}-CAD-04`,
      type: params.type,
      item_id: params.itemId,
      key: "defects_description",
      label: "Дефекты",
      input_type: "textarea",
      required: true,
      order_index: 4,
    },
  ];
}

export function makePublicId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    Math.random() * 10_000,
  )
    .toString(36)
    .toUpperCase()}`;
}

export function parseCatalogListingType(value: unknown): "PRODUCT" | null {
  if (value === "products" || value === "product" || value === "PRODUCT") {
    return "PRODUCT";
  }
  return null;
}

export function catalogTypeToClient(_type: "PRODUCT"): "products" {
  return "products";
}

export function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCatalogName(value: unknown, fieldName: string): string {
  const text = readTrimmedString(value);
  if (text.length < 2) {
    throw new Error(`${fieldName}: минимум 2 символа`);
  }
  if (text.length > 120) {
    throw new Error(`${fieldName}: максимум 120 символов`);
  }
  return text;
}

export function normalizeCatalogIconKey(value: unknown): string {
  const text = readTrimmedString(value);
  return text.length > 0 ? text.slice(0, 40) : "monitor";
}

export function normalizeCatalogReferenceText(
  value: unknown,
  fieldName: string,
): string {
  const text = readTrimmedString(value);
  if (text.length < 1) {
    throw new Error(`${fieldName}: заполните значение`);
  }
  if (text.length > 160) {
    throw new Error(`${fieldName}: максимум 160 символов`);
  }
  return text;
}

export function makeCharacteristicKey(label: string): string {
  const normalized = label
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/giu, "")
    .slice(0, 60);
  return normalized || "characteristic";
}

export function duplicateCatalogReferenceCharacteristicLabel(
  characteristics: Array<{ label: string }>,
): string | null {
  const seen = new Set<string>();
  for (const characteristic of characteristics) {
    const key = makeCharacteristicKey(characteristic.label);
    if (seen.has(key)) return characteristic.label;
    seen.add(key);
  }
  return null;
}

export function clientCatalogCategory(category: {
  public_id: string;
  type: "PRODUCT";
  name: string;
  icon_key: string;
  order_index: number;
  subcategories: Array<{
    public_id: string;
    name: string;
    order_index: number;
    items: Array<{
      public_id: string;
      name: string;
      order_index: number;
      _count?: { listings: number };
    }>;
    _count?: { items: number };
  }>;
}) {
  return {
    id: category.public_id,
    type: catalogTypeToClient(category.type),
    name: category.name,
    iconKey: category.icon_key,
    orderIndex: category.order_index,
    subcategories: category.subcategories.map((subcategory) => ({
      id: subcategory.public_id,
      name: subcategory.name,
      orderIndex: subcategory.order_index,
      itemCount: subcategory._count?.items ?? subcategory.items.length,
      items: subcategory.items.map((item) => ({
        id: item.public_id,
        name: item.name,
        orderIndex: item.order_index,
        listingCount: item._count?.listings ?? 0,
      })),
    })),
  };
}

export async function nextOrderIndex(
  tx: Prisma.TransactionClient,
  scope: "category" | "subcategory" | "item",
  params: { type?: "PRODUCT"; categoryId?: number; subcategoryId?: number },
): Promise<number> {
  if (scope === "category" && params.type) {
    const result = await tx.catalogCategory.aggregate({
      where: { type: params.type },
      _max: { order_index: true },
    });
    return (result._max.order_index ?? 0) + 1;
  }

  if (scope === "subcategory" && params.categoryId) {
    const result = await tx.catalogSubcategory.aggregate({
      where: { category_id: params.categoryId },
      _max: { order_index: true },
    });
    return (result._max.order_index ?? 0) + 1;
  }

  if (scope === "item" && params.subcategoryId) {
    const result = await tx.catalogItem.aggregate({
      where: { subcategory_id: params.subcategoryId },
      _max: { order_index: true },
    });
    return (result._max.order_index ?? 0) + 1;
  }

  return 1;
}

export async function loadAdminCatalog(type: "PRODUCT") {
  const categories = await prisma.catalogCategory.findMany({
    where: { type },
    orderBy: [{ order_index: "asc" }, { id: "asc" }],
    include: {
      subcategories: {
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        include: {
          _count: { select: { items: true } },
          items: {
            orderBy: [{ order_index: "asc" }, { id: "asc" }],
            include: {
              _count: { select: { listings: true } },
            },
          },
        },
      },
    },
  });

  return categories.map(clientCatalogCategory);
}
