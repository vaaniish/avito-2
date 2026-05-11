import { Suspense, lazy, type ReactNode } from "react";
import { Footer } from "../widgets/Footer";
import { AppCatalogView } from "../pages/home/AppCatalogView";
import { AppRenderProps, type AppShellRenderer } from "./app.render.types";

const CartPage = lazy(() =>
  import("../pages/cart/CartPage").then((module) => ({
    default: module.CartPage,
  })),
);
const CheckoutPage = lazy(() =>
  import("../pages/checkout/CheckoutPage").then((module) => ({
    default: module.CheckoutPage,
  })),
);
const OrderCompletePage = lazy(() =>
  import("../pages/order-complete/OrderCompletePage").then((module) => ({
    default: module.OrderCompletePage,
  })),
);
const PaymentReturnPage = lazy(() =>
  import("../pages/payment-return/PaymentReturnPage").then((module) => ({
    default: module.PaymentReturnPage,
  })),
);
const ProductDetail = lazy(() =>
  import("../pages/product-detail/ProductDetail").then((module) => ({
    default: module.ProductDetail,
  })),
);
const SellerStorePage = lazy(() =>
  import("../pages/seller-store/SellerStorePage").then((module) => ({
    default: module.SellerStorePage,
  })),
);
const AboutPage = lazy(() =>
  import("../pages/static/about/AboutPage").then((module) => ({
    default: module.AboutPage,
  })),
);
const PartnershipPage = lazy(() =>
  import("../pages/static/partnership/PartnershipPage").then((module) => ({
    default: module.PartnershipPage,
  })),
);
const FAQPage = lazy(() =>
  import("../pages/static/faq/FAQPage").then((module) => ({
    default: module.FAQPage,
  })),
);
const PrivacyPage = lazy(() =>
  import("../pages/static/privacy/PrivacyPage").then((module) => ({
    default: module.PrivacyPage,
  })),
);
const TermsPage = lazy(() =>
  import("../pages/static/terms/TermsPage").then((module) => ({
    default: module.TermsPage,
  })),
);
const AuthPage = lazy(() =>
  import("../pages/auth/AuthPage").then((module) => ({
    default: module.AuthPage,
  })),
);
const ProfilePage = lazy(() =>
  import("../pages/profile/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);
const PartnerListingsPage = lazy(() =>
  import("../pages/partner-listings/PartnerListingsPage").then((module) => ({
    default: module.PartnerListingsPage,
  })),
);
const AdminLogin = lazy(() =>
  import("../pages/admin/AdminLogin").then((module) => ({
    default: module.AdminLogin,
  })),
);
const AdminPanel = lazy(() =>
  import("../pages/admin/AdminPanel").then((module) => ({
    default: module.AdminPanel,
  })),
);

export function renderProductView(
  props: AppRenderProps,
  lazyFallback: ReactNode,
  renderWithAppShell: AppShellRenderer,
) {
  if (!props.selectedProduct) {
    return renderWithAppShell(
      <div className="page-container py-16 text-center text-gray-600">
        {props.isDeepLinkListingLoading ? "Загрузка объявления..." : "Объявление не найдено"}
      </div>,
    );
  }

  const cartItem = props.cartItems.find((item) => item.id === props.selectedProduct?.id);
  const cartQuantity = cartItem ? cartItem.quantity : 0;

  return renderWithAppShell(
    <Suspense fallback={lazyFallback}>
      <ProductDetail
        product={props.selectedProduct}
        onBack={() => {
          props.onSetSelectedProduct(null);
          if (props.productBackSellerId) {
            props.onSetCurrentView("sellerStore");
            props.onSetDeepLinkSellerId(props.productBackSellerId);
            props.onSetProductBackSellerId(null);
            return;
          }
          if (props.productBackProfileTab) {
            props.onSetCurrentProfileTab(props.productBackProfileTab);
            props.onSetProductBackProfileTab(null);
            props.onSetCurrentView("profile");
            return;
          }
          if (props.productBackAdminPage) {
            props.onSetCurrentAdminPage(props.productBackAdminPage);
            props.onSetProductBackAdminPage(null);
            props.onSetCurrentView("adminPanel");
            return;
          }
          props.onSetCurrentView("home");
        }}
        backLabel={
          props.productBackAdminPage === "listings" ? "Назад к модерации объявлений" : undefined
        }
        onOpenSellerStore={props.onHandleOpenSellerStore}
        onAddToCart={props.onHandleAddToCart}
        onBuyNow={props.onHandleBuyNow}
        onUpdateQuantity={props.onHandleUpdateQuantity}
        cartQuantity={cartQuantity}
        relatedProducts={props.products
          .filter(
            (item) =>
              item.id !== props.selectedProduct?.id &&
              item.category === props.selectedProduct?.category,
          )
          .slice(0, 4)}
        isWishlisted={props.wishlistProductIds.has(props.selectedProduct.id)}
        onWishlistToggle={props.onHandleWishlistToggle}
      />
    </Suspense>,
    { wrapperClassName: "min-h-screen app-shell" },
  );
}

export function renderSellerStoreView(
  props: AppRenderProps,
  lazyFallback: ReactNode,
  renderWithAppShell: AppShellRenderer,
) {
  if (!props.deepLinkSellerId) {
    return renderWithAppShell(
      <div className="page-container py-16 text-center text-gray-600">Профиль продавца не найден</div>,
    );
  }

  return renderWithAppShell(
    <Suspense fallback={lazyFallback}>
      <SellerStorePage
        sellerId={props.deepLinkSellerId}
        categories={props.categories}
        onBack={() => {
          if (!props.sellerBackListingId) {
            props.onHandleLogoClick();
            return;
          }

          const listingId = props.sellerBackListingId;
          const knownListing = props.products.find((item) => item.id === listingId) ?? null;

          props.onSetCurrentView("product");
          props.onSetDeepLinkListingId(listingId);
          props.onSetSelectedProduct((prev) => {
            if (prev?.id === listingId) return prev;
            return knownListing;
          });
          props.onSetSellerBackListingId(null);
        }}
        onOpenListing={(product) => {
          props.onSetProductBackSellerId(props.deepLinkSellerId);
          props.onSetProductBackAdminPage(null);
          props.onSetSelectedProduct(product);
          props.onSetDeepLinkListingId(product.id);
          props.onSetCurrentView("product");
        }}
        onAddToCart={props.onHandleAddToCart}
        onUpdateQuantity={props.onHandleUpdateQuantity}
        cartItems={props.cartItems}
        wishlistProductIds={props.wishlistProductIds}
        onWishlistToggle={props.onHandleWishlistToggle}
      />
    </Suspense>,
  );
}

export function renderCartView(props: AppRenderProps, lazyFallback: ReactNode) {
  return (
    <>
      <Suspense fallback={lazyFallback}>
        <CartPage
          items={props.cartItems}
          wishlistProductIds={props.wishlistProductIds}
          onUpdateQuantity={props.onHandleUpdateQuantity}
          onWishlistToggle={props.onHandleWishlistToggle}
          onOpenListing={props.onHandleProductClick}
          onCheckout={props.onHandleCheckout}
          onBackToHome={props.onHandleLogoClick}
        />
      </Suspense>
      <Footer onNavigate={props.onHandleFooterNavigation} />
    </>
  );
}

export function renderCheckoutView(
  props: AppRenderProps,
  lazyFallback: ReactNode,
  renderWithAppShell: AppShellRenderer,
) {
  return renderWithAppShell(
    <Suspense fallback={lazyFallback}>
      <CheckoutPage
        items={props.cartItems}
        deliveryType={props.selectedDeliveryType}
        userType={props.userType}
        onBack={() => props.onSetCurrentView("cart")}
        onRemoveUnavailableItems={props.onHandleRemoveUnavailableItems}
        onOrderCreated={props.onHandleOrderCreated}
        onComplete={(result) => {
          props.onHandleOrderComplete(result);
          props.onSetCurrentView("orderComplete");
        }}
      />
    </Suspense>,
  );
}

export function renderOrderCompleteView(
  props: AppRenderProps,
  lazyFallback: ReactNode,
  renderWithAppShell: AppShellRenderer,
) {
  return renderWithAppShell(
    <Suspense fallback={lazyFallback}>
      <OrderCompletePage
        orderTotal={props.lastOrderTotal}
        orderIds={props.lastOrderIds}
        deliveryType={props.lastDeliveryType}
        onViewHistory={props.onHandleOrderHistoryNavigation}
        onBackToHome={props.onHandleLogoClick}
      />
    </Suspense>,
  );
}

export function renderPaymentReturnView(lazyFallback: ReactNode) {
  return (
    <Suspense fallback={lazyFallback}>
      <PaymentReturnPage />
    </Suspense>
  );
}

export function renderStaticPageView(
  currentView: AppRenderProps["currentView"],
  props: AppRenderProps,
  lazyFallback: ReactNode,
  renderWithAppShell: AppShellRenderer,
) {
  if (currentView === "about") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <AboutPage onBack={props.onHandleLogoClick} />
      </Suspense>,
    );
  }

  if (currentView === "partnership") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <PartnershipPage onBack={props.onHandlePartnershipBack} />
      </Suspense>,
    );
  }

  if (currentView === "faq") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <FAQPage onBack={props.onHandleLogoClick} />
      </Suspense>,
    );
  }

  if (currentView === "privacy") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <PrivacyPage onBack={props.onHandleLogoClick} />
      </Suspense>,
    );
  }

  if (currentView === "terms") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <TermsPage onBack={props.onHandleLogoClick} />
      </Suspense>,
    );
  }

  return null;
}

export function renderAuthView(props: AppRenderProps, lazyFallback: ReactNode) {
  return (
    <Suspense fallback={lazyFallback}>
      <AuthPage
        onBack={props.onHandleLogoClick}
        onPartnershipClick={props.onHandleOpenPartnershipPage}
        onLoginSuccess={props.onHandleAuthLoginSuccess}
      />
    </Suspense>
  );
}

export function renderProfileView(props: AppRenderProps, lazyFallback: ReactNode) {
  return (
    <Suspense fallback={lazyFallback}>
      <ProfilePage
        onBack={props.onHandleLogoClick}
        onLogout={props.onHandleProfileLogout}
        userType={props.userType === "partner" ? "partner" : "regular"}
        initialTab={props.currentProfileTab}
        onTabChange={props.onSetCurrentProfileTab}
        onPartnershipClick={props.onHandleOpenProfilePartnershipPage}
        onWishlistUpdate={props.onHandleWishlistToggle}
        onOpenListing={props.onHandleProfileOpenListing}
        onOpenCreateListing={props.onHandleOpenCreateListing}
      />
    </Suspense>
  );
}

export function renderPartnerListingCreateView(
  props: AppRenderProps,
  lazyFallback: ReactNode,
) {
  return (
    <Suspense fallback={lazyFallback}>
      <PartnerListingsPage
        createMode
        onRequestAddressChange={props.onHandlePartnerListingAddressRequest}
        onOpenListing={props.onHandleProfileOpenListing}
        onExitCreate={props.onHandleCloseCreateListing}
      />
    </Suspense>
  );
}

export function renderAdminLoginView(props: AppRenderProps, lazyFallback: ReactNode) {
  return (
    <Suspense fallback={lazyFallback}>
      <AdminLogin
        onBack={props.onHandleLogoClick}
        onLoginSuccess={props.onHandleAdminLoginSuccess}
      />
    </Suspense>
  );
}

export function renderAdminPanelView(props: AppRenderProps, lazyFallback: ReactNode) {
  return (
    <Suspense fallback={lazyFallback}>
      <AdminPanel
        initialPage={props.currentAdminPage}
        onPageChange={props.onSetCurrentAdminPage}
        onBack={props.onHandleAdminBackToHome}
        userName={props.currentUser?.name ?? undefined}
        userEmail={props.currentUser?.email ?? undefined}
        onLogout={props.onHandleAdminLogout}
      />
    </Suspense>
  );
}

export function renderCatalogView(
  props: AppRenderProps,
  renderWithAppShell: AppShellRenderer,
) {
  return renderWithAppShell(
    <AppCatalogView
      isSearchActive={props.isSearchActive}
      hideHero={props.isSearchActive || props.currentView === "catalogItem"}
      filters={props.filters}
      viewMode={props.viewMode}
      categories={props.categories}
      sortedItems={props.sortedItems}
      hasMoreItems={props.hasMoreItems}
      hasPreviousItems={props.hasPreviousItems}
      isLoadingMoreItems={props.isLoadingMoreItems}
      loadedItemCount={props.loadedItemCount}
      totalItemCount={props.totalItemCount}
      catalogPageOffsets={props.catalogPageOffsets}
      catalogPagesByOffset={props.catalogPagesByOffset}
      loadedCatalogOffsets={props.loadedCatalogOffsets}
      activeCatalogOffset={props.activeCatalogOffset}
      visibleWindowStartOffset={props.visibleWindowStartOffset}
      cartItems={props.cartItems}
      sortBy={props.sortBy}
      wishlistProductIds={props.wishlistProductIds}
      onBannerClick={props.onHandleBannerClick}
      onFilterChange={props.onHandleCatalogFilterChange}
      onViewModeChange={props.onHandleCatalogViewModeReset}
      onLoadMoreCatalogItems={props.onHandleLoadMoreCatalogItems}
      onLoadPreviousCatalogItems={props.onHandleLoadPreviousCatalogItems}
      onVisibleCatalogOffsetChange={props.onHandleVisibleCatalogOffsetChange}
      onEnsureCatalogOffsetLoaded={props.onHandleEnsureCatalogOffsetLoaded}
      onProductClick={props.onHandleProductClick}
      onAddToCart={props.onHandleAddToCart}
      onUpdateQuantity={props.onHandleUpdateQuantity}
      onSortChange={props.onSetSortBy}
      onWishlistToggle={props.onHandleWishlistToggle}
    />,
    { wrapperClassName: "min-h-screen app-shell" },
  );
}
