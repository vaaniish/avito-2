import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CatalogCategory } from "../widgets/FilterPanel";
import { notifyError } from "../shared/ui/notifications";
import { apiGet } from "../shared/lib/api";
import type { AppView } from "./app-routing";
import type { FilterState, Product } from "../shared/types";
import {
  buildCatalogOffsetRange,
  buildCatalogRequestKey,
  CATALOG_PAGE_SIZE,
  type CatalogPagesByOffset,
  flattenCatalogPages,
  getCatalogLoadedItemCount,
  getCatalogWindowOffsets,
  trimCatalogOffsets,
} from "./app.catalog.utils";
import { logAppDebug } from "./app.debug";

const CATALOG_ORDER_UPDATED_EVENT = "catalog-order-updated";
type PaginatedCatalogResponse = {
  items: Product[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
  searchMeta?: {
    recognizedQuery: string | null;
    emptyStateMessage?: string;
    branchHints: Array<{
      itemPublicId: string;
      itemName: string;
      subcategoryName: string;
      categoryName: string;
      matchedPhrases: string[];
      suggestions: string[];
    }>;
  };
};

function resolveCatalogItemIds(
  categories: CatalogCategory[],
  selectedValues: string[],
): string[] {
  if (!selectedValues.length) return [];
  const bySelection = new Map<string, Set<string>>();
  for (const category of categories) {
    const categoryItemIds = new Set<string>();
    for (const subcategory of category.subcategories) {
      const catalogItems = subcategory.catalogItems?.length
        ? subcategory.catalogItems
        : subcategory.items.map((item) => ({ id: item, name: item }));
      const subcategoryItemIds = new Set(catalogItems.map((item) => item.id));
      bySelection.set(subcategory.id, subcategoryItemIds);
      bySelection.set(subcategory.name, subcategoryItemIds);
      for (const item of catalogItems) {
        categoryItemIds.add(item.id);
        bySelection.set(item.id, new Set([item.id]));
        bySelection.set(item.name, new Set([item.id]));
      }
    }
    bySelection.set(category.id, categoryItemIds);
    bySelection.set(category.name, categoryItemIds);
  }

  const resolved = new Set<string>();
  for (const value of selectedValues) {
    const itemIds = bySelection.get(value);
    if (!itemIds) {
      resolved.add(value);
      continue;
    }
    for (const itemId of itemIds) {
      resolved.add(itemId);
    }
  }
  return Array.from(resolved);
}

function catalogItemIdSet(categories: CatalogCategory[]): Set<string> {
  const ids = new Set<string>();
  for (const category of categories) {
    for (const subcategory of category.subcategories) {
      const catalogItems = subcategory.catalogItems?.length
        ? subcategory.catalogItems
        : subcategory.items.map((item) => ({ id: item }));
      for (const item of catalogItems) {
        ids.add(item.id);
      }
    }
  }
  return ids;
}

export function useAppCatalogData(params: {
  filters: FilterState;
  sortBy: string;
  selectedCatalogItemId: string | null;
  deepLinkListingId: string | null;
  currentView: AppView;
  onSelectProduct: (product: Product | null) => void;
  onClearDeepLinkListingId: () => void;
  onSetCurrentView: (view: AppView) => void;
  onClearSelectedCatalogItemId: () => void;
  onPruneInvalidFilterCategories: (nextCategories: string[]) => void;
}) {
  const [catalogPagesByOffset, setCatalogPagesByOffset] = useState<CatalogPagesByOffset>({});
  const [loadedOffsets, setLoadedOffsets] = useState<number[]>([]);
  const [activeCatalogOffset, setActiveCatalogOffset] = useState(0);
  const [totalProducts, setTotalProducts] = useState(0);
  const [isDeepLinkListingLoading, setIsDeepLinkListingLoading] = useState(false);
  const [catalogSearchMeta, setCatalogSearchMeta] = useState<PaginatedCatalogResponse["searchMeta"] | null>(null);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productCategories, setProductCategories] = useState<CatalogCategory[]>([]);
  const [catalogCategoriesLoadAttempt, setCatalogCategoriesLoadAttempt] = useState(0);

  const pagesByOffsetRef = useRef<CatalogPagesByOffset>({});
  const loadedOffsetsRef = useRef<number[]>([]);
  const loadingOffsetsRef = useRef(new Set<number>());
  const requestKeyRef = useRef("");
  const activeOffsetRef = useRef(0);
  const totalProductsRef = useRef(0);

  useEffect(() => {
    pagesByOffsetRef.current = catalogPagesByOffset;
  }, [catalogPagesByOffset]);

  useEffect(() => {
    loadedOffsetsRef.current = loadedOffsets;
  }, [loadedOffsets]);

  useEffect(() => {
    activeOffsetRef.current = activeCatalogOffset;
  }, [activeCatalogOffset]);

  useEffect(() => {
    totalProductsRef.current = totalProducts;
  }, [totalProducts]);

  const catalogRequestKey = useMemo(
    () =>
      buildCatalogRequestKey({
        filters: params.filters,
        selectedCatalogItemId: params.selectedCatalogItemId,
        sortBy: params.sortBy,
      }),
    [params.filters, params.selectedCatalogItemId, params.sortBy],
  );

  const loadStaticCatalogData = useCallback(async () => {
    try {
      const productResult = await apiGet<CatalogCategory[]>("/catalog/categories?type=products");
      setProductCategories(productResult);
    } catch (error) {
      console.error(error);
      notifyError("Не удалось загрузить каталог");
    }
  }, []);

  const buildCatalogQuery = useCallback(
    (offset: number) => {
      const paramsQuery = new URLSearchParams({
        type: "products",
        paginated: "1",
        limit: String(CATALOG_PAGE_SIZE),
        offset: String(offset),
        sortBy: params.sortBy,
      });
      if (params.filters.searchQuery.trim()) {
        paramsQuery.set("searchQuery", params.filters.searchQuery.trim());
      }
      paramsQuery.set("minPrice", String(params.filters.priceRange[0]));
      paramsQuery.set("maxPrice", String(params.filters.priceRange[1]));
      paramsQuery.set("minRating", String(params.filters.minRating));
      if (params.filters.showOnlySale) {
        paramsQuery.set("showOnlySale", "1");
      }
      if (params.filters.condition && params.filters.condition !== "all") {
        paramsQuery.set("condition", params.filters.condition);
      }
      if (params.filters.includeWords?.trim()) {
        paramsQuery.set("includeWords", params.filters.includeWords.trim());
      }
      if (params.filters.excludeWords?.trim()) {
        paramsQuery.set("excludeWords", params.filters.excludeWords.trim());
      }
      if (params.selectedCatalogItemId) {
        paramsQuery.set("itemId", params.selectedCatalogItemId);
      } else {
        const selectedItemIds = resolveCatalogItemIds(
          productCategories,
          params.filters.categories,
        );
        if (selectedItemIds.length > 0) {
          paramsQuery.set("itemIds", selectedItemIds.join(","));
        }
      }
      return paramsQuery.toString();
    },
    [params.filters, params.selectedCatalogItemId, params.sortBy, productCategories],
  );

  const loadCatalogPage = useCallback(
    async (offset: number) => {
      if (loadingOffsetsRef.current.has(offset)) return;

      loadingOffsetsRef.current.add(offset);
      setIsLoadingProducts(true);

      const activeRequestKey = catalogRequestKey;

      try {
        const response = await apiGet<PaginatedCatalogResponse>(
          `/catalog/listings?${buildCatalogQuery(offset)}`,
        );
        const page = response.items;

        if (requestKeyRef.current !== activeRequestKey) {
          logAppDebug("catalog", "ignore-stale-page", {
            offset,
            activeRequestKey,
            currentRequestKey: requestKeyRef.current,
          });
          return;
        }

        logAppDebug("catalog", "page-loaded", {
          offset,
          pageSize: page.length,
          total: response.pagination.total,
        });

        totalProductsRef.current = response.pagination.total;
        setTotalProducts(response.pagination.total);
        setHasMoreProducts(response.pagination.hasMore);
        setCatalogSearchMeta(response.searchMeta ?? null);

        setCatalogPagesByOffset((prevPages) => {
          const nextPages: CatalogPagesByOffset = {
            ...prevPages,
            [offset]: page,
          };
          const retainedOffsets = trimCatalogOffsets(
            [...loadedOffsetsRef.current, offset],
            {
              activeOffset: activeOffsetRef.current,
              totalCount: response.pagination.total,
            },
          );
          const retainedPages: CatalogPagesByOffset = {};

          for (const retainedOffset of retainedOffsets) {
            retainedPages[retainedOffset] = nextPages[retainedOffset] ?? [];
          }

          return retainedPages;
        });
        setLoadedOffsets((prevOffsets) => {
          const retainedOffsets = trimCatalogOffsets([...prevOffsets, offset], {
            activeOffset: activeOffsetRef.current,
            totalCount: response.pagination.total,
          });
          loadedOffsetsRef.current = retainedOffsets;
          return retainedOffsets;
        });
      } catch (error) {
        if (requestKeyRef.current === activeRequestKey) {
          console.error(error);
          notifyError("Не удалось загрузить каталог");
        }
      } finally {
        loadingOffsetsRef.current.delete(offset);
        setIsLoadingProducts(loadingOffsetsRef.current.size > 0);
      }
    },
    [buildCatalogQuery, catalogRequestKey],
  );

  useEffect(() => {
    void loadStaticCatalogData();
  }, [catalogCategoriesLoadAttempt, loadStaticCatalogData]);

  useEffect(() => {
    const reloadCatalogOrder = () => {
      void loadStaticCatalogData();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CATALOG_ORDER_UPDATED_EVENT) {
        reloadCatalogOrder();
      }
    };

    window.addEventListener(CATALOG_ORDER_UPDATED_EVENT, reloadCatalogOrder);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CATALOG_ORDER_UPDATED_EVENT, reloadCatalogOrder);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadStaticCatalogData]);

  useEffect(() => {
    if (productCategories.length > 0 || catalogCategoriesLoadAttempt >= 2) {
      return;
    }

    const retryTimer = window.setTimeout(() => {
      setCatalogCategoriesLoadAttempt((attempt) => attempt + 1);
    }, 1000);

    return () => window.clearTimeout(retryTimer);
  }, [catalogCategoriesLoadAttempt, productCategories.length]);

  useEffect(() => {
    requestKeyRef.current = catalogRequestKey;
    loadingOffsetsRef.current.clear();
    pagesByOffsetRef.current = {};
    loadedOffsetsRef.current = [];
    activeOffsetRef.current = 0;
    totalProductsRef.current = 0;
    logAppDebug("catalog", "reset-window", {
      requestKey: catalogRequestKey,
      selectedCatalogItemId: params.selectedCatalogItemId,
      searchQuery: params.filters.searchQuery,
      categoriesCount: params.filters.categories.length,
    });
    setCatalogPagesByOffset({});
    setLoadedOffsets([]);
    setActiveCatalogOffset(0);
    setTotalProducts(0);
    setCatalogSearchMeta(null);
    setHasMoreProducts(true);
    setIsLoadingProducts(false);

    const handler = window.setTimeout(() => {
      void loadCatalogPage(0);
    }, 350);

    return () => {
      window.clearTimeout(handler);
    };
  }, [catalogRequestKey, loadCatalogPage]);

  const ensureCatalogOffsetLoaded = useCallback(
    (offset: number) => {
      if (offset < 0) return;
      if (totalProductsRef.current > 0 && offset >= totalProductsRef.current) return;
      if (pagesByOffsetRef.current[offset]) return;
      if (loadingOffsetsRef.current.has(offset)) return;
      void loadCatalogPage(offset);
    },
    [loadCatalogPage],
  );

  const handleVisibleCatalogOffsetChange = useCallback((offset: number) => {
    if (offset < 0) return;
    if (totalProductsRef.current > 0) {
      const maxOffset = Math.max(
        0,
        Math.floor((totalProductsRef.current - 1) / CATALOG_PAGE_SIZE) * CATALOG_PAGE_SIZE,
      );
      activeOffsetRef.current = Math.min(offset, maxOffset);
      setActiveCatalogOffset(Math.min(offset, maxOffset));
      return;
    }

    activeOffsetRef.current = offset;
    setActiveCatalogOffset(offset);
  }, []);

  useEffect(() => {
    const desiredOffsets = getCatalogWindowOffsets({
      activeOffset: activeCatalogOffset,
      totalCount: totalProducts || CATALOG_PAGE_SIZE * 4,
    });

    for (const offset of desiredOffsets) {
      ensureCatalogOffsetLoaded(offset);
    }

    if (totalProductsRef.current <= 0) {
      return;
    }

    setLoadedOffsets((prevOffsets) => {
      const retainedOffsets = trimCatalogOffsets(prevOffsets, {
        activeOffset: activeCatalogOffset,
        totalCount: totalProductsRef.current,
      });
      if (retainedOffsets.length === prevOffsets.length) {
        return prevOffsets;
      }
      loadedOffsetsRef.current = retainedOffsets;
      return retainedOffsets;
    });
    setCatalogPagesByOffset((prevPages) => {
      const retainedOffsets = trimCatalogOffsets(Object.keys(prevPages).map(Number), {
        activeOffset: activeCatalogOffset,
        totalCount: totalProductsRef.current,
      });
      const nextPages: CatalogPagesByOffset = {};
      for (const retainedOffset of retainedOffsets) {
        if (prevPages[retainedOffset]) {
          nextPages[retainedOffset] = prevPages[retainedOffset];
        }
      }
      return nextPages;
    });
  }, [activeCatalogOffset, ensureCatalogOffsetLoaded, totalProducts]);

  const products = useMemo(
    () => flattenCatalogPages(catalogPagesByOffset, loadedOffsets),
    [catalogPagesByOffset, loadedOffsets],
  );

  const markListingsUnavailable = useCallback((itemIds: string[]) => {
    if (itemIds.length === 0) return;

    const purchasedIds = new Set(itemIds);

    setCatalogPagesByOffset((prevPages) => {
      let hasChanges = false;
      const nextPages: CatalogPagesByOffset = {};

      for (const [offsetKey, page] of Object.entries(prevPages)) {
        const nextPage = page.filter((item) => {
          if (!purchasedIds.has(item.id)) return true;
          hasChanges = true;
          return false;
        });
        nextPages[Number(offsetKey)] = nextPage;
      }

      if (!hasChanges) return prevPages;
      pagesByOffsetRef.current = nextPages;
      return nextPages;
    });
  }, []);

  useEffect(() => {
    if (!params.deepLinkListingId || params.currentView !== "product") return;

    const target = products.find((item) => item.id === params.deepLinkListingId);
    if (target) {
      params.onSelectProduct(target);
      params.onClearDeepLinkListingId();
      setIsDeepLinkListingLoading(false);
      return;
    }

    let cancelled = false;
    setIsDeepLinkListingLoading(true);

    void apiGet<Product>(`/catalog/listings/${encodeURIComponent(params.deepLinkListingId)}`)
      .then((listing) => {
        if (cancelled) return;
        params.onSelectProduct(listing);
        params.onClearDeepLinkListingId();
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load listing by id:", error);
        params.onSelectProduct(null);
        params.onClearDeepLinkListingId();
      })
      .finally(() => {
        if (!cancelled) {
          setIsDeepLinkListingLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    params.currentView,
    params.deepLinkListingId,
    params.onClearDeepLinkListingId,
    params.onSelectProduct,
    products,
  ]);

  useEffect(() => {
    if (productCategories.length === 0) return;

    const validCatalogItemIds = catalogItemIdSet(productCategories);
    if (validCatalogItemIds.size === 0) return;

    if (params.selectedCatalogItemId && !validCatalogItemIds.has(params.selectedCatalogItemId)) {
      logAppDebug("catalog", "invalid-selected-catalog-item", {
        selectedCatalogItemId: params.selectedCatalogItemId,
      });
      params.onClearSelectedCatalogItemId();
      params.onSetCurrentView("home");
    }

    if (params.filters.categories.length === 0) return;

    const nextFilterCategories = params.filters.categories.filter((category) =>
      validCatalogItemIds.has(category),
    );
    if (nextFilterCategories.length === params.filters.categories.length) return;
    params.onPruneInvalidFilterCategories(nextFilterCategories);
  }, [
    params.filters.categories,
    params.onClearSelectedCatalogItemId,
    params.onPruneInvalidFilterCategories,
    params.onSetCurrentView,
    params.selectedCatalogItemId,
    productCategories,
  ]);

  const catalogPageOffsets = useMemo(
    () =>
      totalProducts > 0
        ? buildCatalogOffsetRange(totalProducts)
        : loadedOffsets.length > 0
          ? loadedOffsets
          : [0],
    [loadedOffsets, totalProducts],
  );

  return {
    products,
    productCategories,
    isDeepLinkListingLoading,
    hasMoreProducts,
    hasPreviousProducts: loadedOffsets.length > 0 && loadedOffsets[0] > 0,
    isLoadingProducts,
    loadedProductCount: getCatalogLoadedItemCount(catalogPagesByOffset, loadedOffsets),
    totalProducts,
    catalogSearchMeta,
    catalogPageOffsets,
    catalogPagesByOffset,
    loadedCatalogOffsets: loadedOffsets,
    activeCatalogOffset,
    visibleWindowStartOffset: loadedOffsets[0] ?? 0,
    sortedItems: products,
    markListingsUnavailable,
    handleLoadMoreCatalogItems: () => undefined,
    handleLoadPreviousCatalogItems: () => undefined,
    handleVisibleCatalogOffsetChange,
    ensureCatalogOffsetLoaded,
  };
}
