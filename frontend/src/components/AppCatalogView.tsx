import { SlidersHorizontal } from "lucide-react";
import { Hero } from "./Hero";
import { ProductGrid } from "./ProductGrid";
import { FilterPanel, type CatalogCategory } from "./FilterPanel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import type { CartItem, FilterState, Product } from "../types";

type AppCatalogViewProps = {
  isSearchActive: boolean;
  filters: FilterState;
  viewMode: "products" | "services";
  categories: CatalogCategory[];
  sortedItems: Product[];
  hasMoreItems: boolean;
  isLoadingMoreItems: boolean;
  cartItems: CartItem[];
  sortBy: string;
  wishlistProductIds: Set<string>;
  onBannerClick: (category: string) => void;
  onFilterChange: (newFilters: FilterState) => void;
  onViewModeChange: (nextMode: "products" | "services") => void;
  onLoadMoreCatalogItems: () => void;
  onProductClick: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onSortChange: (sortBy: string) => void;
  onWishlistToggle: (productId: string, isWishlisted: boolean) => void;
};

export function AppCatalogView({
  isSearchActive,
  filters,
  viewMode,
  categories,
  sortedItems,
  hasMoreItems,
  isLoadingMoreItems,
  cartItems,
  sortBy,
  wishlistProductIds,
  onBannerClick,
  onFilterChange,
  onViewModeChange,
  onLoadMoreCatalogItems,
  onProductClick,
  onAddToCart,
  onUpdateQuantity,
  onSortChange,
  onWishlistToggle,
}: AppCatalogViewProps) {
  return (
    <>
      {!isSearchActive && <Hero onBannerClick={onBannerClick} />}

      <div className="page-container pb-14 sm:pb-16">
        <div className="lg:hidden mb-6">
          <Sheet>
            <SheetTrigger asChild>
              <button className="btn-primary flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold sm:text-base">
                <SlidersHorizontal className="w-5 h-5" />
                <span>Фильтры</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-full sm:w-96 overflow-y-auto"
            >
              <SheetTitle className="sr-only">Фильтры товаров</SheetTitle>
              <SheetDescription className="sr-only">
                Фильтрация товаров по категориям, цене и рейтингу
              </SheetDescription>
              <FilterPanel
                filters={filters}
                onFilterChange={onFilterChange}
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                categories={categories}
                onApplyFilters={() => {
                  const closeButton = document.querySelector(
                    '[data-slot="sheet-close"]',
                  ) as HTMLButtonElement | null;
                  closeButton?.click();
                }}
              />
            </SheetContent>
          </Sheet>
        </div>

        <div className="mt-6 flex gap-6 lg:mt-8 lg:items-start lg:gap-12 xl:gap-14">
          <aside className="hidden w-80 flex-shrink-0 self-start lg:block">
            <FilterPanel
              filters={filters}
              onFilterChange={onFilterChange}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              categories={categories}
            />
          </aside>

          <main className="min-w-0 flex-1">
            <ProductGrid
              products={sortedItems}
              hasMore={hasMoreItems}
              isLoadingMore={isLoadingMoreItems}
              onLoadMore={onLoadMoreCatalogItems}
              onProductClick={onProductClick}
              onAddToCart={onAddToCart}
              onUpdateQuantity={onUpdateQuantity}
              cartItems={cartItems}
              sortBy={sortBy}
              onSortChange={onSortChange}
              viewMode={viewMode}
              wishlistProductIds={wishlistProductIds}
              onWishlistToggle={onWishlistToggle}
            />
          </main>
        </div>
      </div>
    </>
  );
}
