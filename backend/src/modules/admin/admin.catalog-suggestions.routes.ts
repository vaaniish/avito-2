import { CatalogSuggestionStatus } from "@prisma/client";
import { type Request, type Response, type Router } from "express";
import { prisma } from "../../lib/prisma";
import {
  buildDefaultItemAttributeDefinitions,
  duplicateCatalogReferenceCharacteristicLabel,
  makeCharacteristicKey,
  makePublicId,
  nextOrderIndex,
  normalizeCatalogIconKey,
  normalizeCatalogName,
  normalizeCatalogReferenceText,
  parseCatalogListingType,
  readTrimmedString,
} from "./admin.catalog.shared";
import { requireAdmin } from "./admin.shared";

type CatalogSuggestionClientStatus =
  | "pending"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "merged";

function parseCatalogSuggestionStatus(
  status: unknown,
): CatalogSuggestionStatus | null {
  if (status === "pending") return "PENDING";
  if (status === "auto_approved") return "AUTO_APPROVED";
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "merged") return "MERGED";
  return null;
}

function toClientCatalogSuggestionStatus(
  status: CatalogSuggestionStatus,
): CatalogSuggestionClientStatus {
  return status.toLowerCase() as CatalogSuggestionClientStatus;
}

export function registerAdminCatalogSuggestionRoutes(adminRouter: Router) {
  adminRouter.post(
    "/catalog-suggestions/:publicId/approve-reference",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const body = (req.body ?? {}) as {
          approval?: {
            type?: unknown;
            categoryId?: unknown;
            categoryName?: unknown;
            subcategoryId?: unknown;
            subcategoryName?: unknown;
            itemName?: unknown;
          };
          reference?: {
            brandName?: unknown;
            modelName?: unknown;
            productTitle?: unknown;
            characteristics?: unknown;
          };
          adminNote?: unknown;
        };

        const approval = body.approval && typeof body.approval === "object" ? body.approval : {};
        const reference =
          body.reference && typeof body.reference === "object" ? body.reference : {};
        const adminNote = readTrimmedString(body.adminNote);
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
          res.status(400).json({
            error: `Характеристика «${duplicateCharacteristicLabel}» уже добавлена`,
          });
          return;
        }

        if (!categoryPublicId && categoryName.length < 2) {
          res.status(400).json({ error: "Выберите категорию или укажите новую" });
          return;
        }
        if (!subcategoryPublicId && subcategoryName.length < 2) {
          res.status(400).json({ error: "Выберите подкатегорию или укажите новую" });
          return;
        }

        const result = await prisma.$transaction(async (tx) => {
          const suggestion = await tx.catalogSuggestion.findUnique({
            where: { public_id: String(req.params.publicId) },
            select: { id: true, public_id: true },
          });
          if (!suggestion) throw new Error("Catalog suggestion not found");

          let category:
            | { id: number; public_id: string; name: string }
            | null = null;
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
                  order_index: await nextOrderIndex(tx, "category", { type: targetType }),
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
                  order_index: await nextOrderIndex(tx, "subcategory", {
                    categoryId: category.id,
                  }),
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
                order_index: await nextOrderIndex(tx, "item", {
                  subcategoryId: subcategory.id,
                }),
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
              throw new Error(
                `Характеристика «${duplicateExistingCharacteristic.label}» уже добавлена`,
              );
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
              reviewed_by_id: access.user.id,
              reviewed_at: new Date(),
              merged_target_public_id: item.public_id,
            },
            select: { status: true },
          });

          return { updated, item, brand, model, product };
        });

        res.status(201).json({
          success: true,
          suggestionStatus: toClientCatalogSuggestionStatus(result.updated.status),
          item: { id: result.item.public_id, name: result.item.name },
          brand: { id: result.brand.public_id, name: result.brand.name },
          model: { id: result.model.public_id, name: result.model.name },
          product: { id: result.product.public_id, title: result.product.title },
        });
      } catch (error) {
        console.error("Error approving catalog suggestion reference:", error);
        res.status(400).json({
          error:
            error instanceof Error
              ? error.message
              : "Не удалось одобрить заявку и добавить справочник",
        });
      }
    },
  );

  adminRouter.get("/catalog-suggestions", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const suggestions = await prisma.catalogSuggestion.findMany({
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

      res.json(
        suggestions.map((suggestion) => ({
          id: suggestion.public_id,
          entityType: suggestion.entity_type.toLowerCase(),
          status: toClientCatalogSuggestionStatus(suggestion.status),
          type: suggestion.type.toLowerCase(),
          rawValue: suggestion.raw_value,
          normalizedValue: suggestion.normalized_value,
          reason: suggestion.reason,
          payload: suggestion.payload,
          adminNote: suggestion.admin_note,
          usageCount: suggestion.usage_count,
          mergedTargetPublicId: suggestion.merged_target_public_id,
          createdAt: suggestion.created_at,
          reviewedAt: suggestion.reviewed_at,
          category: suggestion.category
            ? {
                id: suggestion.category.public_id,
                name: suggestion.category.name,
                type: suggestion.category.type.toLowerCase(),
              }
            : null,
          subcategory: suggestion.subcategory
            ? {
                id: suggestion.subcategory.public_id,
                name: suggestion.subcategory.name,
              }
            : null,
          item: suggestion.item
            ? { id: suggestion.item.public_id, name: suggestion.item.name }
            : null,
          proposedBy: suggestion.proposed_by
            ? {
                id: suggestion.proposed_by.public_id,
                name: suggestion.proposed_by.name,
                email: suggestion.proposed_by.email,
              }
            : null,
        })),
      );
    } catch (error) {
      console.error("Error fetching catalog suggestions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch(
    "/catalog-suggestions/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const { publicId } = req.params;
        const body = (req.body ?? {}) as {
          status?: unknown;
          adminNote?: unknown;
          mergedTargetPublicId?: unknown;
          approval?: {
            type?: unknown;
            categoryId?: unknown;
            categoryName?: unknown;
            subcategoryId?: unknown;
            subcategoryName?: unknown;
            itemName?: unknown;
            iconKey?: unknown;
          };
        };
        const nextStatus = parseCatalogSuggestionStatus(body.status);
        if (!nextStatus) {
          res.status(400).json({ error: "Invalid catalog suggestion status" });
          return;
        }

        const adminNote =
          typeof body.adminNote === "string" ? body.adminNote.trim() : "";
        const mergedTargetPublicId =
          typeof body.mergedTargetPublicId === "string"
            ? body.mergedTargetPublicId.trim()
            : "";
        const approval = body.approval && typeof body.approval === "object" ? body.approval : {};

        if (nextStatus === "REJECTED" && adminNote.length < 3) {
          res.status(400).json({ error: "Укажите причину отклонения" });
          return;
        }

        const existing = await prisma.catalogSuggestion.findUnique({
          where: { public_id: String(publicId) },
          include: {
            subcategory: true,
          },
        });

        if (!existing) {
          res.status(404).json({ error: "Catalog suggestion not found" });
          return;
        }

        const result = await prisma.$transaction(async (tx) => {
          let statusToSave = nextStatus;
          let mergedTargetToSave = mergedTargetPublicId || null;
          let createdCatalogEntity: { public_id: string; name: string } | null = null;

          if (nextStatus === "APPROVED") {
            const targetType = parseCatalogListingType(approval.type) ?? existing.type;
            const categoryPublicId = readTrimmedString(approval.categoryId);
            const categoryName = readTrimmedString(approval.categoryName);
            const subcategoryPublicId = readTrimmedString(approval.subcategoryId);
            const subcategoryName = readTrimmedString(approval.subcategoryName);
            const itemName = readTrimmedString(approval.itemName) || existing.raw_value.trim();

            let categoryId = existing.category_id ?? null;
            let subcategoryId = existing.subcategory_id ?? null;

            if (categoryPublicId) {
              const selectedCategory = await tx.catalogCategory.findFirst({
                where: { public_id: categoryPublicId, type: targetType },
                select: { id: true, public_id: true, name: true },
              });
              if (!selectedCategory) throw new Error("Категория не найдена");
              categoryId = selectedCategory.id;
              if (existing.entity_type === "CATEGORY") {
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
                if (existing.entity_type === "CATEGORY") statusToSave = "MERGED";
              } else {
                const createdCategory = await tx.catalogCategory.create({
                  data: {
                    public_id: makePublicId("CAT"),
                    type: targetType,
                    name: categoryName,
                    icon_key: normalizeCatalogIconKey(approval.iconKey),
                    order_index: await nextOrderIndex(tx, "category", { type: targetType }),
                  },
                  select: { id: true, public_id: true, name: true },
                });
                categoryId = createdCategory.id;
                createdCatalogEntity = createdCategory;
                mergedTargetToSave = createdCategory.public_id;
              }
            }

            if (existing.entity_type === "SUBCATEGORY" || existing.entity_type === "ITEM") {
              if (!categoryId) throw new Error("Выберите категорию для подкатегории");

              if (subcategoryPublicId) {
                const selectedSubcategory = await tx.catalogSubcategory.findFirst({
                  where: { public_id: subcategoryPublicId, category_id: categoryId },
                  select: { id: true, public_id: true, name: true },
                });
                if (!selectedSubcategory) throw new Error("Подкатегория не найдена");
                subcategoryId = selectedSubcategory.id;
                if (existing.entity_type === "SUBCATEGORY") {
                  createdCatalogEntity = selectedSubcategory;
                  mergedTargetToSave = selectedSubcategory.public_id;
                }
              } else {
                const resolvedSubcategoryName =
                  subcategoryName || existing.subcategory?.name || existing.raw_value.trim();
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
                  if (existing.entity_type === "SUBCATEGORY") statusToSave = "MERGED";
                } else {
                  const createdSubcategory = await tx.catalogSubcategory.create({
                    data: {
                      public_id: makePublicId("SUB"),
                      category_id: categoryId,
                      name: validSubcategoryName,
                      order_index: await nextOrderIndex(tx, "subcategory", { categoryId }),
                    },
                    select: { id: true, public_id: true, name: true },
                  });
                  subcategoryId = createdSubcategory.id;
                  createdCatalogEntity = createdSubcategory;
                  mergedTargetToSave = createdSubcategory.public_id;
                }
              }
            }

            if (existing.entity_type === "ITEM") {
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
                    order_index: await nextOrderIndex(tx, "item", { subcategoryId }),
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
            where: { id: existing.id },
            data: {
              status: statusToSave,
              admin_note: adminNote || null,
              reviewed_by_id: access.user.id,
              reviewed_at: new Date(),
              merged_target_public_id: mergedTargetToSave,
            },
          });

          return { updated, createdCatalogEntity };
        });

        res.json({
          success: true,
          status: toClientCatalogSuggestionStatus(result.updated.status),
          createdItem: result.createdCatalogEntity,
        });
      } catch (error) {
        console.error("Error updating catalog suggestion:", error);
        res.status(500).json({
          error: error instanceof Error ? error.message : "Internal server error",
        });
      }
    },
  );
}
