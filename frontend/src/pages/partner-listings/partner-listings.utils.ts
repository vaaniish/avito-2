import {
  CUSTOM_OPTION,
  CUSTOM_VALUE_OPTION,
  META_ATTR_CATALOG_REQUEST_ATTRIBUTES,
  META_ATTR_CATALOG_REQUEST_COMMENT,
  PRODUCT_MIN_IMAGES,
} from "./partner-listings.constants";
import type {
  CatalogCategoryDto,
  CharacteristicField,
  DefectsValue,
  FormState,
  ListingAttribute,
  ListingType,
  ProfileAddressDto,
} from "./partner-listings.types";

export function normalizeSuggestionText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isValidCatalogRequestEmail(value: string): boolean {
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/u.test(email);
}

export function isValidCatalogRequestUrl(value: string): boolean {
  const rawValue = value.trim();
  try {
    const url = new URL(/^https?:\/\//iu.test(rawValue) ? rawValue : `https://${rawValue}`);
    const hostname = url.hostname.toLocaleLowerCase("ru-RU");
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      /^[a-zа-я0-9.-]+\.[a-zа-я]{2,24}$/iu.test(hostname) &&
      !hostname.startsWith(".") &&
      !hostname.endsWith(".") &&
      !hostname.includes("..")
    );
  } catch {
    return false;
  }
}

export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Не удалось прочитать фото"));
    reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
    reader.readAsDataURL(file);
  });
}

export function shouldReplaceTitleWithSuggestion(currentTitle: string, suggestion: string): boolean {
  const current = normalizeSuggestionText(currentTitle);
  const next = normalizeSuggestionText(suggestion);
  if (!current || !next) return false;
  return next.includes(current) || current.includes(next);
}

export function titleWithCompletion(currentTitle: string, suggestion: string): string {
  const current = currentTitle.trim();
  const next = suggestion.trim();
  if (!current) return next;
  if (!next) return current;

  const words = current.split(/\s+/);
  const last = words[words.length - 1] ?? "";
  const nextWords = next.split(/\s+/);
  const firstSuggestionWord = nextWords[0] ?? "";
  if (
    last.length > 0 &&
    firstSuggestionWord.toLocaleLowerCase("ru-RU").startsWith(last.toLocaleLowerCase("ru-RU")) &&
    firstSuggestionWord.toLocaleLowerCase("ru-RU") !== last.toLocaleLowerCase("ru-RU")
  ) {
    return [...words.slice(0, -1), next].join(" ");
  }

  return [current, next].filter(Boolean).join(" ");
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}

export function getMinImagesForType(_type: ListingType): number {
  return PRODUCT_MIN_IMAGES;
}

export function choiceButtonClass(active: boolean, extra = ""): string {
  return [
    "min-h-12 rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
    active
      ? "border-blue-300 bg-blue-50 text-blue-800 shadow-sm"
      : "border-gray-200 bg-white text-gray-900 hover:border-blue-200 hover:bg-blue-50/40",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

export async function findDuplicatePhotoPair(
  images: string[],
): Promise<{ sourceIndex: number; duplicateIndex: number } | null> {
  const exactImages = new Map<string, number>();
  for (let i = 0; i < images.length; i += 1) {
    const previousIndex = exactImages.get(images[i]);
    if (previousIndex !== undefined) {
      return { sourceIndex: previousIndex, duplicateIndex: i };
    }
    exactImages.set(images[i], i);
  }

  return null;
}

export async function validateImageDuplicates(
  images: string[],
): Promise<string | null> {
  const duplicate = await findDuplicatePhotoPair(images);
  if (duplicate) {
    return `Фото ${duplicate.duplicateIndex + 1} повторяет фото ${duplicate.sourceIndex + 1}. Загрузите разные файлы.`;
  }

  return null;
}

export async function validateImages(
  type: ListingType,
  images: string[],
): Promise<string | null> {
  const minImages = getMinImagesForType(type);
  if (images.length < minImages) return `Добавьте минимум ${minImages} фото`;
  return validateImageDuplicates(images);
}

export function getMetaAttribute(
  attrs: ListingAttribute[] | undefined,
  key: string,
): string {
  const normalizedKey = key.toLocaleLowerCase("ru-RU");
  return (
    attrs?.find((x) => x.key.toLocaleLowerCase("ru-RU") === normalizedKey)
      ?.value ?? ""
  );
}

export function normalizeFieldOptions(
  options: string[] | undefined,
): string[] | undefined {
  if (!options || options.length === 0) return undefined;
  return Array.from(
    new Set(options.map((option) => option.trim()).filter(Boolean)),
  );
}

export function normalizeField(field: CharacteristicField): CharacteristicField {
  return {
    ...field,
    inputType: field.inputType ?? (field.options?.length ? "select" : "text"),
    options: normalizeFieldOptions(field.options),
    orderIndex: field.orderIndex ?? 0,
  };
}

export function isSystemBackedCharacteristicField(field: CharacteristicField): boolean {
  const key = field.key.trim().toLocaleLowerCase("ru-RU");
  const label = field.label.trim().toLocaleLowerCase("ru-RU");
  return key === "condition_grade" || (key === "condition" && label === "состояние");
}

export function sortFields(fields: CharacteristicField[]): CharacteristicField[] {
  return fields
    .filter((field) => !isSystemBackedCharacteristicField(field))
    .map(normalizeField)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

export function getCharacteristicFields(
  _type: ListingType,
  _subcategory: string,
  selectedSubcategory?: CatalogCategoryDto["subcategories"][number] | null,
  catalogItem?: string,
): CharacteristicField[] {
  if (catalogItem === CUSTOM_OPTION) return [];
  if (!selectedSubcategory) return [];
  if (catalogItem && catalogItem !== CUSTOM_OPTION) {
    const itemSchema = selectedSubcategory.itemAttributeSchemas?.[catalogItem];
    if (itemSchema && itemSchema.length > 0) return sortFields(itemSchema);
  }
  return sortFields(selectedSubcategory.attributeSchema ?? []);
}

export function normalizeCharacteristics(
  fields: CharacteristicField[],
  values: Record<string, string>,
): Record<string, string> {
  const allowed = new Set(fields.map((field) => field.key));
  for (const field of fields) {
    if (field.options?.includes(CUSTOM_VALUE_OPTION)) {
      allowed.add(`__custom_${field.key}`);
    }
  }
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key)) continue;
    next[key] = value;
  }
  for (const field of fields) {
    if (!next[field.key] && field.defaultValue) {
      next[field.key] = field.defaultValue;
    }
  }
  return next;
}

export function getAttributeValue(
  attrs: ListingAttribute[] | undefined,
  keys: string[],
): string {
  if (!attrs) return "";
  const normalizedKeys = keys.map((key) => key.toLocaleLowerCase("ru-RU"));
  return (
    attrs.find((attribute) =>
      normalizedKeys.includes(attribute.key.toLocaleLowerCase("ru-RU")),
    )?.value ?? ""
  );
}

export function referenceCharacteristicsFromAttributes(
  attrs: ListingAttribute[] | undefined,
): Record<string, string> {
  return {
    brand: getAttributeValue(attrs, [
      "brand",
      "Бренд",
      "manufacturer",
      "Производитель / бренд",
    ]),
    model: getAttributeValue(attrs, ["model", "Модель"]),
  };
}

export function attributesToCharacteristics(
  attrs: ListingAttribute[] | undefined,
  fields: CharacteristicField[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const field of fields) {
    const value = getAttributeValue(attrs, [field.label, field.key]);
    if (
      field.options?.includes(CUSTOM_OPTION) &&
      value &&
      !field.options.includes(value)
    ) {
      result[field.key] = "";
      continue;
    }
    result[field.key] = value || field.defaultValue || "";
  }
  return result;
}

export function characteristicsToAttributes(
  values: Record<string, string>,
  fields: CharacteristicField[],
): ListingAttribute[] {
  const attributes: ListingAttribute[] = [];
  for (const field of fields) {
    const selectedValue = (values[field.key] ?? "").trim();
    if (!selectedValue) continue;
    if (selectedValue === CUSTOM_VALUE_OPTION) {
      const customValue = (values[`__custom_${field.key}`] ?? "").trim();
      if (customValue) {
        attributes.push({ key: `__custom_${field.key}`, value: customValue });
      }
      continue;
    }
    attributes.push({ key: field.label, value: selectedValue });
  }
  return attributes;
}

export function catalogRequestFieldsFromAttributes(
  attrs: ListingAttribute[] | undefined,
): Pick<FormState, "catalogRequestAttributes" | "catalogRequestComment"> {
  const currentAttributes = getAttributeValue(attrs, [
    META_ATTR_CATALOG_REQUEST_ATTRIBUTES,
  ]);
  const legacyDetails = [
    getAttributeValue(attrs, ["__catalog_request_brand"]) &&
      `Бренд: ${getAttributeValue(attrs, ["__catalog_request_brand"])}`,
    getAttributeValue(attrs, ["__catalog_request_model"]) &&
      `Модель: ${getAttributeValue(attrs, ["__catalog_request_model"])}`,
  ].filter(Boolean);

  return {
    catalogRequestAttributes: [currentAttributes, ...legacyDetails]
      .filter(Boolean)
      .join("\n"),
    catalogRequestComment: getAttributeValue(attrs, [
      META_ATTR_CATALOG_REQUEST_COMMENT,
    ]),
  };
}

export function catalogRequestDefaults(): Pick<
  FormState,
  "catalogRequestAttributes" | "catalogRequestComment"
> {
  return {
    catalogRequestAttributes: "",
    catalogRequestComment: "",
  };
}

export function buildCatalogRequestAttributes(
  formState: FormState,
): ListingAttribute[] {
  if (
    !isCustomCatalogBranch(formState) &&
    !formState.catalogRequestAttributes.trim() &&
    !formState.catalogRequestComment.trim()
  ) {
    return [];
  }
  return [
    {
      key: META_ATTR_CATALOG_REQUEST_ATTRIBUTES,
      value: formState.catalogRequestAttributes.trim(),
    },
    {
      key: META_ATTR_CATALOG_REQUEST_COMMENT,
      value: formState.catalogRequestComment.trim(),
    },
  ].filter((attribute) => attribute.value);
}

export function getDefectsLabel(value: DefectsValue): string {
  if (value === "yes") return "Есть дефекты";
  if (value === "no") return "Без дефектов";
  return "";
}

export function getResolvedCatalogItem(formState: FormState): string {
  return formState.catalogItem === CUSTOM_OPTION
    ? formState.customCatalogItem.trim()
    : formState.catalogItem.trim();
}

export function getResolvedCategoryRoot(formState: FormState): string {
  return formState.categoryRoot === CUSTOM_OPTION
    ? formState.customCategoryRoot.trim()
    : formState.categoryRoot.trim();
}

export function getResolvedSubcategory(formState: FormState): string {
  return formState.subcategory === CUSTOM_OPTION
    ? formState.customSubcategory.trim()
    : formState.subcategory.trim();
}

export function isCustomCatalogBranch(formState: FormState): boolean {
  return (
    formState.categoryRoot === CUSTOM_OPTION ||
    formState.subcategory === CUSTOM_OPTION ||
    formState.catalogItem === CUSTOM_OPTION
  );
}

export function catalogItemOptions(
  selectedSubcategory: CatalogCategoryDto["subcategories"][number] | null,
): string[] {
  return Array.from(
    new Set([...(selectedSubcategory?.items ?? []), CUSTOM_OPTION]),
  );
}

export function getUniqueComboboxOptions(options: string[]): string[] {
  return Array.from(
    new Set(options.map((option) => option.trim()).filter(Boolean)),
  );
}

export function getComboboxMatches(options: string[], query: string): string[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const uniqueOptions = getUniqueComboboxOptions(options);
  if (!normalizedQuery) return uniqueOptions;
  return uniqueOptions.filter((option) =>
    option.toLocaleLowerCase("ru-RU").includes(normalizedQuery),
  );
}

export function buildInitialForm(type: ListingType): FormState {
  return {
    title: "",
    price: "",
    condition: "new",
    description: "",
    category: "",
    categoryRoot: "",
    customCategoryRoot: "",
    subcategory: "",
    customSubcategory: "",
    catalogItem: "",
    customCatalogItem: "",
    ...catalogRequestDefaults(),
    type,
    meetingAddress: "",
    images: [],
    hasDefects: "",
    characteristics: {},
    hasMultipleStock: false,
  };
}

export function normalizeProfileAddresses(addresses: ProfileAddressDto[]): ProfileAddressDto[] {
  return addresses
    .map((address) => ({
      ...address,
      name: address.name?.trim() || "Адрес самовывоза",
      fullAddress: address.fullAddress?.trim() ?? "",
      city: address.city?.trim() ?? "",
      region: address.region?.trim() ?? "",
      street: address.street?.trim() ?? "",
      house: address.house?.trim() ?? "",
      building: address.building?.trim() ?? "",
      postalCode: address.postalCode?.trim() ?? "",
    }))
    .filter((address) => address.fullAddress);
}
