import type { FilterState } from "../shared/types";

export const FILTER_PANEL_RESET_STATE: FilterState = {
  categories: [],
  priceRange: [0, 500000],
  minRating: 0,
  searchQuery: "",
  showOnlySale: false,
  condition: "all",
  includeWords: "",
  excludeWords: "",
};

export const FILTER_PANEL_RATINGS = [4.5, 4.0, 3.5, 3.0] as const;
