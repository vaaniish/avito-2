import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { SlidersHorizontal } from "lucide-react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { ProductGrid } from "./components/ProductGrid";
import { Footer, type FooterPage } from "./components/Footer";
import { FilterPanel, type CatalogCategory } from "./components/FilterPanel";
import type { ProfileTab } from "./components/pages/ProfilePage";
import type { AdminPage } from "./components/admin/AdminPanel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "./components/ui/sheet";
import type { CartItem, FilterState, Product } from "./types";
import {
  apiGet,
  apiPost,
  apiDelete,
  clearSessionUser,
  getSessionUser,
  saveSessionUser,
  type SessionRole,
  type SessionUser,
} from "./lib/api";
import { matchesSearch } from "./lib/search";
import { notifyError } from "./components/ui/notifications";

const CartPage = lazy(() =>
  import("./components/CartPage").then((module) => ({
    default: module.CartPage,
  })),
);
const CheckoutPage = lazy(() =>
  import("./components/CheckoutPage").then((module) => ({
    default: module.CheckoutPage,
  })),
);
const OrderCompletePage = lazy(() =>
  import("./components/OrderCompletePage").then((module) => ({
    default: module.OrderCompletePage,
  })),
);
const ProductDetail = lazy(() =>
  import("./components/ProductDetail").then((module) => ({
    default: module.ProductDetail,
  })),
);
const AboutPage = lazy(() =>
  import("./components/pages/AboutPage").then((module) => ({
    default: module.AboutPage,
  })),
);
const PartnershipPage = lazy(() =>
  import("./components/pages/PartnershipPage").then((module) => ({
    default: module.PartnershipPage,
  })),
);
const FAQPage = lazy(() =>
  import("./components/pages/FAQPage").then((module) => ({
    default: module.FAQPage,
  })),
);
const PrivacyPage = lazy(() =>
  import("./components/pages/PrivacyPage").then((module) => ({
    default: module.PrivacyPage,
  })),
);
const TermsPage = lazy(() =>
  import("./components/pages/TermsPage").then((module) => ({
    default: module.TermsPage,
  })),
);
const AuthPage = lazy(() =>
  import("./components/pages/AuthPage").then((module) => ({
    default: module.AuthPage,
  })),
);
const ProfilePage = lazy(() =>
  import("./components/pages/ProfilePage").then((module) => ({
    default: module.ProfilePage,
  })),
);
const AdminLogin = lazy(() =>
  import("./components/admin/AdminLogin").then((module) => ({
    default: module.AdminLogin,
  })),
);
const AdminPanel = lazy(() =>
  import("./components/admin/AdminPanel").then((module) => ({
    default: module.AdminPanel,
  })),
);

type AppView =
  | "home"
  | "cart"
  | "checkout"
  | "orderComplete"
  | "product"
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

type ParsedRoute = {
  view: AppView;
  listingId: string | null;
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

function parseRoute(pathname: string, search: string): ParsedRoute {
  const normalizedPath = normalizePathname(pathname);
  const query = new URLSearchParams(search);
  const listingIdFromQuery = query.get("listingId")?.trim() ?? "";
  const defaultRoute: ParsedRoute = {
    view: "home",
    listingId: listingIdFromQuery || null,
    adminPage: "transactions",
    profileTab: "profile",
  };

  if (normalizedPath === "/") return defaultRoute;
  if (normalizedPath === "/cart") return { ...defaultRoute, view: "cart" };
  if (normalizedPath === "/checkout")
    return { ...defaultRoute, view: "checkout" };
  if (normalizedPath === "/order-complete")
    return { ...defaultRoute, view: "orderComplete" };
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

  return defaultRoute;
}

function buildPathForView(params: {
  view: AppView;
  listingId: string | null;
  adminPage: AdminPage;
  profileTab: ProfileTab;
}): string {
  const { view, listingId, adminPage, profileTab } = params;
  switch (view) {
    case "home":
      return "/";
    case "cart":
      return "/cart";
    case "checkout":
      return "/checkout";
    case "orderComplete":
      return "/order-complete";
    case "product":
      return listingId ? `/products/${listingId}` : "/";
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

const CATALOG_PAGE_SIZE = 24;

type CatalogMode = "products" | "services";

export default function App() {
  const initialRoute = parseRoute(
    window.location.pathname,
    window.location.search,
  );
  const [deepLinkListingId, setDeepLinkListingId] = useState<string | null>(
    initialRoute.listingId,
  );
  const [currentView, setCurrentView] = useState<AppView>(initialRoute.view);
  const [currentAdminPage, setCurrentAdminPage] = useState<AdminPage>(
    initialRoute.adminPage,
  );
  const [currentProfileTab, setCurrentProfileTab] = useState<ProfileTab>(
    initialRoute.profileTab,
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState<SessionRole>("regular");
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [lastPaymentMethod, setLastPaymentMethod] = useState<"card" | "cash">(
    "card",
  );
  const [lastOrderIds, setLastOrderIds] = useState<string[]>([]);
  const [selectedDeliveryType, setSelectedDeliveryType] = useState<
    "delivery" | "pickup"
  >("delivery");
  const [lastDeliveryType, setLastDeliveryType] = useState<
    "delivery" | "pickup"
  >("delivery");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<"products" | "services">("products");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<string>("popular");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [wishlistProductIds, setWishlistProductIds] = useState(
    new Set<string>(),
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [isDeepLinkListingLoading, setIsDeepLinkListingLoading] =
    useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [hasMoreServices, setHasMoreServices] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [productCategories, setProductCategories] = useState<CatalogCategory[]>(
    [],
  );
  const [serviceCategories, setServiceCategories] = useState<CatalogCategory[]>(
    [],
  );

  const handleWishlistToggle = async (
    productId: string,
    shouldAddToWishlist: boolean,
  ) => {
    try {
      if (shouldAddToWishlist) {
        await apiPost<{ success: boolean }>(`/profile/wishlist/${productId}`);
      } else {
        await apiDelete<{ success: boolean }>(`/profile/wishlist/${productId}`);
      }

      setWishlistProductIds((prev) => {
        const next = new Set(prev);
        if (shouldAddToWishlist) {
          next.add(productId);
        } else {
          next.delete(productId);
        }
        return next;
      });
    } catch (error) {
      console.error("Error toggling wishlist:", error);
      notifyError("Не удалось обновить список избранного");
    }
  };

  useEffect(() => {
    const existingSession = getSessionUser();
    if (!existingSession) return;

    setCurrentUser(existingSession);
    setUserType(existingSession.role);
    setIsAuthenticated(true);
    if (existingSession.role === "admin") {
      setCurrentView("adminPanel");
    }
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const parsedRoute = parseRoute(
        window.location.pathname,
        window.location.search,
      );
      setCurrentView(parsedRoute.view);
      setCurrentAdminPage(parsedRoute.adminPage);
      setCurrentProfileTab(parsedRoute.profileTab);
      setDeepLinkListingId(parsedRoute.listingId);
      if (parsedRoute.view !== "product") {
        setSelectedProduct(null);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    const targetPath = buildPathForView({
      view: currentView,
      listingId: selectedProduct?.id ?? deepLinkListingId,
      adminPage: currentAdminPage,
      profileTab: currentProfileTab,
    });
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (targetPath !== currentPath) {
      window.history.pushState({}, "", targetPath);
    }
  }, [
    currentAdminPage,
    currentProfileTab,
    currentView,
    deepLinkListingId,
    selectedProduct?.id,
  ]);

  useEffect(() => {
    if (currentView === "adminPanel") {
      if (!isAuthenticated || userType !== "admin") {
        setCurrentView("adminLogin");
      }
      return;
    }

    if (
      (currentView === "profile" ||
        currentView === "cart" ||
        currentView === "checkout") &&
      !isAuthenticated
    ) {
      setCurrentView("auth");
    }
  }, [currentView, isAuthenticated, userType]);

  const loadStaticCatalogData = useCallback(async () => {
    try {
      const [productCategoriesData, serviceCategoriesData] =
        await Promise.all([
          apiGet<CatalogCategory[]>("/catalog/categories?type=products"),
          apiGet<CatalogCategory[]>("/catalog/categories?type=services"),
        ]);
      setProductCategories(productCategoriesData);
      setServiceCategories(serviceCategoriesData);
    } catch (error) {
      console.error(error);
      notifyError("Не удалось загрузить каталог");
    }
  }, []);

  const loadCatalogChunk = useCallback(
    async (mode: CatalogMode, options?: { reset?: boolean }) => {
      const reset = Boolean(options?.reset);
      const sourceItems = mode === "products" ? products : services;
      const offset = reset ? 0 : sourceItems.length;

      if (mode === "products") {
        if (isLoadingProducts) return;
        setIsLoadingProducts(true);
      } else {
        if (isLoadingServices) return;
        setIsLoadingServices(true);
      }

      try {
        const page = await apiGet<Product[]>(
          `/catalog/listings?type=${mode}&limit=${CATALOG_PAGE_SIZE}&offset=${offset}`,
        );

        if (mode === "products") {
          setProducts((prev) => {
            if (reset) return page;
            const known = new Set(prev.map((item) => item.id));
            const merged = [...prev];
            for (const nextItem of page) {
              if (known.has(nextItem.id)) continue;
              known.add(nextItem.id);
              merged.push(nextItem);
            }
            return merged;
          });
          setHasMoreProducts(page.length === CATALOG_PAGE_SIZE);
        } else {
          setServices((prev) => {
            if (reset) return page;
            const known = new Set(prev.map((item) => item.id));
            const merged = [...prev];
            for (const nextItem of page) {
              if (known.has(nextItem.id)) continue;
              known.add(nextItem.id);
              merged.push(nextItem);
            }
            return merged;
          });
          setHasMoreServices(page.length === CATALOG_PAGE_SIZE);
        }
      } catch (error) {
        console.error(error);
        notifyError("Не удалось загрузить каталог");
      } finally {
        if (mode === "products") {
          setIsLoadingProducts(false);
        } else {
          setIsLoadingServices(false);
        }
      }
    },
    [isLoadingProducts, isLoadingServices, products, services],
  );

  useEffect(() => {
    void loadStaticCatalogData();
  }, [loadStaticCatalogData]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      if (viewMode === "products") {
        void loadCatalogChunk("products", { reset: true });
        return;
      }
      void loadCatalogChunk("services", { reset: true });
    }, 350);

    return () => {
      window.clearTimeout(handler);
    };
  }, [filters, loadCatalogChunk, viewMode]);

  const handleLoadMoreCatalogItems = useCallback(() => {
    if (viewMode === "products") {
      if (!hasMoreProducts || isLoadingProducts) return;
      void loadCatalogChunk("products");
      return;
    }

    if (!hasMoreServices || isLoadingServices) return;
    void loadCatalogChunk("services");
  }, [
    hasMoreProducts,
    hasMoreServices,
    isLoadingProducts,
    isLoadingServices,
    loadCatalogChunk,
    viewMode,
  ]);

  const currentItems = viewMode === "products" ? products : services;
  const currentCategories =
    viewMode === "products" ? productCategories : serviceCategories;
  const hasMoreItems =
    viewMode === "products" ? hasMoreProducts : hasMoreServices;
  const isLoadingMoreItems =
    viewMode === "products" ? isLoadingProducts : isLoadingServices;

  useEffect(() => {
    if (!deepLinkListingId || currentView !== "product") return;

    const allItems = [...products, ...services];
    const target = allItems.find((item) => item.id === deepLinkListingId);
    if (target) {
      setSelectedProduct(target);
      setDeepLinkListingId(null);
      setIsDeepLinkListingLoading(false);
      return;
    }

    let cancelled = false;
    setIsDeepLinkListingLoading(true);

    void apiGet<Product>(
      `/catalog/listings/${encodeURIComponent(deepLinkListingId)}`,
    )
      .then((listing) => {
        if (cancelled) return;
        setSelectedProduct(listing);
        setDeepLinkListingId(null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to load listing by id:", error);
        setDeepLinkListingId(null);
        setCurrentView("home");
      })
      .finally(() => {
        if (!cancelled) {
          setIsDeepLinkListingLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentView, deepLinkListingId, products, services]);

  const categoryMap = useMemo(() => {
    const newMap = new Map<string, Set<string>>();
    for (const category of currentCategories) {
      const allSubCategoryItems = new Set<string>();
      for (const subcategory of category.subcategories) {
        const subCategoryItems = new Set(subcategory.items);
        newMap.set(subcategory.name, subCategoryItems);
        for (const item of subCategoryItems) {
          allSubCategoryItems.add(item);
        }
      }
      newMap.set(category.name, allSubCategoryItems);
    }
    return newMap;
  }, [currentCategories]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const requestLoginForCartAccess = () => {
    if (isAuthenticated) {
      return true;
    }

    setCurrentView("auth");
    scrollToTop();
    return false;
  };

  const addToCartUnsafe = (product: Product) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item,
        );
      }

      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const addToCart = (product: Product) => {
    if (!requestLoginForCartAccess()) {
      return;
    }
    addToCartUnsafe(product);
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      setCartItems((prev) => prev.filter((item) => item.id !== id));
      return;
    }

    setCartItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              quantity,
            }
          : item,
      ),
    );
  };

  const handleSearchSubmit = (query: string) => {
    setFilters((prev) => ({ ...prev, searchQuery: query }));
    setIsSearchActive(query.length > 0);
    setCurrentView("home");
  };

  const handleLogoClick = () => {
    setCurrentView("home");
    setCurrentProfileTab("profile");
    setCurrentAdminPage("transactions");
    setDeepLinkListingId(null);
    setSelectedProduct(null);
    setIsSearchActive(false);
    setFilters(DEFAULT_FILTERS);
    scrollToTop();
  };

  const handleBannerClick = (category: string) => {
    setCurrentView("home");
    setSelectedProduct(null);
    setIsSearchActive(false);

    if (category === "sale") {
      setFilters({ ...DEFAULT_FILTERS, showOnlySale: true });
    } else if (category) {
      setFilters({ ...DEFAULT_FILTERS, categories: [category] });
    } else {
      setFilters(DEFAULT_FILTERS);
    }

    window.scrollTo({ top: 600, behavior: "smooth" });
  };

  const handleCartClick = () => {
    if (!requestLoginForCartAccess()) {
      return;
    }
    setCurrentView("cart");
    scrollToTop();
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setDeepLinkListingId(product.id);
    setCurrentView("product");
    scrollToTop();
  };

  const handleBuyNow = (product: Product) => {
    if (!requestLoginForCartAccess()) {
      return;
    }

    const itemInCart = cartItems.find((item) => item.id === product.id);
    if (!itemInCart) {
      addToCartUnsafe(product);
    }
    setCurrentView("checkout");
    scrollToTop();
  };

  const handleCheckout = (deliveryType: "delivery" | "pickup") => {
    setSelectedDeliveryType(deliveryType);
    setCurrentView("checkout");
    scrollToTop();
  };

  const handleFooterNavigation = (page: FooterPage) => {
    if (page === "partnership" && !isAuthenticated) {
      setCurrentView("auth");
      scrollToTop();
      return;
    }

    if (page === "partnership" && isAuthenticated) {
      setCurrentProfileTab("partnership");
      setCurrentView("profile");
      scrollToTop();
      return;
    }

    if (page !== "partnership") {
      setCurrentProfileTab("profile");
    }
    setCurrentView(page);
    scrollToTop();
  };

  const handleProfileClick = () => {
    if (!isAuthenticated) {
      setCurrentView("auth");
      scrollToTop();
      return;
    }

    if (userType === "admin") {
      setCurrentView("adminPanel");
      return;
    }

    setCurrentProfileTab("profile");
    setCurrentView("profile");
    scrollToTop();
  };

  const filteredItems = useMemo(() => {
    const effectiveCategories = new Set<string>();
    if (filters.categories.length > 0) {
      for (const selectedCategory of filters.categories) {
        const children = categoryMap.get(selectedCategory);
        if (children) {
          for (const child of children) {
            effectiveCategories.add(child);
          }
        } else {
          effectiveCategories.add(selectedCategory);
        }
      }
    }

    return currentItems.filter((item) => {
      if (
        effectiveCategories.size > 0 &&
        !effectiveCategories.has(item.category)
      )
        return false;
      if (
        item.price < filters.priceRange[0] ||
        item.price > filters.priceRange[1]
      )
        return false;
      if (item.rating < filters.minRating) return false;

      if (filters.searchQuery) {
        const isMatch = matchesSearch(
          {
            id: item.id,
            title: item.title,
            description: item.description,
            category: item.category,
            seller: item.seller,
            city: item.city,
            sku: item.sku,
            specifications: item.specifications,
          },
          filters.searchQuery,
        );
        if (!isMatch) return false;
      }

      if (filters.showOnlySale && !item.isSale) return false;

      if (filters.condition && filters.condition !== "all") {
        if (!item.condition || item.condition !== filters.condition)
          return false;
      }

      if (filters.includeWords) {
        const words = filters.includeWords
          .toLowerCase()
          .split(" ")
          .filter(Boolean);
        if (words.some((word) => !item.title.toLowerCase().includes(word)))
          return false;
      }

      if (filters.excludeWords) {
        const words = filters.excludeWords
          .toLowerCase()
          .split(" ")
          .filter(Boolean);
        if (words.some((word) => item.title.toLowerCase().includes(word)))
          return false;
      }

      return true;
    });
  }, [currentItems, filters, categoryMap]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((left, right) => {
      switch (sortBy) {
        case "price-asc":
          return left.price - right.price;
        case "price-desc":
          return right.price - left.price;
        case "rating":
          return right.rating - left.rating;
        case "newest":
          return right.isNew === left.isNew ? 0 : right.isNew ? 1 : -1;
        default:
          return 0;
      }
    });
  }, [filteredItems, sortBy]);

  const lazyFallback = (
    <div className="page-container py-16 text-center text-gray-600">
      Загрузка...
    </div>
  );

  if (currentView === "product" && selectedProduct) {
    const cartItem = cartItems.find((item) => item.id === selectedProduct.id);
    const cartQuantity = cartItem ? cartItem.quantity : 0;
    const relatedPool = [...products, ...services];

    return (
      <div className="min-h-screen app-shell">
        <div className="app-header-spacer" aria-hidden="true" />

        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <ProductDetail
            product={selectedProduct}
            onBack={() => {
              setSelectedProduct(null);
              setCurrentView("home");
            }}
            onAddToCart={addToCart}
            onBuyNow={handleBuyNow}
            onUpdateQuantity={updateQuantity}
            cartQuantity={cartQuantity}
            relatedProducts={relatedPool
              .filter(
                (item) =>
                  item.id !== selectedProduct.id &&
                  item.category === selectedProduct.category,
              )
              .slice(0, 4)}
            initialIsWishlisted={wishlistProductIds.has(selectedProduct.id)}
            onWishlistToggle={handleWishlistToggle}
          />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </div>
    );
  }

  if (currentView === "product" && !selectedProduct) {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <div className="page-container py-16 text-center text-gray-600">
          {isDeepLinkListingLoading
            ? "Загрузка объявления..."
            : "Объявление не найдено"}
        </div>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "cart") {
    return (
      <>
        <Suspense fallback={lazyFallback}>
          <CartPage
            items={cartItems}
            onUpdateQuantity={updateQuantity}
            onCheckout={handleCheckout}
          />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "checkout") {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <CheckoutPage
            items={cartItems}
            deliveryType={selectedDeliveryType}
            onBack={() => setCurrentView("cart")}
            onRemoveUnavailableItems={(itemIds) => {
              setCartItems((prev) =>
                prev.filter((item) => !itemIds.includes(item.id)),
              );
            }}
            onComplete={(result) => {
              setLastOrderTotal(result.total);
              setLastPaymentMethod(result.paymentMethod);
              setLastOrderIds(result.orderIds);
              setLastDeliveryType(result.deliveryType);
              setCartItems([]);
              setCurrentView("orderComplete");
            }}
          />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "orderComplete") {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <OrderCompletePage
            orderTotal={lastOrderTotal}
            orderIds={lastOrderIds}
            paymentMethod={lastPaymentMethod}
            deliveryType={lastDeliveryType}
            onViewHistory={() => {
              setCurrentProfileTab("orders");
              setCurrentView("profile");
              scrollToTop();
            }}
            onBackToHome={handleLogoClick}
          />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "about") {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <AboutPage onBack={handleLogoClick} />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "partnership") {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <PartnershipPage onBack={handleLogoClick} />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "faq") {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <FAQPage onBack={handleLogoClick} />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "privacy") {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <PrivacyPage onBack={handleLogoClick} />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "terms") {
    return (
      <>
        <Header
          isAuthenticated={isAuthenticated}
          cartItemCount={cartItems.reduce(
            (sum, item) => sum + item.quantity,
            0,
          )}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <Suspense fallback={lazyFallback}>
          <TermsPage onBack={handleLogoClick} />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "auth") {
    return (
      <Suspense fallback={lazyFallback}>
        <AuthPage
          onBack={handleLogoClick}
          onPartnershipClick={() => setCurrentView("partnership")}
          onLoginSuccess={(role, user, profile) => {
            if (!user) return;
            saveSessionUser(user);
            setCurrentUser(user);
            setIsAuthenticated(true);
            setUserType(role || "regular");
            setWishlistProductIds(
              new Set(profile.wishlist.map((item) => item.id)),
            );

            if (role === "admin") {
              setCurrentAdminPage("transactions");
              setCurrentView("adminPanel");
              return;
            }

            setCurrentProfileTab("profile");
            setCurrentView("profile");
          }}
        />
      </Suspense>
    );
  }

  if (currentView === "profile") {
    return (
      <Suspense fallback={lazyFallback}>
        <ProfilePage
          onBack={handleLogoClick}
          onLogout={() => {
            clearSessionUser();
            setCurrentUser(null);
            setIsAuthenticated(false);
            setUserType("regular");
            setCurrentProfileTab("profile");
            setCurrentView("auth");
          }}
          userType={userType === "partner" ? "partner" : "regular"}
          initialTab={currentProfileTab}
          onTabChange={setCurrentProfileTab}
          onWishlistUpdate={handleWishlistToggle}
          onOpenListing={(listingPublicId) => {
            setSelectedProduct(null);
            setDeepLinkListingId(listingPublicId);
            setCurrentView("product");
            scrollToTop();
          }}
        />
      </Suspense>
    );
  }

  if (currentView === "adminLogin") {
    return (
      <Suspense fallback={lazyFallback}>
        <AdminLogin
          onBack={handleLogoClick}
          onLoginSuccess={(user) => {
            if (user) {
              saveSessionUser(user);
              setCurrentUser(user);
              setIsAuthenticated(true);
              setUserType(user.role);
            }
            setCurrentAdminPage("transactions");
            setCurrentView("adminPanel");
          }}
        />
      </Suspense>
    );
  }

  if (currentView === "adminPanel") {
    return (
      <Suspense fallback={lazyFallback}>
        <AdminPanel
          initialPage={currentAdminPage}
          onPageChange={setCurrentAdminPage}
          onBack={() => {
            setCurrentView("home");
            scrollToTop();
          }}
          userName={currentUser?.name}
          userEmail={currentUser?.email}
          onLogout={() => {
            clearSessionUser();
            setCurrentUser(null);
            setIsAuthenticated(false);
            setUserType("regular");
            setCurrentAdminPage("transactions");
            setCurrentView("home");
            scrollToTop();
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen app-shell">
      <div className="app-header-spacer" aria-hidden="true" />

      <Header
        isAuthenticated={isAuthenticated}
        cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={handleCartClick}
        onSearchSubmit={handleSearchSubmit}
        onLogoClick={handleLogoClick}
        onProfileClick={handleProfileClick}
      />

      {!isSearchActive && <Hero onBannerClick={handleBannerClick} />}

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
                onFilterChange={(newFilters) => {
                  setFilters(newFilters);
                  if (newFilters.searchQuery === "") {
                    setIsSearchActive(false);
                  }
                }}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                categories={currentCategories}
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

        <div className="mt-6 flex gap-4 lg:mt-8 lg:gap-7">
          <aside className="w-80 flex-shrink-0 hidden lg:block self-start">
            <FilterPanel
              filters={filters}
              onFilterChange={(newFilters) => {
                setFilters(newFilters);
                if (newFilters.searchQuery === "") {
                  setIsSearchActive(false);
                }
              }}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              categories={currentCategories}
            />
          </aside>

          <main className="flex-1 min-w-0">
            <ProductGrid
              products={sortedItems}
              hasMore={hasMoreItems}
              isLoadingMore={isLoadingMoreItems}
              onLoadMore={handleLoadMoreCatalogItems}
              onProductClick={handleProductClick}
              onAddToCart={addToCart}
              onUpdateQuantity={updateQuantity}
              cartItems={cartItems}
              sortBy={sortBy}
              onSortChange={setSortBy}
              viewMode={viewMode}
              wishlistProductIds={wishlistProductIds}
              onWishlistToggle={handleWishlistToggle}
            />
          </main>
        </div>
      </div>

      <Footer onNavigate={handleFooterNavigation} />
    </div>
  );
}
