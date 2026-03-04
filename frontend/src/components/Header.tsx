import React, { useEffect, useMemo, useState } from "react";
import { Search, ShoppingCart, User, Menu, X } from "lucide-react";
import { apiGet } from "../lib/api";

interface HeaderProps {
  cartItemCount: number;
  onCartClick: () => void;
  onSearchSubmit: (query: string) => void;
  onLogoClick?: () => void;
  onProfileClick?: () => void;
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
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const canQuerySuggestions = useMemo(
    () => searchQuery.trim().length >= 2,
    [searchQuery],
  );

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

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white text-gray-900 shadow-sm border-b border-gray-200">
      <div className="max-w-[1440px] mx-auto px-4 md:px-6">
        <div className="hidden md:block">
          <div className="flex items-center justify-between h-24">
            <button
              onClick={handleLogoClick}
              className="text-[40px] leading-none tracking-tight hover:text-gray-600 transition-colors duration-300 text-[rgb(38,83,141)]"
            >
              Ecomm
            </button>

            <div className="hidden min-[830px]:flex max-w-2xl flex-1 mx-8">
              <div className="relative w-full rounded-[1px] bg-white">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => canQuerySuggestions && setShowSuggestions(true)}
                  onBlur={() => window.setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="Поиск товаров или услуг..."
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
                placeholder="Поиск товаров или услуг..."
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
            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Поиск товаров или услуг..."
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
