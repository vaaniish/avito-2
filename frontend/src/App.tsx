import {
  Suspense,
  type ReactNode,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Footer, type FooterPage } from "./components/Footer";
import { AppCatalogView } from "./components/AppCatalogView";
import {
  AppPageShell,
  type AppPageShellHeaderProps,
} from "./components/AppPageShell";
import type { CatalogCategory, CatalogItem } from "./components/FilterPanel";
import type { ProfileTab } from "./components/pages/profile.models";
import type { AdminPage } from "./components/admin/AdminPanel";
import type { CartItem, FilterState, Product } from "./types";
import {
  apiGet,
  apiPost,
  apiDelete,
  clearSessionUser,
  getSessionToken,
  getSessionUser,
  saveSessionUser,
  type SessionRole,
  type SessionUser,
} from "./lib/api";
import { matchesSearch } from "./lib/search";
import { notifyError } from "./components/ui/notifications";
import { initYandexMetrika } from "./lib/metrika";
import {
  buildPathForView,
  parseRoute,
  type AppView,
} from "./lib/app-routing";

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
const PaymentReturnPage = lazy(() =>
  import("./components/PaymentReturnPage").then((module) => ({
    default: module.PaymentReturnPage,
  })),
);
const ProductDetail = lazy(() =>
  import("./components/ProductDetail").then((module) => ({
    default: module.ProductDetail,
  })),
);
const SellerStorePage = lazy(() =>
  import("./components/SellerStorePage").then((module) => ({
    default: module.SellerStorePage,
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
const PartnerListingsPage = lazy(() =>
  import("./components/pages/PartnerListingsPage").then((module) => ({
    default: module.PartnerListingsPage,
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
const CATALOG_ORDER_UPDATED_EVENT = "catalog-order-updated";

type CatalogMode = "products";
type AuthProfileData = { wishlist: Array<{ id: string }> };

function resolveCatalogItemIds(
  categories: CatalogCategory[],
  selectedValues: string[],
): string[] {
  if (!selectedValues.length) return [];
  const bySelection = new Map<string, Set<string>>();
  for (const category of categories) {
    const categoryItemIds = new Set<string>();
    for (const subcategory of category.subcategories) {
      const catalogItems = subcategory.catalogItems?.length
        ? subcategory.catalogItems
        : subcategory.items.map((item) => ({ id: item, name: item }));
      const subcategoryItemIds = new Set(catalogItems.map((item) => item.id));
      bySelection.set(subcategory.id, subcategoryItemIds);
      bySelection.set(subcategory.name, subcategoryItemIds);
      for (const item of catalogItems) {
        categoryItemIds.add(item.id);
        bySelection.set(item.id, new Set([item.id]));
        bySelection.set(item.name, new Set([item.id]));
      }
    }
    bySelection.set(category.id, categoryItemIds);
    bySelection.set(category.name, categoryItemIds);
  }

  const resolved = new Set<string>();
  for (const value of selectedValues) {
    const itemIds = bySelection.get(value);
    if (!itemIds) {
      resolved.add(value);
      continue;
    }
    for (const itemId of itemIds) {
      resolved.add(itemId);
    }
  }
  return Array.from(resolved);
}

function catalogItemIdSet(categories: CatalogCategory[]): Set<string> {
  const ids = new Set<string>();
  for (const category of categories) {
    for (const subcategory of category.subcategories) {
      const catalogItems = subcategory.catalogItems?.length
        ? subcategory.catalogItems
        : subcategory.items.map((item) => ({ id: item }));
      for (const item of catalogItems) {
        ids.add(item.id);
      }
    }
  }
  return ids;
}

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSessionHydrated, setIsSessionHydrated] = useState(false);
  const [userType, setUserType] = useState<SessionRole>("regular");
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [lastOrderIds, setLastOrderIds] = useState<string[]>([]);
  const [selectedDeliveryType, setSelectedDeliveryType] = useState<
    "delivery" | "pickup"
  >("delivery");
  const [lastDeliveryType, setLastDeliveryType] = useState<
    "delivery" | "pickup"
  >("delivery");

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewMode] = useState<CatalogMode>("products");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<string>("popular");
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [wishlistProductIds, setWishlistProductIds] = useState(
    new Set<string>(),
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [isDeepLinkListingLoading, setIsDeepLinkListingLoading] =
    useState(false);
  const [hasMoreProducts, setHasMoreProducts] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productCategories, setProductCategories] = useState<CatalogCategory[]>(
    [],
  );
  const [catalogCategoriesLoadAttempt, setCatalogCategoriesLoadAttempt] =
    useState(0);
  const productsRef = useRef<Product[]>([]);
  const isLoadingProductsRef = useRef(false);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  useEffect(() => {
    isLoadingProductsRef.current = isLoadingProducts;
  }, [isLoadingProducts]);

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
    const existingToken = getSessionToken();
    if (!existingSession || !existingToken) {
      if (existingSession && !existingToken) {
        clearSessionUser();
      }
      setIsSessionHydrated(true);
      return;
    }

    setCurrentUser(existingSession);
    setUserType(existingSession.role);
    setIsAuthenticated(true);
    setIsSessionHydrated(true);
    const shouldAutoOpenAdminPanel =
      existingSession.role === "admin" &&
      (initialRoute.view === "home" || initialRoute.view === "adminLogin");
    if (shouldAutoOpenAdminPanel) {
      setCurrentView("adminPanel");
    }
  }, []);

  useEffect(() => {
    initYandexMetrika();
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
      setSelectedCatalogItemId(parsedRoute.catalogItemId);
      setDeepLinkSellerId(parsedRoute.sellerId);
      setProductBackAdminPage(
        parsedRoute.productReturnTo === "admin-listings" ? "listings" : null,
      );
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
      catalogItemId: selectedCatalogItemId,
      sellerId: deepLinkSellerId,
      adminPage: currentAdminPage,
      profileTab: currentProfileTab,
      productReturnTo: productBackAdminPage === "listings" ? "admin-listings" : null,
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
    deepLinkSellerId,
    productBackAdminPage,
    selectedCatalogItemId,
    selectedProduct?.id,
  ]);

  useEffect(() => {
    if (!isSessionHydrated) {
      return;
    }

    if (currentView === "adminPanel") {
      if (!isAuthenticated || userType !== "admin") {
        setCurrentView("adminLogin");
      }
      return;
    }

    if (
      (currentView === "profile" ||
        currentView === "partnerListingCreate" ||
        (currentView === "partnership" && currentProfileTab === "partnership") ||
        currentView === "cart" ||
        currentView === "checkout") &&
      !isAuthenticated
    ) {
      setCurrentView("auth");
    }
  }, [currentProfileTab, currentView, isAuthenticated, isSessionHydrated, userType]);

  const loadStaticCatalogData = useCallback(async () => {
    try {
      const productResult = await apiGet<CatalogCategory[]>("/catalog/categories?type=products");
      setProductCategories(productResult);
    } catch (error) {
      console.error(error);
      notifyError("Не удалось загрузить каталог");
    }
  }, []);

  const loadCatalogChunk = useCallback(
    async (mode: CatalogMode, options?: { reset?: boolean }) => {
      const reset = Boolean(options?.reset);
      const sourceItems = productsRef.current;
      const offset = reset ? 0 : sourceItems.length;

      if (isLoadingProductsRef.current) return;
      isLoadingProductsRef.current = true;
      setIsLoadingProducts(true);

      try {
        const params = new URLSearchParams({
          type: mode,
          limit: String(CATALOG_PAGE_SIZE),
          offset: String(offset),
        });
        if (selectedCatalogItemId) {
          params.set("itemId", selectedCatalogItemId);
        } else {
          const selectedItemIds = resolveCatalogItemIds(
            productCategories,
            filters.categories,
          );
          if (selectedItemIds.length > 0) {
            params.set("itemIds", selectedItemIds.join(","));
          }
        }
        const page = await apiGet<Product[]>(
          `/catalog/listings?${params.toString()}`,
        );

        setProducts((prev) => {
          if (reset) {
            productsRef.current = page;
            return page;
          }
          const known = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const nextItem of page) {
            if (known.has(nextItem.id)) continue;
            known.add(nextItem.id);
            merged.push(nextItem);
          }
          productsRef.current = merged;
          return merged;
        });
        setHasMoreProducts(page.length === CATALOG_PAGE_SIZE);
      } catch (error) {
        console.error(error);
        notifyError("Не удалось загрузить каталог");
      } finally {
        isLoadingProductsRef.current = false;
        setIsLoadingProducts(false);
      }
    },
    [filters.categories, productCategories, selectedCatalogItemId],
  );

  useEffect(() => {
    void loadStaticCatalogData();
  }, [catalogCategoriesLoadAttempt, loadStaticCatalogData]);

  useEffect(() => {
    const reloadCatalogOrder = () => {
      void loadStaticCatalogData();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CATALOG_ORDER_UPDATED_EVENT) {
        reloadCatalogOrder();
      }
    };

    window.addEventListener(CATALOG_ORDER_UPDATED_EVENT, reloadCatalogOrder);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(CATALOG_ORDER_UPDATED_EVENT, reloadCatalogOrder);
      window.removeEventListener("storage", handleStorage);
    };
  }, [loadStaticCatalogData]);

  useEffect(() => {
    if (productCategories.length > 0 || catalogCategoriesLoadAttempt >= 2) {
      return;
    }

    const retryTimer = window.setTimeout(() => {
      setCatalogCategoriesLoadAttempt((attempt) => attempt + 1);
    }, 1000);

    return () => window.clearTimeout(retryTimer);
  }, [catalogCategoriesLoadAttempt, productCategories.length]);

  useEffect(() => {
    const handler = window.setTimeout(() => {
      void loadCatalogChunk("products", { reset: true });
    }, 350);

    return () => {
      window.clearTimeout(handler);
    };
  }, [filters, loadCatalogChunk, selectedCatalogItemId, viewMode]);

  const handleLoadMoreCatalogItems = useCallback(() => {
    if (!hasMoreProducts || isLoadingProducts) return;
    void loadCatalogChunk("products");
  }, [
    hasMoreProducts,
    isLoadingProducts,
    loadCatalogChunk,
  ]);

  const currentItems = products;
  const currentCategories = productCategories;
  const hasMoreItems = hasMoreProducts;
  const isLoadingMoreItems = isLoadingProducts;
  const cartItemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );

  useEffect(() => {
    if (!deepLinkListingId || currentView !== "product") return;

    const allItems = products;
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
  }, [currentView, deepLinkListingId, products]);

  const categoryMap = useMemo(() => {
    const newMap = new Map<string, Set<string>>();
    for (const category of currentCategories) {
      const allSubCategoryItems = new Set<string>();
      for (const subcategory of category.subcategories) {
        const catalogItems = subcategory.catalogItems?.length
          ? subcategory.catalogItems
          : subcategory.items.map((item) => ({ id: item, name: item }));
        const subCategoryItems = new Set(catalogItems.map((item) => item.id));
        newMap.set(subcategory.id, subCategoryItems);
        newMap.set(subcategory.name, subCategoryItems);
        for (const item of subCategoryItems) {
          allSubCategoryItems.add(item);
        }
      }
      newMap.set(category.id, allSubCategoryItems);
      newMap.set(category.name, allSubCategoryItems);
    }
    return newMap;
  }, [currentCategories]);

  useEffect(() => {
    if (currentCategories.length === 0) return;

    const validCatalogItemIds = catalogItemIdSet(currentCategories);
    if (validCatalogItemIds.size === 0) return;

    if (
      selectedCatalogItemId &&
      !validCatalogItemIds.has(selectedCatalogItemId)
    ) {
      setSelectedCatalogItemId(null);
      setCurrentView("home");
    }

    if (filters.categories.length === 0) return;

    const nextFilterCategories = filters.categories.filter((category) =>
      validCatalogItemIds.has(category),
    );
    if (nextFilterCategories.length === filters.categories.length) return;

    setFilters((prev) => ({
      ...prev,
      categories: prev.categories.filter((category) =>
        validCatalogItemIds.has(category),
      ),
    }));
  }, [currentCategories, filters.categories, selectedCatalogItemId]);

  const scrollToTop = () => {
    const scroll = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    scroll();
    window.requestAnimationFrame(scroll);
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
    setSelectedCatalogItemId(null);
    setFilters((prev) => ({ ...prev, searchQuery: query }));
    setIsSearchActive(query.length > 0);
    setCurrentView("home");
  };

  const handleCatalogItemSelect = (item: CatalogItem) => {
    setSelectedCatalogItemId(item.id);
    setSelectedProduct(null);
    setDeepLinkListingId(null);
    setFilters(DEFAULT_FILTERS);
    setIsSearchActive(false);
    setCurrentView("catalogItem");
    scrollToTop();
  };

  const handleLogoClick = () => {
    setCurrentView("home");
    setCurrentProfileTab("profile");
    setCurrentAdminPage("transactions");
    setDeepLinkListingId(null);
    setSelectedCatalogItemId(null);
    setDeepLinkSellerId(null);
    setSellerBackListingId(null);
    setProductBackSellerId(null);
    setProductBackProfileTab(null);
    setSelectedProduct(null);
    setIsSearchActive(false);
    setFilters(DEFAULT_FILTERS);
    scrollToTop();
  };

  const handleBannerClick = (category: string) => {
    setCurrentView("home");
    setSelectedCatalogItemId(null);
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
    setProductBackSellerId(currentView === "sellerStore" ? deepLinkSellerId : null);
    setProductBackProfileTab(null);
    setProductBackAdminPage(null);
    setSelectedProduct(product);
    setDeepLinkListingId(product.id);
    setCurrentView("product");
    scrollToTop();
  };

  const handleOpenSellerStore = (sellerId: string) => {
    const normalized = sellerId.trim();
    if (!normalized) return;
    setSellerBackListingId(currentView === "product" ? selectedProduct?.id ?? null : null);
    setDeepLinkSellerId(normalized);
    setCurrentView("sellerStore");
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

  const handleCheckout = (_deliveryType: "delivery" | "pickup") => {
    setSelectedDeliveryType("delivery");
    setCurrentView("checkout");
    scrollToTop();
  };

  const handleFooterNavigation = (page: FooterPage) => {
    if (page === "partnership" && !isAuthenticated) {
      setCurrentProfileTab("partnership");
      setCurrentView("auth");
      scrollToTop();
      return;
    }

    if (page === "partnership" && isAuthenticated) {
      setCurrentProfileTab("partnership");
      setCurrentView("partnership");
      scrollToTop();
      return;
    }

    if (page !== "partnership") {
      setCurrentProfileTab("profile");
    }
    setCurrentView(page);
    scrollToTop();
  };

  const handleOpenPartnershipPage = () => {
    setCurrentProfileTab("profile");
    setCurrentView("partnership");
    scrollToTop();
  };

  const handleOpenProfilePartnershipPage = () => {
    setCurrentProfileTab("partnership");
    setCurrentView("partnership");
    scrollToTop();
  };

  const handlePartnershipBack = () => {
    if (currentProfileTab === "partnership") {
      setCurrentProfileTab("profile");
      setCurrentView("profile");
      scrollToTop();
      return;
    }

    handleLogoClick();
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

  const handleAuthLoginSuccess = (
    role: SessionRole,
    user: SessionUser,
    profile: AuthProfileData,
  ) => {
    saveSessionUser(user);
    setCurrentUser(user);
    setIsAuthenticated(true);
    setUserType(role || "regular");
    setWishlistProductIds(new Set(profile.wishlist.map((item) => item.id)));

    if (role === "admin") {
      setCurrentAdminPage("transactions");
      setCurrentView("adminPanel");
      return;
    }

    if (currentProfileTab === "partnership") {
      setCurrentView("partnership");
      return;
    }

    setCurrentView("profile");
  };

  const handleProfileLogout = () => {
    clearSessionUser();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setUserType("regular");
    setCurrentProfileTab("profile");
    setCurrentView("auth");
  };

  const handleAdminLoginSuccess = (user?: SessionUser) => {
    if (user) {
      saveSessionUser(user);
      setCurrentUser(user);
      setIsAuthenticated(true);
      setUserType(user.role);
    }
    setCurrentAdminPage("transactions");
    setCurrentView("adminPanel");
  };

  const handleAdminLogout = () => {
    clearSessionUser();
    setCurrentUser(null);
    setIsAuthenticated(false);
    setUserType("regular");
    setCurrentAdminPage("transactions");
    setCurrentView("home");
    scrollToTop();
  };

  const handleProfileOpenListing = (listingPublicId: string) => {
    setSelectedProduct(null);
    setDeepLinkListingId(listingPublicId);
    setProductBackProfileTab(currentProfileTab);
    setProductBackAdminPage(null);
    setCurrentView("product");
    scrollToTop();
  };

  const handleOpenCreateListing = () => {
    setCurrentProfileTab("partner-listings");
    setCurrentView("partnerListingCreate");
    scrollToTop();
  };

  const handleCloseCreateListing = () => {
    setCurrentProfileTab("partner-listings");
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
        !effectiveCategories.has(item.catalogItemId ?? item.category)
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

  const renderWithAppShell = (
    content: ReactNode,
    options?: { wrapperClassName?: string },
  ) => (
    <AppPageShell
      {...appShellHeaderProps}
      onFooterNavigate={handleFooterNavigation}
      wrapperClassName={options?.wrapperClassName}
    >
      {content}
    </AppPageShell>
  );

  if (currentView === "product" && selectedProduct) {
    const cartItem = cartItems.find((item) => item.id === selectedProduct.id);
    const cartQuantity = cartItem ? cartItem.quantity : 0;
    const relatedPool = products;

    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <ProductDetail
          product={selectedProduct}
          onBack={() => {
            setSelectedProduct(null);
            if (productBackSellerId) {
              setCurrentView("sellerStore");
              setDeepLinkSellerId(productBackSellerId);
              setProductBackSellerId(null);
              return;
            }
            if (productBackProfileTab) {
              setCurrentProfileTab(productBackProfileTab);
              setProductBackProfileTab(null);
              setCurrentView("profile");
              return;
            }
            if (productBackAdminPage) {
              setCurrentAdminPage(productBackAdminPage);
              setProductBackAdminPage(null);
              setCurrentView("adminPanel");
              return;
            }
            setCurrentView("home");
          }}
          backLabel={
            productBackAdminPage === "listings"
              ? "Назад к модерации объявлений"
              : undefined
          }
          onOpenSellerStore={handleOpenSellerStore}
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
      </Suspense>,
      { wrapperClassName: "min-h-screen app-shell" },
    );
  }

  if (currentView === "product" && !selectedProduct) {
    return renderWithAppShell(
      <div className="page-container py-16 text-center text-gray-600">
        {isDeepLinkListingLoading
          ? "Загрузка объявления..."
          : "Объявление не найдено"}
      </div>,
    );
  }

  if (currentView === "sellerStore" && deepLinkSellerId) {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <SellerStorePage
          sellerId={deepLinkSellerId}
          onBack={() => {
            if (!sellerBackListingId) {
              handleLogoClick();
              return;
            }

            const listingId = sellerBackListingId;
            const knownListing =
              products.find((item) => item.id === listingId) ??
              null;

            setCurrentView("product");
            setDeepLinkListingId(listingId);
            setSelectedProduct((prev) => {
              if (prev?.id === listingId) return prev;
              return knownListing;
            });
            setSellerBackListingId(null);
            scrollToTop();
          }}
          onOpenListing={(product) => {
            setProductBackSellerId(deepLinkSellerId);
            setProductBackAdminPage(null);
            setSelectedProduct(product);
            setDeepLinkListingId(product.id);
            setCurrentView("product");
            scrollToTop();
          }}
          onAddToCart={addToCart}
          onUpdateQuantity={updateQuantity}
          cartItems={cartItems}
          wishlistProductIds={wishlistProductIds}
          onWishlistToggle={handleWishlistToggle}
        />
      </Suspense>,
    );
  }

  if (currentView === "sellerStore" && !deepLinkSellerId) {
    return renderWithAppShell(
      <div className="page-container py-16 text-center text-gray-600">
        Профиль продавца не найден
      </div>,
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
            onBackToHome={handleLogoClick}
          />
        </Suspense>
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "checkout") {
    return renderWithAppShell(
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
          onOrderCreated={(result) => {
            setLastOrderTotal(result.total);
            setLastOrderIds(result.orderIds);
            setLastDeliveryType(result.deliveryType);
          }}
          onComplete={(result) => {
            setLastOrderTotal(result.total);
            setLastOrderIds(result.orderIds);
            setLastDeliveryType(result.deliveryType);
            setCartItems([]);
            setCurrentView("orderComplete");
          }}
        />
      </Suspense>,
    );
  }

  if (currentView === "orderComplete") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <OrderCompletePage
          orderTotal={lastOrderTotal}
          orderIds={lastOrderIds}
          deliveryType={lastDeliveryType}
          onViewHistory={() => {
            setCurrentProfileTab("orders");
            setCurrentView("profile");
            scrollToTop();
          }}
          onBackToHome={handleLogoClick}
        />
      </Suspense>,
    );
  }

  if (currentView === "paymentReturn") {
    return (
      <Suspense fallback={lazyFallback}>
        <PaymentReturnPage />
      </Suspense>
    );
  }

  if (currentView === "about") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <AboutPage onBack={handleLogoClick} />
      </Suspense>,
    );
  }

  if (currentView === "partnership") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <PartnershipPage onBack={handlePartnershipBack} />
      </Suspense>,
    );
  }

  if (currentView === "faq") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <FAQPage onBack={handleLogoClick} />
      </Suspense>,
    );
  }

  if (currentView === "privacy") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <PrivacyPage onBack={handleLogoClick} />
      </Suspense>,
    );
  }

  if (currentView === "terms") {
    return renderWithAppShell(
      <Suspense fallback={lazyFallback}>
        <TermsPage onBack={handleLogoClick} />
      </Suspense>,
    );
  }

  if (currentView === "auth") {
    return (
      <Suspense fallback={lazyFallback}>
        <AuthPage
          onBack={handleLogoClick}
          onPartnershipClick={handleOpenPartnershipPage}
          onLoginSuccess={handleAuthLoginSuccess}
        />
      </Suspense>
    );
  }

  if (currentView === "profile") {
    return (
      <Suspense fallback={lazyFallback}>
        <ProfilePage
          onBack={handleLogoClick}
          onLogout={handleProfileLogout}
          userType={userType === "partner" ? "partner" : "regular"}
          initialTab={currentProfileTab}
          onTabChange={setCurrentProfileTab}
          onPartnershipClick={handleOpenProfilePartnershipPage}
          onWishlistUpdate={handleWishlistToggle}
          onOpenListing={handleProfileOpenListing}
          onOpenCreateListing={handleOpenCreateListing}
        />
      </Suspense>
    );
  }

  if (currentView === "partnerListingCreate") {
    return (
      <Suspense fallback={lazyFallback}>
        <PartnerListingsPage
          createMode
          onRequestAddressChange={() => {
            setCurrentProfileTab("addresses");
            setCurrentView("profile");
            scrollToTop();
          }}
          onOpenListing={handleProfileOpenListing}
          onExitCreate={handleCloseCreateListing}
        />
      </Suspense>
    );
  }

  if (currentView === "adminLogin") {
    return (
      <Suspense fallback={lazyFallback}>
        <AdminLogin
          onBack={handleLogoClick}
          onLoginSuccess={handleAdminLoginSuccess}
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
          onLogout={handleAdminLogout}
        />
      </Suspense>
    );
  }

  const handleCatalogFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    if (newFilters.searchQuery === "") {
      setIsSearchActive(false);
    }
  };

  return renderWithAppShell(
    <AppCatalogView
      isSearchActive={isSearchActive}
      hideHero={isSearchActive || currentView === "catalogItem"}
      filters={filters}
      viewMode={viewMode}
      categories={currentCategories}
      sortedItems={sortedItems}
      hasMoreItems={hasMoreItems}
      isLoadingMoreItems={isLoadingMoreItems}
      cartItems={cartItems}
      sortBy={sortBy}
      wishlistProductIds={wishlistProductIds}
      onBannerClick={handleBannerClick}
      onFilterChange={handleCatalogFilterChange}
      onViewModeChange={() => {
        setSelectedCatalogItemId(null);
        setCurrentView("home");
      }}
      onLoadMoreCatalogItems={handleLoadMoreCatalogItems}
      onProductClick={handleProductClick}
      onAddToCart={addToCart}
      onUpdateQuantity={updateQuantity}
      onSortChange={setSortBy}
      onWishlistToggle={handleWishlistToggle}
    />,
    { wrapperClassName: "min-h-screen app-shell" },
  );
}
