export type CatalogSuggestionStatus =
  | "pending"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "merged";

export type CatalogType = "products";
export type StatusFilter = "all" | CatalogSuggestionStatus;
export type CatalogNodeKind = "category" | "subcategory" | "item";
export type CatalogEditorScope = "all" | "categories" | "subcategories" | "items";

export type CatalogSuggestion = {
  id: string;
  entityType: "category" | "subcategory" | "item" | string;
  status: CatalogSuggestionStatus;
  type: CatalogType;
  rawValue: string;
  normalizedValue: string;
  reason: string | null;
  payload: unknown;
  adminNote: string | null;
  usageCount: number;
  mergedTargetPublicId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  category: { id: string; name: string; type: string } | null;
  subcategory: { id: string; name: string } | null;
  item: { id: string; name: string } | null;
  proposedBy: { id: string; name: string; email: string } | null;
};

export type CatalogItem = {
  id: string;
  name: string;
  orderIndex: number;
  listingCount: number;
};

export type CatalogSubcategory = {
  id: string;
  name: string;
  orderIndex: number;
  itemCount: number;
  items: CatalogItem[];
};

export type CatalogCategory = {
  id: string;
  type: CatalogType;
  name: string;
  iconKey: string;
  orderIndex: number;
  subcategories: CatalogSubcategory[];
};

export type CatalogReferenceCharacteristic = {
  id?: number;
  label: string;
  value: string;
};

export type ApprovalForm = {
  categoryId: string;
  categoryName: string;
  subcategoryId: string;
  subcategoryName: string;
  itemName: string;
  brandName: string;
  modelName: string;
  characteristics: CatalogReferenceCharacteristic[];
  adminNote: string;
};

export type CatalogEditTarget =
  | { kind: "category"; category?: { id: string; name: string; iconKey?: string } }
  | { kind: "subcategory"; categoryId: string; subcategory?: { id: string; name: string } }
  | { kind: "item"; subcategoryId: string; item?: { id: string; name: string } };

export type CatalogNode = {
  kind: CatalogNodeKind;
  id: string;
  name: string;
  type: CatalogType;
  path: string;
  orderIndex: number;
  categoryId?: string;
  categoryName?: string;
  iconKey?: string;
  subcategoryId?: string;
  subcategoryName?: string;
  childCount?: number;
  listingCount?: number;
};

export type CatalogReferenceProduct = {
  id: string;
  title: string;
  characteristics: CatalogReferenceCharacteristic[];
};

export type CatalogReferenceModel = {
  id: string;
  name: string;
  products: CatalogReferenceProduct[];
};

export type CatalogReferenceBrand = {
  id: string;
  name: string;
  models: CatalogReferenceModel[];
};

export type CatalogReferenceResponse = {
  item: { id: string; name: string };
  brands: CatalogReferenceBrand[];
};

export type CatalogSearchResponse = {
  items: CatalogNode[];
  limit: number;
  query: string;
  scope: CatalogEditorScope;
};

export type DeleteTarget = {
  kind: CatalogNodeKind;
  id: string;
  name: string;
};
