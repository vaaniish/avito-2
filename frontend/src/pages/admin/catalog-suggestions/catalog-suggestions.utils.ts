import {
  CATALOG_ORDER_UPDATED_EVENT,
  payloadLabels,
} from "./catalog-suggestions.constants";
import type {
  ApprovalForm,
  CatalogNode,
  CatalogReferenceCharacteristic,
  CatalogSuggestion,
} from "./catalog-suggestions.types";

export function notifyCatalogOrderUpdated() {
  window.dispatchEvent(new CustomEvent(CATALOG_ORDER_UPDATED_EVENT));
  try {
    window.localStorage.setItem(CATALOG_ORDER_UPDATED_EVENT, String(Date.now()));
  } catch (_error) {
    // The same-window event above is primary; localStorage only helps other open tabs.
  }
}

export function catalogSuggestionEntityLabel(value: string, reason?: string | null): string {
  if (reason === "seller_catalog_reference_request") {
    return "Запрос на характеристику";
  }
  const labels: Record<string, string> = {
    category: "Новая категория",
    subcategory: "Предложенная подкатегория",
    item: "Предложенный вид товара",
    manufacturer: "Предложенный производитель",
    model: "Предложенная модель",
    attribute_value: "Предложенное значение",
    attribute_schema: "Предложенная характеристика",
  };
  return labels[value] ?? value;
}

export function isCharacteristicCatalogRequest(
  item: Pick<CatalogSuggestion, "reason">,
): boolean {
  return item.reason === "seller_catalog_reference_request";
}

export function isFullCatalogApprovalRequest(
  item: Pick<CatalogSuggestion, "entityType" | "reason">,
): boolean {
  return (
    item.entityType === "category" ||
    item.entityType === "subcategory" ||
    item.entityType === "item"
  );
}

export function isCatalogTreeSuggestion(
  item: Pick<CatalogSuggestion, "entityType" | "reason">,
): boolean {
  return isFullCatalogApprovalRequest(item) && !isCharacteristicCatalogRequest(item);
}

export function emojiFromIconKey(value: string): string {
  return value.startsWith("emoji:") ? value.slice("emoji:".length) : "";
}

export function formatDate(value: string | null) {
  if (!value) return "Не указано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

export function payloadEntries(payload: unknown): Array<[string, string]> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload as Record<string, unknown>).map(([key, value]) => [
    payloadLabels[key] ?? key,
    value === null || value === undefined || value === "" ? "Не указано" : String(value),
  ]);
}

export function payloadValue(payload: unknown, key: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export function displayValue(value: string): string {
  return value.trim() || "Не указано";
}

export function catalogCharacteristicKey(label: string): string {
  return (
    label
      .trim()
      .toLocaleLowerCase("ru-RU")
      .replace(/ё/g, "е")
      .replace(/[^a-zа-я0-9]+/giu, "")
      .slice(0, 60) || "characteristic"
  );
}

export function duplicateCatalogCharacteristicLabel(
  characteristics: Array<{ label: string }>,
): string | null {
  const seen = new Set<string>();
  for (const characteristic of characteristics) {
    const key = catalogCharacteristicKey(characteristic.label);
    if (seen.has(key)) return characteristic.label;
    seen.add(key);
  }
  return null;
}

export function suggestionCategoryName(item: CatalogSuggestion): string {
  return payloadValue(item.payload, "categoryName") || item.category?.name || "";
}

export function suggestionSubcategoryName(item: CatalogSuggestion): string {
  return payloadValue(item.payload, "subcategoryName") || item.subcategory?.name || "";
}

export function suggestionItemName(item: CatalogSuggestion): string {
  return payloadValue(item.payload, "proposedItem") || item.item?.name || item.rawValue;
}

export function catalogRequestCommentParts(value: string): {
  link: string;
  email: string;
  photoName: string;
  rest: string;
} {
  const result = { link: "", email: "", photoName: "", rest: "" };
  const rest: string[] = [];
  value
    .split(/\n+/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const link = line.match(/^Ссылка:\s*(.+)$/iu);
      if (link) {
        result.link = link[1].trim();
        return;
      }
      const email = line.match(/^Почта:\s*(.+)$/iu);
      if (email) {
        result.email = email[1].trim();
        return;
      }
      const photo = line.match(
        /^Фото\s+(?:товара|наклейки|товара,\s*упаковки\s+или\s+маркировки):\s*(.+)$/iu,
      );
      if (photo) {
        result.photoName = photo[1].trim();
        return;
      }
      if (/^Файл\s+фото:\s*(.+)$/iu.test(line)) {
        return;
      }
      rest.push(line);
    });
  result.rest = rest.join("\n");
  return result;
}

export function catalogRequestReview(item: CatalogSuggestion) {
  const comment = catalogRequestCommentParts(payloadValue(item.payload, "comment"));
  const payloadPhoto = payloadValue(item.payload, "photoName");
  return {
    categoryName: suggestionCategoryName(item),
    subcategoryName: suggestionSubcategoryName(item),
    itemName: suggestionItemName(item),
    brand: payloadValue(item.payload, "brand"),
    model: payloadValue(item.payload, "model"),
    importantAttributes: payloadValue(item.payload, "importantAttributes"),
    link: payloadValue(item.payload, "link") || comment.link,
    email: payloadValue(item.payload, "email") || comment.email || item.proposedBy?.email || "",
    photoName: payloadPhoto || comment.photoName,
    photoLabel: payloadValue(item.payload, "photoLabel"),
    comment: comment.rest,
  };
}

export function catalogRequestPhotoItems(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (/^data:image\//iu.test(trimmed)) return [trimmed];
  return trimmed
    .split(/\n+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isPreviewableImage(value: string): boolean {
  return /^(https?:\/\/|data:image\/|blob:)/iu.test(value);
}

export function catalogRequestPhotoLabel(value: string, fallback: string): string {
  if (fallback.trim()) return fallback.trim();
  return /^data:image\//iu.test(value) ? "Прикреплённое фото" : value;
}

export function parseImportantCharacteristics(value: string): CatalogReferenceCharacteristic[] {
  const text = value.trim();
  if (!text) return [{ label: "", value: "" }];

  const parsed: CatalogReferenceCharacteristic[] = [];
  const leftovers: string[] = [];
  const parts = text
    .split(/\n+|;+/g)
    .flatMap((part) => part.split(/,(?=\s*[^,;:=—-]{2,40}\s*(?::|=|—|-)\s*)/g))
    .map((part) => part.trim())
    .filter(Boolean);

  for (const part of parts) {
    const match = part.match(/^(.{2,80}?)(?:\s*[:=]\s*|\s+[—-]\s+)(.{1,220})$/u);
    if (!match) {
      leftovers.push(part);
      continue;
    }
    const label = match[1].trim();
    const characteristicValue = match[2].trim();
    if (!label || !characteristicValue) {
      leftovers.push(part);
      continue;
    }
    parsed.push({ label, value: characteristicValue });
  }

  if (leftovers.length > 0) {
    parsed.push({
      label: "Важные характеристики",
      value: leftovers.join("; "),
    });
  }

  return parsed.length > 0 ? parsed : [{ label: "Важные характеристики", value: text }];
}

export function approvalFormForSuggestion(item: CatalogSuggestion): ApprovalForm {
  const importantAttributes = payloadValue(item.payload, "importantAttributes");
  const brandName = payloadValue(item.payload, "brand");
  const modelName = payloadValue(item.payload, "model");
  const proposedItem = payloadValue(item.payload, "proposedItem") || item.rawValue;
  return {
    categoryId: item.category?.id ?? "",
    categoryName: payloadValue(item.payload, "categoryName") || item.category?.name || "",
    subcategoryId: item.subcategory?.id ?? "",
    subcategoryName:
      payloadValue(item.payload, "subcategoryName") || item.subcategory?.name || "",
    itemName: proposedItem,
    brandName,
    modelName,
    characteristics: parseImportantCharacteristics(importantAttributes),
    adminNote: item.adminNote ?? "",
  };
}

export function sortByIds(nodes: CatalogNode[], orderedIds: string[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return orderedIds.map((id) => byId.get(id)).filter((node): node is CatalogNode => Boolean(node));
}
