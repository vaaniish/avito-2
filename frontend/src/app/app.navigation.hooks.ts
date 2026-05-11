import { useCallback } from "react";
import type { FooterPage } from "../widgets/Footer";
import type { CatalogItem } from "../widgets/FilterPanel";
import type { AdminPage } from "../pages/admin/AdminPanel";
import type { ProfileTab } from "../pages/profile/profile.models";
import type { AppView } from "./app-routing";
import type { FilterState, Product } from "../shared/types";
import { notifyInfo } from "../shared/ui/notifications";

export function useAppNavigationHandlers(params: {
  defaultFilters: FilterState;
  isAuthenticated: boolean;
  userType: "regular" | "partner" | "admin";
  currentView: AppView;
  currentProfileTab: ProfileTab;
  deepLinkSellerId: string | null;
  currentUserPublicId: string | null;
  selectedProduct: Product | null;
  cartItems: Array<{ id: string }>;
  requestLoginForCartAccess: () => boolean;
  addToCartUnsafe: (product: Product) => void;
  scrollToTop: () => void;
  onSetCurrentView: (view: AppView) => void;
  onSetCurrentProfileTab: (tab: ProfileTab) => void;
  onSetCurrentAdminPage: (page: AdminPage) => void;
  onSetDeepLinkListingId: (listingId: string | null) => void;
  onSetSelectedCatalogItemId: (itemId: string | null) => void;
  onSetDeepLinkSellerId: (sellerId: string | null) => void;
  onSetSellerBackListingId: (listingId: string | null) => void;
  onSetProductBackSellerId: (sellerId: string | null) => void;
  onSetProductBackProfileTab: (tab: ProfileTab | null) => void;
  onSetProductBackAdminPage: (page: AdminPage | null) => void;
  onSetSelectedProduct: (product: Product | null) => void;
  onSetFilters: (
    value: FilterState | ((prev: FilterState) => FilterState),
  ) => void;
  onSetIsSearchActive: (active: boolean) => void;
  onSetSelectedDeliveryType: (value: "delivery" | "pickup") => void;
}) {
  const {
    addToCartUnsafe,
    cartItems,
    currentProfileTab,
    currentUserPublicId,
    currentView,
    deepLinkSellerId,
    defaultFilters,
    isAuthenticated,
    requestLoginForCartAccess,
    scrollToTop,
    selectedProduct,
    userType,
    onSetCurrentAdminPage,
    onSetCurrentProfileTab,
    onSetCurrentView,
    onSetDeepLinkListingId,
    onSetDeepLinkSellerId,
    onSetFilters,
    onSetIsSearchActive,
    onSetProductBackAdminPage,
    onSetProductBackProfileTab,
    onSetProductBackSellerId,
    onSetSelectedCatalogItemId,
    onSetSelectedDeliveryType,
    onSetSelectedProduct,
    onSetSellerBackListingId,
  } = params;

  const handleSearchSubmit = useCallback(
    (query: string) => {
      onSetSelectedCatalogItemId(null);
      onSetSelectedProduct(null);
      onSetDeepLinkListingId(null);
      onSetDeepLinkSellerId(null);
      onSetSellerBackListingId(null);
      onSetProductBackSellerId(null);
      onSetProductBackProfileTab(null);
      onSetProductBackAdminPage(null);
      onSetFilters((prev) => ({ ...prev, searchQuery: query }));
      onSetIsSearchActive(query.length > 0);
      onSetCurrentView("home");
      scrollToTop();
    },
    [
      onSetCurrentView,
      onSetDeepLinkListingId,
      onSetDeepLinkSellerId,
      onSetFilters,
      onSetIsSearchActive,
      onSetProductBackAdminPage,
      onSetProductBackProfileTab,
      onSetProductBackSellerId,
      onSetSelectedCatalogItemId,
      onSetSelectedProduct,
      onSetSellerBackListingId,
      scrollToTop,
    ],
  );

  const handleCatalogItemSelect = useCallback(
    (item: CatalogItem) => {
      onSetSelectedCatalogItemId(item.id);
      onSetSelectedProduct(null);
      onSetDeepLinkListingId(null);
      onSetFilters(defaultFilters);
      onSetIsSearchActive(false);
      onSetCurrentView("catalogItem");
      scrollToTop();
    },
    [
      defaultFilters,
      onSetCurrentView,
      onSetDeepLinkListingId,
      onSetFilters,
      onSetIsSearchActive,
      onSetSelectedCatalogItemId,
      onSetSelectedProduct,
      scrollToTop,
    ],
  );

  const handleLogoClick = useCallback(() => {
    onSetCurrentView("home");
    onSetCurrentProfileTab("profile");
    onSetCurrentAdminPage("transactions");
    onSetDeepLinkListingId(null);
    onSetSelectedCatalogItemId(null);
    onSetDeepLinkSellerId(null);
    onSetSellerBackListingId(null);
    onSetProductBackSellerId(null);
    onSetProductBackProfileTab(null);
    onSetSelectedProduct(null);
    onSetIsSearchActive(false);
    onSetFilters(defaultFilters);
    scrollToTop();
  }, [
    defaultFilters,
    onSetCurrentAdminPage,
    onSetCurrentProfileTab,
    onSetCurrentView,
    onSetDeepLinkListingId,
    onSetDeepLinkSellerId,
    onSetFilters,
    onSetIsSearchActive,
    onSetProductBackProfileTab,
    onSetProductBackSellerId,
    onSetSelectedCatalogItemId,
    onSetSelectedProduct,
    onSetSellerBackListingId,
    scrollToTop,
  ]);

  const handleBannerClick = useCallback(
    (category: string) => {
      onSetCurrentView("home");
      onSetSelectedCatalogItemId(null);
      onSetSelectedProduct(null);
      onSetIsSearchActive(false);

      if (category === "sale") {
        onSetFilters({ ...defaultFilters, showOnlySale: true });
      } else if (category) {
        onSetFilters({ ...defaultFilters, categories: [category] });
      } else {
        onSetFilters(defaultFilters);
      }

      window.scrollTo({ top: 600, behavior: "smooth" });
    },
    [
      defaultFilters,
      onSetCurrentView,
      onSetFilters,
      onSetIsSearchActive,
      onSetSelectedCatalogItemId,
      onSetSelectedProduct,
    ],
  );

  const handleCartClick = useCallback(() => {
    if (!requestLoginForCartAccess()) {
      return;
    }
    onSetCurrentView("cart");
    scrollToTop();
  }, [onSetCurrentView, requestLoginForCartAccess, scrollToTop]);

  const handleProductClick = useCallback(
    (product: Product) => {
      onSetProductBackSellerId(currentView === "sellerStore" ? deepLinkSellerId : null);
      onSetProductBackProfileTab(null);
      onSetProductBackAdminPage(null);
      onSetSelectedProduct(product);
      onSetDeepLinkListingId(product.id);
      onSetCurrentView("product");
      scrollToTop();
    },
    [
      currentView,
      deepLinkSellerId,
      onSetCurrentView,
      onSetDeepLinkListingId,
      onSetProductBackAdminPage,
      onSetProductBackProfileTab,
      onSetProductBackSellerId,
      onSetSelectedProduct,
      scrollToTop,
    ],
  );

  const handleOpenSellerStore = useCallback(
    (sellerId: string) => {
      const normalized = sellerId.trim();
      if (!normalized) return;
      onSetSellerBackListingId(
        currentView === "product" ? selectedProduct?.id ?? null : null,
      );
      onSetDeepLinkSellerId(normalized);
      onSetCurrentView("sellerStore");
      scrollToTop();
    },
    [
      currentView,
      onSetCurrentView,
      onSetDeepLinkSellerId,
      onSetSellerBackListingId,
      scrollToTop,
      selectedProduct?.id,
    ],
  );

  const handleBuyNow = useCallback(
    (product: Product) => {
      if (!requestLoginForCartAccess()) {
        return;
      }
      if (userType === "partner" && currentUserPublicId && product.sellerId === currentUserPublicId) {
        notifyInfo("Нельзя купить собственное объявление.");
        return;
      }
      if (userType === "admin") {
        notifyInfo("Администратор не может оформить заказ со своего аккаунта.");
        return;
      }

      const itemInCart = cartItems.find((item) => item.id === product.id);
      if (!itemInCart) {
        addToCartUnsafe(product);
      }
      onSetCurrentView("checkout");
      scrollToTop();
    },
    [
      addToCartUnsafe,
      cartItems,
      currentUserPublicId,
      onSetCurrentView,
      requestLoginForCartAccess,
      scrollToTop,
      userType,
    ],
  );

  const handleCheckout = useCallback(
    (_deliveryType: "delivery" | "pickup") => {
      if (userType === "admin") {
        notifyInfo("Администратор не может оформить заказ со своего аккаунта.");
        return;
      }
      onSetSelectedDeliveryType("delivery");
      onSetCurrentView("checkout");
      scrollToTop();
    },
    [onSetCurrentView, onSetSelectedDeliveryType, scrollToTop, userType],
  );

  const handleFooterNavigation = useCallback(
    (page: FooterPage) => {
      if (page === "partnership" && !isAuthenticated) {
        onSetCurrentProfileTab("partnership");
        onSetCurrentView("auth");
        scrollToTop();
        return;
      }

      if (page === "partnership" && isAuthenticated) {
        onSetCurrentProfileTab("partnership");
        onSetCurrentView("partnership");
        scrollToTop();
        return;
      }

      if (page !== "partnership") {
        onSetCurrentProfileTab("profile");
      }
      onSetCurrentView(page);
      scrollToTop();
    },
    [isAuthenticated, onSetCurrentProfileTab, onSetCurrentView, scrollToTop],
  );

  const handleOpenPartnershipPage = useCallback(() => {
    onSetCurrentProfileTab("profile");
    onSetCurrentView("partnership");
    scrollToTop();
  }, [onSetCurrentProfileTab, onSetCurrentView, scrollToTop]);

  const handleOpenProfilePartnershipPage = useCallback(() => {
    onSetCurrentProfileTab("partnership");
    onSetCurrentView("partnership");
    scrollToTop();
  }, [onSetCurrentProfileTab, onSetCurrentView, scrollToTop]);

  const handlePartnershipBack = useCallback(() => {
    if (currentProfileTab === "partnership") {
      onSetCurrentProfileTab("profile");
      onSetCurrentView("profile");
      scrollToTop();
      return;
    }

    handleLogoClick();
  }, [
    currentProfileTab,
    handleLogoClick,
    onSetCurrentProfileTab,
    onSetCurrentView,
    scrollToTop,
  ]);

  const handleProfileClick = useCallback(() => {
    if (!isAuthenticated) {
      onSetCurrentView("auth");
      scrollToTop();
      return;
    }

    if (userType === "admin") {
      onSetCurrentView("adminPanel");
      return;
    }

    onSetCurrentProfileTab("profile");
    onSetCurrentView("profile");
    scrollToTop();
  }, [
    isAuthenticated,
    onSetCurrentProfileTab,
    onSetCurrentView,
    scrollToTop,
    userType,
  ]);

  const handleProfileOpenListing = useCallback(
    (listingPublicId: string) => {
      onSetSelectedProduct(null);
      onSetDeepLinkListingId(listingPublicId);
      onSetProductBackProfileTab(currentProfileTab);
      onSetProductBackAdminPage(null);
      onSetCurrentView("product");
      scrollToTop();
    },
    [
      currentProfileTab,
      onSetCurrentView,
      onSetDeepLinkListingId,
      onSetProductBackAdminPage,
      onSetProductBackProfileTab,
      onSetSelectedProduct,
      scrollToTop,
    ],
  );

  const handleOpenCreateListing = useCallback(() => {
    onSetCurrentProfileTab("partner-listings");
    onSetCurrentView("partnerListingCreate");
    scrollToTop();
  }, [onSetCurrentProfileTab, onSetCurrentView, scrollToTop]);

  const handleCloseCreateListing = useCallback(() => {
    onSetCurrentProfileTab("partner-listings");
    onSetCurrentView("profile");
    scrollToTop();
  }, [onSetCurrentProfileTab, onSetCurrentView, scrollToTop]);

  const handleCatalogFilterChange = useCallback(
    (newFilters: FilterState) => {
      onSetFilters(newFilters);
      if (newFilters.searchQuery === "") {
        onSetIsSearchActive(false);
      }
    },
    [onSetFilters, onSetIsSearchActive],
  );

  const handleCatalogViewModeReset = useCallback(() => {
    onSetSelectedCatalogItemId(null);
    onSetCurrentView("home");
  }, [onSetCurrentView, onSetSelectedCatalogItemId]);

  const handleOrderHistoryNavigation = useCallback(() => {
    onSetCurrentProfileTab("orders");
    onSetCurrentView("profile");
    scrollToTop();
  }, [onSetCurrentProfileTab, onSetCurrentView, scrollToTop]);

  const handlePartnerListingAddressRequest = useCallback(() => {
    onSetCurrentProfileTab("addresses");
    onSetCurrentView("profile");
    scrollToTop();
  }, [onSetCurrentProfileTab, onSetCurrentView, scrollToTop]);

  const handleAdminBackToHome = useCallback(() => {
    onSetCurrentView("home");
    scrollToTop();
  }, [onSetCurrentView, scrollToTop]);

  return {
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
  };
}
