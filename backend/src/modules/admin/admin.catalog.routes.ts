import { Prisma } from "@prisma/client";
import { type Request, type Response, type Router } from "express";
import { prisma } from "../../lib/prisma";
import {
  buildDefaultItemAttributeDefinitions,
  catalogTypeToClient,
  clientCatalogCategory,
  duplicateCatalogReferenceCharacteristicLabel,
  loadAdminCatalog,
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

export function registerAdminCatalogRoutes(adminRouter: Router) {
  adminRouter.get("/catalog", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const type = parseCatalogListingType(req.query.type) ?? "PRODUCT";
      res.json(await loadAdminCatalog(type));
    } catch (error) {
      console.error("Error fetching admin catalog:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.get("/catalog/search", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const type = parseCatalogListingType(req.query.type) ?? "PRODUCT";
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const scope =
        req.query.scope === "categories" ||
        req.query.scope === "subcategories" ||
        req.query.scope === "items"
          ? req.query.scope
          : "all";
      const categoryPublicId =
        typeof req.query.categoryId === "string"
          ? req.query.categoryId.trim()
          : "";
      const subcategoryPublicId =
        typeof req.query.subcategoryId === "string"
          ? req.query.subcategoryId.trim()
          : "";
      const parsedLimit = Number(req.query.limit ?? 50);
      const take = Number.isInteger(parsedLimit)
        ? Math.min(Math.max(parsedLimit, 1), 80)
        : 50;
      const nameFilter = q
        ? { contains: q, mode: "insensitive" as const }
        : undefined;

      const nodes: Array<{
        kind: "category" | "subcategory" | "item";
        id: string;
        name: string;
        type: "products";
        path: string;
        orderIndex: number;
        categoryId?: string;
        categoryName?: string;
        iconKey?: string;
        subcategoryId?: string;
        subcategoryName?: string;
        childCount?: number;
        listingCount?: number;
      }> = [];

      if (scope === "all" || scope === "categories") {
        const categories = await prisma.catalogCategory.findMany({
          where: {
            type,
            ...(nameFilter ? { name: nameFilter } : {}),
          },
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
          take: scope === "all" ? Math.min(take, 30) : take,
          include: {
            _count: { select: { subcategories: true } },
          },
        });

        nodes.push(
          ...categories.map((category) => ({
            kind: "category" as const,
            id: category.public_id,
            name: category.name,
            type: catalogTypeToClient(category.type),
            path: category.name,
            iconKey: category.icon_key,
            orderIndex: category.order_index,
            childCount: category._count.subcategories,
          })),
        );
      }

      if (scope === "all" || scope === "subcategories") {
        const category = categoryPublicId
          ? await prisma.catalogCategory.findFirst({
              where: { public_id: categoryPublicId, type },
              select: { id: true },
            })
          : null;
        const subcategories = await prisma.catalogSubcategory.findMany({
          where: {
            ...(category ? { category_id: category.id } : {}),
            category: { type },
            ...(nameFilter ? { name: nameFilter } : {}),
          },
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
          take: scope === "all" ? Math.min(take, 30) : take,
          include: {
            category: { select: { public_id: true, name: true, type: true } },
            _count: { select: { items: true } },
          },
        });

        nodes.push(
          ...subcategories.map((subcategory) => ({
            kind: "subcategory" as const,
            id: subcategory.public_id,
            name: subcategory.name,
            type: catalogTypeToClient(subcategory.category.type),
            path: `${subcategory.category.name} / ${subcategory.name}`,
            orderIndex: subcategory.order_index,
            categoryId: subcategory.category.public_id,
            categoryName: subcategory.category.name,
            childCount: subcategory._count.items,
          })),
        );
      }

      if (scope === "all" || scope === "items") {
        const subcategory = subcategoryPublicId
          ? await prisma.catalogSubcategory.findFirst({
              where: {
                public_id: subcategoryPublicId,
                category: { type },
              },
              select: { id: true },
            })
          : null;
        const items = await prisma.catalogItem.findMany({
          where: {
            ...(subcategory ? { subcategory_id: subcategory.id } : {}),
            subcategory: { category: { type } },
            ...(nameFilter ? { name: nameFilter } : {}),
          },
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
          take: scope === "all" ? Math.min(take, 30) : take,
          include: {
            subcategory: {
              select: {
                public_id: true,
                name: true,
                category: { select: { public_id: true, name: true, type: true } },
              },
            },
            _count: { select: { listings: true } },
          },
        });

        nodes.push(
          ...items.map((item) => ({
            kind: "item" as const,
            id: item.public_id,
            name: item.name,
            type: catalogTypeToClient(item.subcategory.category.type),
            path: `${item.subcategory.category.name} / ${item.subcategory.name} / ${item.name}`,
            orderIndex: item.order_index,
            categoryId: item.subcategory.category.public_id,
            categoryName: item.subcategory.category.name,
            subcategoryId: item.subcategory.public_id,
            subcategoryName: item.subcategory.name,
            listingCount: item._count.listings,
          })),
        );
      }

      res.json({
        items: nodes.slice(0, take),
        limit: take,
        query: q,
        scope,
      });
    } catch (error) {
      console.error("Error searching admin catalog:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch("/catalog/reorder", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const kind =
        body.kind === "category" ||
        body.kind === "subcategory" ||
        body.kind === "item"
          ? body.kind
          : null;
      const orderedIds = Array.isArray(body.orderedIds)
        ? body.orderedIds
            .map((value) => readTrimmedString(value))
            .filter(
              (value, index, list) =>
                value.length > 0 && list.indexOf(value) === index,
            )
        : [];

      if (!kind || orderedIds.length === 0) {
        res.status(400).json({ error: "Некорректные параметры сортировки" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        if (kind === "category") {
          const categories = await tx.catalogCategory.findMany({
            where: { public_id: { in: orderedIds }, type: "PRODUCT" },
            select: { id: true, public_id: true },
          });
          if (categories.length !== orderedIds.length) {
            throw new Error("Категории не найдены");
          }
          await Promise.all(
            orderedIds.map((publicId, index) =>
              tx.catalogCategory.update({
                where: { public_id: publicId },
                data: { order_index: index + 1 },
              }),
            ),
          );
          return;
        }

        if (kind === "subcategory") {
          const subcategories = await tx.catalogSubcategory.findMany({
            where: {
              public_id: { in: orderedIds },
              category: { type: "PRODUCT" },
            },
            select: { id: true, public_id: true, category_id: true },
          });
          const parentIds = new Set(
            subcategories.map((subcategory) => subcategory.category_id),
          );
          if (subcategories.length !== orderedIds.length || parentIds.size !== 1) {
            throw new Error("Подкатегории должны быть внутри одной категории");
          }
          await Promise.all(
            orderedIds.map((publicId, index) =>
              tx.catalogSubcategory.update({
                where: { public_id: publicId },
                data: { order_index: index + 1 },
              }),
            ),
          );
          return;
        }

        const items = await tx.catalogItem.findMany({
          where: {
            public_id: { in: orderedIds },
            subcategory: { category: { type: "PRODUCT" } },
          },
          select: { id: true, public_id: true, subcategory_id: true },
        });
        const parentIds = new Set(items.map((item) => item.subcategory_id));
        if (items.length !== orderedIds.length || parentIds.size !== 1) {
          throw new Error("Виды товаров должны быть внутри одной подкатегории");
        }
        await Promise.all(
          orderedIds.map((publicId, index) =>
            tx.catalogItem.update({
              where: { public_id: publicId },
              data: { order_index: index + 1 },
            }),
          ),
        );
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering catalog:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Не удалось изменить порядок",
      });
    }
  });

  adminRouter.post("/catalog/categories", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const type = parseCatalogListingType(body.type);
      if (!type) {
        res.status(400).json({ error: "Некорректный тип каталога" });
        return;
      }

      const name = normalizeCatalogName(body.name, "Категория");
      const iconKey = normalizeCatalogIconKey(body.iconKey);

      const category = await prisma.$transaction(async (tx) =>
        tx.catalogCategory.create({
          data: {
            public_id: makePublicId("CAT"),
            type,
            name,
            icon_key: iconKey,
            order_index: await nextOrderIndex(tx, "category", { type }),
          },
          include: { subcategories: { include: { items: true } } },
        }),
      );

      res.status(201).json(clientCatalogCategory(category));
    } catch (error) {
      console.error("Error creating catalog category:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Не удалось создать категорию",
      });
    }
  });

  adminRouter.patch("/catalog/categories/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const data: Prisma.CatalogCategoryUpdateInput = {};
      if (body.name !== undefined) {
        data.name = normalizeCatalogName(body.name, "Категория");
      }
      if (body.iconKey !== undefined) {
        data.icon_key = normalizeCatalogIconKey(body.iconKey);
      }
      if (body.orderIndex !== undefined) {
        const orderIndex = Number(body.orderIndex);
        if (Number.isInteger(orderIndex) && orderIndex >= 0) {
          data.order_index = orderIndex;
        }
      }

      const updated = await prisma.catalogCategory.update({
        where: { public_id: String(req.params.publicId) },
        data,
        include: {
          subcategories: {
            include: {
              _count: { select: { items: true } },
              items: { include: { _count: { select: { listings: true } } } },
            },
          },
        },
      });
      res.json(clientCatalogCategory(updated));
    } catch (error) {
      console.error("Error updating catalog category:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Не удалось обновить категорию",
      });
    }
  });

  adminRouter.delete("/catalog/categories/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      await prisma.catalogCategory.delete({
        where: { public_id: String(req.params.publicId) },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting catalog category:", error);
      res.status(400).json({ error: "Не удалось удалить категорию" });
    }
  });

  adminRouter.post("/catalog/subcategories", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const categoryPublicId = readTrimmedString(body.categoryId);
      const name = normalizeCatalogName(body.name, "Подкатегория");
      if (!categoryPublicId) {
        res.status(400).json({ error: "Выберите категорию" });
        return;
      }

      const subcategory = await prisma.$transaction(async (tx) => {
        const category = await tx.catalogCategory.findUnique({
          where: { public_id: categoryPublicId },
          select: { id: true },
        });
        if (!category) throw new Error("Категория не найдена");

        return tx.catalogSubcategory.create({
          data: {
            public_id: makePublicId("SUB"),
            category_id: category.id,
            name,
            order_index: await nextOrderIndex(tx, "subcategory", {
              categoryId: category.id,
            }),
          },
          include: { items: true },
        });
      });

      res.status(201).json({
        id: subcategory.public_id,
        name: subcategory.name,
        orderIndex: subcategory.order_index,
        itemCount: subcategory.items.length,
        items: [],
      });
    } catch (error) {
      console.error("Error creating catalog subcategory:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Не удалось создать подкатегорию",
      });
    }
  });

  adminRouter.patch("/catalog/subcategories/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const data: Prisma.CatalogSubcategoryUpdateInput = {};
      if (body.name !== undefined) {
        data.name = normalizeCatalogName(body.name, "Подкатегория");
      }
      if (body.categoryId !== undefined) {
        const categoryPublicId = readTrimmedString(body.categoryId);
        const category = await prisma.catalogCategory.findUnique({
          where: { public_id: categoryPublicId },
          select: { id: true },
        });
        if (!category) {
          res.status(400).json({ error: "Категория не найдена" });
          return;
        }
        data.category = { connect: { id: category.id } };
      }

      const updated = await prisma.catalogSubcategory.update({
        where: { public_id: String(req.params.publicId) },
        data,
        include: { items: { include: { _count: { select: { listings: true } } } } },
      });

      res.json({
        id: updated.public_id,
        name: updated.name,
        orderIndex: updated.order_index,
        itemCount: updated.items.length,
        items: updated.items.map((item) => ({
          id: item.public_id,
          name: item.name,
          orderIndex: item.order_index,
          listingCount: item._count.listings,
        })),
      });
    } catch (error) {
      console.error("Error updating catalog subcategory:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Не удалось обновить подкатегорию",
      });
    }
  });

  adminRouter.delete("/catalog/subcategories/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      await prisma.catalogSubcategory.delete({
        where: { public_id: String(req.params.publicId) },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting catalog subcategory:", error);
      res.status(400).json({ error: "Не удалось удалить подкатегорию" });
    }
  });

  adminRouter.post("/catalog/items", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const subcategoryPublicId = readTrimmedString(body.subcategoryId);
      const name = normalizeCatalogName(body.name, "Вид товара");
      if (!subcategoryPublicId) {
        res.status(400).json({ error: "Выберите подкатегорию" });
        return;
      }

      const item = await prisma.$transaction(async (tx) => {
        const subcategory = await tx.catalogSubcategory.findUnique({
          where: { public_id: subcategoryPublicId },
          include: { category: { select: { type: true } } },
        });
        if (!subcategory) throw new Error("Подкатегория не найдена");

        const created = await tx.catalogItem.create({
          data: {
            public_id: makePublicId("ITM"),
            subcategory_id: subcategory.id,
            name,
            order_index: await nextOrderIndex(tx, "item", {
              subcategoryId: subcategory.id,
            }),
          },
          select: { id: true, public_id: true, name: true, order_index: true },
        });

        await tx.catalogAttributeDefinition.createMany({
          data: buildDefaultItemAttributeDefinitions({
            itemId: created.id,
            itemPublicId: created.public_id,
            type: subcategory.category.type,
          }),
        });

        return created;
      });

      res.status(201).json({
        id: item.public_id,
        name: item.name,
        orderIndex: item.order_index,
        listingCount: 0,
      });
    } catch (error) {
      console.error("Error creating catalog item:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Не удалось создать вид товара",
      });
    }
  });

  adminRouter.patch("/catalog/items/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as Record<string, unknown>;
      const data: Prisma.CatalogItemUpdateInput = {};
      if (body.name !== undefined) {
        data.name = normalizeCatalogName(body.name, "Вид товара");
      }
      if (body.subcategoryId !== undefined) {
        const subcategoryPublicId = readTrimmedString(body.subcategoryId);
        const subcategory = await prisma.catalogSubcategory.findUnique({
          where: { public_id: subcategoryPublicId },
          select: { id: true },
        });
        if (!subcategory) {
          res.status(400).json({ error: "Подкатегория не найдена" });
          return;
        }
        data.subcategory = { connect: { id: subcategory.id } };
      }

      const updated = await prisma.catalogItem.update({
        where: { public_id: String(req.params.publicId) },
        data,
        include: { _count: { select: { listings: true } } },
      });

      res.json({
        id: updated.public_id,
        name: updated.name,
        orderIndex: updated.order_index,
        listingCount: updated._count.listings,
      });
    } catch (error) {
      console.error("Error updating catalog item:", error);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Не удалось обновить вид товара",
      });
    }
  });

  adminRouter.delete("/catalog/items/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      await prisma.catalogItem.delete({
        where: { public_id: String(req.params.publicId) },
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting catalog item:", error);
      res.status(400).json({ error: "Не удалось удалить вид товара" });
    }
  });

  adminRouter.get("/catalog/items/:publicId/reference", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const item = await prisma.catalogItem.findUnique({
        where: { public_id: String(req.params.publicId) },
        select: { public_id: true, name: true },
      });
      if (!item) {
        res.status(404).json({ error: "Вид товара не найден" });
        return;
      }

      const brands = await prisma.catalogReferenceBrand.findMany({
        where: { item: { public_id: item.public_id } },
        orderBy: [{ order_index: "asc" }, { name: "asc" }, { id: "asc" }],
        include: {
          models: {
            orderBy: [{ order_index: "asc" }, { name: "asc" }, { id: "asc" }],
            include: {
              variants: {
                orderBy: [{ order_index: "asc" }, { title: "asc" }, { id: "asc" }],
                include: {
                  characteristics: {
                    orderBy: [{ order_index: "asc" }, { id: "asc" }],
                  },
                },
              },
            },
          },
        },
      });

      res.json({
        item: { id: item.public_id, name: item.name },
        brands: brands.map((brand) => ({
          id: brand.public_id,
          name: brand.name,
          models: brand.models.map((model) => ({
            id: model.public_id,
            name: model.name,
            products: model.variants.map((variant) => ({
              id: variant.public_id,
              title: variant.title,
              characteristics: variant.characteristics.map((characteristic) => ({
                id: characteristic.id,
                label: characteristic.label,
                value: characteristic.value,
              })),
            })),
          })),
        })),
      });
    } catch (error) {
      console.error("Error fetching catalog item reference:", error);
      res.status(500).json({ error: "Не удалось загрузить справочник товара" });
    }
  });

  adminRouter.post(
    "/catalog/items/:publicId/reference/brands",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = normalizeCatalogReferenceText(body.name, "Бренд");

        const brand = await prisma.$transaction(async (tx) => {
          const item = await tx.catalogItem.findUnique({
            where: { public_id: String(req.params.publicId) },
            select: { id: true },
          });
          if (!item) throw new Error("Вид товара не найден");

          return tx.catalogReferenceBrand.create({
            data: {
              public_id: makePublicId("CRB"),
              item_id: item.id,
              name,
              order_index:
                (await tx.catalogReferenceBrand.count({
                  where: { item_id: item.id },
                })) + 1,
            },
          });
        });

        res.status(201).json({ id: brand.public_id, name: brand.name, models: [] });
      } catch (error) {
        console.error("Error creating catalog reference brand:", error);
        res.status(400).json({
          error: error instanceof Error ? error.message : "Не удалось создать бренд",
        });
      }
    },
  );

  adminRouter.patch(
    "/catalog/reference/brands/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = normalizeCatalogReferenceText(body.name, "Бренд");
        const brand = await prisma.catalogReferenceBrand.update({
          where: { public_id: String(req.params.publicId) },
          data: { name },
        });
        res.json({ id: brand.public_id, name: brand.name });
      } catch (error) {
        console.error("Error updating catalog reference brand:", error);
        res.status(400).json({
          error: error instanceof Error ? error.message : "Не удалось обновить бренд",
        });
      }
    },
  );

  adminRouter.delete(
    "/catalog/reference/brands/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        await prisma.catalogReferenceBrand.delete({
          where: { public_id: String(req.params.publicId) },
        });
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting catalog reference brand:", error);
        res.status(400).json({ error: "Не удалось удалить бренд" });
      }
    },
  );

  adminRouter.post(
    "/catalog/reference/brands/:publicId/models",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = normalizeCatalogReferenceText(body.name, "Модель");
        const model = await prisma.$transaction(async (tx) => {
          const brand = await tx.catalogReferenceBrand.findUnique({
            where: { public_id: String(req.params.publicId) },
            select: { id: true },
          });
          if (!brand) throw new Error("Бренд не найден");

          return tx.catalogReferenceModel.create({
            data: {
              public_id: makePublicId("CRM"),
              brand_id: brand.id,
              name,
              order_index:
                (await tx.catalogReferenceModel.count({
                  where: { brand_id: brand.id },
                })) + 1,
            },
          });
        });

        res.status(201).json({ id: model.public_id, name: model.name, products: [] });
      } catch (error) {
        console.error("Error creating catalog reference model:", error);
        res.status(400).json({
          error: error instanceof Error ? error.message : "Не удалось создать модель",
        });
      }
    },
  );

  adminRouter.patch(
    "/catalog/reference/models/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = normalizeCatalogReferenceText(body.name, "Модель");
        const model = await prisma.catalogReferenceModel.update({
          where: { public_id: String(req.params.publicId) },
          data: { name },
        });
        res.json({ id: model.public_id, name: model.name });
      } catch (error) {
        console.error("Error updating catalog reference model:", error);
        res.status(400).json({
          error: error instanceof Error ? error.message : "Не удалось обновить модель",
        });
      }
    },
  );

  adminRouter.delete(
    "/catalog/reference/models/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        await prisma.catalogReferenceModel.delete({
          where: { public_id: String(req.params.publicId) },
        });
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting catalog reference model:", error);
        res.status(400).json({ error: "Не удалось удалить модель" });
      }
    },
  );

  adminRouter.post(
    "/catalog/reference/models/:publicId/products",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const body = (req.body ?? {}) as Record<string, unknown>;
        const rawCharacteristics = Array.isArray(body.characteristics)
          ? body.characteristics
          : [];
        const characteristics = rawCharacteristics
          .map((entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
              return null;
            }
            const label = readTrimmedString((entry as Record<string, unknown>).label);
            const value = readTrimmedString((entry as Record<string, unknown>).value);
            if (!label || !value) return null;
            return { label, value };
          })
          .filter(
            (entry): entry is { label: string; value: string } => Boolean(entry),
          );
        const duplicateCharacteristicLabel =
          duplicateCatalogReferenceCharacteristicLabel(characteristics);
        if (duplicateCharacteristicLabel) {
          res.status(400).json({
            error: `Характеристика «${duplicateCharacteristicLabel}» уже добавлена`,
          });
          return;
        }

        const product = await prisma.$transaction(async (tx) => {
          const model = await tx.catalogReferenceModel.findUnique({
            where: { public_id: String(req.params.publicId) },
            select: { id: true, name: true },
          });
          if (!model) throw new Error("Модель не найдена");

          const variant =
            (await tx.catalogReferenceVariant.findFirst({
              where: { model_id: model.id },
              orderBy: [{ order_index: "asc" }, { id: "asc" }],
            })) ??
            (await tx.catalogReferenceVariant.create({
              data: {
                public_id: makePublicId("CRV"),
                model_id: model.id,
                title: model.name,
                order_index:
                  (await tx.catalogReferenceVariant.count({
                    where: { model_id: model.id },
                  })) + 1,
              },
            }));

          if (characteristics.length > 0) {
            const existingCharacteristics =
              await tx.catalogReferenceCharacteristic.findMany({
                where: { variant: { model_id: model.id } },
                select: { label: true },
              });
            const existingKeys = new Set(
              existingCharacteristics.map((characteristic) =>
                makeCharacteristicKey(characteristic.label),
              ),
            );
            const duplicateExistingCharacteristic = characteristics.find(
              (characteristic) =>
                existingKeys.has(makeCharacteristicKey(characteristic.label)),
            );
            if (duplicateExistingCharacteristic) {
              throw new Error(
                `Характеристика «${duplicateExistingCharacteristic.label}» уже добавлена`,
              );
            }

            const currentCount = await tx.catalogReferenceCharacteristic.count({
              where: { variant_id: variant.id },
            });
            await tx.catalogReferenceCharacteristic.createMany({
              data: characteristics.map((characteristic, index) => ({
                variant_id: variant.id,
                key: makeCharacteristicKey(characteristic.label),
                label: characteristic.label,
                value: characteristic.value,
                raw_value: characteristic.value,
                source_group_index: index,
                source: "admin",
                order_index: currentCount + index + 1,
              })),
            });
          }

          return variant;
        });

        res.status(201).json({
          id: product.public_id,
          title: product.title,
          characteristics,
        });
      } catch (error) {
        console.error("Error creating catalog reference product:", error);
        res.status(400).json({
          error:
            error instanceof Error ? error.message : "Не удалось добавить характеристики",
        });
      }
    },
  );

  adminRouter.patch(
    "/catalog/reference/products/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const body = (req.body ?? {}) as Record<string, unknown>;
        const title = normalizeCatalogReferenceText(body.title, "Конкретный товар");
        const product = await prisma.catalogReferenceVariant.update({
          where: { public_id: String(req.params.publicId) },
          data: { title },
        });
        res.json({ id: product.public_id, title: product.title });
      } catch (error) {
        console.error("Error updating catalog reference product:", error);
        res.status(400).json({
          error:
            error instanceof Error ? error.message : "Не удалось обновить конкретный товар",
        });
      }
    },
  );

  adminRouter.delete(
    "/catalog/reference/characteristics/:id",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) {
          res.status(400).json({ error: "Некорректная характеристика" });
          return;
        }

        await prisma.catalogReferenceCharacteristic.delete({ where: { id } });
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting catalog reference characteristic:", error);
        res.status(400).json({ error: "Не удалось удалить характеристику" });
      }
    },
  );

  adminRouter.delete(
    "/catalog/reference/products/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        await prisma.catalogReferenceVariant.delete({
          where: { public_id: String(req.params.publicId) },
        });
        res.json({ success: true });
      } catch (error) {
        console.error("Error deleting catalog reference product:", error);
        res.status(400).json({ error: "Не удалось удалить конкретный товар" });
      }
    },
  );
}
