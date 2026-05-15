import { Prisma } from "@prisma/client";
import { prisma } from "../../../../../lib/prisma";
import { validationError } from "../../../../../common/application-error";
import {
  aggregateCatalogReferenceCharacteristics,
  catalogReferenceFields,
  firstCatalogReferenceVariant,
} from "../../../../catalog/domain/catalog-reference.helpers";
import {
  catalogReferenceAttributeDefinitions,
  catalogReferenceBrandOptions,
  catalogReferenceModelOptions,
  findCatalogReferenceItem,
  findCatalogReferenceSelectedModel,
  validateCatalogReferenceCombination,
} from "../../../../catalog/infrastructure/repositories/catalog-reference.repository";
import {
  filterCatalogAttributeDefinitionsForListingType,
  mergeAttributeDefinitionsForSelection,
  type AttributeDefinitionForValidation,
  type ListingAttributeInput,
  type ListingTypeValue,
  type PartnerCatalogSelection,
  filterAttributesForCatalogSelection,
  validateCatalogSuggestionValue,
} from "../../domain/partner-listings.helpers";
import { makePublicId, normalizeRequiredText } from "../../../partner.shared";

const META_ATTR_CATEGORY_ROOT = "__catalog_category";
const META_ATTR_SUBCATEGORY = "__catalog_subcategory";
const META_ATTR_CATALOG_ITEM = "__catalog_item";
const META_ATTR_CATALOG_ITEM_CUSTOM = "__catalog_item_custom";
const META_ATTR_CATALOG_REQUEST_ATTRIBUTES = "__catalog_request_attributes";
const META_ATTR_CATALOG_REQUEST_COMMENT = "__catalog_request_comment";
const META_ATTR_CUSTOM_PREFIX = "__custom_";

type PartnerCatalogSelectionResult =
  | { ok: true; selection: PartnerCatalogSelection }
  | { ok: false; status: number; error: string; reasonCode: string };

function getAttributeValue(attributes: ListingAttributeInput[], key: string): string {
  const normalizedKey = key.toLocaleLowerCase("ru-RU");
  return (
    attributes.find((attribute) => attribute.key.toLocaleLowerCase("ru-RU") === normalizedKey)?.value.trim() ??
    ""
  );
}

function getAttributeValueByAnyKey(attributes: ListingAttributeInput[], keys: string[]): string {
  for (const key of keys) {
    const value = getAttributeValue(attributes, key);
    if (value) return value;
  }
  return "";
}

function normalizeCatalogSuggestionValue(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ");
}

function upsertCatalogSuggestionPayload(params: {
  type: ListingTypeValue;
  categoryId: number | null;
  subcategoryId: number | null;
  itemId?: number | null;
  proposedById: number;
  rawValue: string;
  entityType: "CATEGORY" | "ITEM" | "MANUFACTURER" | "MODEL" | "ATTRIBUTE_VALUE" | "SUBCATEGORY" | "ATTRIBUTE_SCHEMA";
  reason: string;
  payload?: Prisma.InputJsonValue;
}) {
  return params;
}

export async function upsertCatalogSuggestion(params: {
  type: ListingTypeValue;
  categoryId: number | null;
  subcategoryId: number | null;
  itemId?: number | null;
  proposedById: number;
  rawValue: string;
  entityType: "CATEGORY" | "ITEM" | "MANUFACTURER" | "MODEL" | "ATTRIBUTE_VALUE" | "SUBCATEGORY" | "ATTRIBUTE_SCHEMA";
  reason: string;
  payload?: Prisma.InputJsonValue;
}): Promise<void> {
  const normalizedValue = normalizeCatalogSuggestionValue(params.rawValue);
  const existing = await prisma.catalogSuggestion.findFirst({
    where: {
      entity_type: params.entityType,
      type: params.type,
      category_id: params.categoryId,
      subcategory_id: params.subcategoryId,
      normalized_value: normalizedValue,
    },
    select: { id: true, usage_count: true },
  });

  if (existing) {
    await prisma.catalogSuggestion.update({
      where: { id: existing.id },
      data: {
        usage_count: { increment: 1 },
        raw_value: params.rawValue.trim(),
        reason: params.reason,
        payload: params.payload ?? undefined,
      },
    });
    return;
  }

  await prisma.catalogSuggestion.create({
    data: {
      public_id: makePublicId("CSG"),
      entity_type: params.entityType,
      type: params.type,
      category_id: params.categoryId,
      subcategory_id: params.subcategoryId,
      item_id: params.itemId ?? null,
      proposed_by_id: params.proposedById,
      raw_value: params.rawValue.trim(),
      normalized_value: normalizedValue,
      reason: params.reason,
      payload: params.payload ?? undefined,
    },
  });
}

export async function resolvePartnerCatalogSelection(params: {
  type: ListingTypeValue;
  rawCategory: string;
  attributes: ListingAttributeInput[];
}): Promise<PartnerCatalogSelectionResult> {
  const categoryName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_CATEGORY_ROOT));
  const subcategoryName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_SUBCATEGORY));
  const selectedItemName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_CATALOG_ITEM));
  const customItemName = normalizeRequiredText(getAttributeValue(params.attributes, META_ATTR_CATALOG_ITEM_CUSTOM));

  if (!categoryName || !subcategoryName || !selectedItemName) {
    return {
      ok: false,
      status: 400,
      error: "Выберите категорию, подкатегорию и вид из справочника",
      reasonCode: "LISTING_CATALOG_SELECTION_REQUIRED",
    };
  }

  const category = await prisma.catalogCategory.findFirst({
    where: {
      type: params.type,
      name: { equals: categoryName, mode: "insensitive" },
    },
    include: {
      attribute_definitions: true,
    },
  });

  if (!category) {
    const suggestionError = validateCatalogSuggestionValue(categoryName);
    if (suggestionError) {
      return {
        ok: false,
        status: 400,
        error: suggestionError,
        reasonCode: "LISTING_CATALOG_SUGGESTION_INVALID",
      };
    }
    return {
      ok: true,
      selection: {
        itemId: null,
        categoryId: null,
        subcategoryId: null,
        categoryName,
        subcategoryName,
        itemName: customItemName || selectedItemName,
        isCustomCategory: true,
        isCustomSubcategory: true,
        isCustomItem: true,
        attributeDefinitions: [],
      },
    };
  }

  const subcategory = await prisma.catalogSubcategory.findFirst({
    where: {
      category_id: category.id,
      name: { equals: subcategoryName, mode: "insensitive" },
    },
    include: {
      attribute_definitions: true,
    },
  });

  if (!subcategory) {
    const suggestionError = validateCatalogSuggestionValue(subcategoryName);
    if (suggestionError) {
      return {
        ok: false,
        status: 400,
        error: suggestionError,
        reasonCode: "LISTING_CATALOG_SUGGESTION_INVALID",
      };
    }
    return {
      ok: true,
      selection: {
        itemId: null,
        categoryId: category.id,
        subcategoryId: null,
        categoryName: category.name,
        subcategoryName,
        itemName: customItemName || selectedItemName,
        isCustomCategory: false,
        isCustomSubcategory: true,
        isCustomItem: true,
        attributeDefinitions: [],
      },
    };
  }

  const itemNameForLookup = customItemName ? "" : selectedItemName;
  const item = itemNameForLookup
    ? await prisma.catalogItem.findFirst({
        where: {
          subcategory_id: subcategory.id,
          name: { equals: itemNameForLookup, mode: "insensitive" },
        },
        include: {
          attribute_definitions: true,
        },
      })
    : null;

  const isCustomItem = Boolean(customItemName) || !item;
  const resolvedItemName = customItemName || selectedItemName;
  if (isCustomItem) {
    const suggestionError = validateCatalogSuggestionValue(resolvedItemName);
    if (suggestionError) {
      return {
        ok: false,
        status: 400,
        error: suggestionError,
        reasonCode: "LISTING_CATALOG_SUGGESTION_INVALID",
      };
    }
  }

  const isReferenceItem = !isCustomItem && item ? Boolean(await findCatalogReferenceItem(item.name)) : false;
  const attributeDefinitions = filterCatalogAttributeDefinitionsForListingType(
    mergeAttributeDefinitionsForSelection(
      category.attribute_definitions as AttributeDefinitionForValidation[],
      subcategory.attribute_definitions as AttributeDefinitionForValidation[],
      isReferenceItem ? [] : ((item?.attribute_definitions ?? []) as AttributeDefinitionForValidation[]),
      isReferenceItem && item
        ? ((await catalogReferenceAttributeDefinitions(item.name, params.attributes)) as AttributeDefinitionForValidation[])
        : [],
    ),
    params.type,
  );

  return {
    ok: true,
    selection: {
      itemId: isCustomItem ? null : item?.id ?? null,
      categoryId: category.id,
      subcategoryId: subcategory.id,
      categoryName: category.name,
      subcategoryName: subcategory.name,
      itemName: resolvedItemName,
      isCustomCategory: false,
      isCustomSubcategory: false,
      isCustomItem,
      attributeDefinitions,
    },
  };
}

export async function validateItemSchemaConstraints(
  attributes: ListingAttributeInput[],
  selection: PartnerCatalogSelection,
): Promise<{ ok: true } | { ok: false; error: string; reasonCode: string }> {
  if (selection.isCustomItem) return { ok: true };

  const value = (key: string, label: string) => getAttributeValueByAnyKey(attributes, [key, label]);

  if (await findCatalogReferenceItem(selection.itemName)) {
    return validateCatalogReferenceCombination(selection.itemName, attributes);
  }

  if (selection.itemName === "Блок питания") {
    const power = Number(value("power", "Мощность").replace(",", "."));
    const gpuConnector = value("gpu_power_connector", "Питание видеокарты");
    const atxVersion = value("atx_version", "Стандарт ATX");
    const formFactor = value("form_factor", "Форм-фактор");
    if (Number.isFinite(power) && power < 500 && /12VHPWR|3x 8-pin/.test(gpuConnector)) {
      return {
        ok: false,
        error: "Блок питания до 500 Вт не может быть заявлен с флагманским GPU-питанием",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
    if (Number.isFinite(power) && power < 600 && (atxVersion === "ATX 3.0" || atxVersion === "ATX 3.1")) {
      return {
        ok: false,
        error: "ATX 3.x для блока питания ниже 600 Вт выглядит невозможной комбинацией",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
    if (formFactor === "Внешний адаптер" && Number.isFinite(power) && power > 330) {
      return {
        ok: false,
        error: "Внешний адаптер питания не должен быть мощнее 330 Вт",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  if (selection.itemName === "Стиральная машина") {
    const loadType = value("load_type", "Тип загрузки");
    const depth = Number(value("depth", "Глубина").replace(",", "."));
    if (loadType === "Вертикальная" && Number.isFinite(depth) && depth < 45) {
      return {
        ok: false,
        error: "Вертикальная стиральная машина не может иметь глубину меньше 45 см",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  if (selection.itemName === "Духовой шкаф") {
    const ovenType = value("oven_type", "Тип");
    const cleaningType = value("cleaning_type", "Очистка");
    if (ovenType === "Газовый" && cleaningType === "Пиролитическая") {
      return {
        ok: false,
        error: "Пиролитическая очистка доступна для электрических духовых шкафов, не для газовых",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  if (selection.itemName === "Холодильник") {
    const fridgeType = value("fridge_type", "Тип");
    const height = Number(value("height", "Высота").replace(",", "."));
    if (fridgeType === "Side-by-Side" && Number.isFinite(height) && height < 150) {
      return {
        ok: false,
        error: "Side-by-Side холодильник ниже 150 см выглядит невозможной комбинацией",
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  return { ok: true };
}

export async function createCatalogSuggestionsForListing(params: {
  type: ListingTypeValue;
  sellerId: number;
  attributes: ListingAttributeInput[];
  selection: PartnerCatalogSelection;
  listingPublicId?: string;
  title?: string;
}): Promise<void> {
  const requestBrand =
    getAttributeValue(params.attributes, "brand") ||
    getAttributeValue(params.attributes, "manufacturer") ||
    getAttributeValue(params.attributes, "Производитель / бренд");
  const requestModel =
    getAttributeValue(params.attributes, "model") ||
    getAttributeValue(params.attributes, "Модель");
  const requestImportantAttributes = getAttributeValue(params.attributes, META_ATTR_CATALOG_REQUEST_ATTRIBUTES);
  const requestComment = getAttributeValue(params.attributes, META_ATTR_CATALOG_REQUEST_COMMENT);
  const hasRequestLink = /^Ссылка:\s*\S+/imu.test(requestComment ?? "");
  const hasRequestEmail = /^Почта:\s*\S+/imu.test(requestComment ?? "");
  const hasRequestPhoto = /^Фото\s+(?:товара|наклейки|товара,\s*упаковки\s+или\s+маркировки):\s*\S+/imu.test(
    requestComment ?? "",
  );

  if (!requestBrand || !requestModel || !requestImportantAttributes || !hasRequestLink || !hasRequestEmail || !hasRequestPhoto) {
    return;
  }

  const basePayload: Prisma.InputJsonObject = {
    categoryName: params.selection.categoryName,
    subcategoryName: params.selection.subcategoryName,
    proposedItem: params.selection.itemName,
    brand: requestBrand,
    model: requestModel,
    importantAttributes: requestImportantAttributes,
    comment: requestComment,
    listingPublicId: params.listingPublicId ?? null,
    title: params.title ?? null,
  };

  if (params.selection.isCustomCategory) {
    await upsertCatalogSuggestion(
      upsertCatalogSuggestionPayload({
        type: params.type,
        categoryId: null,
        subcategoryId: null,
        proposedById: params.sellerId,
        rawValue: params.selection.categoryName,
        entityType: "CATEGORY",
        reason: "seller_custom_catalog_category",
        payload: basePayload,
      }),
    );
    return;
  }

  if (params.selection.isCustomSubcategory) {
    await upsertCatalogSuggestion(
      upsertCatalogSuggestionPayload({
        type: params.type,
        categoryId: params.selection.categoryId,
        subcategoryId: null,
        proposedById: params.sellerId,
        rawValue: params.selection.subcategoryName,
        entityType: "SUBCATEGORY",
        reason: "seller_custom_catalog_subcategory",
        payload: basePayload,
      }),
    );
    return;
  }

  if (params.selection.isCustomItem) {
    await upsertCatalogSuggestion(
      upsertCatalogSuggestionPayload({
        type: params.type,
        categoryId: params.selection.categoryId,
        subcategoryId: params.selection.subcategoryId,
        proposedById: params.sellerId,
        rawValue: params.selection.itemName,
        entityType: "ITEM",
        reason: "seller_custom_catalog_item",
        payload: basePayload,
      }),
    );
  }

  for (const definition of params.selection.attributeDefinitions) {
    const value =
      getAttributeValue(params.attributes, `${META_ATTR_CUSTOM_PREFIX}${definition.key}`) ||
      getAttributeValue(params.attributes, `${META_ATTR_CUSTOM_PREFIX}${definition.label}`);
    if (!value) continue;
    const suggestionError = validateCatalogSuggestionValue(value);
    if (suggestionError) continue;
    await upsertCatalogSuggestion(
      upsertCatalogSuggestionPayload({
        type: params.type,
        categoryId: params.selection.categoryId,
        subcategoryId: params.selection.subcategoryId,
        itemId: params.selection.itemId,
        proposedById: params.sellerId,
        rawValue: value,
        entityType: definition.key === "manufacturer" ? "MANUFACTURER" : "ATTRIBUTE_VALUE",
        reason: "seller_custom_attribute_value",
        payload: {
          ...basePayload,
          attributeKey: definition.key,
          attributeLabel: definition.label,
        },
      }),
    );
  }
}

export async function getCatalogReferenceResponse(params: {
  itemName: string;
  brand: string;
  model: string;
}) {
  if (!params.itemName) {
    throw validationError("Catalog item is required");
  }

  const brandOptions = await catalogReferenceBrandOptions(params.itemName);
  if (!brandOptions) {
    return {
      item: params.itemName,
      supported: false,
      brands: [],
    };
  }

  if (!params.brand) {
    return {
      item: brandOptions.itemName,
      supported: true,
      brands: brandOptions.brands,
    };
  }

  const modelOptions = await catalogReferenceModelOptions(params.itemName, params.brand);
  if (!modelOptions) {
    return {
      item: brandOptions.itemName,
      supported: true,
      brand: params.brand,
      models: [],
    };
  }

  if (!params.model) {
    return {
      item: modelOptions.itemName,
      supported: true,
      brand: modelOptions.brand,
      models: modelOptions.models,
    };
  }

  const selected = await findCatalogReferenceSelectedModel(
    params.itemName,
    params.brand,
    params.model,
  );
  if (!selected) {
    return {
      item: modelOptions.itemName,
      supported: true,
      brand: modelOptions.brand,
      model: params.model,
      variants: [],
      characteristics: [],
      fields: [],
    };
  }

  const selectedVariant = firstCatalogReferenceVariant(selected.model);
  const fields = catalogReferenceFields(selected.model);
  return {
    item: selected.itemName,
    supported: true,
    brand: selected.brand.brand,
    model: selected.model.model,
    variants: selected.model.variants.map((variant) => ({
      productId: variant.productId,
      title: variant.title,
      characteristics: aggregateCatalogReferenceCharacteristics(variant.characteristics),
    })),
    characteristics: selectedVariant
      ? aggregateCatalogReferenceCharacteristics(selectedVariant.characteristics)
      : [],
    fields,
  };
}
