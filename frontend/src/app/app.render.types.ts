import type { ReactNode } from "react";
import type { FooterPage } from "../widgets/Footer";
import type { AppPageShellHeaderProps } from "./AppPageShell";
import type { AdminPage } from "../pages/admin/AdminPanel";
import type { ProfileTab } from "../pages/profile/profile.models";
import type { SessionRole, SessionUser } from "../shared/lib/api";
import type { AppView } from "./app-routing";
import type { FilterState, Product } from "../shared/types";
import type { CatalogPagesByOffset } from "./app.catalog.utils";

export type CatalogMode = "products";

export type AppRenderProps = {
  appShellHeaderProps: AppPageShellHeaderProps;
  currentView: AppView;
  currentAdminPage: AdminPage;
  currentProfileTab: ProfileTab;
  userType: SessionRole;
  currentUser: SessionUser | null;
  cartItems: Array<Product & { quantity: number }>;
  selectedDeliveryType: "delivery" | "pickup";
  lastOrderTotal: number;
  lastOrderIds: string[];
  lastDeliveryType: "delivery" | "pickup";
  selectedProduct: Product | null;
  wishlistProductIds: Set<string>;
  products: Product[];
  sortedItems: Product[];
  hasMoreItems: boolean;
  hasPreviousItems: boolean;
  isLoadingMoreItems: boolean;
  loadedItemCount: number;
  totalItemCount: number;
  catalogPageOffsets: number[];
  catalogPagesByOffset: CatalogPagesByOffset;
  loadedCatalogOffsets: number[];
  activeCatalogOffset: number;
  visibleWindowStartOffset: number;
  isSearchActive: boolean;
  filters: FilterState;
  viewMode: CatalogMode;
  categories: AppPageShellHeaderProps["catalogCategories"];
  sortBy: string;
  deepLinkSellerId: string | null;
  sellerBackListingId: string | null;
  productBackSellerId: string | null;
  productBackProfileTab: ProfileTab | null;
  productBackAdminPage: AdminPage | null;
  isDeepLinkListingLoading: boolean;
  onSetCurrentView: (view: AppView) => void;
  onSetCurrentAdminPage: (page: AdminPage) => void;
  onSetCurrentProfileTab: (tab: ProfileTab) => void;
  onSetDeepLinkListingId: (listingId: string | null) => void;
  onSetDeepLinkSellerId: (sellerId: string | null) => void;
  onSetSellerBackListingId: (listingId: string | null) => void;
  onSetProductBackSellerId: (sellerId: string | null) => void;
  onSetProductBackProfileTab: (tab: ProfileTab | null) => void;
  onSetProductBackAdminPage: (page: AdminPage | null) => void;
  onSetSelectedProduct: (
    product: Product | null | ((prev: Product | null) => Product | null),
  ) => void;
  onHandleWishlistToggle: (
    productId: string,
    shouldAddToWishlist: boolean,
  ) => Promise<void>;
  onHandleOpenSellerStore: (sellerId: string) => void;
  onHandleAddToCart: (product: Product) => void;
  onHandleBuyNow: (product: Product) => void;
  onHandleUpdateQuantity: (id: string, quantity: number) => void;
  onHandleFooterNavigation: (page: FooterPage) => void;
  onHandleCheckout: (deliveryType: "delivery" | "pickup") => void;
  onHandleLogoClick: () => void;
  onHandlePartnershipBack: () => void;
  onHandleOpenPartnershipPage: () => void;
  onHandleAuthLoginSuccess: (
    role: SessionRole,
    user: SessionUser,
    profile: { wishlist: Array<{ id: string }> },
  ) => void;
  onHandleProfileLogout: () => void;
  onHandleOpenProfilePartnershipPage: () => void;
  onHandleProfileOpenListing: (listingPublicId: string) => void;
  onHandleOpenCreateListing: () => void;
  onHandleCloseCreateListing: () => void;
  onHandlePartnerListingAddressRequest: () => void;
  onHandleAdminLoginSuccess: (user?: SessionUser) => void;
  onHandleAdminBackToHome: () => void;
  onHandleAdminLogout: () => void;
  onHandleRemoveUnavailableItems: (itemIds: string[]) => void;
  onHandleOrderCreated: (result: {
    orderIds: string[];
    total: number;
    deliveryType: "delivery" | "pickup";
    itemIds: string[];
  }) => void;
  onHandleOrderComplete: (result: {
    orderIds: string[];
    total: number;
    deliveryType: "delivery" | "pickup";
    itemIds: string[];
  }) => void;
  onHandleOrderHistoryNavigation: () => void;
  onHandleBannerClick: (category: string) => void;
  onHandleCatalogFilterChange: (newFilters: FilterState) => void;
  onHandleCatalogViewModeReset: () => void;
  onHandleLoadMoreCatalogItems: () => void;
  onHandleLoadPreviousCatalogItems: () => void;
  onHandleVisibleCatalogOffsetChange: (offset: number) => void;
  onHandleEnsureCatalogOffsetLoaded: (offset: number) => void;
  onHandleProductClick: (product: Product) => void;
  onSetSortBy: (sortBy: string) => void;
};

export type AppShellRenderer = (
  content: ReactNode,
  options?: { wrapperClassName?: string },
) => ReactNode;
