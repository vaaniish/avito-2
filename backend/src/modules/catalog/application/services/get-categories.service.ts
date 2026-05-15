import {
  mergeAttributeDefinitionDtos,
  normalizeDisplayText,
  resolveListingType,
  toClientAttributeDefinitionDtos,
} from "../catalog.service";
import type { CatalogRepositoryPort } from "../catalog.types";

export class GetCategoriesService {
  constructor(private readonly repository: CatalogRepositoryPort) {}

  async execute(input: { type?: unknown }) {
    const type = resolveListingType(input.type);
    const [categories, visibleListingCounts] = await Promise.all([
      this.repository.findCategoriesWithTree(type),
      this.repository.groupVisibleListingCountsByItem(type),
    ]);
    const countByItemId = new Map(
      visibleListingCounts
        .filter((row) => row.item_id !== null)
        .map((row) => [row.item_id as number, row._count._all]),
    );
    const categoryCounts = new Map<number, number>();
    const subcategoryCounts = new Map<number, number>();

    for (const category of categories) {
      for (const subcategory of category.subcategories) {
        for (const item of subcategory.items) {
          const count = countByItemId.get(item.id) ?? 0;
          if (count === 0) continue;
          categoryCounts.set(category.id, (categoryCounts.get(category.id) ?? 0) + count);
          subcategoryCounts.set(
            subcategory.id,
            (subcategoryCounts.get(subcategory.id) ?? 0) + count,
          );
        }
      }
    }

    return categories.map((category) => ({
      id: category.public_id,
      name: normalizeDisplayText(category.name, "Без названия"),
      icon_key: category.icon_key,
      count: categoryCounts.get(category.id) ?? 0,
      attributeSchema: toClientAttributeDefinitionDtos(
        category.attribute_definitions,
        type,
      ),
      subcategories: category.subcategories.map((subcategory: any) => {
        const inheritedSchema = mergeAttributeDefinitionDtos(
          toClientAttributeDefinitionDtos(category.attribute_definitions, type),
          toClientAttributeDefinitionDtos(subcategory.attribute_definitions, type),
        );
        return {
          id: subcategory.public_id,
          name: normalizeDisplayText(subcategory.name, "Без названия"),
          count: subcategoryCounts.get(subcategory.id) ?? 0,
          items: subcategory.items.map((item: any) =>
            normalizeDisplayText(item.name, "Без названия"),
          ),
          catalogItems: subcategory.items.map((item: any) => ({
            id: item.public_id,
            name: normalizeDisplayText(item.name, "Без названия"),
            count: countByItemId.get(item.id) ?? 0,
            categoryId: category.public_id,
            subcategoryId: subcategory.public_id,
          })),
          attributeSchema: inheritedSchema,
          itemAttributeSchemas: Object.fromEntries(
            subcategory.items.map((item: any) => [
              normalizeDisplayText(item.name, "Без названия"),
              mergeAttributeDefinitionDtos(
                [],
                toClientAttributeDefinitionDtos(item.attribute_definitions, type),
              ),
            ]),
          ),
        };
      }),
    }));
  }
}
