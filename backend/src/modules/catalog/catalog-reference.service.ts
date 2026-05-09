import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const REFERENCE_ATTR_BRAND_KEY = "brand";
const REFERENCE_ATTR_MODEL_KEY = "model";
const REFERENCE_ATTR_BRAND_LABEL = "Бренд";
const REFERENCE_ATTR_MODEL_LABEL = "Модель";

export type CatalogReferenceCharacteristic = {
  key: string;
  label: string;
  value: string;
  rawValue: string;
  sourceGroupIndex: number;
  source?: "bracketGroups" | "titleFallback";
};

export type CatalogReferenceVariant = {
  productId: string;
  title: string;
  characteristics: CatalogReferenceCharacteristic[];
};

export type CatalogReferenceModel = {
  model: string;
  variants: CatalogReferenceVariant[];
};

export type CatalogReferenceBrand = {
  brand: string;
  models: CatalogReferenceModel[];
};

export type CatalogReferenceItem = {
  itemName: string;
  sourceFile: string;
  productsCount: number;
  brands: CatalogReferenceBrand[];
};

export type CatalogReferenceField = {
  key: string;
  label: string;
  options: string[];
  defaultValue: string | null;
  locked: boolean;
  source: "bracketGroups" | "titleFallback";
  orderIndex: number;
};

export type CatalogReferenceAttributeInput = { key: string; value: string };

export type CatalogReferenceCreateSuggestion = {
  itemName: string;
  brand: string;
  model: string;
  title: string;
  characteristics: CatalogReferenceCharacteristic[];
  score: number;
};

export type CatalogReferenceTitleSuggestion = {
  value: string;
  score: number;
};

export type CatalogReferenceBrandOptions = {
  itemName: string;
  brands: string[];
};

export type CatalogReferenceModelOptions = {
  itemName: string;
  brand: string;
  models: string[];
};

export type CatalogReferenceSelectedModel = {
  itemName: string;
  brand: CatalogReferenceBrand;
  model: CatalogReferenceModel;
};

export type CatalogReferenceAttributeDefinition = {
  key: string;
  label: string;
  input_type: string;
  required: boolean;
  options: Prisma.JsonValue | null;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  default_value: string | null;
  order_index: number;
};

export function normalizeReferenceSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[«»"'`]/g, "")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeExactText(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function getAttributeValueByAnyKey(
  attributes: CatalogReferenceAttributeInput[],
  keys: string[],
): string {
  const normalizedKeys = keys.map((key) => key.trim().toLocaleLowerCase("ru-RU"));
  const match = attributes.find((attribute) =>
    normalizedKeys.includes(attribute.key.trim().toLocaleLowerCase("ru-RU")),
  );
  return match?.value.trim() ?? "";
}

function isMissingCatalogReferenceTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    ((error as { code?: string }).code === "P2021" ||
      (error as { code?: string }).code === "P2022")
  );
}

function mapCatalogReferenceCharacteristic(characteristic: {
  key: string;
  label: string;
  value: string;
  raw_value: string;
  source_group_index: number;
  source: string;
}): CatalogReferenceCharacteristic {
  return {
    key: characteristic.key,
    label: characteristic.label,
    value: characteristic.value,
    rawValue: characteristic.raw_value,
    sourceGroupIndex: characteristic.source_group_index,
    source:
      characteristic.source === "titleFallback"
        ? "titleFallback"
        : "bracketGroups",
  };
}

function normalizedCharacteristicLabel(label: string): string {
  return normalizeExactText(label).replace(/\s+/g, " ");
}

function appendUniqueValue(values: string[], value: string): void {
  const normalized = normalizeExactText(value);
  if (!normalized) return;
  if (values.some((entry) => normalizeExactText(entry) === normalized)) return;
  values.push(value);
}

export function aggregateCatalogReferenceCharacteristics(
  characteristics: CatalogReferenceCharacteristic[],
): CatalogReferenceCharacteristic[] {
  const byLabel = new Map<
    string,
    {
      first: CatalogReferenceCharacteristic;
      values: string[];
      rawValues: string[];
      hasTitleFallback: boolean;
    }
  >();

  for (const characteristic of characteristics) {
    const label = characteristic.label.trim();
    const key = normalizedCharacteristicLabel(label);
    const value = characteristic.value.trim();
    if (!key || !value) continue;

    const existing = byLabel.get(key);
    if (existing) {
      appendUniqueValue(existing.values, value);
      appendUniqueValue(existing.rawValues, characteristic.rawValue.trim() || value);
      if ((characteristic.source ?? "bracketGroups") === "titleFallback") {
        existing.hasTitleFallback = true;
      }
      continue;
    }

    byLabel.set(key, {
      first: characteristic,
      values: [value],
      rawValues: [characteristic.rawValue.trim() || value],
      hasTitleFallback: (characteristic.source ?? "bracketGroups") === "titleFallback",
    });
  }

  return Array.from(byLabel.values()).map((entry) => ({
    ...entry.first,
    value: entry.values.join(", "),
    rawValue: entry.rawValues.join(", "),
    source: entry.hasTitleFallback ? "titleFallback" : "bracketGroups",
  }));
}

export function findCatalogReferenceBrand(
  item: CatalogReferenceItem,
  brand: string,
): CatalogReferenceBrand | null {
  const normalized = normalizeExactText(brand);
  return (
    item.brands.find((entry) => normalizeExactText(entry.brand) === normalized) ??
    null
  );
}

export function findCatalogReferenceModel(
  brand: CatalogReferenceBrand,
  model: string,
): CatalogReferenceModel | null {
  const normalized = normalizeExactText(model);
  return (
    brand.models.find((entry) => normalizeExactText(entry.model) === normalized) ??
    null
  );
}

async function findCatalogReferenceItemFromDb(
  itemName: string,
): Promise<CatalogReferenceItem | null> {
  const items = await prisma.catalogItem.findMany({
    where: {
      name: { equals: itemName, mode: "insensitive" },
    },
    include: {
      reference_brands: {
        orderBy: [{ order_index: "asc" }, { id: "asc" }],
        include: {
          models: {
            orderBy: [{ order_index: "asc" }, { id: "asc" }],
            include: {
              variants: {
                orderBy: [{ order_index: "asc" }, { id: "asc" }],
                include: {
                  characteristics: {
                    orderBy: [{ order_index: "asc" }, { id: "asc" }],
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const normalized = normalizeExactText(itemName);
  const item =
    items.find((entry) => normalizeExactText(entry.name) === normalized) ??
    items[0] ??
    null;
  if (!item || item.reference_brands.length === 0) return null;

  return {
    itemName: item.name,
    sourceFile: "database",
    productsCount: item.reference_brands.reduce(
      (total, brand) =>
        total +
        brand.models.reduce(
          (brandTotal, model) => brandTotal + model.variants.length,
          0,
        ),
      0,
    ),
    brands: item.reference_brands.map((brand) => ({
      brand: brand.name,
      models: brand.models.map((model) => ({
        model: model.name,
        variants: model.variants.map((variant) => ({
          productId: variant.external_product_id ?? variant.public_id,
          title: variant.title,
          characteristics: variant.characteristics.map(mapCatalogReferenceCharacteristic),
        })),
      })),
    })),
  };
}

export async function findCatalogReferenceItem(
  itemName: string,
): Promise<CatalogReferenceItem | null> {
  try {
    return await findCatalogReferenceItemFromDb(itemName);
  } catch (error) {
    if (isMissingCatalogReferenceTable(error)) return null;
    throw error;
  }
}

export async function catalogReferenceBrandOptions(
  itemName: string,
): Promise<CatalogReferenceBrandOptions | null> {
  try {
    const items = await prisma.catalogItem.findMany({
      where: {
        name: { equals: itemName, mode: "insensitive" },
      },
      select: {
        name: true,
        reference_brands: {
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
          select: { name: true },
        },
      },
    });
    const normalized = normalizeExactText(itemName);
    const item =
      items.find((entry) => normalizeExactText(entry.name) === normalized) ??
      items[0] ??
      null;
    if (!item || item.reference_brands.length === 0) return null;
    return {
      itemName: item.name,
      brands: item.reference_brands.map((brand) => brand.name),
    };
  } catch (error) {
    if (isMissingCatalogReferenceTable(error)) return null;
    throw error;
  }
}

export async function catalogReferenceModelOptions(
  itemName: string,
  brandName: string,
): Promise<CatalogReferenceModelOptions | null> {
  try {
    const brands = await prisma.catalogReferenceBrand.findMany({
      where: {
        name: { equals: brandName, mode: "insensitive" },
        item: {
          name: { equals: itemName, mode: "insensitive" },
        },
      },
      orderBy: [{ order_index: "asc" }, { id: "asc" }],
      select: {
        name: true,
        item: { select: { name: true } },
        models: {
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
          select: { name: true },
        },
      },
    });
    const normalizedItem = normalizeExactText(itemName);
    const normalizedBrand = normalizeExactText(brandName);
    const brand =
      brands.find(
        (entry) =>
          normalizeExactText(entry.item.name) === normalizedItem &&
          normalizeExactText(entry.name) === normalizedBrand,
      ) ??
      brands[0] ??
      null;
    if (!brand) return null;
    return {
      itemName: brand.item.name,
      brand: brand.name,
      models: brand.models.map((model) => model.name),
    };
  } catch (error) {
    if (isMissingCatalogReferenceTable(error)) return null;
    throw error;
  }
}

export async function findCatalogReferenceSelectedModel(
  itemName: string,
  brandName: string,
  modelName: string,
): Promise<CatalogReferenceSelectedModel | null> {
  try {
    const models = await prisma.catalogReferenceModel.findMany({
      where: {
        name: { equals: modelName, mode: "insensitive" },
        brand: {
          name: { equals: brandName, mode: "insensitive" },
          item: {
            name: { equals: itemName, mode: "insensitive" },
          },
        },
      },
      orderBy: [{ order_index: "asc" }, { id: "asc" }],
      include: {
        brand: {
          include: {
            item: true,
          },
        },
        variants: {
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
          include: {
            characteristics: {
              orderBy: [{ order_index: "asc" }, { id: "asc" }],
            },
          },
        },
      },
    });
    const normalizedItem = normalizeExactText(itemName);
    const normalizedBrand = normalizeExactText(brandName);
    const normalizedModel = normalizeExactText(modelName);
    const model =
      models.find(
        (entry) =>
          normalizeExactText(entry.name) === normalizedModel &&
          normalizeExactText(entry.brand.name) === normalizedBrand &&
          normalizeExactText(entry.brand.item.name) === normalizedItem,
      ) ??
      models[0] ??
      null;
    if (!model) return null;
    return {
      itemName: model.brand.item.name,
      brand: {
        brand: model.brand.name,
        models: [],
      },
      model: {
        model: model.name,
        variants: model.variants.map((variant) => ({
          productId: variant.external_product_id ?? variant.public_id,
          title: variant.title,
          characteristics: variant.characteristics.map(mapCatalogReferenceCharacteristic),
        })),
      },
    };
  } catch (error) {
    if (isMissingCatalogReferenceTable(error)) return null;
    throw error;
  }
}

export function firstCatalogReferenceVariant(
  model: CatalogReferenceModel,
): CatalogReferenceVariant | null {
  return model.variants[0] ?? null;
}

function createReferenceSuggestionTokens(value: string): string[] {
  return normalizeReferenceSearchText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function catalogReferenceQueryScore(params: {
  query: string;
  itemName: string;
  brand: string;
  model: string;
  title: string;
}): number {
  const normalizedQuery = normalizeReferenceSearchText(params.query);
  if (!normalizedQuery) return 0;

  const normalizedItem = normalizeReferenceSearchText(params.itemName);
  const normalizedBrand = normalizeReferenceSearchText(params.brand);
  const normalizedModel = normalizeReferenceSearchText(params.model);
  const normalizedTitle = normalizeReferenceSearchText(params.title);
  const queryTokens = createReferenceSuggestionTokens(params.query);
  let score = 0;

  if (normalizedModel === normalizedQuery) score += 100;
  if (normalizedModel.includes(normalizedQuery)) score += 82;
  if (normalizedTitle.includes(normalizedQuery)) score += 72;
  if (normalizedBrand && normalizedBrand === normalizedQuery) score += 44;
  if (normalizedBrand && normalizedQuery.includes(normalizedBrand)) score += 22;
  if (normalizedItem.includes(normalizedQuery) || normalizedQuery.includes(normalizedItem)) {
    score += 24;
  }

  for (const token of queryTokens) {
    if (normalizedModel.includes(token)) score += 14;
    if (normalizedTitle.includes(token)) score += 10;
    if (normalizedBrand.includes(token)) score += 8;
  }

  score -= Math.min(16, Math.floor(normalizedTitle.length / 28));
  return Math.max(0, Math.min(score, 100));
}

function tokenParts(value: string): Array<{ raw: string; normalized: string }> {
  return Array.from(value.matchAll(/[\p{L}\p{N}]+(?:[+-][\p{L}\p{N}]+)?/gu))
    .map((match) => match[0])
    .filter(Boolean)
    .map((raw) => ({ raw, normalized: normalizeReferenceSearchText(raw) }))
    .filter((token) => token.normalized.length > 0);
}

function completionFromText(query: string, text: string): string | null {
  const queryTokens = tokenParts(query);
  const textTokens = tokenParts(text);
  if (queryTokens.length === 0 || textTokens.length === 0) return null;

  for (let start = 0; start < textTokens.length; start += 1) {
    let textIndex = start;
    let matched = true;
    let partialMatch = false;

    let queryIndex = 0;
    while (queryIndex < queryTokens.length) {
      const queryToken = queryTokens[queryIndex];
      const textToken = textTokens[textIndex];
      if (!textToken) {
        matched = false;
        break;
      }
      if (textToken.normalized === queryToken.normalized) {
        textIndex += 1;
        queryIndex += 1;
        continue;
      }

      const nextQueryToken = queryTokens[queryIndex + 1];
      if (
        nextQueryToken &&
        /^\d+$/.test(queryToken.normalized) &&
        /^\d+$/.test(nextQueryToken.normalized) &&
        textToken.normalized === `${queryToken.normalized}${nextQueryToken.normalized}`
      ) {
        textIndex += 1;
        queryIndex += 2;
        continue;
      }

      if (
        queryTokens.length > 1 &&
        queryIndex === queryTokens.length - 1 &&
        textToken.normalized.startsWith(queryToken.normalized)
      ) {
        partialMatch = true;
        textIndex += 1;
        queryIndex += 1;
        continue;
      }
      matched = false;
      break;
    }

    if (!matched) continue;
    const completionStart = partialMatch ? Math.max(start, textIndex - 1) : textIndex;
    const completion = textTokens
      .slice(completionStart, completionStart + 2)
      .map((token) => token.raw)
      .join(" ")
      .trim();
    if (!completion || normalizeReferenceSearchText(completion) === normalizeReferenceSearchText(query)) {
      return null;
    }
    return completion;
  }

  return null;
}

export function catalogReferenceTitleSuggestions(
  query: string,
  suggestions: CatalogReferenceCreateSuggestion[],
): string[] {
  const byValue = new Map<string, { value: string; score: number; count: number }>();
  const register = (value: string | null, score: number) => {
    if (!value) return;
    const normalized = normalizeReferenceSearchText(value);
    if (!normalized || normalized === normalizeReferenceSearchText(query)) return;
    const existing = byValue.get(normalized);
    if (existing) {
      existing.score = Math.max(existing.score, score);
      existing.count += 1;
      return;
    }
    byValue.set(normalized, { value, score, count: 1 });
  };

  for (const suggestion of suggestions) {
    register(completionFromText(query, suggestion.model), suggestion.score + 8);
    register(completionFromText(query, suggestion.title), suggestion.score);
  }

  return Array.from(byValue.values())
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.count - left.count ||
        left.value.localeCompare(right.value, "ru-RU"),
    )
    .slice(0, 8)
    .map((entry) => entry.value);
}

export async function findCatalogReferenceCreateSuggestions(
  query: string,
  type: "PRODUCT",
): Promise<CatalogReferenceCreateSuggestion[]> {
  const tokens = createReferenceSuggestionTokens(query).slice(0, 8);
  if (tokens.length === 0) return [];

  try {
    const variants = await prisma.catalogReferenceVariant.findMany({
      where: {
        model: {
          brand: {
            item: {
              subcategory: {
                category: { type },
              },
            },
          },
        },
        AND: tokens.map((token) => ({
          OR: [
            { title: { contains: token, mode: "insensitive" } },
            { model: { name: { contains: token, mode: "insensitive" } } },
            { model: { brand: { name: { contains: token, mode: "insensitive" } } } },
            {
              model: {
                brand: {
                  item: { name: { contains: token, mode: "insensitive" } },
                },
              },
            },
          ],
        })),
      },
      include: {
        characteristics: {
          orderBy: [{ order_index: "asc" }, { id: "asc" }],
        },
        model: {
          include: {
            brand: {
              include: {
                item: true,
              },
            },
          },
        },
      },
      orderBy: [{ order_index: "asc" }, { id: "asc" }],
      take: 600,
    });

    const suggestions: CatalogReferenceCreateSuggestion[] = [];
    const bestByItem = new Map<string, CatalogReferenceCreateSuggestion>();
    const keyForSuggestion = (suggestion: CatalogReferenceCreateSuggestion) =>
      [
        suggestion.itemName,
        suggestion.brand,
        suggestion.model,
        suggestion.title,
      ].map(normalizeReferenceSearchText).join("::");

    for (const variant of variants) {
      const brand = variant.model.brand;
      const item = brand.item;
      const score = catalogReferenceQueryScore({
        query,
        itemName: item.name,
        brand: brand.name,
        model: variant.model.name,
        title: variant.title,
      });
      if (score < 35) continue;

      const next: CatalogReferenceCreateSuggestion = {
        itemName: item.name,
        brand: brand.name,
        model: variant.model.name,
        title: variant.title,
        characteristics: variant.characteristics.map(mapCatalogReferenceCharacteristic),
        score,
      };
      const previous = bestByItem.get(item.name);
      if (!previous || next.score > previous.score) bestByItem.set(item.name, next);
      suggestions.push(next);
    }

    const bestSuggestions = Array.from(bestByItem.values())
      .sort((left, right) => right.score - left.score || left.itemName.localeCompare(right.itemName, "ru-RU"))
    const bestKeys = new Set(bestSuggestions.map(keyForSuggestion));
    return bestSuggestions
      .concat(
        suggestions
          .sort((left, right) => right.score - left.score || left.model.localeCompare(right.model, "ru-RU"))
          .filter((suggestion) => !bestKeys.has(keyForSuggestion(suggestion))),
      )
      .slice(0, 80);
  } catch (error) {
    if (isMissingCatalogReferenceTable(error)) return [];
    throw error;
  }
}

export function catalogReferenceChips(
  suggestions: CatalogReferenceCreateSuggestion[],
): string[] {
  return Array.from(
    new Set(
      suggestions
        .map((suggestion) => suggestion.itemName)
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 8);
}

export function catalogReferenceFields(
  model: CatalogReferenceModel | null,
): CatalogReferenceField[] {
  if (!model) return [];
  const byLabel = new Map<
    string,
    {
      key: string;
      label: string;
      values: string[];
      source: "bracketGroups" | "titleFallback";
      firstIndex: number;
    }
  >();

  for (const variant of model.variants) {
    const aggregated = aggregateCatalogReferenceCharacteristics(variant.characteristics);
    for (const [index, characteristic] of aggregated.entries()) {
      const value = characteristic.value.trim();
      if (!value) continue;
      const labelKey = normalizedCharacteristicLabel(characteristic.label);
      if (!labelKey) continue;
      const existing = byLabel.get(labelKey);
      if (existing) {
        appendUniqueValue(existing.values, value);
        if ((characteristic.source ?? "bracketGroups") === "titleFallback") {
          existing.source = "titleFallback";
        }
        continue;
      }
      byLabel.set(labelKey, {
        key: characteristic.key,
        label: characteristic.label,
        values: [value],
        source: characteristic.source ?? "bracketGroups",
        firstIndex: index,
      });
    }
  }

  return Array.from(byLabel.values())
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .map((field, index) => {
      const options = field.values.slice().sort((left, right) =>
        left.localeCompare(right, "ru-RU"),
      );
      return {
        key: field.key,
        label: field.label,
        options,
        defaultValue: options.length === 1 ? options[0] : null,
        locked: field.source === "bracketGroups" && options.length === 1,
        source: field.source,
        orderIndex: 10 + index,
      };
    });
}

export async function catalogReferenceAttributeDefinitions(
  itemName: string,
  attributes: CatalogReferenceAttributeInput[],
): Promise<CatalogReferenceAttributeDefinition[]> {
  const item = await findCatalogReferenceItem(itemName);
  if (!item) return [];
  const brand = getAttributeValueByAnyKey(attributes, [
    REFERENCE_ATTR_BRAND_LABEL,
    REFERENCE_ATTR_BRAND_KEY,
  ]);
  const model = getAttributeValueByAnyKey(attributes, [
    REFERENCE_ATTR_MODEL_LABEL,
    REFERENCE_ATTR_MODEL_KEY,
  ]);
  const brandEntry = brand ? findCatalogReferenceBrand(item, brand) : null;
  const modelEntry =
    brandEntry && model ? findCatalogReferenceModel(brandEntry, model) : null;

  const base: CatalogReferenceAttributeDefinition[] = [
    {
      key: REFERENCE_ATTR_BRAND_KEY,
      label: REFERENCE_ATTR_BRAND_LABEL,
      input_type: "text",
      required: true,
      options: null,
      unit: null,
      min_value: null,
      max_value: null,
      default_value: null,
      order_index: 1,
    },
    {
      key: REFERENCE_ATTR_MODEL_KEY,
      label: REFERENCE_ATTR_MODEL_LABEL,
      input_type: "text",
      required: true,
      options: null,
      unit: null,
      min_value: null,
      max_value: null,
      default_value: null,
      order_index: 2,
    },
  ];

  const seen = new Set(base.map((definition) => definition.key));
  for (const field of catalogReferenceFields(modelEntry)) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    base.push({
      key: field.key,
      label: field.label,
      input_type: "select",
      required: true,
      options: field.options,
      unit: null,
      min_value: null,
      max_value: null,
      default_value: field.defaultValue,
      order_index: field.orderIndex,
    });
  }

  return base;
}

export async function validateCatalogReferenceCombination(
  itemName: string,
  attributes: CatalogReferenceAttributeInput[],
): Promise<{ ok: true } | { ok: false; error: string; reasonCode: string }> {
  const item = await findCatalogReferenceItem(itemName);
  if (!item) return { ok: true };

  const brand = getAttributeValueByAnyKey(attributes, [
    REFERENCE_ATTR_BRAND_LABEL,
    REFERENCE_ATTR_BRAND_KEY,
  ]);
  const model = getAttributeValueByAnyKey(attributes, [
    REFERENCE_ATTR_MODEL_LABEL,
    REFERENCE_ATTR_MODEL_KEY,
  ]);

  if (!brand) {
    return {
      ok: false,
      error: "Заполните характеристику: Бренд",
      reasonCode: "LISTING_REQUIRED_ATTRIBUTES_MISSING",
    };
  }

  const brandEntry = findCatalogReferenceBrand(item, brand);
  if (!brandEntry) {
    return {
      ok: false,
      error: "Выберите бренд из справочника",
      reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
    };
  }

  if (!model) {
    return {
      ok: false,
      error: "Заполните характеристику: Модель",
      reasonCode: "LISTING_REQUIRED_ATTRIBUTES_MISSING",
    };
  }

  const modelEntry = findCatalogReferenceModel(brandEntry, model);
  if (!modelEntry) {
    return {
      ok: false,
      error: "Выберите модель, которая относится к выбранному бренду",
      reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
    };
  }

  for (const field of catalogReferenceFields(modelEntry)) {
    const value = getAttributeValueByAnyKey(attributes, [field.label, field.key]);
    if (!value) {
      return {
        ok: false,
        error: `Заполните характеристику: ${field.label}`,
        reasonCode: "LISTING_REQUIRED_ATTRIBUTES_MISSING",
      };
    }
    if (!field.options.some((option) => normalizeExactText(option) === normalizeExactText(value))) {
      return {
        ok: false,
        error: field.locked
          ? `Характеристика «${field.label}» зафиксирована справочником DNS`
          : `Выберите значение из DNS-справочника: ${field.label}`,
        reasonCode: "LISTING_ATTRIBUTE_COMBINATION_INVALID",
      };
    }
  }

  return { ok: true };
}
