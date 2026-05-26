export const CATALOG_ORDER_UPDATED_EVENT = "catalog-order-updated";

export function dispatchCatalogOrderUpdated(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent(CATALOG_ORDER_UPDATED_EVENT));

  try {
    window.localStorage.setItem(CATALOG_ORDER_UPDATED_EVENT, String(Date.now()));
  } catch {
    // no-op
  }
}
