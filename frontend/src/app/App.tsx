import { useEffect, useState } from "react";
import {
  useAppCartState,
  useAppCatalogData,
  useAppNavigationHandlers,
  useAppRouteSync,
  useAppSessionState,
} from "./app.hooks";
import { type AppPageShellHeaderProps } from "./AppPageShell";
import { AppRender } from "./app.render";
import type { ProfileTab } from "../pages/profile/profile.models";
import type { AdminPage } from "../pages/admin/AdminPanel";
import type { FilterState, Product } from "../shared/types";
import { parseRoute, type AppView } from "./app-routing";
import { logAppDebug } from "./app.debug";

const DEFAULT_FILTERS: FilterState = {
  categories: [],
  priceRange: [0, 500000],
  minRating: 0,
  searchQuery: "",
  showOnlySale: false,
  condition: "all",
  includeWords: "",
  excludeWords: "",
};

type CatalogMode = "products";

export default function App() {
  const initialRoute = parseRoute(
    window.location.pathname,
    window.location.search,
  );
  const [deepLinkListingId, setDeepLinkListingId] = useState<string | null>(
    initialRoute.listingId,
  );
  const [selectedCatalogItemId, setSelectedCatalogItemId] = useState<string | null>(
    initialRoute.catalogItemId,
  );
  const [deepLinkSellerId, setDeepLinkSellerId] = useState<string | null>(
    initialRoute.sellerId,
  );
  const [sellerBackListingId, setSellerBackListingId] = useState<string | null>(
    null,
  );
  const [productBackSellerId, setProductBackSellerId] = useState<string | null>(
    null,
  );
  const [productBackProfileTab, setProductBackProfileTab] =
    useState<ProfileTab | null>(null);
  const [productBackAdminPage, setProductBackAdminPage] =
    useState<AdminPage | null>(
      initialRoute.productReturnTo === "admin-listings" ? "listings" : null,
    );
  const [currentView, setCurrentView] = useState<AppView>(initialRoute.view);
  const [currentAdminPage, setCurrentAdminPage] = useState<AdminPage>(
    initialRoute.adminPage,
  );
  const [currentProfileTab, setCurrentProfileTab] = useState<ProfileTab>(
    initialRoute.profileTab,
  );

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewMode] = useState<CatalogMode>("products");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<string>("popular");
  const [isSearchActive, setIsSearchActive] = useState(false);

  const scrollToTop = () => {
    const scroll = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    scroll();
    window.requestAnimationFrame(scroll);
  };

  const {
    currentUser,
    isAuthenticated,
    userType,
    wishlistProductIds,
    handleWishlistToggle,
    handleAuthLoginSuccess,
    handleProfileLogout,
    handleAdminLoginSuccess,
    handleAdminLogout,
  } = useAppSessionState({
    currentView,
    currentProfileTab,
    onSetCurrentView: setCurrentView,
    onSetCurrentAdminPage: setCurrentAdminPage,
  });

  useEffect(() => {
    logAppDebug("view", "current-view-changed", {
      currentView,
      currentProfileTab,
      currentAdminPage,
      deepLinkListingId,
      deepLinkSellerId,
    });
  }, [
    currentAdminPage,
    currentProfileTab,
    currentView,
    deepLinkListingId,
    deepLinkSellerId,
  ]);

  const {
    cartItems,
    cartItemCount,
    lastDeliveryType,
    lastOrderIds,
    lastOrderTotal,
    selectedDeliveryType,
    setSelectedDeliveryType,
    requestLoginForCartAccess,
    addToCartUnsafe,
    addToCart,
    updateQuantity,
    handleRemoveUnavailableItems,
    handleOrderCreated,
    handleOrderComplete: handleCartOrderComplete,
  } = useAppCartState({
    isAuthenticated,
    userType,
    currentUserPublicId: currentUser?.public_id ?? null,
    onRequireAuth: () => {
      setCurrentView("auth");
      scrollToTop();
    },
  });

  const {
    products,
    productCategories,
    isDeepLinkListingLoading,
    hasMoreProducts,
    hasPreviousProducts,
    isLoadingProducts,
    loadedProductCount,
    totalProducts,
    catalogPageOffsets,
    catalogPagesByOffset,
    loadedCatalogOffsets,
    activeCatalogOffset,
    visibleWindowStartOffset,
    sortedItems,
    handleLoadMoreCatalogItems,
    handleLoadPreviousCatalogItems,
    handleVisibleCatalogOffsetChange,
    ensureCatalogOffsetLoaded,
    markListingsUnavailable,
  } = useAppCatalogData({
    filters,
    sortBy,
    selectedCatalogItemId,
    deepLinkListingId,
    currentView,
    onSelectProduct: setSelectedProduct,
    onClearDeepLinkListingId: () => setDeepLinkListingId(null),
    onSetCurrentView: setCurrentView,
    onClearSelectedCatalogItemId: () => setSelectedCatalogItemId(null),
    onPruneInvalidFilterCategories: (nextCategories) => {
      setFilters((prev) => ({
        ...prev,
        categories: nextCategories,
      }));
    },
  });

  const handleOrderComplete = (result: {
    orderIds: string[];
    total: number;
    deliveryType: "delivery" | "pickup";
    itemIds: string[];
  }) => {
    handleCartOrderComplete(result);
    markListingsUnavailable(result.itemIds);
    setSelectedProduct((prev) => {
      if (!prev || !result.itemIds.includes(prev.id)) return prev;
      return {
        ...prev,
        isAvailable: false,
        listingStatus: "inactive",
        unavailableReason: "Объявление снято с публикации.",
      };
    });
  };
  useAppRouteSync({
    currentAdminPage,
    currentProfileTab,
    currentView,
    deepLinkListingId,
    deepLinkSellerId,
    productBackAdminPage,
    selectedCatalogItemId,
    selectedProductId: selectedProduct?.id ?? null,
    onSetCurrentAdminPage: setCurrentAdminPage,
    onSetCurrentProfileTab: setCurrentProfileTab,
    onSetCurrentView: setCurrentView,
    onSetDeepLinkListingId: setDeepLinkListingId,
    onSetDeepLinkSellerId: setDeepLinkSellerId,
    onSetProductBackAdminPage: setProductBackAdminPage,
    onSetSelectedCatalogItemId: setSelectedCatalogItemId,
    onSetSelectedProduct: setSelectedProduct,
  });

  const currentCategories = productCategories;
  const hasMoreItems = hasMoreProducts;
  const isLoadingMoreItems = isLoadingProducts;
  const {
    handleAdminBackToHome,
    handleBannerClick,
    handleBuyNow,
    handleCartClick,
    handleCatalogFilterChange,
    handleCatalogItemSelect,
    handleCatalogViewModeReset,
    handleCheckout,
    handleCloseCreateListing,
    handleFooterNavigation,
    handleLogoClick,
    handleOpenCreateListing,
    handleOpenPartnershipPage,
    handleOpenProfilePartnershipPage,
    handleOpenSellerStore,
    handleOrderHistoryNavigation,
    handlePartnerListingAddressRequest,
    handlePartnershipBack,
    handleProductClick,
    handleProfileClick,
    handleProfileOpenListing,
    handleSearchSubmit,
  } = useAppNavigationHandlers({
    defaultFilters: DEFAULT_FILTERS,
    isAuthenticated,
    userType,
    currentView,
    currentProfileTab,
    deepLinkSellerId,
    currentUserPublicId: currentUser?.public_id ?? null,
    selectedProduct,
    cartItems,
    requestLoginForCartAccess,
    addToCartUnsafe,
    scrollToTop,
    onSetCurrentView: setCurrentView,
    onSetCurrentProfileTab: setCurrentProfileTab,
    onSetCurrentAdminPage: setCurrentAdminPage,
    onSetDeepLinkListingId: setDeepLinkListingId,
    onSetSelectedCatalogItemId: setSelectedCatalogItemId,
    onSetDeepLinkSellerId: setDeepLinkSellerId,
    onSetSellerBackListingId: setSellerBackListingId,
    onSetProductBackSellerId: setProductBackSellerId,
    onSetProductBackProfileTab: setProductBackProfileTab,
    onSetProductBackAdminPage: setProductBackAdminPage,
    onSetSelectedProduct: setSelectedProduct,
    onSetFilters: setFilters,
    onSetIsSearchActive: setIsSearchActive,
    onSetSelectedDeliveryType: setSelectedDeliveryType,
  });

  const handleProfileLogoutAndReset = () => {
    setCurrentProfileTab("profile");
    handleProfileLogout();
  };

  const handleAdminLogoutAndReset = () => {
    setCurrentProfileTab("profile");
    setCurrentAdminPage("transactions");
    handleAdminLogout();
    scrollToTop();
  };

  const appShellHeaderProps: AppPageShellHeaderProps = {
    isAuthenticated,
    cartItemCount,
    onCartClick: handleCartClick,
    onSearchSubmit: handleSearchSubmit,
    onLogoClick: handleLogoClick,
    onProfileClick: handleProfileClick,
    catalogCategories: productCategories,
    onCatalogItemSelect: handleCatalogItemSelect,
  };
  return (
    <div data-testid="app-root" data-view={currentView}>
      <AppRender
        appShellHeaderProps={appShellHeaderProps}
        currentView={currentView}
        currentAdminPage={currentAdminPage}
        currentProfileTab={currentProfileTab}
        userType={userType}
        currentUser={currentUser}
        cartItems={cartItems}
        selectedDeliveryType={selectedDeliveryType}
        lastOrderTotal={lastOrderTotal}
        lastOrderIds={lastOrderIds}
        lastDeliveryType={lastDeliveryType}
        selectedProduct={selectedProduct}
        wishlistProductIds={wishlistProductIds}
        products={products}
        sortedItems={sortedItems}
        hasMoreItems={hasMoreItems}
        hasPreviousItems={hasPreviousProducts}
        isLoadingMoreItems={isLoadingMoreItems}
        loadedItemCount={loadedProductCount}
        totalItemCount={totalProducts}
        catalogPageOffsets={catalogPageOffsets}
        catalogPagesByOffset={catalogPagesByOffset}
        loadedCatalogOffsets={loadedCatalogOffsets}
        activeCatalogOffset={activeCatalogOffset}
        visibleWindowStartOffset={visibleWindowStartOffset}
        isSearchActive={isSearchActive}
        filters={filters}
        viewMode={viewMode}
        categories={currentCategories}
        sortBy={sortBy}
        deepLinkSellerId={deepLinkSellerId}
        sellerBackListingId={sellerBackListingId}
        productBackSellerId={productBackSellerId}
        productBackProfileTab={productBackProfileTab}
        productBackAdminPage={productBackAdminPage}
        isDeepLinkListingLoading={isDeepLinkListingLoading}
        onSetCurrentView={setCurrentView}
        onSetCurrentAdminPage={setCurrentAdminPage}
        onSetCurrentProfileTab={setCurrentProfileTab}
        onSetDeepLinkListingId={setDeepLinkListingId}
        onSetDeepLinkSellerId={setDeepLinkSellerId}
        onSetSellerBackListingId={setSellerBackListingId}
        onSetProductBackSellerId={setProductBackSellerId}
        onSetProductBackProfileTab={setProductBackProfileTab}
        onSetProductBackAdminPage={setProductBackAdminPage}
        onSetSelectedProduct={setSelectedProduct}
        onHandleWishlistToggle={handleWishlistToggle}
        onHandleOpenSellerStore={handleOpenSellerStore}
        onHandleAddToCart={addToCart}
        onHandleBuyNow={handleBuyNow}
        onHandleUpdateQuantity={updateQuantity}
        onHandleFooterNavigation={handleFooterNavigation}
        onHandleCheckout={handleCheckout}
        onHandleLogoClick={handleLogoClick}
        onHandlePartnershipBack={handlePartnershipBack}
        onHandleOpenPartnershipPage={handleOpenPartnershipPage}
        onHandleAuthLoginSuccess={handleAuthLoginSuccess}
        onHandleProfileLogout={handleProfileLogoutAndReset}
        onHandleOpenProfilePartnershipPage={handleOpenProfilePartnershipPage}
        onHandleProfileOpenListing={handleProfileOpenListing}
        onHandleOpenCreateListing={handleOpenCreateListing}
        onHandleCloseCreateListing={handleCloseCreateListing}
        onHandlePartnerListingAddressRequest={handlePartnerListingAddressRequest}
        onHandleAdminLoginSuccess={handleAdminLoginSuccess}
        onHandleAdminBackToHome={handleAdminBackToHome}
        onHandleAdminLogout={handleAdminLogoutAndReset}
        onHandleRemoveUnavailableItems={handleRemoveUnavailableItems}
        onHandleOrderCreated={handleOrderCreated}
        onHandleOrderComplete={handleOrderComplete}
        onHandleOrderHistoryNavigation={handleOrderHistoryNavigation}
        onHandleBannerClick={handleBannerClick}
        onHandleCatalogFilterChange={handleCatalogFilterChange}
        onHandleCatalogViewModeReset={handleCatalogViewModeReset}
        onHandleLoadMoreCatalogItems={handleLoadMoreCatalogItems}
        onHandleLoadPreviousCatalogItems={handleLoadPreviousCatalogItems}
        onHandleVisibleCatalogOffsetChange={handleVisibleCatalogOffsetChange}
        onHandleEnsureCatalogOffsetLoaded={ensureCatalogOffsetLoaded}
        onHandleProductClick={handleProductClick}
        onSetSortBy={setSortBy}
      />
    </div>
  );
}
