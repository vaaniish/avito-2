import type { FilterState, Product } from "../shared/types";

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_BACKWARD_WINDOW_PAGES = 3;
export const CATALOG_FORWARD_WINDOW_PAGES = 3;
export const CATALOG_MEMORY_WINDOW_PAGES =
  CATALOG_BACKWARD_WINDOW_PAGES + 1 + CATALOG_FORWARD_WINDOW_PAGES;

export type CatalogPagesByOffset = Record<number, Product[]>;
export type CatalogOffsetWindow = {
  activeOffset: number;
  totalCount: number;
};

export function buildCatalogRequestKey(params: {
  filters: FilterState;
  selectedCatalogItemId: string | null;
  sortBy: string;
}): string {
  return JSON.stringify({
    filters: params.filters,
    selectedCatalogItemId: params.selectedCatalogItemId,
    sortBy: params.sortBy,
  });
}

export function sortCatalogOffsets(offsets: number[]): number[] {
  return Array.from(new Set(offsets)).sort((left, right) => left - right);
}

export function buildCatalogOffsetRange(totalCount: number): number[] {
  if (totalCount <= 0) {
    return [];
  }

  const lastOffset = Math.max(0, Math.floor((totalCount - 1) / CATALOG_PAGE_SIZE) * CATALOG_PAGE_SIZE);
  const offsets: number[] = [];
  for (let offset = 0; offset <= lastOffset; offset += CATALOG_PAGE_SIZE) {
    offsets.push(offset);
  }
  return offsets;
}

export function getCatalogWindowOffsets(params: CatalogOffsetWindow): number[] {
  const totalOffsets = buildCatalogOffsetRange(params.totalCount);
  if (totalOffsets.length === 0) {
    return [0];
  }

  const firstOffset = Math.max(0, params.activeOffset - CATALOG_BACKWARD_WINDOW_PAGES * CATALOG_PAGE_SIZE);
  const lastOffset = params.activeOffset + CATALOG_FORWARD_WINDOW_PAGES * CATALOG_PAGE_SIZE;

  return totalOffsets.filter((offset) => offset >= firstOffset && offset <= lastOffset);
}

export function trimCatalogOffsets(offsets: number[], params: CatalogOffsetWindow): number[] {
  const sorted = sortCatalogOffsets(offsets);
  const allowedOffsets = new Set(getCatalogWindowOffsets(params));
  return sorted.filter((offset) => allowedOffsets.has(offset));
}

export function getCatalogLoadedItemCount(
  pagesByOffset: CatalogPagesByOffset,
  loadedOffsets: number[],
): number {
  return loadedOffsets.reduce((total, offset) => total + (pagesByOffset[offset]?.length ?? 0), 0);
}

export function flattenCatalogPages(
  pagesByOffset: CatalogPagesByOffset,
  loadedOffsets: number[],
): Product[] {
  return loadedOffsets.flatMap((offset) => pagesByOffset[offset] ?? []);
}
