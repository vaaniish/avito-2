import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ProductCard } from "./ProductCard";
import type { Product, CartItem } from "../shared/types";
import type { CatalogPagesByOffset } from "../app/app.catalog.utils";

interface ProductGridProps {
  products: Product[];
  hasMore: boolean;
  hasPrevious: boolean;
  isLoadingMore: boolean;
  loadedItemCount: number;
  totalItemCount: number;
  pageOffsets: number[];
  pagesByOffset: CatalogPagesByOffset;
  loadedOffsets: number[];
  activeOffset: number;
  visibleWindowStartOffset: number;
  onLoadMore: () => void;
  onLoadPrevious: () => void;
  onVisibleOffsetChange: (offset: number) => void;
  onEnsureOffsetLoaded: (offset: number) => void;
  onProductClick: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  cartItems: CartItem[];
  sortBy: string;
  onSortChange: (sortBy: string) => void;
  viewMode: "products";
  wishlistProductIds: Set<string>;
  onWishlistToggle: (productId: string, isWishlisted: boolean) => void;
}

const DEFAULT_PAGE_HEIGHT = 1460;

function resolveColumnCount(viewportWidth: number): number {
  if (viewportWidth >= 1280) return 4;
  if (viewportWidth >= 1024) return 3;
  if (viewportWidth >= 640) return 2;
  return 1;
}

function estimatePageHeight(itemCount: number, columns: number): number {
  const rows = Math.max(1, Math.ceil(itemCount / Math.max(1, columns)));
  const cardHeight = columns === 1 ? 420 : 390;
  const gap = 12;
  return rows * cardHeight + Math.max(0, rows - 1) * gap;
}

function CatalogPageBlock(props: {
  offset: number;
  products: Product[];
  expectedCount: number;
  isLoaded: boolean;
  cartItemsById: Map<string, CartItem>;
  onVisibleOffsetChange: (offset: number) => void;
  onEnsureOffsetLoaded: (offset: number) => void;
  onProductClick: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  wishlistProductIds: Set<string>;
  onWishlistToggle: (productId: string, isWishlisted: boolean) => void;
  columns: number;
  measuredHeight: number | undefined;
  onMeasuredHeightChange: (offset: number, height: number) => void;
}) {
  useEffect(() => {
    const element = document.querySelector<HTMLElement>(`[data-catalog-page="${props.offset}"]`);
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        props.onVisibleOffsetChange(props.offset);
        if (!props.isLoaded) {
          props.onEnsureOffsetLoaded(props.offset);
        }
      },
      {
        root: null,
        rootMargin: "900px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [
    props.isLoaded,
    props.offset,
    props.onEnsureOffsetLoaded,
    props.onVisibleOffsetChange,
  ]);

  useEffect(() => {
    if (!props.isLoaded) return;
    const element = document.querySelector<HTMLElement>(`[data-catalog-page="${props.offset}"]`);
    if (!element) return;

    const measure = () => {
      const nextHeight = Math.ceil(element.getBoundingClientRect().height);
      if (nextHeight > 0) {
        props.onMeasuredHeightChange(props.offset, nextHeight);
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [props.isLoaded, props.offset, props.onMeasuredHeightChange]);

  const fallbackHeight =
    props.measuredHeight ?? estimatePageHeight(props.expectedCount, props.columns) ?? DEFAULT_PAGE_HEIGHT;

  if (!props.isLoaded) {
    return (
      <div
        data-catalog-page={props.offset}
        className="w-full"
        style={{ minHeight: fallbackHeight }}
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      data-catalog-page={props.offset}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {props.products.map((product, index) => {
        const cartItem = props.cartItemsById.get(product.id);
        const cartQuantity = cartItem ? cartItem.quantity : 0;
        const imagePriority =
          props.offset === 0 && index < props.columns * 2
            ? "high"
            : "lazy";

        return (
          <ProductCard
            key={product.id}
            product={product}
            onClick={() => props.onProductClick(product)}
            onAddToCart={() => props.onAddToCart(product)}
            onUpdateQuantity={(quantity) => props.onUpdateQuantity(product.id, quantity)}
            cartQuantity={cartQuantity}
            viewMode="products"
            displayMode="grid"
            isWishlisted={props.wishlistProductIds.has(product.id)}
            onWishlistToggle={props.onWishlistToggle}
            dataTestId="catalog-card"
            imagePriority={imagePriority}
          />
        );
      })}
    </div>
  );
}

export function ProductGrid({
  products,
  hasMore,
  hasPrevious: _hasPrevious,
  isLoadingMore,
  loadedItemCount: _loadedItemCount,
  totalItemCount,
  pageOffsets,
  pagesByOffset,
  loadedOffsets,
  activeOffset,
  visibleWindowStartOffset: _visibleWindowStartOffset,
  onLoadMore: _onLoadMore,
  onLoadPrevious: _onLoadPrevious,
  onVisibleOffsetChange,
  onEnsureOffsetLoaded,
  onProductClick,
  onAddToCart,
  onUpdateQuantity,
  cartItems,
  sortBy,
  onSortChange,
  viewMode: _viewMode,
  wishlistProductIds,
  onWishlistToggle,
}: ProductGridProps) {
  const [sortOpen, setSortOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [measuredHeights, setMeasuredHeights] = useState<Record<number, number>>({});

  const sortOptions = [
    { value: "popular", label: "Популярные" },
    { value: "price-asc", label: "Цена: по возрастанию" },
    { value: "price-desc", label: "Цена: по убыванию" },
    { value: "rating", label: "Высокий рейтинг" },
    { value: "newest", label: "Новинки" },
  ];

  const currentSort = sortOptions.find((opt) => opt.value === sortBy);
  const cartItemsById = useMemo(
    () => new Map(cartItems.map((item) => [item.id, item])),
    [cartItems],
  );
  const columns = useMemo(() => resolveColumnCount(viewportWidth), [viewportWidth]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setMeasuredHeights((prev) => {
      const next: Record<number, number> = {};
      for (const offset of pageOffsets) {
        if (prev[offset]) {
          next[offset] = prev[offset];
        }
      }
      return next;
    });
  }, [pageOffsets]);

  const handleMeasuredHeightChange = (offset: number, height: number) => {
    setMeasuredHeights((prev) => {
      if (prev[offset] === height) {
        return prev;
      }
      return {
        ...prev,
        [offset]: height,
      };
    });
  };

  const loadedOffsetSet = useMemo(() => new Set(loadedOffsets), [loadedOffsets]);
  const hasPendingForwardPages = useMemo(() => {
    if (isLoadingMore || hasMore) {
      return true;
    }

    return pageOffsets.some((offset) => offset >= activeOffset && !loadedOffsetSet.has(offset));
  }, [activeOffset, hasMore, isLoadingMore, loadedOffsetSet, pageOffsets]);

  return (
    <div>
      <div className="mb-[20px] mt-[0px] mr-[0px] ml-[0px] flex items-center justify-between">
        <div>
          <h2 className="text-3xl text-gray-900">Товары</h2>
          <p data-testid="catalog-stats" className="mt-2 text-lg text-gray-600">
            Найдено: {totalItemCount}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:flex-none">
            <button
              onClick={() => setSortOpen(!sortOpen)}
              onBlur={() => setTimeout(() => setSortOpen(false), 200)}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm transition-all duration-300 hover:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 sm:w-auto sm:gap-3 sm:px-6 sm:py-4 sm:text-base"
            >
              <span className="truncate text-gray-700">{currentSort?.label}</span>
              <ChevronDown
                className={`h-5 w-5 flex-shrink-0 text-gray-500 transition-transform duration-300 sm:h-6 sm:w-6 ${
                  sortOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {sortOpen && (
              <div className="absolute right-0 z-10 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg sm:w-72">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSortChange(option.value);
                      setSortOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm transition-colors duration-200 hover:bg-gray-50 sm:px-6 sm:py-4 sm:text-base ${
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

      <div data-testid="catalog-grid" className="space-y-3">
        {pageOffsets.map((offset) => {
          const pageProducts = pagesByOffset[offset] ?? [];
          const expectedCount = Math.max(0, Math.min(24, totalItemCount - offset));
          return (
            <CatalogPageBlock
              key={offset}
              offset={offset}
              products={pageProducts}
              expectedCount={expectedCount}
              isLoaded={loadedOffsetSet.has(offset)}
              cartItemsById={cartItemsById}
              onVisibleOffsetChange={onVisibleOffsetChange}
              onEnsureOffsetLoaded={onEnsureOffsetLoaded}
              onProductClick={onProductClick}
              onAddToCart={onAddToCart}
              onUpdateQuantity={onUpdateQuantity}
              wishlistProductIds={wishlistProductIds}
              onWishlistToggle={onWishlistToggle}
              columns={columns}
              measuredHeight={measuredHeights[offset]}
              onMeasuredHeightChange={handleMeasuredHeightChange}
            />
          );
        })}
      </div>

      {hasPendingForwardPages && (
        <div className="mt-6">
          <p className="text-center text-sm text-gray-500">
            {isLoadingMore
              ? "Подгружаем соседние страницы каталога..."
              : "Следующие товары подгружаются заранее по мере прокрутки"}
          </p>
        </div>
      )}

      {products.length === 0 && !isLoadingMore && (
        <div className="py-16 text-center">
          <p className="text-2xl text-gray-500">Товары не найдены</p>
          <p className="mt-2 text-lg text-gray-400">Попробуйте изменить фильтры</p>
        </div>
      )}
    </div>
  );
}
