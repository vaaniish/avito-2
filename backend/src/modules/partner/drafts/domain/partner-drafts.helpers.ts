export function parseListingType(_value: unknown): "PRODUCT" {
  return "PRODUCT";
}

export function formatDraftPublicId(id: number): string {
  return `DRF-${String(id).padStart(4, "0")}`;
}

export function safeJsonPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function draftToClient(draft: {
  public_id: string;
  title: string | null;
  category_id: number | null;
  subcategory_id: number | null;
  item_id: number | null;
  payload: unknown;
  current_screen: string;
  updated_at: Date;
  created_at: Date;
}) {
  return {
    id: draft.public_id,
    title: draft.title ?? "",
    type: "products",
    categoryId: draft.category_id,
    subcategoryId: draft.subcategory_id,
    itemId: draft.item_id,
    payload: draft.payload,
    currentScreen: draft.current_screen,
    updatedAt: draft.updated_at,
    createdAt: draft.created_at,
  };
}
