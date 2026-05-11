import type { CatalogCategory, CatalogItem, CatalogSubcategory } from "./filter-panel.types";

export function buildCatalogItemsForSubcategory(subcategory: CatalogSubcategory): CatalogItem[] {
  if (subcategory.catalogItems?.length) return subcategory.catalogItems;
  return subcategory.items.map((name) => ({
    id: name,
    name,
    count: 0,
    categoryId: "",
    subcategoryId: subcategory.id,
  }));
}

export function getCatalogItemIdsForSubcategory(subcategory: CatalogSubcategory): string[] {
  return buildCatalogItemsForSubcategory(subcategory).map((item) => item.id);
}

export function getCatalogItemIdsForCategory(category: CatalogCategory): string[] {
  return category.subcategories.flatMap(getCatalogItemIdsForSubcategory);
}

export function toggleSetValue(previous: Set<string>, value: string) {
  const next = new Set(previous);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
