import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, Menu, Search, ShoppingCart, Trash2, User, X } from "lucide-react";
import { apiGet } from "../lib/api";
import { confirmDialog } from "./ui/notifications";
import { useRealtimeNotifications } from "../lib/useRealtimeNotifications";
import { DnsCatalogOverlay } from "./DnsCatalogOverlay";
import type { CatalogCategory, CatalogItem } from "./FilterPanel";

interface HeaderProps {
  cartItemCount: number;
  onCartClick: () => void;
  onSearchSubmit: (query: string) => void;
  onLogoClick?: () => void;
  onProfileClick?: () => void;
  catalogCategories: CatalogCategory[];
  onCatalogItemSelect: (item: CatalogItem) => void;
  isAuthenticated: boolean;
}

type SearchSuggestion = {
  type: "product" | "service" | "category";
  title: string;
  subtitle?: string;
  query: string;
};

export function Header({
  cartItemCount,
  onCartClick,
  onSearchSubmit,
  onLogoClick,
  onProfileClick,
  catalogCategories,
  onCatalogItemSelect,
  isAuthenticated,
}: HeaderProps) {
  const headerRef = useRef<HTMLElement | null>(null);
  const catalogRef = useRef<HTMLDivElement | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [activeCatalogCategoryId, setActiveCatalogCategoryId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [showNotifications, setShowNotifications] = useState(false);
  const {
    notifications,
    unreadCount,
    markAllAsRead,
    deleteAll: deleteAllNotifications,
  } = useRealtimeNotifications(isAuthenticated);

  const canQuerySuggestions = useMemo(
    () => searchQuery.trim().length >= 2,
    [searchQuery],
  );

  useEffect(() => {
    if (!catalogCategories.length) return;
    setActiveCatalogCategoryId((current) =>
      catalogCategories.some((category) => category.id === current)
        ? current
        : catalogCategories[0].id,
    );
  }, [catalogCategories]);

  useEffect(() => {
    if (!canQuerySuggestions) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const result = await apiGet<SearchSuggestion[]>(
          `/catalog/suggestions?q=${encodeURIComponent(searchQuery.trim())}`,
          controller.signal,
        );
        setSuggestions(result);
        setShowSuggestions(true);
      } catch (_error) {
        setSuggestions([]);
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canQuerySuggestions, searchQuery]);

  useEffect(() => {
    const root = document.documentElement;
    const node = headerRef.current;
    if (!node) return;

    const syncHeight = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      if (height > 0) {
        root.style.setProperty("--header-height", `${height}px`);
      }
    };

    syncHeight();
    window.addEventListener("resize", syncHeight);
    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncHeight())
        : null;
    observer?.observe(node);

    return () => {
      window.removeEventListener("resize", syncHeight);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!catalogOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (catalogRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest("#dns-catalog-overlay") || target.closest(".dns-mobile-catalog-toggle"))
      ) {
        return;
      }
      setCatalogOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCatalogOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [catalogOpen]);

  const handleSearchSubmit = (query: string) => {
    const normalized = query.trim();
    setShowSuggestions(false);
    onSearchSubmit(normalized);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSearchSubmit(searchQuery);
    }
  };

  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    setSearchQuery(suggestion.query);
    handleSearchSubmit(suggestion.query);
  };

  const handleLogoClick = () => {
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    onSearchSubmit("");
    onLogoClick?.();
  };

  const handleCatalogToggle = () => {
    setCatalogOpen((open) => !open);
    setActiveCatalogCategoryId((current) => current || catalogCategories[0]?.id || "");
  };

  const handleCatalogItemSelect = (item: CatalogItem) => {
    setCatalogOpen(false);
    setMobileMenuOpen(false);
    onCatalogItemSelect(item);
  };

  const handleToggleNotifications = async () => {
    if (!showNotifications && unreadCount > 0) {
      try {
        await markAllAsRead();
      } catch (error) {
        console.error("Failed to mark notifications as read:", error);
      }
    }
    setShowNotifications(!showNotifications);
  };

  const handleDeleteNotifications = async () => {
    const confirmed = await confirmDialog({
      title: "Удалить все уведомления?",
      description: "Старые уведомления будут удалены из вашего списка. Это действие нельзя отменить.",
      confirmLabel: "Удалить",
      confirmTone: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteAllNotifications();
    } catch (error) {
      console.error("Failed to delete notifications:", error);
    }
  };

  return (
    <header ref={headerRef} className="sticky top-0 z-50 bg-white text-gray-900 shadow-sm border-b border-gray-200">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6">
        <div className="hidden md:block">
          <div className="flex items-center justify-between h-24 gap-5">
            <div ref={catalogRef} className="relative shrink-0">
              <div className="dns-header-brand">
                <button
                  onClick={handleLogoClick}
                  className="dns-header-logo"
                  aria-label="На главную"
                >
                  Ecomm
                </button>
                <button
                  className="dns-header-catalog-button"
                  type="button"
                  onClick={handleCatalogToggle}
                  aria-expanded={catalogOpen}
                  aria-controls="dns-catalog-overlay"
                >
                  <span>Каталог</span>
                  <ChevronDown
                    className={`dns-header-catalog-button__icon${
                      catalogOpen ? " dns-header-catalog-button__icon--open" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {catalogOpen && (
                <div id="dns-catalog-overlay">
                  <DnsCatalogOverlay
                    activeCategoryId={activeCatalogCategoryId}
                    categories={catalogCategories}
                    onActiveCategoryChange={setActiveCatalogCategoryId}
                    onCatalogItemSelect={handleCatalogItemSelect}
                  />
                </div>
              )}
            </div>

            <div className="hidden min-[830px]:flex max-w-2xl flex-1">
              <div className="relative w-full rounded-[1px] bg-white">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => canQuerySuggestions && setShowSuggestions(true)}
                  onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Поиск товаров..."
                  className="w-full pl-14 pr-4 py-4 rounded-xl bg-gray-50 text-black text-lg placeholder:text-gray-400 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all duration-300"
                />

                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={`${suggestion.type}-${suggestion.title}-${index}`}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors duration-200 text-base text-gray-700 border-b border-gray-100 last:border-b-0"
                      >
                        <Search className="inline w-4 h-4 mr-3 text-gray-400" />
                        {suggestion.title}
                        {suggestion.subtitle && (
                          <span className="text-sm text-gray-500 ml-2">({suggestion.subtitle})</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 lg:gap-4">
              {isAuthenticated && (
                <div className="relative">
                  <button
                    onClick={handleToggleNotifications}
                    className="p-3 rounded-xl hover:bg-gray-100 transition-all duration-300"
                  >
                    <Bell className="w-6 h-6 lg:w-7 lg:h-7" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-5 h-5 lg:w-6 lg:h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs lg:text-sm">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {showNotifications && (
                    <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                      <div className="flex items-center justify-between gap-2 border-b p-4">
                        <div className="font-semibold">Уведомления</div>
                        {notifications.length > 0 ? (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void markAllAsRead()}
                              className="text-xs font-semibold text-blue-700 transition hover:text-blue-900"
                            >
                              Прочитать все
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteNotifications()}
                              className="inline-flex items-center text-red-600 transition hover:text-red-800"
                              title="Удалить все уведомления"
                              aria-label="Удалить все уведомления"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map((n) => (
                            <a
                              key={n.id}
                              href={n.url}
                              className={`block px-4 py-3 hover:bg-gray-50 ${!n.isRead ? "bg-blue-50" : ""}`}
                            >
                              <p className="text-sm text-gray-800">{n.message}</p>
                              <p className="text-xs text-gray-500 mt-1">{new Date(n.date).toLocaleString("ru-RU")}</p>
                            </a>
                          ))
                        ) : (
                          <p className="p-4 text-sm text-gray-500">Нет новых уведомлений.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={onProfileClick}
                className="p-3 rounded-xl hover:bg-gray-100 transition-all duration-300"
              >
                <User className="w-6 h-6 lg:w-7 lg:h-7" />
              </button>
              <button
                onClick={onCartClick}
                className="relative p-3 rounded-xl hover:bg-gray-100 transition-all duration-300"
              >
                <ShoppingCart className="w-6 h-6 lg:w-7 lg:h-7" />
                {cartItemCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 lg:w-6 lg:h-6 bg-[rgb(38,83,141)] text-white rounded-full flex items-center justify-center text-xs lg:text-sm">
                    {cartItemCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="min-[830px]:hidden pb-4">
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => canQuerySuggestions && setShowSuggestions(true)}
                onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Поиск товаров..."
                className="w-full pl-14 pr-4 py-4 rounded-xl bg-gray-50 text-black text-lg placeholder:text-gray-400 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 transition-all duration-300"
              />

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full mt-2 w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-50">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.type}-${suggestion.title}-${index}`}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="w-full text-left px-6 py-3 hover:bg-gray-50 transition-colors duration-200 text-base text-gray-700 border-b border-gray-100 last:border-b-0"
                    >
                      <Search className="inline w-4 h-4 mr-3 text-gray-400" />
                      {suggestion.title}
                      {suggestion.subtitle && (
                        <span className="text-sm text-gray-500 ml-2">({suggestion.subtitle})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="md:hidden flex items-center justify-between h-16 relative px-4">
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-2 rounded-xl hover:bg-gray-100 transition-all duration-300"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <button
            onClick={handleLogoClick}
            className="absolute left-1/2 -translate-x-1/2 text-2xl leading-none tracking-tight hover:text-gray-600 transition-colors duration-300 text-[rgb(38,83,141)]"
          >
            Ecomm
          </button>

          <button
            onClick={onCartClick}
            className="relative p-2 rounded-xl hover:bg-gray-100 transition-all duration-300"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-gray-900 text-white rounded-full flex items-center justify-center text-xs">
                {cartItemCount}
              </span>
            )}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <button
              onClick={handleCatalogToggle}
              className="dns-mobile-catalog-toggle w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-orange-50 text-orange-700 transition-all duration-300"
            >
              <span className="font-semibold">Каталог</span>
              <ChevronDown
                className={`w-5 h-5 transition-transform${catalogOpen ? " rotate-180" : ""}`}
              />
            </button>

            {catalogOpen && (
              <div className="px-4">
                <DnsCatalogOverlay
                  activeCategoryId={activeCatalogCategoryId}
                  categories={catalogCategories}
                  onActiveCategoryChange={setActiveCatalogCategoryId}
                  onCatalogItemSelect={handleCatalogItemSelect}
                />
              </div>
            )}

            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Поиск товаров..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl bg-gray-50 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900"
                />
              </div>
            </div>

            <button
              onClick={onProfileClick}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl hover:bg-gray-100 transition-all duration-300"
            >
              <User className="w-5 h-5" />
              <span>Профиль</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
