import { Prisma } from "@prisma/client";
import { prisma } from "../../../../../lib/prisma";
import type { PartnerListingsCatalogRepositoryPort } from "../../domain/partner-listings.types";
import {
  isValidCatalogRequestEmail,
  isValidCatalogRequestUrl,
  parseListingType,
  readTrimmedBodyString,
  validateCatalogSuggestionValue,
} from "../../domain/partner-listings.helpers";
import {
  getCatalogReferenceResponse,
  upsertCatalogSuggestion,
} from "./partner-listings-catalog.repository-helper";
import { validationError } from "../../../../../common/application-error";

export class PartnerListingsCatalogRepository
  implements PartnerListingsCatalogRepositoryPort
{
  async createCatalogRequest(params: { sellerId: number; body: Record<string, unknown> }) {
    const mode = readTrimmedBodyString(params.body, "mode") === "catalog" ? "catalog" : "characteristic";
    const categoryName = readTrimmedBodyString(params.body, "categoryName");
    const subcategoryName = readTrimmedBodyString(params.body, "subcategoryName");
    const itemName = readTrimmedBodyString(params.body, "itemName");
    const brand = readTrimmedBodyString(params.body, "brand");
    const model = readTrimmedBodyString(params.body, "model");
    const importantAttributes = readTrimmedBodyString(params.body, "importantAttributes");
    const comment = readTrimmedBodyString(params.body, "comment");
    const link = readTrimmedBodyString(params.body, "link");
    const email = readTrimmedBodyString(params.body, "email");
    const photoName = readTrimmedBodyString(params.body, "photoName");
    const photoLabel = readTrimmedBodyString(params.body, "photoLabel");
    const title = readTrimmedBodyString(params.body, "title");
    const type = parseListingType(undefined);

    const requiredFields = [
      [categoryName, "Укажите категорию"],
      [subcategoryName, "Укажите подкатегорию"],
      [itemName, "Укажите вид товара"],
      [brand, "Укажите бренд"],
      [model, "Укажите модель"],
      [importantAttributes.length >= 10 ? importantAttributes : "", "Опишите важные характеристики"],
      [photoName, "Прикрепите фото товара"],
      [link, "Укажите ссылку на описание"],
      [email, "Укажите почту продавца"],
    ] as const;
    const missing = requiredFields.find(([value]) => !value);
    if (missing) {
      throw validationError(missing[1]);
    }

    for (const value of [categoryName, subcategoryName, itemName]) {
      const suggestionError = validateCatalogSuggestionValue(value);
      if (suggestionError) {
        throw validationError(suggestionError);
      }
    }
    if (!isValidCatalogRequestUrl(link)) {
      throw validationError(
        "Укажите корректную ссылку на сайт, например example.com или https://example.ru",
      );
    }
    if (!isValidCatalogRequestEmail(email)) {
      throw validationError("Укажите корректную почту, например seller@example.ru");
    }

    const category = await prisma.catalogCategory.findFirst({
      where: { type, name: { equals: categoryName, mode: "insensitive" } },
      select: { id: true, public_id: true, name: true },
    });
    const subcategory = category
      ? await prisma.catalogSubcategory.findFirst({
          where: {
            category_id: category.id,
            name: { equals: subcategoryName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        })
      : null;
    const item = subcategory
      ? await prisma.catalogItem.findFirst({
          where: {
            subcategory_id: subcategory.id,
            name: { equals: itemName, mode: "insensitive" },
          },
          select: { id: true, public_id: true, name: true },
        })
      : null;

    const payload: Prisma.InputJsonObject = {
      categoryName,
      subcategoryName,
      proposedItem: itemName,
      brand,
      model,
      importantAttributes,
      comment,
      link,
      email,
      photoName,
      photoLabel,
      listingPublicId: null,
      title: title || null,
      requestMode: mode,
    };

    let entityType: "CATEGORY" | "SUBCATEGORY" | "ITEM" = "ITEM";
    let rawValue = itemName;
    let reason = mode === "catalog" ? "seller_custom_catalog_item" : "seller_catalog_reference_request";
    if (mode === "catalog" && !category) {
      entityType = "CATEGORY";
      rawValue = categoryName;
      reason = "seller_custom_catalog_category";
    } else if (mode === "catalog" && !subcategory) {
      entityType = "SUBCATEGORY";
      rawValue = subcategoryName;
      reason = "seller_custom_catalog_subcategory";
    }

    await upsertCatalogSuggestion({
      type,
      categoryId: category?.id ?? null,
      subcategoryId: subcategory?.id ?? null,
      itemId: item?.id ?? null,
      proposedById: params.sellerId,
      rawValue,
      entityType,
      reason,
      payload,
    });

    return { success: true };
  }

  async getCatalogReference(params: { itemName: string; brand: string; model: string }) {
    return getCatalogReferenceResponse(params);
  }
}
