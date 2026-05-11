import {
  AppCatalogDesktopFilters,
  AppCatalogGridSection,
  AppCatalogHeroSection,
  AppCatalogMobileFilters,
} from "./app-catalog-view.sections";
import type { AppCatalogViewProps } from "./app-catalog-view.types";

export function AppCatalogView({
  isSearchActive,
  hideHero,
  filters,
  viewMode,
  categories,
  sortedItems,
  hasMoreItems,
  hasPreviousItems,
  isLoadingMoreItems,
  loadedItemCount,
  totalItemCount,
  catalogPageOffsets,
  catalogPagesByOffset,
  loadedCatalogOffsets,
  activeCatalogOffset,
  visibleWindowStartOffset,
  cartItems,
  sortBy,
  wishlistProductIds,
  onBannerClick,
  onFilterChange,
  onViewModeChange,
  onLoadMoreCatalogItems,
  onLoadPreviousCatalogItems,
  onVisibleCatalogOffsetChange,
  onEnsureCatalogOffsetLoaded,
  onProductClick,
  onAddToCart,
  onUpdateQuantity,
  onSortChange,
  onWishlistToggle,
}: AppCatalogViewProps) {
  return (
    <>
      <AppCatalogHeroSection
        hideHero={hideHero}
        isSearchActive={isSearchActive}
        onBannerClick={onBannerClick}
      />

      <div className="page-container pb-14 sm:pb-16">
        <AppCatalogMobileFilters
          filters={filters}
          viewMode={viewMode}
          categories={categories}
          onFilterChange={onFilterChange}
          onViewModeChange={onViewModeChange}
        />

        <div className="mt-6 flex gap-6 lg:mt-8 lg:items-start lg:gap-12 xl:gap-14">
          <AppCatalogDesktopFilters
            filters={filters}
            viewMode={viewMode}
            categories={categories}
            onFilterChange={onFilterChange}
            onViewModeChange={onViewModeChange}
          />

          <AppCatalogGridSection
            sortedItems={sortedItems}
            hasMoreItems={hasMoreItems}
            hasPreviousItems={hasPreviousItems}
            isLoadingMoreItems={isLoadingMoreItems}
            loadedItemCount={loadedItemCount}
            totalItemCount={totalItemCount}
            catalogPageOffsets={catalogPageOffsets}
            catalogPagesByOffset={catalogPagesByOffset}
            loadedCatalogOffsets={loadedCatalogOffsets}
            activeCatalogOffset={activeCatalogOffset}
            visibleWindowStartOffset={visibleWindowStartOffset}
            onLoadMoreCatalogItems={onLoadMoreCatalogItems}
            onLoadPreviousCatalogItems={onLoadPreviousCatalogItems}
            onVisibleCatalogOffsetChange={onVisibleCatalogOffsetChange}
            onEnsureCatalogOffsetLoaded={onEnsureCatalogOffsetLoaded}
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
        </div>
      </div>
    </>
  );
}
