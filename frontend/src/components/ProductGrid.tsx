import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProductCard } from "./ProductCard";
import type { Product, CartItem } from "../types";

interface ProductGridProps {
  products: Product[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onProductClick: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  cartItems: CartItem[];
  sortBy: string;
  onSortChange: (sortBy: string) => void;
  viewMode: "products" | "services";
  wishlistProductIds: Set<string>;
  onWishlistToggle: (productId: string, isWishlisted: boolean) => void;
}

export function ProductGrid({
  products,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onProductClick,
  onAddToCart,
  onUpdateQuantity,
  cartItems,
  sortBy,
  onSortChange,
  viewMode,
  wishlistProductIds,
  onWishlistToggle,
}: ProductGridProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const sortOptions = [
    { value: "popular", label: "Популярные" },
    { value: "price-asc", label: "Цена: по возрастанию" },
    { value: "price-desc", label: "Цена: по убыванию" },
    { value: "rating", label: "Высокий рейтинг" },
    { value: "newest", label: "Новинки" },
  ];

  const currentSort = sortOptions.find((opt) => opt.value === sortBy);

  useEffect(() => {
    if (!hasMore || isLoadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        onLoadMore();
      },
      {
        root: null,
        rootMargin: "320px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  return (
    <div>
      <div className="flex items-center justify-between mb-[20px] mt-[0px] mr-[0px] ml-[0px]">
        <div>
          <h2 className="text-3xl text-gray-900">{viewMode === "products" ? "Товары" : "Услуги"}</h2>
          <p className="text-gray-600 mt-2 text-lg">Найдено: {products.length}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              onBlur={() => setTimeout(() => setSortOpen(false), 200)}
              className="w-full sm:w-auto flex items-center justify-between gap-2 sm:gap-3 px-3 py-2.5 sm:px-6 sm:py-4 bg-white rounded-xl border border-gray-200 hover:border-gray-900 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-gray-900 text-sm sm:text-base"
            >
              <span className="text-gray-700 truncate">{currentSort?.label}</span>
              <ChevronDown
                className={`w-5 h-5 sm:w-6 sm:h-6 text-gray-500 transition-transform duration-300 flex-shrink-0 ${
                  sortOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {sortOpen && (
              <div className="absolute right-0 mt-2 w-full sm:w-72 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-10">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setSortOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 sm:px-6 sm:py-4 hover:bg-gray-50 transition-colors duration-200 text-sm sm:text-base ${
                      sortBy === option.value ? "bg-gray-100 text-gray-900" : "text-gray-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {products.map((product) => {
          const cartItem = cartItems.find((item) => item.id === product.id);
          const cartQuantity = cartItem ? cartItem.quantity : 0;

          return (
            <ProductCard
              key={product.id}
              product={product}
              onClick={() => onProductClick(product)}
              onAddToCart={() => onAddToCart(product)}
              onUpdateQuantity={(quantity) => onUpdateQuantity(product.id, quantity)}
              cartQuantity={cartQuantity}
              viewMode={viewMode}
              displayMode="grid"
              isWishlisted={wishlistProductIds.has(product.id)}
              onWishlistToggle={onWishlistToggle}
            />
          );
        })}
      </div>

      {hasMore && (
        <div className="mt-6">
          <div ref={sentinelRef} className="h-4 w-full" aria-hidden="true" />
          <p className="text-center text-sm text-gray-500">
            {isLoadingMore ? "Загружаем ещё..." : "Прокрутите ниже для загрузки"}
          </p>
        </div>
      )}

      {products.length === 0 && (
        <div className="text-center py-16">
          <p className="text-2xl text-gray-500">Товары не найдены</p>
          <p className="text-gray-400 mt-2 text-lg">Попробуйте изменить фильтры</p>
        </div>
      )}
    </div>
  );
}
