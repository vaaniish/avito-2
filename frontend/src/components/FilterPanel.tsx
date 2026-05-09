import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Star } from "lucide-react";
import type { FilterState } from "../types";

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

interface FilterPanelProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  viewMode: "products";
  onViewModeChange: (mode: "products") => void;
  categories: CatalogCategory[];
  onApplyFilters?: () => void;
}

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

  const toggleMainCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const toggleSubcategoryExpansion = (subcategoryId: string) => {
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(subcategoryId)) {
        next.delete(subcategoryId);
      } else {
        next.add(subcategoryId);
      }
      return next;
    });
  };

  const toggleCategorySelection = (categoryName: string) => {
    const nextCategories = filters.categories.includes(categoryName)
      ? filters.categories.filter((category) => category !== categoryName)
      : [...filters.categories, categoryName];
    onFilterChange({ ...filters, categories: nextCategories });
  };

  const catalogItemsForSubcategory = (subcategory: CatalogSubcategory): CatalogItem[] => {
    if (subcategory.catalogItems?.length) return subcategory.catalogItems;
    return subcategory.items.map((name) => ({
      id: name,
      name,
      count: 0,
      categoryId: "",
      subcategoryId: subcategory.id,
    }));
  };

  const catalogItemIdsForSubcategory = (subcategory: CatalogSubcategory): string[] =>
    catalogItemsForSubcategory(subcategory).map((item) => item.id);

  const catalogItemIdsForCategory = (category: CatalogCategory): string[] =>
    category.subcategories.flatMap(catalogItemIdsForSubcategory);

  const toggleMainCategorySelection = (category: CatalogCategory) => {
    const categoryItems = catalogItemIdsForCategory(category);
    const areAllSelected =
      categoryItems.length > 0 &&
      categoryItems.every((itemId) => filters.categories.includes(itemId));
    const nextCategories = areAllSelected
      ? filters.categories.filter((itemId) => !categoryItems.includes(itemId))
      : [...new Set([...filters.categories, ...categoryItems])];
    onFilterChange({ ...filters, categories: nextCategories });
  };

  const toggleSubCategorySelection = (subcategory: CatalogSubcategory) => {
    const subcategoryItems = catalogItemIdsForSubcategory(subcategory);
    const areAllSelected =
      subcategoryItems.length > 0 &&
      subcategoryItems.every((item) => filters.categories.includes(item));
    let nextCategories: string[];
    if (areAllSelected) {
      nextCategories = filters.categories.filter((c) => !subcategoryItems.includes(c));
    } else {
      nextCategories = [...new Set([...filters.categories, ...subcategoryItems])];
    }
    onFilterChange({ ...filters, categories: nextCategories });
  };

  const handleResetFilters = () => {
    const reset: FilterState = {
      categories: [],
      priceRange: [0, 500000],
      minRating: 0,
      searchQuery: "",
      showOnlySale: false,
      condition: "all",
      includeWords: "",
      excludeWords: "",
    };
    onFilterChange(reset);
    setExpandedCategories(new Set());
    setExpandedSubcategories(new Set());
    onApplyFilters?.();
  };

  return (
    <div className="lg:sticky lg:top-24 bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-gray-200 w-full lg:w-80 pt-12 lg:pt-[21px] px-4 lg:px-[21px] pb-4 lg:pb-[21px]">
      <div className="border-b border-gray-200 pb-6 mb-6">
        <button
          type="button"
          onClick={() => setCategoriesOpen((prev) => !prev)}
          className="flex items-center justify-between w-full mb-4"
        >
          <span className="text-lg text-gray-900">Категории</span>
          <ChevronDown
            className={`w-6 h-6 text-gray-500 transition-transform duration-300 ${
              categoriesOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {categoriesOpen && (
          <div className="space-y-2">
            {categoryTree.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
                Категории загружаются...
              </div>
            )}

            {categoryTree.map((category) => {
              const isExpanded = expandedCategories.has(category.id);
              const categoryItemIds = catalogItemIdsForCategory(category);
              const areAllCategoryItemsSelected =
                categoryItemIds.length > 0 &&
                categoryItemIds.every((itemId) => filters.categories.includes(itemId));

              return (
                <div key={category.id} className="space-y-1">
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200">
                    <input
                      type="checkbox"
                      checked={areAllCategoryItemsSelected}
                      onChange={() => toggleMainCategorySelection(category)}
                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer flex-shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => toggleMainCategory(category.id)}
                      className="w-full flex items-center gap-2"
                    >
                      <ChevronRight
                        className={`w-4 h-4 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
                          isExpanded ? "rotate-90" : ""
                        }`}
                      />
                      <span className="text-sm text-gray-700 text-left flex-1">{category.name}</span>
                    </button>
                  </div>

                  {isExpanded && category.subcategories.length > 0 && (
                    <div className="ml-6 space-y-1">
                      {category.subcategories.map((subcategory) => {
                        const isSubExpanded = expandedSubcategories.has(subcategory.id);
                        const subcategoryItems = catalogItemsForSubcategory(subcategory);
                        const subcategoryItemIds = subcategoryItems.map((item) => item.id);
                        const areAllItemsSelected =
                          subcategoryItemIds.length > 0 &&
                          subcategoryItemIds.every((item) => filters.categories.includes(item));

                        return (
                          <div key={subcategory.id} className="space-y-1">
                            <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors duration-200">
                              <input
                                type="checkbox"
                                checked={areAllItemsSelected}
                                onChange={() => toggleSubCategorySelection(subcategory)}
                                className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer flex-shrink-0"
                              />
                              <button
                                type="button"
                                onClick={() => toggleSubcategoryExpansion(subcategory.id)}
                                className="w-full flex items-center gap-2"
                              >
                                <span className="text-sm text-gray-700 text-left flex-1">{subcategory.name}</span>
                                <ChevronRight
                                  className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
                                    isSubExpanded ? "rotate-90" : ""
                                  }`}
                                />
                              </button>
                            </div>

                            {isSubExpanded && subcategoryItems.length > 0 && (
                              <div className="ml-4 space-y-1">
                                {subcategoryItems.map((item) => (
                                  <label
                                    key={`${subcategory.id}-${item.id}`}
                                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={filters.categories.includes(item.id)}
                                      onChange={() => toggleCategorySelection(item.id)}
                                      className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer flex-shrink-0"
                                    />
                                    <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors duration-200">
                                      {item.name}
                                      {typeof item.count === "number" && (
                                        <span className="ml-1 text-gray-400">({item.count})</span>
                                      )}
                                    </span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 pb-6 mb-6">
        <button
          type="button"
          onClick={() => setPriceOpen((prev) => !prev)}
          className="flex items-center justify-between w-full mb-4"
        >
          <span className="text-lg text-gray-900">Цена</span>
          <ChevronDown
            className={`w-6 h-6 text-gray-500 transition-transform duration-300 ${
              priceOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {priceOpen && (
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm text-gray-600 mb-1 block">От</label>
                <input
                  type="number"
                  value={filters.priceRange[0]}
                  onChange={(event) => onFilterChange({ ...filters, priceRange: [Number(event.target.value), filters.priceRange[1]] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm text-gray-600 mb-1 block">До</label>
                <input
                  type="number"
                  value={filters.priceRange[1]}
                  onChange={(event) => onFilterChange({ ...filters, priceRange: [filters.priceRange[0], Number(event.target.value)] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 pb-6 mb-6">
        <button
          type="button"
          onClick={() => setRatingOpen((prev) => !prev)}
          className="flex items-center justify-between w-full mb-4"
        >
          <span className="text-lg text-gray-900">Рейтинг</span>
          <ChevronDown
            className={`w-6 h-6 text-gray-500 transition-transform duration-300 ${
              ratingOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {ratingOpen && (
          <div className="space-y-3">
            {[4.5, 4.0, 3.5, 3.0].map((rating) => (
              <label key={rating} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="rating"
                  checked={filters.minRating === rating}
                  onChange={() => onFilterChange({ ...filters, minRating: rating })}
                  className="w-5 h-5 text-gray-900 focus:ring-gray-900 cursor-pointer"
                />
                <div className="flex items-center gap-1">
                  <Star className="w-5 h-5 fill-[rgb(38,83,141)] text-gray-900" />
                  <span className="text-base text-gray-700 group-hover:text-gray-900 transition-colors duration-200">
                    {rating} и выше
                  </span>
                </div>
              </label>
            ))}
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="rating"
                checked={filters.minRating === 0}
                onChange={() => onFilterChange({ ...filters, minRating: 0 })}
                className="w-5 h-5 text-gray-900 focus:ring-gray-900 cursor-pointer"
              />
              <span className="text-base text-gray-700 group-hover:text-gray-900 transition-colors duration-200">
                Все рейтинги
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="border-b border-gray-200 pb-6 mb-6">
          <span className="text-lg text-gray-900 mb-4 block">Состояние</span>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="condition"
                checked={filters.condition === "all"}
                onChange={() => onFilterChange({ ...filters, condition: "all" })}
                className="w-5 h-5 text-gray-900 focus:ring-gray-900 cursor-pointer"
              />
              <span className="text-base text-gray-700">Все</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="condition"
                checked={filters.condition === "new"}
                onChange={() => onFilterChange({ ...filters, condition: "new" })}
                className="w-5 h-5 text-gray-900 focus:ring-gray-900 cursor-pointer"
              />
              <span className="text-base text-gray-700">Новое</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="radio"
                name="condition"
                checked={filters.condition === "used"}
                onChange={() => onFilterChange({ ...filters, condition: "used" })}
                className="w-5 h-5 text-gray-900 focus:ring-gray-900 cursor-pointer"
              />
              <span className="text-base text-gray-700">Б/У</span>
            </label>
          </div>
      </div>

      <div className="border-b border-gray-200 pb-6 mb-6">
        <span className="text-lg text-gray-900 mb-4 block">Фильтр по словам</span>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block">Разрешенные слова</label>
            <input
              type="text"
              value={filters.includeWords || ""}
              onChange={(event) => onFilterChange({ ...filters, includeWords: event.target.value })}
              placeholder="Слова через пробел"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block">Запрещенные слова</label>
            <input
              type="text"
              value={filters.excludeWords || ""}
              onChange={(event) => onFilterChange({ ...filters, excludeWords: event.target.value })}
              placeholder="Слова через пробел"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
            />
          </div>
        </div>
      </div>

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
