import type { ImageModerationSignal } from "./partner-listing-image-moderation";
import {
  CUSTOM_OPTION,
  CUSTOM_VALUE_OPTION,
  META_ATTR_CATALOG_ITEM,
  META_ATTR_CATALOG_ITEM_CUSTOM,
  META_ATTR_CATEGORY_ROOT,
  META_ATTR_HAS_DEFECTS,
  META_ATTR_MEETING_ADDRESS,
  META_ATTR_SUBCATEGORY,
} from "./partner-listings.constants";
import type {
  CharacteristicField,
  FormState,
  ListingAttribute,
} from "./partner-listings.types";
import {
  buildCatalogRequestAttributes,
  characteristicsToAttributes,
  getDefectsLabel,
  getResolvedCatalogItem,
  getResolvedCategoryRoot,
  getResolvedSubcategory,
  isCustomCatalogBranch,
  normalizeCharacteristics,
  validateImages,
} from "./partner-listings.utils";

export type PartnerListingSavePayload = {
  title: string;
  price: number;
  condition: FormState["condition"];
  description: string;
  category: string;
  images: string[];
  imageModerationSignals: ImageModerationSignal[];
  attributes: ListingAttribute[];
};

type CharacteristicValidationOptions = {
  lockedFieldMessage?: (field: CharacteristicField) => string | null;
};

export function snapshotListingFormForSave(
  form: FormState,
  fields: CharacteristicField[],
): FormState {
  return {
    ...form,
    title: form.title.trim(),
    description: form.description.trim(),
    meetingAddress: form.meetingAddress.trim(),
    customCategoryRoot: form.customCategoryRoot.trim(),
    customSubcategory: form.customSubcategory.trim(),
    customCatalogItem: form.customCatalogItem.trim(),
    catalogRequestAttributes: form.catalogRequestAttributes.trim(),
    catalogRequestComment: form.catalogRequestComment.trim(),
    price: String(Math.round(Number(form.price))),
    images: [...form.images],
    characteristics: normalizeCharacteristics(fields, form.characteristics),
  };
}

export function validateCatalogSelection(form: FormState): string | null {
  if (!form.categoryRoot) return "Выберите категорию";
  if (
    form.categoryRoot === CUSTOM_OPTION &&
    getResolvedCategoryRoot(form).length < 2
  ) {
    return "Укажите свою категорию";
  }
  if (!form.subcategory) return "Выберите подкатегорию";
  if (
    form.subcategory === CUSTOM_OPTION &&
    getResolvedSubcategory(form).length < 2
  ) {
    return "Укажите свою подкатегорию";
  }
  if (!form.catalogItem) return "Выберите вид товара";
  if (isCustomCatalogBranch(form) && getResolvedCatalogItem(form).length < 2) {
    return "Укажите свой вид товара";
  }
  return null;
}

export function validateCharacteristicValues(
  fields: CharacteristicField[],
  characteristics: Record<string, string>,
  options: CharacteristicValidationOptions = {},
): string | null {
  for (const field of fields) {
    const selectedValue = characteristics[field.key]?.trim() ?? "";
    if (field.required && !selectedValue) {
      return `Заполните характеристику: ${field.label}`;
    }
    if (
      field.options?.length &&
      selectedValue &&
      !field.options.includes(selectedValue)
    ) {
      const lockedMessage = options.lockedFieldMessage?.(field);
      return lockedMessage ?? `Выберите значение из подсказки: ${field.label}`;
    }
    if (
      selectedValue === CUSTOM_VALUE_OPTION &&
      (characteristics[`__custom_${field.key}`]?.trim().length ?? 0) < 2
    ) {
      return `Предложите значение: ${field.label}`;
    }
  }
  return null;
}

export async function validateCreateListingDetails(params: {
  form: FormState;
  fields: CharacteristicField[];
  isCatalogReferenceCreation: boolean;
  catalogReferenceBrands: string[];
  catalogReferenceModels: string[];
}): Promise<string | null> {
  const {
    form,
    fields,
    isCatalogReferenceCreation,
    catalogReferenceBrands,
    catalogReferenceModels,
  } = params;
  const catalogError = validateCatalogSelection(form);
  if (catalogError) return catalogError;
  if (form.title.trim().length < 2) return "Укажите название объявления";
  const imageError = await validateImages(form.type, form.images);
  if (imageError) return imageError;
  if (form.description.trim().length < 10) {
    return "Описание должно быть не короче 10 символов";
  }
  const price = Number(form.price);
  if (!Number.isFinite(price) || price <= 0) return "Укажите корректную цену";
  if (form.meetingAddress.trim().length < 5) {
    return "Выберите или добавьте адрес самовывоза";
  }
  if (isCatalogReferenceCreation) {
    if (!form.characteristics.brand?.trim()) {
      return "Заполните характеристику: Бренд";
    }
    if (!catalogReferenceBrands.includes(form.characteristics.brand.trim())) {
      return "Выберите бренд из подсказки";
    }
    if (!form.characteristics.model?.trim()) {
      return "Заполните характеристику: Модель";
    }
    if (!catalogReferenceModels.includes(form.characteristics.model.trim())) {
      return "Выберите модель из подсказки";
    }
    return validateCharacteristicValues(fields, form.characteristics, {
      lockedFieldMessage: (field) =>
        field.locked
          ? `Характеристика «${field.label}» зафиксирована DNS`
          : null,
    });
  }
  if (isCustomCatalogBranch(form)) {
    if (form.catalogRequestAttributes.trim().length < 10) {
      return "Опишите важные характеристики для заявки на добавление вида";
    }
    return null;
  }
  return validateCharacteristicValues(fields, form.characteristics);
}

export async function validateInlineListingDetails(params: {
  form: FormState;
  fields: CharacteristicField[];
}): Promise<string | null> {
  const { form, fields } = params;
  const title = form.title.trim();
  const description = form.description.trim();
  const meetingAddress = form.meetingAddress.trim();
  const price = Math.round(Number(form.price));

  if (title.length < 2) return "Укажите название объявления";
  if (!Number.isFinite(price) || price <= 0) return "Укажите корректную цену";
  const catalogError = validateCatalogSelection(form);
  if (catalogError) return catalogError;
  if (description.length < 10) {
    return "Описание должно быть не короче 10 символов";
  }
  if (meetingAddress.length < 5) return "Укажите адрес";

  const imageError = await validateImages(form.type, form.images);
  if (imageError) return imageError;
  if (!isCustomCatalogBranch(form) && !form.hasDefects) {
    return "Укажите, есть ли дефекты";
  }
  if (
    isCustomCatalogBranch(form) &&
    form.catalogRequestAttributes.trim().length < 10
  ) {
    return "Опишите важные характеристики для заявки на добавление вида";
  }

  return validateCharacteristicValues(fields, form.characteristics);
}

export function buildPartnerListingSavePayload(params: {
  form: FormState;
  fields: CharacteristicField[];
  imageModerationSignals: ImageModerationSignal[];
  includeDefects: boolean;
  includeMultipleStock: boolean;
}): PartnerListingSavePayload {
  const {
    form,
    fields,
    imageModerationSignals,
    includeDefects,
    includeMultipleStock,
  } = params;
  const resolvedCatalogItem = getResolvedCatalogItem(form);
  const resolvedCategoryRoot = getResolvedCategoryRoot(form);
  const resolvedSubcategory = getResolvedSubcategory(form);

  const attributes: ListingAttribute[] = [
    ...characteristicsToAttributes(form.characteristics, fields),
    ...(isCustomCatalogBranch(form)
      ? [
          { key: "brand", value: form.characteristics.brand ?? "" },
          { key: "model", value: form.characteristics.model ?? "" },
        ]
      : []),
    { key: META_ATTR_CATEGORY_ROOT, value: resolvedCategoryRoot },
    { key: META_ATTR_SUBCATEGORY, value: resolvedSubcategory },
    { key: META_ATTR_CATALOG_ITEM, value: resolvedCatalogItem },
    {
      key: META_ATTR_CATALOG_ITEM_CUSTOM,
      value: isCustomCatalogBranch(form) ? resolvedCatalogItem : "",
    },
    ...buildCatalogRequestAttributes(form),
    ...(includeDefects && !isCustomCatalogBranch(form)
      ? [
          { key: META_ATTR_HAS_DEFECTS, value: form.hasDefects },
          { key: "Дефекты", value: getDefectsLabel(form.hasDefects) },
        ]
      : []),
    ...(includeMultipleStock && form.hasMultipleStock
      ? [{ key: "Несколько штук в наличии", value: "Да" }]
      : []),
    { key: META_ATTR_MEETING_ADDRESS, value: form.meetingAddress.trim() },
  ].filter((attribute) => attribute.value.trim());

  return {
    title: form.title.trim(),
    price: Math.round(Number(form.price)),
    condition: form.condition,
    description: form.description.trim(),
    category: resolvedCatalogItem || resolvedSubcategory || resolvedCategoryRoot,
    images: form.images,
    imageModerationSignals,
    attributes,
  };
}
