import { type ReactNode } from "react";
import {
  AppPageShell,
  type AppPageShellHeaderProps,
} from "./AppPageShell";
import type { AppRenderProps } from "./app.render.types";
import {
  renderAdminLoginView,
  renderAdminPanelView,
  renderAuthView,
  renderCartView,
  renderCatalogView,
  renderCheckoutView,
  renderOrderCompleteView,
  renderPartnerListingCreateView,
  renderPaymentReturnView,
  renderProductView,
  renderProfileView,
  renderSellerStoreView,
  renderStaticPageView,
} from "./app.render.views";

export function AppRender(props: AppRenderProps) {
  const lazyFallback = (
    <div className="page-container py-16 text-center text-gray-600">
      Загрузка...
    </div>
  );

  const renderWithAppShell = (
    content: ReactNode,
    options?: { wrapperClassName?: string },
  ) => (
    <AppPageShell
      {...props.appShellHeaderProps}
      onFooterNavigate={props.onHandleFooterNavigation}
      wrapperClassName={options?.wrapperClassName}
    >
      {content}
    </AppPageShell>
  );

  if (props.currentView === "product") {
    return renderProductView(props, lazyFallback, renderWithAppShell);
  }

  if (props.currentView === "sellerStore") {
    return renderSellerStoreView(props, lazyFallback, renderWithAppShell);
  }

  if (props.currentView === "cart") {
    return renderCartView(props, lazyFallback);
  }

  if (props.currentView === "checkout") {
    return renderCheckoutView(props, lazyFallback, renderWithAppShell);
  }

  if (props.currentView === "orderComplete") {
    return renderOrderCompleteView(props, lazyFallback, renderWithAppShell);
  }

  if (props.currentView === "paymentReturn") {
    return renderPaymentReturnView(lazyFallback);
  }

  if (
    props.currentView === "about" ||
    props.currentView === "partnership" ||
    props.currentView === "faq" ||
    props.currentView === "privacy" ||
    props.currentView === "terms"
  ) {
    return renderStaticPageView(
      props.currentView,
      props,
      lazyFallback,
      renderWithAppShell,
    );
  }

  if (props.currentView === "auth") {
    return renderAuthView(props, lazyFallback);
  }

  if (props.currentView === "profile") {
    return renderProfileView(props, lazyFallback);
  }

  if (props.currentView === "partnerListingCreate") {
    return renderPartnerListingCreateView(props, lazyFallback);
  }

  if (props.currentView === "adminLogin") {
    return renderAdminLoginView(props, lazyFallback);
  }

  if (props.currentView === "adminPanel") {
    return renderAdminPanelView(props, lazyFallback);
  }

  return renderCatalogView(props, renderWithAppShell);
}
