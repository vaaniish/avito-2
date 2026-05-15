import { Prisma, type CatalogSuggestionStatus, type PrismaClient } from "@prisma/client";
import {
  buildDefaultItemAttributeDefinitions,
  duplicateCatalogReferenceCharacteristicLabel,
  makeCharacteristicKey,
  makePublicId,
  normalizeCatalogIconKey,
  normalizeCatalogName,
  normalizeCatalogReferenceText,
  parseCatalogListingType,
  readTrimmedString,
} from "../../../catalog/domain/admin-catalog.helpers";

export class AdminCatalogSuggestionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async approveReference(params: {
    publicId: string;
    actorUserId: number;
    body: Record<string, unknown>;
  }) {
    const approval =
      params.body.approval && typeof params.body.approval === "object"
        ? (params.body.approval as Record<string, unknown>)
        : {};
    const reference =
      params.body.reference && typeof params.body.reference === "object"
        ? (params.body.reference as Record<string, unknown>)
        : {};
    const adminNote = readTrimmedString(params.body.adminNote);
    const targetType = parseCatalogListingType(approval.type) ?? "PRODUCT";
    const categoryPublicId = readTrimmedString(approval.categoryId);
    const categoryName = readTrimmedString(approval.categoryName);
    const subcategoryPublicId = readTrimmedString(approval.subcategoryId);
    const subcategoryName = readTrimmedString(approval.subcategoryName);
    const itemName = normalizeCatalogName(approval.itemName, "Вид товара");
    const brandName = normalizeCatalogReferenceText(reference.brandName, "Бренд");
    const modelName = normalizeCatalogReferenceText(reference.modelName, "Модель");
    const productTitle = normalizeCatalogReferenceText(
      reference.productTitle,
      "Конкретный товар",
    );
    const rawCharacteristics = Array.isArray(reference.characteristics)
      ? reference.characteristics
      : [];
    const characteristics = rawCharacteristics
      .map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const label = readTrimmedString((entry as Record<string, unknown>).label);
        const value = readTrimmedString((entry as Record<string, unknown>).value);
        if (!label || !value) return null;
        return {
          label: label.slice(0, 120),
          value: value.slice(0, 300),
        };
      })
      .filter((entry): entry is { label: string; value: string } => Boolean(entry))
      .slice(0, 60);
    const duplicateCharacteristicLabel =
      duplicateCatalogReferenceCharacteristicLabel(characteristics);
    if (duplicateCharacteristicLabel) {
      throw new Error(`Характеристика «${duplicateCharacteristicLabel}» уже добавлена`);
    }

    if (!categoryPublicId && categoryName.length < 2) {
      throw new Error("Выберите категорию или укажите новую");
    }
    if (!subcategoryPublicId && subcategoryName.length < 2) {
      throw new Error("Выберите подкатегорию или укажите новую");
    }

    return this.prisma.$transaction(async (tx) => {
      const suggestion = await tx.catalogSuggestion.findUnique({
        where: { public_id: params.publicId },
        select: { id: true },
      });
      if (!suggestion) throw new Error("Catalog suggestion not found");

      let category: { id: number; public_id: string; name: string } | null = null;
      if (categoryPublicId) {
        category = await tx.catalogCategory.findFirst({
          where: { public_id: categoryPublicId, type: targetType },
          select: { id: true, public_id: true, name: true },
        });
        if (!category) throw new Error("Категория не найдена");
      } else {
        category = await tx.catalogCategory.findFirst({
          where: { type: targetType, name: { equals: categoryName, mode: "insensitive" } },
          select: { id: true, public_id: true, name: true },
        });
        if (!category) {
          category = await tx.catalogCategory.create({
            data: {
              public_id: makePublicId("CAT"),
              type: targetType,
              name: normalizeCatalogName(categoryName, "Категория"),
              icon_key: "monitor",
              order_index:
                (await tx.catalogCategory.count({ where: { type: targetType } })) + 1,
            },
            select: { id: true, public_id: true, name: true },
          });
        }
      }

      let subcategory:
        | { id: number; public_id: string; name: string }
        | null = null;
      if (subcategoryPublicId) {
        subcategory = await tx.catalogSubcategory.findFirst({
          where: { public_id: subcategoryPublicId, category_id: category.id },
          select: { id: true, public_id: true, name: true },
        });
        if (!subcategory) throw new Error("Подкатегория не найдена");
      } else {
        const validSubcategoryName = normalizeCatalogName(subcategoryName, "Подкатегория");
        subcategory = await tx.catalogSubcategory.findFirst({
          where: {
            category_id: category.id,
            name: { equals: validSubcategoryName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        });
        if (!subcategory) {
          subcategory = await tx.catalogSubcategory.create({
            data: {
              public_id: makePublicId("SUB"),
              category_id: category.id,
              name: validSubcategoryName,
              order_index:
                (await tx.catalogSubcategory.count({ where: { category_id: category.id } })) + 1,
            },
            select: { id: true, public_id: true, name: true },
          });
        }
      }

      let item = await tx.catalogItem.findFirst({
        where: {
          subcategory_id: subcategory.id,
          name: { equals: itemName, mode: "insensitive" },
        },
        select: { id: true, public_id: true, name: true },
      });
      if (!item) {
        item = await tx.catalogItem.create({
          data: {
            public_id: makePublicId("ITM"),
            subcategory_id: subcategory.id,
            name: itemName,
            order_index:
              (await tx.catalogItem.count({ where: { subcategory_id: subcategory.id } })) + 1,
          },
          select: { id: true, public_id: true, name: true },
        });
        await tx.catalogAttributeDefinition.createMany({
          data: buildDefaultItemAttributeDefinitions({
            itemId: item.id,
            itemPublicId: item.public_id,
            type: targetType,
          }),
        });
      }

      let brand = await tx.catalogReferenceBrand.findFirst({
        where: {
          item_id: item.id,
          name: { equals: brandName, mode: "insensitive" },
        },
        select: { id: true, public_id: true, name: true },
      });
      if (!brand) {
        brand = await tx.catalogReferenceBrand.create({
          data: {
            public_id: makePublicId("CRB"),
            item_id: item.id,
            name: brandName,
            order_index:
              (await tx.catalogReferenceBrand.count({ where: { item_id: item.id } })) + 1,
          },
          select: { id: true, public_id: true, name: true },
        });
      }

      let model = await tx.catalogReferenceModel.findFirst({
        where: {
          brand_id: brand.id,
          name: { equals: modelName, mode: "insensitive" },
        },
        select: { id: true, public_id: true, name: true },
      });
      if (!model) {
        model = await tx.catalogReferenceModel.create({
          data: {
            public_id: makePublicId("CRM"),
            brand_id: brand.id,
            name: modelName,
            order_index:
              (await tx.catalogReferenceModel.count({ where: { brand_id: brand.id } })) + 1,
          },
          select: { id: true, public_id: true, name: true },
        });
      }

      if (characteristics.length > 0) {
        const existingCharacteristics = await tx.catalogReferenceCharacteristic.findMany({
          where: { variant: { model_id: model.id } },
          select: { label: true },
        });
        const existingKeys = new Set(
          existingCharacteristics.map((characteristic) =>
            makeCharacteristicKey(characteristic.label),
          ),
        );
        const duplicateExistingCharacteristic = characteristics.find((characteristic) =>
          existingKeys.has(makeCharacteristicKey(characteristic.label)),
        );
        if (duplicateExistingCharacteristic) {
          throw new Error(`Характеристика «${duplicateExistingCharacteristic.label}» уже добавлена`);
        }
      }

      const product = await tx.catalogReferenceVariant.create({
        data: {
          public_id: makePublicId("CRV"),
          model_id: model.id,
          title: productTitle,
          order_index:
            (await tx.catalogReferenceVariant.count({ where: { model_id: model.id } })) + 1,
        },
        select: { id: true, public_id: true, title: true },
      });

      if (characteristics.length > 0) {
        await tx.catalogReferenceCharacteristic.createMany({
          data: characteristics.map((characteristic, index) => ({
            variant_id: product.id,
            key: makeCharacteristicKey(characteristic.label),
            label: characteristic.label,
            value: characteristic.value,
            raw_value: characteristic.value,
            source_group_index: index,
            source: "admin",
            order_index: index + 1,
          })),
        });
      }

      const updated = await tx.catalogSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: "APPROVED",
          admin_note: adminNote || null,
          reviewed_by_id: params.actorUserId,
          reviewed_at: new Date(),
          merged_target_public_id: item.public_id,
        },
        select: { status: true },
      });

      return { updated, item, brand, model, product };
    });
  }

  listSuggestions() {
    return this.prisma.catalogSuggestion.findMany({
      include: {
        category: { select: { public_id: true, name: true, type: true } },
        subcategory: { select: { public_id: true, name: true } },
        item: { select: { public_id: true, name: true } },
        proposed_by: {
          select: { public_id: true, name: true, email: true },
        },
      },
      orderBy: [{ status: "asc" }, { created_at: "desc" }, { id: "desc" }],
    });
  }

  findSuggestionByPublicId(publicId: string) {
    return this.prisma.catalogSuggestion.findUnique({
      where: { public_id: publicId },
      include: {
        subcategory: true,
      },
    });
  }

  async updateSuggestion(params: {
    existing: any;
    nextStatus: CatalogSuggestionStatus;
    adminNote: string;
    mergedTargetPublicId: string;
    approval: Record<string, unknown>;
    actorUserId: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      let statusToSave = params.nextStatus;
      let mergedTargetToSave = params.mergedTargetPublicId || null;
      let createdCatalogEntity: { public_id: string; name: string } | null = null;

      if (params.nextStatus === "APPROVED") {
        const targetType = parseCatalogListingType(params.approval.type) ?? params.existing.type;
        const categoryPublicId = readTrimmedString(params.approval.categoryId);
        const categoryName = readTrimmedString(params.approval.categoryName);
        const subcategoryPublicId = readTrimmedString(params.approval.subcategoryId);
        const subcategoryName = readTrimmedString(params.approval.subcategoryName);
        const itemName =
          readTrimmedString(params.approval.itemName) || params.existing.raw_value.trim();

        let categoryId = params.existing.category_id ?? null;
        let subcategoryId = params.existing.subcategory_id ?? null;

        if (categoryPublicId) {
          const selectedCategory = await tx.catalogCategory.findFirst({
            where: { public_id: categoryPublicId, type: targetType },
            select: { id: true, public_id: true, name: true },
          });
          if (!selectedCategory) throw new Error("Категория не найдена");
          categoryId = selectedCategory.id;
          if (params.existing.entity_type === "CATEGORY") {
            createdCatalogEntity = selectedCategory;
            mergedTargetToSave = selectedCategory.public_id;
          }
        } else if (categoryName) {
          const duplicateCategory = await tx.catalogCategory.findFirst({
            where: { type: targetType, name: { equals: categoryName, mode: "insensitive" } },
            select: { id: true, public_id: true, name: true },
          });
          if (duplicateCategory) {
            categoryId = duplicateCategory.id;
            createdCatalogEntity = duplicateCategory;
            mergedTargetToSave = duplicateCategory.public_id;
            if (params.existing.entity_type === "CATEGORY") statusToSave = "MERGED";
          } else {
            const createdCategory = await tx.catalogCategory.create({
              data: {
                public_id: makePublicId("CAT"),
                type: targetType,
                name: categoryName,
                icon_key: normalizeCatalogIconKey(params.approval.iconKey),
                order_index:
                  (await tx.catalogCategory.count({ where: { type: targetType } })) + 1,
              },
              select: { id: true, public_id: true, name: true },
            });
            categoryId = createdCategory.id;
            createdCatalogEntity = createdCategory;
            mergedTargetToSave = createdCategory.public_id;
          }
        }

        if (params.existing.entity_type === "SUBCATEGORY" || params.existing.entity_type === "ITEM") {
          if (!categoryId) throw new Error("Выберите категорию для подкатегории");

          if (subcategoryPublicId) {
            const selectedSubcategory = await tx.catalogSubcategory.findFirst({
              where: { public_id: subcategoryPublicId, category_id: categoryId },
              select: { id: true, public_id: true, name: true },
            });
            if (!selectedSubcategory) throw new Error("Подкатегория не найдена");
            subcategoryId = selectedSubcategory.id;
            if (params.existing.entity_type === "SUBCATEGORY") {
              createdCatalogEntity = selectedSubcategory;
              mergedTargetToSave = selectedSubcategory.public_id;
            }
          } else {
            const resolvedSubcategoryName =
              subcategoryName ||
              params.existing.subcategory?.name ||
              params.existing.raw_value.trim();
            const validSubcategoryName = normalizeCatalogName(
              resolvedSubcategoryName,
              "Подкатегория",
            );
            const duplicateSubcategory = await tx.catalogSubcategory.findFirst({
              where: {
                category_id: categoryId,
                name: { equals: validSubcategoryName, mode: "insensitive" },
              },
              select: { id: true, public_id: true, name: true },
            });
            if (duplicateSubcategory) {
              subcategoryId = duplicateSubcategory.id;
              createdCatalogEntity = duplicateSubcategory;
              mergedTargetToSave = duplicateSubcategory.public_id;
              if (params.existing.entity_type === "SUBCATEGORY") statusToSave = "MERGED";
            } else {
              const createdSubcategory = await tx.catalogSubcategory.create({
                data: {
                  public_id: makePublicId("SUB"),
                  category_id: categoryId,
                  name: validSubcategoryName,
                  order_index:
                    (await tx.catalogSubcategory.count({ where: { category_id: categoryId } })) + 1,
                },
                select: { id: true, public_id: true, name: true },
              });
              subcategoryId = createdSubcategory.id;
              createdCatalogEntity = createdSubcategory;
              mergedTargetToSave = createdSubcategory.public_id;
            }
          }
        }

        if (params.existing.entity_type === "ITEM") {
          if (!subcategoryId) throw new Error("Выберите подкатегорию для вида товара");
          const validItemName = normalizeCatalogName(itemName, "Вид товара");
          const duplicate = await tx.catalogItem.findFirst({
            where: {
              subcategory_id: subcategoryId,
              name: { equals: validItemName, mode: "insensitive" },
            },
            select: { public_id: true, name: true },
          });

          if (duplicate) {
            statusToSave = "MERGED";
            mergedTargetToSave = duplicate.public_id;
            createdCatalogEntity = duplicate;
          } else {
            const item = await tx.catalogItem.create({
              data: {
                public_id: makePublicId("ITM"),
                subcategory_id: subcategoryId,
                name: validItemName,
                order_index:
                  (await tx.catalogItem.count({ where: { subcategory_id: subcategoryId } })) + 1,
              },
              select: { id: true, public_id: true, name: true },
            });

            await tx.catalogAttributeDefinition.createMany({
              data: buildDefaultItemAttributeDefinitions({
                itemId: item.id,
                itemPublicId: item.public_id,
                type: targetType,
              }),
            });

            createdCatalogEntity = item;
            mergedTargetToSave = item.public_id;
          }
        }
      }

      const updated = await tx.catalogSuggestion.update({
        where: { id: params.existing.id },
        data: {
          status: statusToSave,
          admin_note: params.adminNote || null,
          reviewed_by_id: params.actorUserId,
          reviewed_at: new Date(),
          merged_target_public_id: mergedTargetToSave,
        },
      });

      return { updated, createdCatalogEntity };
    });
  }
}
