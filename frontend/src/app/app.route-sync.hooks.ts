import { useEffect, useRef } from "react";
import type { AdminPage } from "../pages/admin/AdminPanel";
import type { ProfileTab } from "../pages/profile/profile.models";
import { initYandexMetrika } from "../shared/lib/metrika";
import {
  buildPathForView,
  parseRoute,
  type AppView,
  type ParsedRoute,
} from "./app-routing";
import type { Product } from "../shared/types";
import { logAppDebug } from "./app.debug";

export function useAppRouteSync(params: {
  currentAdminPage: AdminPage;
  currentProfileTab: ProfileTab;
  currentView: AppView;
  deepLinkListingId: string | null;
  deepLinkSellerId: string | null;
  productBackAdminPage: AdminPage | null;
  selectedCatalogItemId: string | null;
  selectedProductId: string | null;
  onSetCurrentAdminPage: (page: AdminPage) => void;
  onSetCurrentProfileTab: (tab: ProfileTab) => void;
  onSetCurrentView: (view: AppView) => void;
  onSetDeepLinkListingId: (listingId: string | null) => void;
  onSetDeepLinkSellerId: (sellerId: string | null) => void;
  onSetProductBackAdminPage: (page: AdminPage | null) => void;
  onSetSelectedCatalogItemId: (itemId: string | null) => void;
  onSetSelectedProduct: (product: Product | null) => void;
}) {
  const {
    currentAdminPage,
    currentProfileTab,
    currentView,
    deepLinkListingId,
    deepLinkSellerId,
    productBackAdminPage,
    selectedCatalogItemId,
    selectedProductId,
    onSetCurrentAdminPage,
    onSetCurrentProfileTab,
    onSetCurrentView,
    onSetDeepLinkListingId,
    onSetDeepLinkSellerId,
    onSetProductBackAdminPage,
    onSetSelectedCatalogItemId,
    onSetSelectedProduct,
  } = params;
  const lastSyncedPathRef = useRef<string | null>(null);

  useEffect(() => {
    initYandexMetrika();
    lastSyncedPathRef.current = `${window.location.pathname}${window.location.search}`;
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const parsedRoute: ParsedRoute = parseRoute(
        window.location.pathname,
        window.location.search,
      );
      logAppDebug("route-sync", "popstate", {
        pathname: window.location.pathname,
        search: window.location.search,
        nextView: parsedRoute.view,
      });
      lastSyncedPathRef.current = `${window.location.pathname}${window.location.search}`;
      onSetCurrentView(parsedRoute.view);
      onSetCurrentAdminPage(parsedRoute.adminPage);
      onSetCurrentProfileTab(parsedRoute.profileTab);
      onSetDeepLinkListingId(parsedRoute.listingId);
      onSetSelectedCatalogItemId(parsedRoute.catalogItemId);
      onSetDeepLinkSellerId(parsedRoute.sellerId);
      onSetProductBackAdminPage(
        parsedRoute.productReturnTo === "admin-listings" ? "listings" : null,
      );
      if (parsedRoute.view !== "product") {
        onSetSelectedProduct(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [
    onSetCurrentAdminPage,
    onSetCurrentProfileTab,
    onSetCurrentView,
    onSetDeepLinkListingId,
    onSetDeepLinkSellerId,
    onSetProductBackAdminPage,
    onSetSelectedCatalogItemId,
    onSetSelectedProduct,
  ]);

  useEffect(() => {
    const targetPath = buildPathForView({
      view: currentView,
      listingId: selectedProductId ?? deepLinkListingId,
      catalogItemId: selectedCatalogItemId,
      sellerId: deepLinkSellerId,
      adminPage: currentAdminPage,
      profileTab: currentProfileTab,
      productReturnTo:
        productBackAdminPage === "listings" ? "admin-listings" : null,
    });
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (targetPath === currentPath) {
      lastSyncedPathRef.current = currentPath;
      return;
    }

    if (lastSyncedPathRef.current === targetPath) {
      return;
    }

    if (targetPath !== currentPath) {
      logAppDebug("route-sync", "push-state", {
        currentPath,
        targetPath,
        currentView,
      });
      window.history.pushState({}, "", targetPath);
      lastSyncedPathRef.current = targetPath;
    }
  }, [
    currentAdminPage,
    currentProfileTab,
    currentView,
    deepLinkListingId,
    deepLinkSellerId,
    productBackAdminPage,
    selectedCatalogItemId,
    selectedProductId,
  ]);
}
