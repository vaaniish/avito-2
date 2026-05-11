import { useMemo, useState } from "react";
import { FILTER_PANEL_RESET_STATE } from "./filter-panel.constants";
import {
  FilterPanelCategoriesSection,
  FilterPanelConditionSection,
  FilterPanelPriceSection,
  FilterPanelRatingSection,
  FilterPanelWordsSection,
} from "./filter-panel.sections";
import type {
  CatalogCategory,
  CatalogItem,
  CatalogSubcategory,
  FilterPanelProps,
} from "./filter-panel.types";
import {
  buildCatalogItemsForSubcategory,
  getCatalogItemIdsForCategory,
  getCatalogItemIdsForSubcategory,
  toggleSetValue,
} from "./filter-panel.utils";

export type { CatalogCategory, CatalogItem, CatalogSubcategory } from "./filter-panel.types";

export function FilterPanel({
  filters,
  onFilterChange,
  viewMode: _viewMode,
  onViewModeChange: _onViewModeChange,
  categories,
  onApplyFilters,
}: FilterPanelProps) {
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());
  const [priceOpen, setPriceOpen] = useState(true);
  const [ratingOpen, setRatingOpen] = useState(true);

  const categoryTree = useMemo(() => categories, [categories]);

  const updateFilters = (updater: (current: FilterPanelProps["filters"]) => FilterPanelProps["filters"]) => {
    onFilterChange(updater(filters));
  };

  const toggleMainCategory = (categoryId: string) => {
    setExpandedCategories((previous) => toggleSetValue(previous, categoryId));
  };

  const toggleSubcategoryExpansion = (subcategoryId: string) => {
    setExpandedSubcategories((previous) => toggleSetValue(previous, subcategoryId));
  };

  const toggleCategorySelection = (categoryName: string) => {
    const nextCategories = filters.categories.includes(categoryName)
      ? filters.categories.filter((category) => category !== categoryName)
      : [...filters.categories, categoryName];
    onFilterChange({ ...filters, categories: nextCategories });
  };

  const toggleMainCategorySelection = (category: CatalogCategory) => {
    const categoryItems = getCatalogItemIdsForCategory(category);
    const areAllSelected =
      categoryItems.length > 0 &&
      categoryItems.every((itemId) => filters.categories.includes(itemId));
    const nextCategories = areAllSelected
      ? filters.categories.filter((itemId) => !categoryItems.includes(itemId))
      : [...new Set([...filters.categories, ...categoryItems])];
    onFilterChange({ ...filters, categories: nextCategories });
  };

  const toggleSubCategorySelection = (subcategory: CatalogSubcategory) => {
    const subcategoryItems = getCatalogItemIdsForSubcategory(subcategory);
    const areAllSelected =
      subcategoryItems.length > 0 &&
      subcategoryItems.every((item) => filters.categories.includes(item));
    const nextCategories = areAllSelected
      ? filters.categories.filter((category) => !subcategoryItems.includes(category))
      : [...new Set([...filters.categories, ...subcategoryItems])];
    onFilterChange({ ...filters, categories: nextCategories });
  };

  const handleResetFilters = () => {
    onFilterChange(FILTER_PANEL_RESET_STATE);
    setExpandedCategories(new Set());
    setExpandedSubcategories(new Set());
    onApplyFilters?.();
  };

  return (
    <div
      className="w-full bg-white px-4 pb-4 pt-12 lg:w-80 lg:rounded-2xl lg:border lg:border-gray-200 lg:px-[21px] lg:pb-[21px] lg:pt-4 lg:shadow-sm"
    >
      <FilterPanelCategoriesSection
        isOpen={categoriesOpen}
        onToggleOpen={() => setCategoriesOpen((previous) => !previous)}
        categories={categoryTree}
        filters={filters}
        expandedCategories={expandedCategories}
        expandedSubcategories={expandedSubcategories}
        catalogItemsForSubcategory={buildCatalogItemsForSubcategory}
        catalogItemIdsForCategory={getCatalogItemIdsForCategory}
        onToggleMainCategory={toggleMainCategory}
        onToggleSubcategoryExpansion={toggleSubcategoryExpansion}
        onToggleMainCategorySelection={toggleMainCategorySelection}
        onToggleSubCategorySelection={toggleSubCategorySelection}
        onToggleCategorySelection={toggleCategorySelection}
      />

      <FilterPanelPriceSection
        isOpen={priceOpen}
        onToggleOpen={() => setPriceOpen((previous) => !previous)}
        priceRange={filters.priceRange}
        onMinPriceChange={(value) =>
          updateFilters((current) => ({
            ...current,
            priceRange: [value, current.priceRange[1]],
          }))
        }
        onMaxPriceChange={(value) =>
          updateFilters((current) => ({
            ...current,
            priceRange: [current.priceRange[0], value],
          }))
        }
      />

      <FilterPanelRatingSection
        isOpen={ratingOpen}
        onToggleOpen={() => setRatingOpen((previous) => !previous)}
        minRating={filters.minRating}
        onMinRatingChange={(rating) =>
          updateFilters((current) => ({ ...current, minRating: rating }))
        }
      />

      <FilterPanelConditionSection
        condition={filters.condition}
        onConditionChange={(condition) =>
          updateFilters((current) => ({ ...current, condition }))
        }
      />

      <FilterPanelWordsSection
        includeWords={filters.includeWords || ""}
        excludeWords={filters.excludeWords || ""}
        onIncludeWordsChange={(value) =>
          updateFilters((current) => ({ ...current, includeWords: value }))
        }
        onExcludeWordsChange={(value) =>
          updateFilters((current) => ({ ...current, excludeWords: value }))
        }
      />

      <button
        type="button"
        onClick={handleResetFilters}
        className="w-full py-3 text-base border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all duration-300"
      >
        Сбросить фильтры
      </button>
    </div>
  );
}
