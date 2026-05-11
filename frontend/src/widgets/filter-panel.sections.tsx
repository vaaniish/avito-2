import { ChevronDown, ChevronRight, Star } from "lucide-react";
import type { FilterState } from "../shared/types";
import { FILTER_PANEL_RATINGS } from "./filter-panel.constants";
import type { CatalogCategory, CatalogItem, CatalogSubcategory } from "./filter-panel.types";

export function FilterPanelSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-200 pb-6 mb-6">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full mb-4"
      >
        <span className="text-lg text-gray-900">{title}</span>
        <ChevronDown
          className={`w-6 h-6 text-gray-500 transition-transform duration-300 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {isOpen ? children : null}
    </div>
  );
}

export function FilterPanelCategoriesSection({
  isOpen,
  onToggleOpen,
  categories,
  filters,
  expandedCategories,
  expandedSubcategories,
  catalogItemsForSubcategory,
  catalogItemIdsForCategory,
  onToggleMainCategory,
  onToggleSubcategoryExpansion,
  onToggleMainCategorySelection,
  onToggleSubCategorySelection,
  onToggleCategorySelection,
}: {
  isOpen: boolean;
  onToggleOpen: () => void;
  categories: CatalogCategory[];
  filters: FilterState;
  expandedCategories: Set<string>;
  expandedSubcategories: Set<string>;
  catalogItemsForSubcategory: (subcategory: CatalogSubcategory) => CatalogItem[];
  catalogItemIdsForCategory: (category: CatalogCategory) => string[];
  onToggleMainCategory: (categoryId: string) => void;
  onToggleSubcategoryExpansion: (subcategoryId: string) => void;
  onToggleMainCategorySelection: (category: CatalogCategory) => void;
  onToggleSubCategorySelection: (subcategory: CatalogSubcategory) => void;
  onToggleCategorySelection: (categoryName: string) => void;
}) {
  return (
    <FilterPanelSection title="Категории" isOpen={isOpen} onToggle={onToggleOpen}>
      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-sm text-gray-500">
            Категории загружаются...
          </div>
        ) : null}

        {categories.map((category) => {
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
                  onChange={() => onToggleMainCategorySelection(category)}
                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer flex-shrink-0"
                />
                <button
                  type="button"
                  onClick={() => onToggleMainCategory(category.id)}
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

              {isExpanded && category.subcategories.length > 0 ? (
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
                            onChange={() => onToggleSubCategorySelection(subcategory)}
                            className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer flex-shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => onToggleSubcategoryExpansion(subcategory.id)}
                            className="w-full flex items-center gap-2"
                          >
                            <span className="text-sm text-gray-700 text-left flex-1">
                              {subcategory.name}
                            </span>
                            <ChevronRight
                              className={`w-3 h-3 text-gray-400 transition-transform duration-200 flex-shrink-0 ${
                                isSubExpanded ? "rotate-90" : ""
                              }`}
                            />
                          </button>
                        </div>

                        {isSubExpanded && subcategoryItems.length > 0 ? (
                          <div className="ml-4 space-y-1">
                            {subcategoryItems.map((item) => (
                              <label
                                key={`${subcategory.id}-${item.id}`}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer group"
                              >
                                <input
                                  type="checkbox"
                                  checked={filters.categories.includes(item.id)}
                                  onChange={() => onToggleCategorySelection(item.id)}
                                  className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 cursor-pointer flex-shrink-0"
                                />
                                <span className="text-sm text-gray-600 group-hover:text-gray-900 transition-colors duration-200">
                                  {item.name}
                                  {typeof item.count === "number" ? (
                                    <span className="ml-1 text-gray-400">({item.count})</span>
                                  ) : null}
                                </span>
                              </label>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </FilterPanelSection>
  );
}

export function FilterPanelPriceSection({
  isOpen,
  onToggleOpen,
  priceRange,
  onMinPriceChange,
  onMaxPriceChange,
}: {
  isOpen: boolean;
  onToggleOpen: () => void;
  priceRange: [number, number];
  onMinPriceChange: (value: number) => void;
  onMaxPriceChange: (value: number) => void;
}) {
  return (
    <FilterPanelSection title="Цена" isOpen={isOpen} onToggle={onToggleOpen}>
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1 block">От</label>
            <input
              type="number"
              value={priceRange[0]}
              onChange={(event) => onMinPriceChange(Number(event.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
            />
          </div>
          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1 block">До</label>
            <input
              type="number"
              value={priceRange[1]}
              onChange={(event) => onMaxPriceChange(Number(event.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
            />
          </div>
        </div>
      </div>
    </FilterPanelSection>
  );
}

export function FilterPanelRatingSection({
  isOpen,
  onToggleOpen,
  minRating,
  onMinRatingChange,
}: {
  isOpen: boolean;
  onToggleOpen: () => void;
  minRating: number;
  onMinRatingChange: (rating: number) => void;
}) {
  return (
    <FilterPanelSection title="Рейтинг" isOpen={isOpen} onToggle={onToggleOpen}>
      <div className="space-y-3">
        {FILTER_PANEL_RATINGS.map((rating) => (
          <label key={rating} className="flex items-center gap-3 cursor-pointer group">
            <input
              type="radio"
              name="rating"
              checked={minRating === rating}
              onChange={() => onMinRatingChange(rating)}
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
            checked={minRating === 0}
            onChange={() => onMinRatingChange(0)}
            className="w-5 h-5 text-gray-900 focus:ring-gray-900 cursor-pointer"
          />
          <span className="text-base text-gray-700 group-hover:text-gray-900 transition-colors duration-200">
            Все рейтинги
          </span>
        </label>
      </div>
    </FilterPanelSection>
  );
}

export function FilterPanelConditionSection({
  condition,
  onConditionChange,
}: {
  condition: FilterState["condition"];
  onConditionChange: (condition: FilterState["condition"]) => void;
}) {
  return (
    <div className="border-b border-gray-200 pb-6 mb-6">
      <span className="text-lg text-gray-900 mb-4 block">Состояние</span>
      <div className="space-y-3">
        {[
          { value: "all" as const, label: "Все" },
          { value: "new" as const, label: "Новое" },
          { value: "used" as const, label: "Б/У" },
        ].map((option) => (
          <label key={option.value} className="flex items-center gap-3 cursor-pointer group">
            <input
              type="radio"
              name="condition"
              checked={condition === option.value}
              onChange={() => onConditionChange(option.value)}
              className="w-5 h-5 text-gray-900 focus:ring-gray-900 cursor-pointer"
            />
            <span className="text-base text-gray-700">{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function FilterPanelWordsSection({
  includeWords,
  excludeWords,
  onIncludeWordsChange,
  onExcludeWordsChange,
}: {
  includeWords: string;
  excludeWords: string;
  onIncludeWordsChange: (value: string) => void;
  onExcludeWordsChange: (value: string) => void;
}) {
  return (
    <div className="border-b border-gray-200 pb-6 mb-6">
      <span className="text-lg text-gray-900 mb-4 block">Фильтр по словам</span>
      <div className="space-y-4">
        <div>
          <label className="text-sm text-gray-600 mb-1.5 block">Разрешенные слова</label>
          <input
            type="text"
            value={includeWords}
            onChange={(event) => onIncludeWordsChange(event.target.value)}
            placeholder="Слова через пробел"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
          />
        </div>
        <div>
          <label className="text-sm text-gray-600 mb-1.5 block">Запрещенные слова</label>
          <input
            type="text"
            value={excludeWords}
            onChange={(event) => onExcludeWordsChange(event.target.value)}
            placeholder="Слова через пробел"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 text-base"
          />
        </div>
      </div>
    </div>
  );
}
