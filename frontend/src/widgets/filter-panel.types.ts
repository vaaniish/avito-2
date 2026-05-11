import type { FilterState } from "../shared/types";

export type CatalogSubcategory = {
  id: string;
  name: string;
  items: string[];
  catalogItems?: CatalogItem[];
};

export type CatalogItem = {
  id: string;
  name: string;
  count: number;
  categoryId: string;
  subcategoryId: string;
};

export type CatalogCategory = {
  id: string;
  name: string;
  icon_key: string;
  count?: number;
  subcategories: CatalogSubcategory[];
};

export type FilterPanelProps = {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  viewMode: "products";
  onViewModeChange: (mode: "products") => void;
  categories: CatalogCategory[];
  onApplyFilters?: () => void;
};
