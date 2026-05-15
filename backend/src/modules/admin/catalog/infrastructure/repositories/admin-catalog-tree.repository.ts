import { Prisma, type PrismaClient } from "@prisma/client";
import { clientCatalogCategory } from "../../domain/admin-catalog.helpers";

type CatalogTypeValue = "PRODUCT";

async function nextOrderIndex(
  tx: Prisma.TransactionClient,
  scope: "category" | "subcategory" | "item",
  params: { type?: CatalogTypeValue; categoryId?: number; subcategoryId?: number },
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

export class AdminCatalogTreeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async loadCatalog(type: CatalogTypeValue) {
    const categories = await this.prisma.catalogCategory.findMany({
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

  searchCategories(params: {
    type: CatalogTypeValue;
    q: string;
    take: number;
  }) {
    return this.prisma.catalogCategory.findMany({
      where: {
        type: params.type,
        ...(params.q
          ? { name: { contains: params.q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ order_index: "asc" }, { id: "asc" }],
      take: params.take,
      include: {
        _count: { select: { subcategories: true } },
      },
    });
  }

  findCategoryScope(publicId: string, type: CatalogTypeValue) {
    return this.prisma.catalogCategory.findFirst({
      where: { public_id: publicId, type },
      select: { id: true },
    });
  }

  searchSubcategories(params: {
    type: CatalogTypeValue;
    q: string;
    take: number;
    categoryId?: number;
  }) {
    return this.prisma.catalogSubcategory.findMany({
      where: {
        ...(params.categoryId ? { category_id: params.categoryId } : {}),
        category: { type: params.type },
        ...(params.q
          ? { name: { contains: params.q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ order_index: "asc" }, { id: "asc" }],
      take: params.take,
      include: {
        category: { select: { public_id: true, name: true, type: true } },
        _count: { select: { items: true } },
      },
    });
  }

  findSubcategoryScope(publicId: string, type: CatalogTypeValue) {
    return this.prisma.catalogSubcategory.findFirst({
      where: {
        public_id: publicId,
        category: { type },
      },
      select: { id: true },
    });
  }

  searchItems(params: {
    type: CatalogTypeValue;
    q: string;
    take: number;
    subcategoryId?: number;
  }) {
    return this.prisma.catalogItem.findMany({
      where: {
        ...(params.subcategoryId ? { subcategory_id: params.subcategoryId } : {}),
        subcategory: { category: { type: params.type } },
        ...(params.q
          ? { name: { contains: params.q, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ order_index: "asc" }, { id: "asc" }],
      take: params.take,
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
  }

  reorder(kind: "category" | "subcategory" | "item", orderedIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      if (kind === "category") {
        const categories = await tx.catalogCategory.findMany({
          where: { public_id: { in: orderedIds }, type: "PRODUCT" },
          select: { public_id: true },
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
          select: { public_id: true, category_id: true },
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
        select: { public_id: true, subcategory_id: true },
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
  }

  createCategory(params: { type: CatalogTypeValue; name: string; iconKey: string; makePublicId: (prefix: string) => string; }) {
    return this.prisma.$transaction(async (tx) =>
      tx.catalogCategory.create({
        data: {
          public_id: params.makePublicId("CAT"),
          type: params.type,
          name: params.name,
          icon_key: params.iconKey,
          order_index: await nextOrderIndex(tx, "category", { type: params.type }),
        },
        include: { subcategories: { include: { items: true } } },
      }),
    );
  }

  updateCategory(params: {
    publicId: string;
    data: Prisma.CatalogCategoryUpdateInput;
  }) {
    return this.prisma.catalogCategory.update({
      where: { public_id: params.publicId },
      data: params.data,
      include: {
        subcategories: {
          include: {
            _count: { select: { items: true } },
            items: { include: { _count: { select: { listings: true } } } },
          },
        },
      },
    });
  }

  deleteCategory(publicId: string) {
    return this.prisma.catalogCategory.delete({
      where: { public_id: publicId },
    });
  }

  createSubcategory(params: {
    categoryPublicId: string;
    name: string;
    makePublicId: (prefix: string) => string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const category = await tx.catalogCategory.findUnique({
        where: { public_id: params.categoryPublicId },
        select: { id: true },
      });
      if (!category) throw new Error("Категория не найдена");

      return tx.catalogSubcategory.create({
        data: {
          public_id: params.makePublicId("SUB"),
          category_id: category.id,
          name: params.name,
          order_index: await nextOrderIndex(tx, "subcategory", {
            categoryId: category.id,
          }),
        },
        include: { items: true },
      });
    });
  }

  async resolveCategoryId(categoryPublicId: string) {
    const category = await this.prisma.catalogCategory.findUnique({
      where: { public_id: categoryPublicId },
      select: { id: true },
    });
    return category?.id ?? null;
  }

  updateSubcategory(params: {
    publicId: string;
    data: Prisma.CatalogSubcategoryUpdateInput;
  }) {
    return this.prisma.catalogSubcategory.update({
      where: { public_id: params.publicId },
      data: params.data,
      include: { items: { include: { _count: { select: { listings: true } } } } },
    });
  }

  deleteSubcategory(publicId: string) {
    return this.prisma.catalogSubcategory.delete({
      where: { public_id: publicId },
    });
  }

  createItem(params: {
    subcategoryPublicId: string;
    name: string;
    makePublicId: (prefix: string) => string;
    buildDefaultItemAttributeDefinitions: (params: {
      itemId: number;
      itemPublicId: string;
      type: "PRODUCT";
    }) => Prisma.CatalogAttributeDefinitionCreateManyInput[];
  }) {
    return this.prisma.$transaction(async (tx) => {
      const subcategory = await tx.catalogSubcategory.findUnique({
        where: { public_id: params.subcategoryPublicId },
        include: { category: { select: { type: true } } },
      });
      if (!subcategory) throw new Error("Подкатегория не найдена");

      const created = await tx.catalogItem.create({
        data: {
          public_id: params.makePublicId("ITM"),
          subcategory_id: subcategory.id,
          name: params.name,
          order_index: await nextOrderIndex(tx, "item", {
            subcategoryId: subcategory.id,
          }),
        },
        select: { id: true, public_id: true, name: true, order_index: true },
      });

      await tx.catalogAttributeDefinition.createMany({
        data: params.buildDefaultItemAttributeDefinitions({
          itemId: created.id,
          itemPublicId: created.public_id,
          type: subcategory.category.type,
        }),
      });

      return created;
    });
  }

  async resolveSubcategoryId(subcategoryPublicId: string) {
    const subcategory = await this.prisma.catalogSubcategory.findUnique({
      where: { public_id: subcategoryPublicId },
      select: { id: true },
    });
    return subcategory?.id ?? null;
  }

  updateItem(params: {
    publicId: string;
    data: Prisma.CatalogItemUpdateInput;
  }) {
    return this.prisma.catalogItem.update({
      where: { public_id: params.publicId },
      data: params.data,
      include: { _count: { select: { listings: true } } },
    });
  }

  deleteItem(publicId: string) {
    return this.prisma.catalogItem.delete({
      where: { public_id: publicId },
    });
  }
}
