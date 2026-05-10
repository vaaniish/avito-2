import type {
  CatalogNodeKind,
  CatalogSuggestionStatus,
  CatalogType,
} from "./catalog-suggestions.types";

export const PRODUCT_TYPE: CatalogType = "products";
export const CATALOG_ORDER_UPDATED_EVENT = "catalog-order-updated";

export const statusLabels: Record<CatalogSuggestionStatus, string> = {
  pending: "Ожидает",
  auto_approved: "Авто-одобрено",
  approved: "Одобрено",
  rejected: "Отклонено",
  merged: "Объединено",
};

export const payloadLabels: Record<string, string> = {
  categoryName: "Категория предложенная",
  subcategoryName: "Подкатегория предложенная",
  proposedItem: "Вид товара предложенный",
  importantAttributes: "Важные характеристики",
  comment: "Комментарий модератору",
  link: "Ссылка на описание",
  email: "Почта продавца",
  photoName: "Фото",
  photoLabel: "Файл фото",
  listingPublicId: "Объявление",
  title: "Название объявления",
  brand: "Бренд (legacy)",
  model: "Модель (legacy)",
  manufacturerCode: "Код производителя (legacy)",
};

export const catalogKindLabels: Record<CatalogNodeKind, string> = {
  category: "категорию",
  subcategory: "подкатегорию",
  item: "вид товара",
};
