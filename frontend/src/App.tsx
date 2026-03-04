import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { ProductGrid } from "./components/ProductGrid";
import { CartPage } from "./components/CartPage";
import { CheckoutPage } from "./components/CheckoutPage";
import { OrderCompletePage } from "./components/OrderCompletePage";
import { ProductDetail } from "./components/ProductDetail";
import { Footer, type FooterPage } from "./components/Footer";
import { FilterPanel, type CatalogCategory } from "./components/FilterPanel";
import { AboutPage } from "./components/pages/AboutPage";
import { PartnershipPage } from "./components/pages/PartnershipPage";
import { FAQPage } from "./components/pages/FAQPage";
import { PrivacyPage } from "./components/pages/PrivacyPage";
import { TermsPage } from "./components/pages/TermsPage";
import { AuthPage } from "./components/pages/AuthPage";
import { ProfilePage } from "./components/pages/ProfilePage";
import { AdminLogin } from "./components/admin/AdminLogin";
import { AdminPanel } from "./components/admin/AdminPanel";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./components/ui/sheet";
import type { CartItem, FilterState, Product } from "./types";
import { apiGet, clearSessionUser, getSessionUser, saveSessionUser, type SessionRole, type SessionUser } from "./lib/api";

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

const DEFAULT_FILTERS: FilterState = {
  categories: [],
  priceRange: [0, 500000],
  minRating: 0,
  searchQuery: "",
  showOnlySale: false,
  condition: "all",
  city: "",
  includeWords: "",
  excludeWords: "",
};

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>("home");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userType, setUserType] = useState<SessionRole>("regular");
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [redirectAfterLogin, setRedirectAfterLogin] = useState<AppView | null>(null);

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [lastPaymentMethod, setLastPaymentMethod] = useState<"card" | "cash">("card");
  const [lastOrderIds, setLastOrderIds] = useState<string[]>([]);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<"products" | "services">("products");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [sortBy, setSortBy] = useState<string>("popular");
  const [isSearchActive, setIsSearchActive] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Product[]>([]);
  const [productCategories, setProductCategories] = useState<CatalogCategory[]>([]);
  const [serviceCategories, setServiceCategories] = useState<CatalogCategory[]>([]);
  const [cities, setCities] = useState<string[]>([]);

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

  const loadCatalog = async () => {
    try {
      const [productsData, servicesData, productCategoriesData, serviceCategoriesData, citiesData] = await Promise.all([
        apiGet<Product[]>("/catalog/listings?type=products"),
        apiGet<Product[]>("/catalog/listings?type=services"),
        apiGet<CatalogCategory[]>("/catalog/categories?type=products"),
        apiGet<CatalogCategory[]>("/catalog/categories?type=services"),
        apiGet<string[]>("/catalog/cities"),
      ]);

      setProducts(productsData);
      setServices(servicesData);
      setProductCategories(productCategoriesData);
      setServiceCategories(serviceCategoriesData);
      setCities(citiesData);
    } catch (error) {
      console.error(error);
      alert("Не удалось загрузить каталог");
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const currentItems = viewMode === "products" ? products : services;
  const currentCategories = viewMode === "products" ? productCategories : serviceCategories;

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

  const addToCart = (product: Product) => {
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
    setCurrentView("cart");
    scrollToTop();
  };

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setCurrentView("product");
    scrollToTop();
  };

  const handleBuyNow = (product: Product) => {
    const itemInCart = cartItems.find((item) => item.id === product.id);
    if (!itemInCart) {
      addToCart(product);
    }
    setCurrentView("checkout");
    scrollToTop();
  };

  const handleCheckout = () => {
    setCurrentView("checkout");
    scrollToTop();
  };

  const handleFooterNavigation = (page: FooterPage) => {
    if (page === "partnership" && !isAuthenticated) {
      setRedirectAfterLogin("partnership");
      setCurrentView("auth");
      scrollToTop();
      return;
    }

    if (page === "partnership" && isAuthenticated) {
      setCurrentView("profile");
      scrollToTop();
      return;
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
      if (effectiveCategories.size > 0 && !effectiveCategories.has(item.category)) return false;
      if (item.price < filters.priceRange[0] || item.price > filters.priceRange[1]) return false;
      if (item.rating < filters.minRating) return false;

      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        if (!item.title.toLowerCase().includes(query)) return false;
      }

      if (filters.showOnlySale && !item.isSale) return false;

      if (filters.condition && filters.condition !== "all") {
        if (!item.condition || item.condition !== filters.condition) return false;
      }

      if (filters.city && item.city !== filters.city) return false;

      if (filters.includeWords) {
        const words = filters.includeWords.toLowerCase().split(" ").filter(Boolean);
        if (words.some((word) => !item.title.toLowerCase().includes(word))) return false;
      }

      if (filters.excludeWords) {
        const words = filters.excludeWords.toLowerCase().split(" ").filter(Boolean);
        if (words.some((word) => item.title.toLowerCase().includes(word))) return false;
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

  if (currentView === "product" && selectedProduct) {
    const cartItem = cartItems.find((item) => item.id === selectedProduct.id);
    const cartQuantity = cartItem ? cartItem.quantity : 0;

    return (
      <div className="min-h-screen bg-white">
        <div className="h-[100px]" aria-hidden="true" />

        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <ProductDetail
          product={selectedProduct}
          onBack={() => setCurrentView("home")}
          onAddToCart={addToCart}
          onBuyNow={handleBuyNow}
          onUpdateQuantity={updateQuantity}
          cartQuantity={cartQuantity}
          relatedProducts={currentItems
            .filter(
              (item) =>
                item.id !== selectedProduct.id && item.category === selectedProduct.category
            )
            .slice(0, 4)}
        />
        <Footer onNavigate={handleFooterNavigation} />
      </div>
    );
  }

  if (currentView === "cart") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <CartPage items={cartItems} onUpdateQuantity={updateQuantity} onCheckout={handleCheckout} />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "checkout") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <CheckoutPage
          items={cartItems}
          onBack={() => setCurrentView("cart")}
          onComplete={(result) => {
            setLastOrderTotal(result.total);
            setLastPaymentMethod(result.paymentMethod);
            setLastOrderIds(result.orderIds);
            setCartItems([]);
            setCurrentView("orderComplete");
          }}
        />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "orderComplete") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <OrderCompletePage
          orderTotal={lastOrderTotal}
          orderIds={lastOrderIds}
          paymentMethod={lastPaymentMethod}
          onViewHistory={() => {
            setCurrentView("profile");
            scrollToTop();
          }}
          onBackToHome={handleLogoClick}
        />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "about") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <AboutPage onBack={handleLogoClick} />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "partnership") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <PartnershipPage onBack={handleLogoClick} />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "faq") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <FAQPage onBack={handleLogoClick} />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "privacy") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <PrivacyPage onBack={handleLogoClick} />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "terms") {
    return (
      <>
        <Header
          cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          onCartClick={handleCartClick}
          onSearchSubmit={handleSearchSubmit}
          onLogoClick={handleLogoClick}
          onProfileClick={handleProfileClick}
        />
        <TermsPage onBack={handleLogoClick} />
        <Footer onNavigate={handleFooterNavigation} />
      </>
    );
  }

  if (currentView === "auth") {
    return (
      <AuthPage
        onBack={handleLogoClick}
        onPartnershipClick={() => setCurrentView("partnership")}
        onLoginSuccess={(role, user) => {
          if (!user) return;
          saveSessionUser(user);
          setCurrentUser(user);
          setIsAuthenticated(true);
          setUserType(role || "regular");

          if (role === "admin") {
            setCurrentView("adminPanel");
            return;
          }

          if (redirectAfterLogin === "partnership") {
            setCurrentView("profile");
            setRedirectAfterLogin(null);
          } else if (redirectAfterLogin) {
            setCurrentView(redirectAfterLogin);
            setRedirectAfterLogin(null);
          } else {
            setCurrentView("profile");
          }
        }}
      />
    );
  }

  if (currentView === "profile") {
    return (
      <ProfilePage
        onBack={handleLogoClick}
        onLogout={() => {
          clearSessionUser();
          setCurrentUser(null);
          setIsAuthenticated(false);
          setUserType("regular");
          setCurrentView("auth");
        }}
        userType={userType === "partner" ? "partner" : "regular"}
        initialTab={userType === "partner" ? "partner-achievements" : redirectAfterLogin === "partnership" ? "partnership" : undefined}
      />
    );
  }

  if (currentView === "adminLogin") {
    return (
      <AdminLogin
        onBack={handleLogoClick}
        onLoginSuccess={(user) => {
          if (user) {
            saveSessionUser(user);
            setCurrentUser(user);
            setIsAuthenticated(true);
            setUserType(user.role);
          }
          setCurrentView("adminPanel");
        }}
      />
    );
  }

  if (currentView === "adminPanel") {
    return (
      <AdminPanel
        onLogout={() => {
          clearSessionUser();
          setCurrentUser(null);
          setIsAuthenticated(false);
          setUserType("regular");
          setCurrentView("home");
          scrollToTop();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="h-[100px]" aria-hidden="true" />

      <Header
        cartItemCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={handleCartClick}
        onSearchSubmit={handleSearchSubmit}
        onLogoClick={handleLogoClick}
        onProfileClick={handleProfileClick}
      />

      {!isSearchActive && <Hero onBannerClick={handleBannerClick} />}

      <div className="max-w-[1440px] mx-auto px-[21px] pb-[56px] sm:pb-16">
        <div className="lg:hidden mb-6">
          <Sheet>
            <SheetTrigger asChild>
              <button className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-xl hover:bg-gray-900 transition-all duration-300">
                <SlidersHorizontal className="w-5 h-5" />
                <span>Фильтры</span>
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-full sm:w-96 overflow-y-auto">
              <SheetTitle className="sr-only">Фильтры товаров</SheetTitle>
              <SheetDescription className="sr-only">Фильтрация товаров по категориям, цене и рейтингу</SheetDescription>
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
                cities={cities}
                onApplyFilters={() => {
                  const closeButton = document.querySelector('[data-slot="sheet-close"]') as HTMLButtonElement | null;
                  closeButton?.click();
                }}
              />
            </SheetContent>
          </Sheet>
        </div>

        <div className="mt-[70px] flex gap-6 lg:gap-8">
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
              cities={cities}
            />
          </aside>

          <main className="flex-1 min-w-0">
            <ProductGrid
              products={sortedItems}
              onProductClick={handleProductClick}
              onAddToCart={addToCart}
              onUpdateQuantity={updateQuantity}
              cartItems={cartItems}
              sortBy={sortBy}
              onSortChange={setSortBy}
              viewMode={viewMode}
            />
          </main>
        </div>
      </div>

      <Footer onNavigate={handleFooterNavigation} />
    </div>
  );
}
