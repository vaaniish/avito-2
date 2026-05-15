import { Prisma } from "@prisma/client";
import { validationError, notFound } from "../../../../../common/application-error";
import {
  buildDefaultItemAttributeDefinitions,
  catalogTypeToClient,
  clientCatalogCategory,
  duplicateCatalogReferenceCharacteristicLabel,
  makeCharacteristicKey,
  makePublicId,
  normalizeCatalogIconKey,
  normalizeCatalogName,
  normalizeCatalogReferenceText,
  parseCatalogListingType,
  readTrimmedString,
} from "../../domain/admin-catalog.helpers";
import type { AdminCatalogReferenceRepository } from "../../infrastructure/repositories/admin-catalog-reference.repository";
import type { AdminCatalogTreeRepository } from "../../infrastructure/repositories/admin-catalog-tree.repository";

export class AdminCatalogService {
  constructor(
    private readonly treeRepository: AdminCatalogTreeRepository,
    private readonly referenceRepository: AdminCatalogReferenceRepository,
  ) {}

  async getCatalog(typeInput: unknown) {
    const type = parseCatalogListingType(typeInput) ?? "PRODUCT";
    return this.treeRepository.loadCatalog(type);
  }

  async searchCatalog(query: Record<string, unknown>) {
    const type = parseCatalogListingType(query.type) ?? "PRODUCT";
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const scope =
      query.scope === "categories" ||
      query.scope === "subcategories" ||
      query.scope === "items"
        ? query.scope
        : "all";
    const categoryPublicId =
      typeof query.categoryId === "string" ? query.categoryId.trim() : "";
    const subcategoryPublicId =
      typeof query.subcategoryId === "string"
        ? query.subcategoryId.trim()
        : "";
    const parsedLimit = Number(query.limit ?? 50);
    const take = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 80)
      : 50;

    const nodes: any[] = [];

    if (scope === "all" || scope === "categories") {
      const categories = await this.treeRepository.searchCategories({
        type,
        q,
        take: scope === "all" ? Math.min(take, 30) : take,
      });
      nodes.push(
        ...categories.map((category) => ({
          kind: "category",
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
        ? await this.treeRepository.findCategoryScope(categoryPublicId, type)
        : null;
      const subcategories = await this.treeRepository.searchSubcategories({
        type,
        q,
        take: scope === "all" ? Math.min(take, 30) : take,
        categoryId: category?.id,
      });
      nodes.push(
        ...subcategories.map((subcategory) => ({
          kind: "subcategory",
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
        ? await this.treeRepository.findSubcategoryScope(subcategoryPublicId, type)
        : null;
      const items = await this.treeRepository.searchItems({
        type,
        q,
        take: scope === "all" ? Math.min(take, 30) : take,
        subcategoryId: subcategory?.id,
      });
      nodes.push(
        ...items.map((item) => ({
          kind: "item",
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

    return {
      items: nodes.slice(0, take),
      limit: take,
      query: q,
      scope,
    };
  }

  async reorderCatalog(body: Record<string, unknown>) {
    const kind =
      body.kind === "category" || body.kind === "subcategory" || body.kind === "item"
        ? body.kind
        : null;
    const orderedIds = Array.isArray(body.orderedIds)
      ? body.orderedIds
          .map((value) => readTrimmedString(value))
          .filter((value, index, list) => value.length > 0 && list.indexOf(value) === index)
      : [];

    if (!kind || orderedIds.length === 0) {
      throw validationError("Некорректные параметры сортировки");
    }

    await this.treeRepository.reorder(kind, orderedIds);
    return { success: true };
  }

  async createCategory(body: Record<string, unknown>) {
    const type = parseCatalogListingType(body.type);
    if (!type) {
      throw validationError("Некорректный тип каталога");
    }

    const category = await this.treeRepository.createCategory({
      type,
      name: normalizeCatalogName(body.name, "Категория"),
      iconKey: normalizeCatalogIconKey(body.iconKey),
      makePublicId,
    });

    return clientCatalogCategory(category);
  }

  async updateCategory(publicId: string, body: Record<string, unknown>) {
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

    const updated = await this.treeRepository.updateCategory({ publicId, data });
    return clientCatalogCategory(updated);
  }

  async deleteCategory(publicId: string) {
    await this.treeRepository.deleteCategory(publicId);
    return { success: true };
  }

  async createSubcategory(body: Record<string, unknown>) {
    const categoryPublicId = readTrimmedString(body.categoryId);
    if (!categoryPublicId) {
      throw validationError("Выберите категорию");
    }

    const subcategory = await this.treeRepository.createSubcategory({
      categoryPublicId,
      name: normalizeCatalogName(body.name, "Подкатегория"),
      makePublicId,
    });

    return {
      id: subcategory.public_id,
      name: subcategory.name,
      orderIndex: subcategory.order_index,
      itemCount: subcategory.items.length,
      items: [],
    };
  }

  async updateSubcategory(publicId: string, body: Record<string, unknown>) {
    const data: Prisma.CatalogSubcategoryUpdateInput = {};
    if (body.name !== undefined) {
      data.name = normalizeCatalogName(body.name, "Подкатегория");
    }
    if (body.categoryId !== undefined) {
      const categoryId = await this.treeRepository.resolveCategoryId(
        readTrimmedString(body.categoryId),
      );
      if (!categoryId) {
        throw validationError("Категория не найдена");
      }
      data.category = { connect: { id: categoryId } };
    }

    const updated = await this.treeRepository.updateSubcategory({ publicId, data });
    return {
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
    };
  }

  async deleteSubcategory(publicId: string) {
    await this.treeRepository.deleteSubcategory(publicId);
    return { success: true };
  }

  async createItem(body: Record<string, unknown>) {
    const subcategoryPublicId = readTrimmedString(body.subcategoryId);
    if (!subcategoryPublicId) {
      throw validationError("Выберите подкатегорию");
    }

    const item = await this.treeRepository.createItem({
      subcategoryPublicId,
      name: normalizeCatalogName(body.name, "Вид товара"),
      makePublicId,
      buildDefaultItemAttributeDefinitions,
    });

    return {
      id: item.public_id,
      name: item.name,
      orderIndex: item.order_index,
      listingCount: 0,
    };
  }

  async updateItem(publicId: string, body: Record<string, unknown>) {
    const data: Prisma.CatalogItemUpdateInput = {};
    if (body.name !== undefined) {
      data.name = normalizeCatalogName(body.name, "Вид товара");
    }
    if (body.subcategoryId !== undefined) {
      const subcategoryId = await this.treeRepository.resolveSubcategoryId(
        readTrimmedString(body.subcategoryId),
      );
      if (!subcategoryId) {
        throw validationError("Подкатегория не найдена");
      }
      data.subcategory = { connect: { id: subcategoryId } };
    }

    const updated = await this.treeRepository.updateItem({ publicId, data });
    return {
      id: updated.public_id,
      name: updated.name,
      orderIndex: updated.order_index,
      listingCount: updated._count.listings,
    };
  }

  async deleteItem(publicId: string) {
    await this.treeRepository.deleteItem(publicId);
    return { success: true };
  }

  async getItemReference(publicId: string) {
    const item = await this.referenceRepository.findItemByPublicId(publicId);
    if (!item) {
      throw notFound("Вид товара не найден");
    }

    const brands = await this.referenceRepository.listReferenceBrands(item.public_id);
    return {
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
    };
  }

  async createBrand(itemPublicId: string, body: Record<string, unknown>) {
    const brand = await this.referenceRepository.createBrand({
      itemPublicId,
      name: normalizeCatalogReferenceText(body.name, "Бренд"),
      makePublicId,
    });
    return { id: brand.public_id, name: brand.name, models: [] };
  }

  async updateBrand(publicId: string, body: Record<string, unknown>) {
    const brand = await this.referenceRepository.updateBrand(
      publicId,
      normalizeCatalogReferenceText(body.name, "Бренд"),
    );
    return { id: brand.public_id, name: brand.name };
  }

  async deleteBrand(publicId: string) {
    await this.referenceRepository.deleteBrand(publicId);
    return { success: true };
  }

  async createModel(brandPublicId: string, body: Record<string, unknown>) {
    const model = await this.referenceRepository.createModel({
      brandPublicId,
      name: normalizeCatalogReferenceText(body.name, "Модель"),
      makePublicId,
    });
    return { id: model.public_id, name: model.name, products: [] };
  }

  async updateModel(publicId: string, body: Record<string, unknown>) {
    const model = await this.referenceRepository.updateModel(
      publicId,
      normalizeCatalogReferenceText(body.name, "Модель"),
    );
    return { id: model.public_id, name: model.name };
  }

  async deleteModel(publicId: string) {
    await this.referenceRepository.deleteModel(publicId);
    return { success: true };
  }

  async createProduct(modelPublicId: string, body: Record<string, unknown>) {
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
      .filter((entry): entry is { label: string; value: string } => Boolean(entry));
    const duplicateCharacteristicLabel =
      duplicateCatalogReferenceCharacteristicLabel(characteristics);
    if (duplicateCharacteristicLabel) {
      throw validationError(
        `Характеристика «${duplicateCharacteristicLabel}» уже добавлена`,
      );
    }

    const product = await this.referenceRepository.createProduct({
      modelPublicId,
      characteristics,
      makePublicId,
      makeCharacteristicKey,
    });

    return {
      id: product.public_id,
      title: product.title,
      characteristics,
    };
  }

  async updateProduct(publicId: string, body: Record<string, unknown>) {
    const product = await this.referenceRepository.updateProduct(
      publicId,
      normalizeCatalogReferenceText(body.title, "Конкретный товар"),
    );
    return { id: product.public_id, title: product.title };
  }

  async deleteCharacteristic(rawId: string) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) {
      throw validationError("Некорректная характеристика");
    }
    await this.referenceRepository.deleteCharacteristic(id);
    return { success: true };
  }

  async deleteProduct(publicId: string) {
    await this.referenceRepository.deleteProduct(publicId);
    return { success: true };
  }
}
