import {
  BookOpen,
  Box,
  Camera,
  ChevronRight,
  Cpu,
  Gamepad2,
  Headphones,
  Home,
  Laptop,
  Monitor,
  Shirt,
  Smartphone,
  Sparkles,
  Tv,
  WashingMachine,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CatalogCategory, CatalogItem, CatalogSubcategory } from "./FilterPanel";

type DnsCatalogOverlayProps = {
  activeCategoryId: string;
  categories: CatalogCategory[];
  onActiveCategoryChange: (categoryId: string) => void;
  onCatalogItemSelect: (item: CatalogItem) => void;
};

const iconByKey: Record<string, LucideIcon> = {
  cpu: Cpu,
  gamepad: Gamepad2,
  headphones: Headphones,
  camera: Camera,
  tv: Tv,
  home: Home,
  laptop: Laptop,
  monitor: Monitor,
  shirt: Shirt,
  smartphone: Smartphone,
  book: BookOpen,
  box: Box,
  sparkles: Sparkles,
  washing_machine: WashingMachine,
  wifi: Wifi,
};

function catalogItemsForSubcategory(subcategory: CatalogSubcategory): CatalogItem[] {
  if (subcategory.catalogItems?.length) return subcategory.catalogItems;
  return subcategory.items.map((name) => ({
    id: name,
    name,
    count: 0,
    categoryId: "",
    subcategoryId: subcategory.id,
  }));
}

function ProductLink({
  product,
  onSelect,
}: {
  product: CatalogItem;
  onSelect: (item: CatalogItem) => void;
}) {
  return (
    <div>
      <button
        className="dns-catalog-product"
        type="button"
        onClick={() => onSelect(product)}
      >
        <span className="dns-catalog-product__title">{product.name}</span>
        <span className="dns-catalog-product__count">({product.count})</span>
      </button>
    </div>
  );
}

function CategoryContent({
  category,
  onCatalogItemSelect,
}: {
  category: CatalogCategory;
  onCatalogItemSelect: (item: CatalogItem) => void;
}) {
  return (
    <div className="dns-catalog-content__inner">
      <div className="dns-catalog-content__header">
        <p className="dns-catalog-content__eyebrow">Каталог товаров</p>
        <h2>{category.name}</h2>
      </div>
      <div className="dns-catalog-sections">
        {category.subcategories.map((subcategory) => {
          const products = catalogItemsForSubcategory(subcategory);
          return (
            <section key={subcategory.id} className="dns-catalog-section">
              <h3>{subcategory.name}</h3>
              <div className="dns-catalog-products">
                {products.map((product) => (
                  <ProductLink
                    key={product.id}
                    product={product}
                    onSelect={onCatalogItemSelect}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function DnsCatalogOverlay({
  activeCategoryId,
  categories,
  onActiveCategoryChange,
  onCatalogItemSelect,
}: DnsCatalogOverlayProps) {
  const activeCategory =
    categories.find((category) => category.id === activeCategoryId) ??
    categories[0];

  if (!activeCategory) {
    return (
      <div className="dns-catalog-overlay" role="dialog" aria-label="Каталог товаров">
        <div className="dns-catalog-empty">Каталог загружается...</div>
      </div>
    );
  }

  return (
    <div className="dns-catalog-overlay" role="dialog" aria-label="Каталог товаров">
      <aside className="dns-catalog-sidebar" aria-label="Разделы каталога">
        {categories.map((category) => {
          const Icon = iconByKey[category.icon_key] ?? Monitor;
          const emojiIcon = category.icon_key.startsWith("emoji:")
            ? category.icon_key.slice("emoji:".length)
            : "";
          const isActive = category.id === activeCategory.id;

          return (
            <button
              key={category.id}
              className={`dns-catalog-category${isActive ? " dns-catalog-category--active" : ""}`}
              type="button"
              onMouseEnter={() => onActiveCategoryChange(category.id)}
              onFocus={() => onActiveCategoryChange(category.id)}
              onClick={() => onActiveCategoryChange(category.id)}
            >
              {emojiIcon ? (
                <span className="dns-catalog-category__icon dns-catalog-category__emoji" aria-hidden="true">
                  {emojiIcon}
                </span>
              ) : (
                <Icon className="dns-catalog-category__icon" aria-hidden="true" />
              )}
              <span>{category.name}</span>
              <ChevronRight className="dns-catalog-category__arrow" aria-hidden="true" />
            </button>
          );
        })}
      </aside>

      <div className="dns-catalog-content">
        <CategoryContent
          category={activeCategory}
          onCatalogItemSelect={onCatalogItemSelect}
        />
      </div>
    </div>
  );
}
