import type { AdminPage } from "../components/admin/AdminPanel";
import type { ProfileTab } from "../components/pages/profile.models";

export type AppView =
  | "home"
  | "cart"
  | "checkout"
  | "orderComplete"
  | "paymentReturn"
  | "product"
  | "sellerStore"
  | "about"
  | "partnership"
  | "faq"
  | "privacy"
  | "terms"
  | "auth"
  | "profile"
  | "adminLogin"
  | "adminPanel";

const ADMIN_ROUTE_PAGES: AdminPage[] = [
  "transactions",
  "complaints",
  "sellers",
  "listings",
  "users",
  "commissions",
  "audit",
];

const PROFILE_ROUTE_TABS: ProfileTab[] = [
  "profile",
  "addresses",
  "orders",
  "wishlist",
  "partnership",
  "partner-listings",
  "partner-questions",
  "partner-orders",
];

export type ParsedRoute = {
  view: AppView;
  listingId: string | null;
  sellerId: string | null;
  adminPage: AdminPage;
  profileTab: ProfileTab;
};

function isAdminRoutePage(value: string): value is AdminPage {
  return ADMIN_ROUTE_PAGES.includes(value as AdminPage);
}

function isProfileRouteTab(value: string): value is ProfileTab {
  return PROFILE_ROUTE_TABS.includes(value as ProfileTab);
}

function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function decodeRouteSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function parseRoute(pathname: string, search: string): ParsedRoute {
  const normalizedPath = normalizePathname(pathname);
  const query = new URLSearchParams(search);
  const listingIdFromQuery = query.get("listingId")?.trim() ?? "";
  const defaultRoute: ParsedRoute = {
    view: "home",
    listingId: listingIdFromQuery || null,
    sellerId: null,
    adminPage: "transactions",
    profileTab: "profile",
  };

  if (normalizedPath === "/") return defaultRoute;
  if (normalizedPath === "/cart") return { ...defaultRoute, view: "cart" };
  if (normalizedPath === "/checkout")
    return { ...defaultRoute, view: "checkout" };
  if (normalizedPath === "/order-complete")
    return { ...defaultRoute, view: "orderComplete" };
  if (normalizedPath === "/payment-return")
    return { ...defaultRoute, view: "paymentReturn" };
  if (normalizedPath === "/about") return { ...defaultRoute, view: "about" };
  if (normalizedPath === "/partnership")
    return { ...defaultRoute, view: "partnership" };
  if (normalizedPath === "/faq") return { ...defaultRoute, view: "faq" };
  if (normalizedPath === "/privacy")
    return { ...defaultRoute, view: "privacy" };
  if (normalizedPath === "/terms") return { ...defaultRoute, view: "terms" };
  if (normalizedPath === "/auth") return { ...defaultRoute, view: "auth" };
  if (normalizedPath === "/admin/login")
    return { ...defaultRoute, view: "adminLogin" };

  if (normalizedPath === "/admin") {
    return { ...defaultRoute, view: "adminPanel", adminPage: "transactions" };
  }

  if (normalizedPath.startsWith("/admin/")) {
    const segment = normalizedPath.slice("/admin/".length).trim();
    return {
      ...defaultRoute,
      view: "adminPanel",
      adminPage: isAdminRoutePage(segment) ? segment : "transactions",
    };
  }

  if (normalizedPath === "/profile") {
    return { ...defaultRoute, view: "profile", profileTab: "profile" };
  }

  if (normalizedPath.startsWith("/profile/")) {
    const segment = normalizedPath.slice("/profile/".length).trim();
    return {
      ...defaultRoute,
      view: "profile",
      profileTab: isProfileRouteTab(segment) ? segment : "profile",
    };
  }

  if (normalizedPath.startsWith("/products/")) {
    const listingId = normalizedPath.slice("/products/".length).trim();
    return {
      ...defaultRoute,
      view: "product",
      listingId: listingId || defaultRoute.listingId,
    };
  }

  if (normalizedPath.startsWith("/product/")) {
    const listingId = normalizedPath.slice("/product/".length).trim();
    return {
      ...defaultRoute,
      view: "product",
      listingId: listingId || defaultRoute.listingId,
    };
  }

  if (normalizedPath.startsWith("/sellers/")) {
    const sellerId = decodeRouteSegment(
      normalizedPath.slice("/sellers/".length).trim(),
    );
    return {
      ...defaultRoute,
      view: "sellerStore",
      sellerId: sellerId || null,
    };
  }

  return defaultRoute;
}

export function buildPathForView(params: {
  view: AppView;
  listingId: string | null;
  sellerId: string | null;
  adminPage: AdminPage;
  profileTab: ProfileTab;
}): string {
  const { view, listingId, sellerId, adminPage, profileTab } = params;
  switch (view) {
    case "home":
      return "/";
    case "cart":
      return "/cart";
    case "checkout":
      return "/checkout";
    case "orderComplete":
      return "/order-complete";
    case "paymentReturn":
      return "/payment-return";
    case "product":
      return listingId ? `/products/${listingId}` : "/";
    case "sellerStore":
      return sellerId ? `/sellers/${encodeURIComponent(sellerId)}` : "/";
    case "about":
      return "/about";
    case "partnership":
      return "/partnership";
    case "faq":
      return "/faq";
    case "privacy":
      return "/privacy";
    case "terms":
      return "/terms";
    case "auth":
      return "/auth";
    case "profile":
      return profileTab === "profile" ? "/profile" : `/profile/${profileTab}`;
    case "adminLogin":
      return "/admin/login";
    case "adminPanel":
      return adminPage === "transactions" ? "/admin" : `/admin/${adminPage}`;
    default:
      return "/";
  }
}
