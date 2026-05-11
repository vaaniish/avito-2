import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Hero } from "../../widgets/Hero";
import { ProductGrid } from "../../entities/ProductGrid";
import { FilterPanel } from "../../widgets/FilterPanel";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "../../shared/ui/sheet";
import type { AppCatalogViewProps } from "./app-catalog-view.types";

function getNextFilterContentOffset(params: {
  scrollY: number;
  lastScrollY: number;
  stickyStart: number;
  contentHeight: number;
  viewportHeight: number;
  currentOffset: number;
}) {
  const {
    scrollY,
    lastScrollY,
    stickyStart,
    contentHeight,
    viewportHeight,
    currentOffset,
  } = params;

  if (scrollY <= stickyStart) {
    return 0;
  }

  const maxOffset = Math.max(0, contentHeight - viewportHeight);
  if (maxOffset === 0) {
    return 0;
  }

  const deltaY = scrollY - lastScrollY;
  if (deltaY === 0) {
    return Math.min(currentOffset, maxOffset);
  }

  return Math.min(maxOffset, Math.max(0, currentOffset + deltaY));
}

export function AppCatalogHeroSection({
  hideHero,
  isSearchActive,
  onBannerClick,
}: Pick<AppCatalogViewProps, "hideHero" | "isSearchActive" | "onBannerClick">) {
  if (hideHero || isSearchActive) return null;
  return <Hero onBannerClick={onBannerClick} />;
}

export function AppCatalogMobileFilters({
  filters,
  viewMode,
  categories,
  onFilterChange,
  onViewModeChange,
}: Pick<
  AppCatalogViewProps,
  "filters" | "viewMode" | "categories" | "onFilterChange" | "onViewModeChange"
>) {
  return (
    <div className="lg:hidden mb-6">
      <Sheet>
        <SheetTrigger asChild>
          <button className="btn-primary flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold sm:text-base">
            <SlidersHorizontal className="w-5 h-5" />
            <span>Фильтры</span>
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-full sm:w-96 overflow-y-auto">
          <SheetTitle className="sr-only">Фильтры товаров</SheetTitle>
          <SheetDescription className="sr-only">
            Фильтрация товаров по категориям, цене и рейтингу
          </SheetDescription>
          <FilterPanel
            filters={filters}
            onFilterChange={onFilterChange}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            categories={categories}
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
  );
}

export function AppCatalogDesktopFilters({
  filters,
  viewMode,
  categories,
  onFilterChange,
  onViewModeChange,
}: Pick<
  AppCatalogViewProps,
  "filters" | "viewMode" | "categories" | "onFilterChange" | "onViewModeChange"
>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const stickyStartRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const latestScrollYRef = useRef(0);
  const lastProcessedScrollYRef = useRef(0);
  const contentOffsetRef = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [stickyTop, setStickyTop] = useState<number | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const readHeaderOffset = () => {
      const root = getComputedStyle(document.documentElement);
      const raw = root.getPropertyValue("--header-height").trim();
      const parsed = Number.parseFloat(raw || "84");
      return (Number.isFinite(parsed) ? parsed : 84) + 8;
    };

    const applyContentOffset = (nextOffset: number) => {
      const content = contentRef.current;
      if (!content) return;
      content.style.transform = `translate3d(0, -${nextOffset}px, 0)`;
    };

    const runScrollFrame = () => {
      frameRef.current = null;

      const nextOffset = getNextFilterContentOffset({
        scrollY: latestScrollYRef.current,
        lastScrollY: lastProcessedScrollYRef.current,
        stickyStart: stickyStartRef.current,
        contentHeight: contentHeightRef.current,
        viewportHeight: viewportHeightRef.current,
        currentOffset: contentOffsetRef.current,
      });

      lastProcessedScrollYRef.current = latestScrollYRef.current;
      if (nextOffset === contentOffsetRef.current) return;

      contentOffsetRef.current = nextOffset;
      applyContentOffset(nextOffset);
    };

    const scheduleScrollFrame = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(runScrollFrame);
    };

    const syncLayout = () => {
      const container = containerRef.current;
      const content = contentRef.current;
      if (!container || !content) return;

      const topOffset = readHeaderOffset();
      const contentHeight = Math.ceil(content.getBoundingClientRect().height);
      const availableHeight = Math.max(240, window.innerHeight - topOffset - 8);
      const visibleHeight = Math.min(contentHeight, availableHeight);

      stickyStartRef.current =
        container.getBoundingClientRect().top + window.scrollY - topOffset;
      viewportHeightRef.current = visibleHeight;
      contentHeightRef.current = contentHeight;

      setStickyTop(topOffset);
      setViewportHeight(visibleHeight);

      const maxOffset = Math.max(0, contentHeight - visibleHeight);
      const nextOffset = Math.min(contentOffsetRef.current, maxOffset);
      contentOffsetRef.current = nextOffset;
      applyContentOffset(nextOffset);
      scheduleScrollFrame();
    };

    const syncScroll = () => {
      latestScrollYRef.current = window.scrollY;
      scheduleScrollFrame();
    };

    const contentObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            syncLayout();
          });

    if (contentRef.current && contentObserver) {
      contentObserver.observe(contentRef.current);
    }

    latestScrollYRef.current = window.scrollY;
    lastProcessedScrollYRef.current = window.scrollY;
    syncLayout();
    syncScroll();

    window.addEventListener("resize", syncLayout);
    window.addEventListener("scroll", syncScroll, { passive: true });

    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      contentObserver?.disconnect();
      window.removeEventListener("resize", syncLayout);
      window.removeEventListener("scroll", syncScroll);
    };
  }, []);

  return (
    <div ref={containerRef} className="hidden w-80 flex-shrink-0 self-stretch lg:block">
      <aside
        className="overflow-hidden lg:sticky"
        style={{
          top: stickyTop !== null ? `${stickyTop}px` : undefined,
          height: viewportHeight !== null ? `${viewportHeight}px` : undefined,
        }}
      >
        <div style={{ height: "100%", overflow: "hidden" }}>
          <div
            ref={contentRef}
            style={{
              willChange: "transform",
            }}
          >
            <FilterPanel
              filters={filters}
              onFilterChange={onFilterChange}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              categories={categories}
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

export function AppCatalogGridSection(
  props: Pick<
    AppCatalogViewProps,
    | "sortedItems"
    | "hasMoreItems"
    | "hasPreviousItems"
    | "isLoadingMoreItems"
    | "loadedItemCount"
    | "totalItemCount"
    | "catalogPageOffsets"
    | "catalogPagesByOffset"
    | "loadedCatalogOffsets"
    | "activeCatalogOffset"
    | "visibleWindowStartOffset"
    | "onLoadMoreCatalogItems"
    | "onLoadPreviousCatalogItems"
    | "onVisibleCatalogOffsetChange"
    | "onEnsureCatalogOffsetLoaded"
    | "onProductClick"
    | "onAddToCart"
    | "onUpdateQuantity"
    | "cartItems"
    | "sortBy"
    | "onSortChange"
    | "viewMode"
    | "wishlistProductIds"
    | "onWishlistToggle"
  >,
) {
  return (
    <main className="min-w-0 flex-1">
      <ProductGrid
        products={props.sortedItems}
        hasMore={props.hasMoreItems}
        hasPrevious={props.hasPreviousItems}
        isLoadingMore={props.isLoadingMoreItems}
        loadedItemCount={props.loadedItemCount}
        totalItemCount={props.totalItemCount}
        pageOffsets={props.catalogPageOffsets}
        pagesByOffset={props.catalogPagesByOffset}
        loadedOffsets={props.loadedCatalogOffsets}
        activeOffset={props.activeCatalogOffset}
        visibleWindowStartOffset={props.visibleWindowStartOffset}
        onLoadMore={props.onLoadMoreCatalogItems}
        onLoadPrevious={props.onLoadPreviousCatalogItems}
        onVisibleOffsetChange={props.onVisibleCatalogOffsetChange}
        onEnsureOffsetLoaded={props.onEnsureCatalogOffsetLoaded}
        onProductClick={props.onProductClick}
        onAddToCart={props.onAddToCart}
        onUpdateQuantity={props.onUpdateQuantity}
        cartItems={props.cartItems}
        sortBy={props.sortBy}
        onSortChange={props.onSortChange}
        viewMode={props.viewMode}
        wishlistProductIds={props.wishlistProductIds}
        onWishlistToggle={props.onWishlistToggle}
      />
    </main>
  );
}
