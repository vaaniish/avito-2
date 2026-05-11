import { apiDelete, apiGet, apiPatch, apiPost } from "../../../shared/lib/api";
import { PRODUCT_TYPE } from "./catalog-suggestions.constants";
import type {
  ApprovalForm,
  CatalogCategory,
  CatalogEditorScope,
  CatalogNode,
  CatalogNodeKind,
  CatalogReferenceCharacteristic,
  CatalogReferenceResponse,
  CatalogSearchResponse,
  CatalogSuggestion,
  CatalogSuggestionStatus,
} from "./catalog-suggestions.types";

export function fetchCatalogSuggestions(): Promise<CatalogSuggestion[]> {
  return apiGet<CatalogSuggestion[]>("/admin/catalog-suggestions");
}

export function fetchCatalogCategories(): Promise<CatalogCategory[]> {
  return apiGet<CatalogCategory[]>("/admin/catalog?type=products");
}

export async function searchCatalogNodes(options: {
  query?: string;
  scope: CatalogEditorScope;
  categoryId?: string;
  subcategoryId?: string;
}): Promise<CatalogNode[]> {
  const params = new URLSearchParams();
  params.set("type", PRODUCT_TYPE);
  params.set("q", options.query ?? "");
  params.set("scope", options.scope);
  params.set("limit", "80");
  if (options.categoryId) params.set("categoryId", options.categoryId);
  if (options.subcategoryId) params.set("subcategoryId", options.subcategoryId);

  const response = await apiGet<CatalogSearchResponse>(
    `/admin/catalog/search?${params.toString()}`,
  );
  return response.items;
}

export function fetchCatalogReference(itemId: string): Promise<CatalogReferenceResponse> {
  return apiGet<CatalogReferenceResponse>(
    `/admin/catalog/items/${encodeURIComponent(itemId)}/reference`,
  );
}

export function createCatalogReferenceBrand(itemId: string, name: string): Promise<unknown> {
  return apiPost(`/admin/catalog/items/${encodeURIComponent(itemId)}/reference/brands`, {
    name,
  });
}

export function deleteCatalogReferenceEntity(path: string): Promise<unknown> {
  return apiDelete(path);
}

export function deleteCatalogReferenceCharacteristic(id: number): Promise<unknown> {
  return apiDelete(`/admin/catalog/reference/characteristics/${encodeURIComponent(String(id))}`);
}

export function createCatalogReferenceModel(
  brandId: string,
  name: string,
): Promise<unknown> {
  return apiPost(`/admin/catalog/reference/brands/${encodeURIComponent(brandId)}/models`, {
    name,
  });
}

export function createCatalogReferenceProduct(params: {
  modelId: string;
  title: string;
  characteristics: CatalogReferenceCharacteristic[];
}): Promise<unknown> {
  return apiPost(`/admin/catalog/reference/models/${encodeURIComponent(params.modelId)}/products`, {
    title: params.title,
    characteristics: params.characteristics,
  });
}

export function updateCatalogSuggestion(params: {
  id: string;
  status: "approved" | "rejected" | "merged";
  adminNote?: string;
  mergedTargetPublicId?: string;
  approval?: ApprovalForm;
}): Promise<{ success: boolean }> {
  return apiPatch<{ success: boolean }>(
    `/admin/catalog-suggestions/${encodeURIComponent(params.id)}`,
    {
      status: params.status,
      adminNote: params.adminNote || undefined,
      mergedTargetPublicId: params.mergedTargetPublicId || undefined,
      approval: params.approval
        ? {
            type: PRODUCT_TYPE,
            categoryId: params.approval.categoryId || undefined,
            categoryName: params.approval.categoryName || undefined,
            subcategoryId: params.approval.subcategoryId || undefined,
            subcategoryName: params.approval.subcategoryName || undefined,
            itemName: params.approval.itemName || undefined,
          }
        : undefined,
    },
  );
}

export function approveCatalogReferenceSuggestion(params: {
  suggestionId: string;
  approval: ApprovalForm;
  characteristics: CatalogReferenceCharacteristic[];
}): Promise<{
  success: boolean;
  suggestionStatus: CatalogSuggestionStatus;
  item: { id: string; name: string };
  brand: { id: string; name: string };
  model: { id: string; name: string };
  product: { id: string; title: string };
}> {
  return apiPost(
    `/admin/catalog-suggestions/${encodeURIComponent(params.suggestionId)}/approve-reference`,
    {
      approval: {
        type: PRODUCT_TYPE,
        categoryId: params.approval.categoryId || undefined,
        categoryName: params.approval.categoryName || undefined,
        subcategoryId: params.approval.subcategoryId || undefined,
        subcategoryName: params.approval.subcategoryName || undefined,
        itemName: params.approval.itemName,
      },
      reference: {
        brandName: params.approval.brandName,
        modelName: params.approval.modelName,
        productTitle: params.approval.modelName,
        characteristics: params.characteristics,
      },
      adminNote: params.approval.adminNote || undefined,
    },
  );
}

export function saveCatalogCategory(params: {
  id?: string;
  name: string;
  iconKey: string;
}): Promise<unknown> {
  if (params.id) {
    return apiPatch(`/admin/catalog/categories/${encodeURIComponent(params.id)}`, {
      name: params.name,
      iconKey: params.iconKey,
    });
  }
  return apiPost("/admin/catalog/categories", {
    type: PRODUCT_TYPE,
    name: params.name,
    iconKey: params.iconKey,
  });
}

export function saveCatalogSubcategory(params: {
  id?: string;
  categoryId: string;
  name: string;
}): Promise<unknown> {
  if (params.id) {
    return apiPatch(`/admin/catalog/subcategories/${encodeURIComponent(params.id)}`, {
      name: params.name,
      categoryId: params.categoryId,
    });
  }
  return apiPost("/admin/catalog/subcategories", {
    categoryId: params.categoryId,
    name: params.name,
  });
}

export function saveCatalogItem(params: {
  id?: string;
  subcategoryId: string;
  name: string;
}): Promise<unknown> {
  if (params.id) {
    return apiPatch(`/admin/catalog/items/${encodeURIComponent(params.id)}`, {
      name: params.name,
      subcategoryId: params.subcategoryId,
    });
  }
  return apiPost("/admin/catalog/items", {
    subcategoryId: params.subcategoryId,
    name: params.name,
  });
}

export function deleteCatalogEntity(kind: CatalogNodeKind, id: string): Promise<unknown> {
  const path =
    kind === "category"
      ? `/admin/catalog/categories/${encodeURIComponent(id)}`
      : kind === "subcategory"
        ? `/admin/catalog/subcategories/${encodeURIComponent(id)}`
        : `/admin/catalog/items/${encodeURIComponent(id)}`;
  return apiDelete(path);
}

export function reorderCatalogNodes(
  kind: CatalogNodeKind,
  orderedIds: string[],
): Promise<unknown> {
  return apiPatch("/admin/catalog/reorder", { kind, orderedIds });
}
