import type { ImageModerationSignal } from "../../listing-moderation";
import { jsonStringArray } from "../../../partnership/onboarding";

export type ListingTypeValue = "PRODUCT";
export type ListingConditionValue = "NEW" | "USED";
export type ListingStateValue = "new" | "restored" | "used";
export type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";

export type ListingAttributeInput = { key: string; value: string };
export type AttributeDefinitionForValidation = {
  key: string;
  label: string;
  input_type: string;
  required: boolean;
  options: unknown;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  default_value: string | null;
  order_index: number;
};

export type CatalogCategoryRef = { name: string };
export type CatalogSubcategoryRef = { name: string; category: CatalogCategoryRef };
export type CatalogItemRef = { name: string; subcategory: CatalogSubcategoryRef };
export type PartnerCatalogSelection = {
  itemId: number | null;
  categoryId: number | null;
  subcategoryId: number | null;
  categoryName: string;
  subcategoryName: string;
  itemName: string;
  isCustomCategory: boolean;
  isCustomSubcategory: boolean;
  isCustomItem: boolean;
  attributeDefinitions: AttributeDefinitionForValidation[];
};

const META_ATTR_LISTING_STATE = "__listing_state";
const META_ATTR_CATEGORY_ROOT = "__catalog_category";
const META_ATTR_SUBCATEGORY = "__catalog_subcategory";
const META_ATTR_CATALOG_ITEM = "__catalog_item";
const META_ATTR_CATALOG_ITEM_CUSTOM = "__catalog_item_custom";
const META_ATTR_CATALOG_REQUEST_ATTRIBUTES = "__catalog_request_attributes";
const META_ATTR_CATALOG_REQUEST_COMMENT = "__catalog_request_comment";
const META_ATTR_CUSTOM_PREFIX = "__custom_";
export const CUSTOM_VALUE_OPTION = "Другое / предложить значение";
const PUBLIC_ATTR_DEFECTS = "Дефекты";
const CATALOG_META_ATTRIBUTE_KEYS = new Set([
  META_ATTR_CATEGORY_ROOT.toLocaleLowerCase("ru-RU"),
  META_ATTR_SUBCATEGORY.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM_CUSTOM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_ATTRIBUTES.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_COMMENT.toLocaleLowerCase("ru-RU"),
  "__meeting_address",
  "__has_defects",
]);
const CUSTOM_ITEM_META_ATTRIBUTE_KEYS = new Set([
  META_ATTR_CATEGORY_ROOT.toLocaleLowerCase("ru-RU"),
  META_ATTR_SUBCATEGORY.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_ITEM_CUSTOM.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_ATTRIBUTES.toLocaleLowerCase("ru-RU"),
  META_ATTR_CATALOG_REQUEST_COMMENT.toLocaleLowerCase("ru-RU"),
  "__meeting_address",
]);

export const ROLE_SELLER = "SELLER";
export const ROLE_ADMIN = "ADMIN";
export const LISTING_ACTIVE: ListingStatusValue = "ACTIVE";
export const LISTING_INACTIVE: ListingStatusValue = "INACTIVE";
export const LISTING_MODERATION: ListingStatusValue = "MODERATION";
export const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

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

function extractListingStateFromAttributes(
  attributes: Array<{ key: string; value: string }> | undefined,
): ListingStateValue | null {
  if (!attributes || attributes.length === 0) return null;
  const found = attributes.find((attribute) => attribute.key === META_ATTR_LISTING_STATE);
  if (!found) return null;
  const value = found.value.trim().toLowerCase();
  if (value === "restored") return "restored";
  if (value === "used") return "used";
  if (value === "new") return "new";
  return null;
}

function extractCatalogItemNameFromAttributes(
  attributes: Array<{ key: string; value: string }> | undefined,
): string | null {
  const itemName = attributes?.find((attribute) => attribute.key === META_ATTR_CATALOG_ITEM)?.value.trim();
  const customName = attributes?.find((attribute) => attribute.key === META_ATTR_CATALOG_ITEM_CUSTOM)?.value.trim();
  return customName || itemName || null;
}

function toClientTechGrade(value: string | null): string | null {
  if (!value) return null;
  if (value === "A_PLUS") return "A+";
  return value;
}

function normalizeCatalogSuggestionValue(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/\s+/g, " ");
}

function findAttributeDefinitionValue(
  attributes: ListingAttributeInput[],
  definition: AttributeDefinitionForValidation,
): string {
  return getAttributeValueByAnyKey(attributes, [definition.label, definition.key]);
}

function mergeCatalogAttributeDefinitions(
  ...groups: AttributeDefinitionForValidation[][]
): AttributeDefinitionForValidation[] {
  const byKey = new Map<string, AttributeDefinitionForValidation>();
  for (const group of groups) {
    for (const definition of group) {
      const previous = byKey.get(definition.key);
      byKey.set(definition.key, {
        ...previous,
        ...definition,
        order_index: previous?.order_index ?? definition.order_index,
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => a.order_index - b.order_index);
}

function isSystemBackedProductAttributeDefinition(
  definition: Pick<AttributeDefinitionForValidation, "key" | "label">,
): boolean {
  const key = definition.key.trim().toLocaleLowerCase("ru-RU");
  const label = definition.label.trim().toLocaleLowerCase("ru-RU");
  return key === "condition_grade" || (key === "condition" && label === "состояние");
}

export function parseListingType(_value: unknown): ListingTypeValue {
  return "PRODUCT";
}

export function parseListingState(value: unknown): ListingStateValue {
  if (value === "restored") return "restored";
  if (value === "used") return "used";
  return "new";
}

export function toDbCondition(state: ListingStateValue): ListingConditionValue {
  return state === "new" ? "NEW" : "USED";
}

export function mergeListingStateAttributes(params: {
  attributes: ListingAttributeInput[];
  listingState: ListingStateValue;
}): ListingAttributeInput[] {
  const deduplicated = new Map<string, ListingAttributeInput>();
  for (const attribute of params.attributes) {
    const key = attribute.key.trim();
    const value = attribute.value.trim();
    if (!key || !value) continue;
    deduplicated.set(key.toLowerCase(), { key, value });
  }

  deduplicated.set(META_ATTR_LISTING_STATE.toLowerCase(), {
    key: META_ATTR_LISTING_STATE,
    value: params.listingState,
  });

  return Array.from(deduplicated.values()).slice(0, 64);
}

export function toClientListingState(params: {
  condition: ListingConditionValue;
  attributes: Array<{ key: string; value: string }> | undefined;
}): ListingStateValue {
  const fromAttributes = extractListingStateFromAttributes(params.attributes);
  if (fromAttributes) return fromAttributes;
  return params.condition === "NEW" ? "new" : "used";
}

export function toClientTechState(params: {
  grade: string | null;
  batteryHealth: number | null;
  defects: string | null;
  included: string | null;
}): {
  grade: string;
  batteryHealthPercent: number;
  defects: string;
  included: string;
} | null {
  if (!params.grade || params.batteryHealth === null || !params.defects || !params.included) {
    return null;
  }

  return {
    grade: toClientTechGrade(params.grade) ?? params.grade,
    batteryHealthPercent: params.batteryHealth,
    defects: params.defects,
    included: params.included,
  };
}

export function normalizeImageArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const unique = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    unique.add(trimmed);
    if (unique.size >= 10) break;
  }

  return Array.from(unique);
}

export function normalizeImageModerationSignals(input: unknown): ImageModerationSignal[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const allowed = new Set<ImageModerationSignal>([
    "image_exact_duplicate",
    "image_near_duplicate",
    "image_low_contrast",
    "image_low_resolution",
    "image_similar_composition",
  ]);
  const signals = new Set<ImageModerationSignal>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const normalized = value.trim() as ImageModerationSignal;
    if (allowed.has(normalized)) {
      signals.add(normalized);
    }
  }

  return Array.from(signals).slice(0, 12);
}

export function parseListingStatus(value: unknown): ListingStatusValue | null {
  if (value === "active") return LISTING_ACTIVE;
  if (value === "inactive") return LISTING_INACTIVE;
  if (value === "moderation") return LISTING_MODERATION;
  return null;
}

export function resolveSellerStatusTransition(
  current: ListingStatusValue,
  requested: ListingStatusValue,
): { nextStatus: ListingStatusValue; nextModerationStatus: "APPROVED" | "PENDING" | "REJECTED" } | null {
  if (current === requested) {
    if (current === LISTING_MODERATION) {
      return { nextStatus: LISTING_MODERATION, nextModerationStatus: "PENDING" };
    }
    if (current === LISTING_ACTIVE) {
      return { nextStatus: LISTING_ACTIVE, nextModerationStatus: "APPROVED" };
    }
    return null;
  }

  if (current === LISTING_ACTIVE && requested === LISTING_INACTIVE) {
    return { nextStatus: LISTING_INACTIVE, nextModerationStatus: "APPROVED" };
  }

  if (current === LISTING_INACTIVE && requested === LISTING_MODERATION) {
    return { nextStatus: LISTING_MODERATION, nextModerationStatus: "PENDING" };
  }

  if (current === LISTING_MODERATION && requested === LISTING_INACTIVE) {
    return { nextStatus: LISTING_INACTIVE, nextModerationStatus: "PENDING" };
  }

  return null;
}

export function normalizeAttributes(input: unknown): ListingAttributeInput[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const deduplicated = new Map<string, ListingAttributeInput>();
  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const rawKey = "key" in entry ? entry.key : undefined;
    const rawValue = "value" in entry ? entry.value : undefined;
    if (typeof rawKey !== "string" || typeof rawValue !== "string") continue;

    const key = rawKey.trim();
    const value = rawValue.trim();
    if (!key || !value) continue;

    const normalizedKey = key.toLowerCase();
    if (!deduplicated.has(normalizedKey)) {
      deduplicated.set(normalizedKey, { key: key.slice(0, 120), value: value.slice(0, 500) });
    }
  }

  return Array.from(deduplicated.values()).slice(0, 60);
}

export function listingCategoryNameForClient(
  item: CatalogItemRef | null | undefined,
  attributes: Array<{ key: string; value: string }> | undefined,
): string {
  return (item?.name ?? "No category") === "No category"
    ? extractCatalogItemNameFromAttributes(attributes) ?? "No category"
    : item?.name ?? "No category";
}

export function ensureCatalogMetaAttributes(
  attributes: ListingAttributeInput[],
  item: CatalogItemRef | null | undefined,
): ListingAttributeInput[] {
  if (!item) return attributes;
  const next = [...attributes];
  const ensure = (key: string, value: string) => {
    if (getAttributeValue(next, key)) return;
    next.push({ key, value });
  };
  ensure(META_ATTR_CATEGORY_ROOT, item.subcategory.category.name);
  ensure(META_ATTR_SUBCATEGORY, item.subcategory.name);
  ensure(META_ATTR_CATALOG_ITEM, item.name);
  return next;
}

export function applyCatalogAttributeDefaults(
  attributes: ListingAttributeInput[],
  definitions: AttributeDefinitionForValidation[],
): ListingAttributeInput[] {
  const next = [...attributes];
  const existingKeys = new Set(next.map((attribute) => attribute.key.toLocaleLowerCase("ru-RU")));
  for (const definition of definitions) {
    const value = findAttributeDefinitionValue(next, definition);
    if (value || !definition.default_value) continue;
    const key = definition.label || definition.key;
    if (existingKeys.has(key.toLocaleLowerCase("ru-RU"))) continue;
    next.push({ key, value: definition.default_value });
    existingKeys.add(key.toLocaleLowerCase("ru-RU"));
  }
  return next;
}

export function validateCatalogSuggestionValue(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return "Укажите вид понятнее: минимум 2 символа";
  if (trimmed.length > 80) return "Слишком длинный вид: максимум 80 символов";
  if (!/[a-zа-я0-9]/iu.test(trimmed)) return "Вид должен содержать буквы или цифры";
  const normalized = normalizeCatalogSuggestionValue(trimmed);
  const blocked = ["гондошлеп", "хуй", "хуи", "бляд", "ебат", "ебан", "пизд", "fuck", "shit"];
  if (blocked.some((word) => normalized.includes(word))) {
    return "Такое значение нельзя добавить в справочник";
  }
  return null;
}

export function readTrimmedBodyString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value.trim() : "";
}

export function isValidCatalogRequestEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,24}$/u.test(value.trim());
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

export function validateAttributesAgainstSchema(
  attributes: ListingAttributeInput[],
  definitions: AttributeDefinitionForValidation[],
): { ok: true } | { ok: false; error: string; reasonCode: string } {
  const schemaKeys = new Set<string>();
  for (const definition of definitions) {
    schemaKeys.add(definition.key.toLocaleLowerCase("ru-RU"));
    schemaKeys.add(definition.label.toLocaleLowerCase("ru-RU"));
  }

  for (const attribute of attributes) {
    const normalizedKey = attribute.key.toLocaleLowerCase("ru-RU");
    if (!normalizedKey.startsWith(META_ATTR_CUSTOM_PREFIX)) continue;
    const schemaKey = normalizedKey.slice(META_ATTR_CUSTOM_PREFIX.length);
    if (!schemaKeys.has(schemaKey)) continue;
    const suggestionError = validateCatalogSuggestionValue(attribute.value);
    if (suggestionError) {
      return {
        ok: false,
        error: suggestionError,
        reasonCode: "LISTING_ATTRIBUTE_CUSTOM_VALUE_INVALID",
      };
    }
  }

  for (const definition of definitions) {
    const value = findAttributeDefinitionValue(attributes, definition).trim();
    const customValue =
      getAttributeValue(attributes, `${META_ATTR_CUSTOM_PREFIX}${definition.key}`) ||
      getAttributeValue(attributes, `${META_ATTR_CUSTOM_PREFIX}${definition.label}`);
    const hasCustomValue = Boolean(customValue.trim());
    if (definition.required && !value && !hasCustomValue) {
      return {
        ok: false,
        error: `Заполните характеристику: ${definition.label}`,
        reasonCode: "LISTING_REQUIRED_ATTRIBUTES_MISSING",
      };
    }
    if (!value) continue;

    if (definition.input_type === "number") {
      const numericValue = Number(value.replace(",", "."));
      if (!Number.isFinite(numericValue)) {
        return {
          ok: false,
          error: `Характеристика «${definition.label}» должна быть числом`,
          reasonCode: "LISTING_ATTRIBUTE_INVALID",
        };
      }
      if (definition.min_value !== null && numericValue < definition.min_value) {
        return {
          ok: false,
          error: `Характеристика «${definition.label}» должна быть не меньше ${definition.min_value}`,
          reasonCode: "LISTING_ATTRIBUTE_INVALID",
        };
      }
      if (definition.max_value !== null && numericValue > definition.max_value) {
        return {
          ok: false,
          error: `Характеристика «${definition.label}» должна быть не больше ${definition.max_value}`,
          reasonCode: "LISTING_ATTRIBUTE_INVALID",
        };
      }
    }

    const options = jsonStringArray(definition.options);
    if (definition.input_type === "select" && options.length === 0) {
      return {
        ok: false,
        error: `Справочник характеристики «${definition.label}» настроен без вариантов`,
        reasonCode: "LISTING_ATTRIBUTE_SCHEMA_INVALID",
      };
    }
    if (definition.input_type === "select" && value === CUSTOM_VALUE_OPTION && !hasCustomValue) {
      return {
        ok: false,
        error: `Укажите предлагаемое значение: ${definition.label}`,
        reasonCode: "LISTING_ATTRIBUTE_CUSTOM_VALUE_REQUIRED",
      };
    }
    if (
      definition.input_type === "select" &&
      hasCustomValue &&
      value &&
      value !== CUSTOM_VALUE_OPTION
    ) {
      return {
        ok: false,
        error: `Предлагаемое значение характеристики «${definition.label}» отправляется только через пункт «${CUSTOM_VALUE_OPTION}»`,
        reasonCode: "LISTING_ATTRIBUTE_CUSTOM_VALUE_REQUIRES_SUGGESTION",
      };
    }
    if (definition.input_type === "select" && !options.includes(value)) {
      return {
        ok: false,
        error: `Выберите значение из списка: ${definition.label}`,
        reasonCode: "LISTING_ATTRIBUTE_INVALID",
      };
    }
    if (definition.input_type !== "select" && options.length > 0 && !options.includes(value)) {
      return {
        ok: false,
        error: `Выберите значение из списка: ${definition.label}`,
        reasonCode: "LISTING_ATTRIBUTE_INVALID",
      };
    }
  }

  return { ok: true };
}

export function filterAttributesForCatalogSelection(
  attributes: ListingAttributeInput[],
  selection: PartnerCatalogSelection,
): ListingAttributeInput[] {
  const allowedSchemaKeys = new Set<string>();
  for (const definition of selection.attributeDefinitions) {
    allowedSchemaKeys.add(definition.key.toLocaleLowerCase("ru-RU"));
    allowedSchemaKeys.add(definition.label.toLocaleLowerCase("ru-RU"));
  }

  const allowedMetaKeys = selection.isCustomItem
    ? CUSTOM_ITEM_META_ATTRIBUTE_KEYS
    : CATALOG_META_ATTRIBUTE_KEYS;
  const next: ListingAttributeInput[] = [];
  const seen = new Set<string>();
  for (const attribute of attributes) {
    const key = attribute.key.trim();
    const value = attribute.value.trim();
    if (!key || !value) continue;
    const normalizedKey = key.toLocaleLowerCase("ru-RU");
    const isAllowed =
      allowedMetaKeys.has(normalizedKey) ||
      allowedSchemaKeys.has(normalizedKey) ||
      (!selection.isCustomItem &&
        normalizedKey === PUBLIC_ATTR_DEFECTS.toLocaleLowerCase("ru-RU"));
    if (!isAllowed) continue;
    if (normalizedKey.startsWith(META_ATTR_CUSTOM_PREFIX)) continue;
    if (seen.has(normalizedKey)) continue;
    seen.add(normalizedKey);
    next.push({ key, value });
  }
  return next.slice(0, 60);
}

export function mergeAttributeDefinitionsForSelection(
  ...groups: AttributeDefinitionForValidation[][]
): AttributeDefinitionForValidation[] {
  return mergeCatalogAttributeDefinitions(...groups);
}

export function filterCatalogAttributeDefinitionsForListingType(
  definitions: AttributeDefinitionForValidation[],
  type: "PRODUCT",
): AttributeDefinitionForValidation[] {
  if (type !== "PRODUCT") return definitions;
  return definitions.filter(
    (definition) => !isSystemBackedProductAttributeDefinition(definition),
  );
}

export function listingImageUrl(images: Array<{ url: string }>): string {
  return images[0]?.url ?? FALLBACK_LISTING_IMAGE;
}

export function extractSellerCity(seller: { addresses: Array<{ city: string }> }): string | null {
  const city = seller.addresses[0]?.city?.trim();
  return city || null;
}
