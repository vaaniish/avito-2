import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "../../shared/lib/api";
import type { FilterState, Product, Review } from "../../shared/types";
import { notifyError } from "../../shared/ui/notifications";
import { PAGE_SIZE, extractJoinedYear, formatReviewsWord, toSortTime } from "./seller-store.utils";
import type { ReviewSort, SellerProfile, SellerStorefrontResponse } from "./seller-store.types";
import { FILTER_PANEL_RESET_STATE } from "../../widgets/filter-panel.constants";

function buildSellerStoreQuery(filters: FilterState, sortBy: string, offset: number): string {
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    sortBy,
    minPrice: String(filters.priceRange[0]),
    maxPrice: String(filters.priceRange[1]),
    minRating: String(filters.minRating),
  });
  if (filters.searchQuery.trim()) {
    params.set("searchQuery", filters.searchQuery.trim());
  }
  if (filters.showOnlySale) {
    params.set("showOnlySale", "1");
  }
  if (filters.condition && filters.condition !== "all") {
    params.set("condition", filters.condition);
  }
  if (filters.includeWords?.trim()) {
    params.set("includeWords", filters.includeWords.trim());
  }
  if (filters.excludeWords?.trim()) {
    params.set("excludeWords", filters.excludeWords.trim());
  }
  if (filters.categories.length > 0) {
    params.set("itemIds", filters.categories.join(","));
  }
  return params.toString();
}

export function useSellerStorefront(sellerId: string) {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [items, setItems] = useState<Product[]>([]);
  const [filters, setFilters] = useState<FilterState>(FILTER_PANEL_RESET_STATE);
  const [sortBy, setSortBy] = useState("popular");
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [sellerReviews, setSellerReviews] = useState<Review[]>([]);
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [reviewSort, setReviewSort] = useState<ReviewSort>("newest");

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setIsLoadingMore(true);
      else setIsLoading(true);

      try {
        const response = await apiGet<SellerStorefrontResponse>(
          `/catalog/sellers/${encodeURIComponent(sellerId)}/listings?${buildSellerStoreQuery(filters, sortBy, offset)}`,
        );

        setSeller(response.seller);
        setSellerReviews(response.reviews ?? []);
        setIsReviewsLoading(false);
        setItems((prev) => {
          if (!append) return response.items;

          const known = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          for (const item of response.items) {
            if (known.has(item.id)) continue;
            known.add(item.id);
            merged.push(item);
          }
          return merged;
        });
        setNextOffset(offset + response.items.length);
        setHasMore(response.pagination.hasMore);
      } catch (error) {
        notifyError(error instanceof Error ? error.message : "Не удалось загрузить витрину продавца");
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [filters, sellerId, sortBy],
  );

  useEffect(() => {
    setSeller(null);
    setItems([]);
    setSellerReviews([]);
    setNextOffset(0);
    setHasMore(false);
    setIsLoading(true);
    setIsLoadingMore(false);
    void loadPage(0, false);
  }, [loadPage]);

  useEffect(() => {
    if (!isReviewsModalOpen || typeof document === "undefined") return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsReviewsModalOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isReviewsModalOpen]);

  const joinedYear = useMemo(() => extractJoinedYear(seller?.joinedAt), [seller?.joinedAt]);
  const sellerRatingValue = useMemo(() => {
    if (!seller || seller.reviewsCount <= 0) return "-";
    return seller.rating.toFixed(1);
  }, [seller]);
  const sellerRatingNumber = seller?.rating ?? 0;
  const sellerRatingDisplay = sellerRatingValue === "-" ? "-" : sellerRatingValue.replace(".", ",");
  const sellerReviewsCount = seller?.reviewsCount ?? 0;

  const sortedSellerReviews = useMemo(() => {
    const source = [...sellerReviews];
    if (reviewSort === "highest") {
      source.sort((a, b) => (b.rating !== a.rating ? b.rating - a.rating : toSortTime(b) - toSortTime(a)));
      return source;
    }
    if (reviewSort === "lowest") {
      source.sort((a, b) => (a.rating !== b.rating ? a.rating - b.rating : toSortTime(b) - toSortTime(a)));
      return source;
    }
    if (reviewSort === "oldest") {
      source.sort((a, b) => toSortTime(a) - toSortTime(b));
      return source;
    }
    source.sort((a, b) => toSortTime(b) - toSortTime(a));
    return source;
  }, [reviewSort, sellerReviews]);

  const ratingDistribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const review of sellerReviews) {
      if (review.rating >= 1 && review.rating <= 5) counts[review.rating - 1] += 1;
    }
    return counts;
  }, [sellerReviews]);

  const modalReviewsTotal = sellerReviews.length || sellerReviewsCount;
  const modalRatingTotal = Math.max(1, modalReviewsTotal);
  const modalAverageRating =
    sellerReviews.length > 0
      ? sellerReviews.reduce((sum, review) => sum + review.rating, 0) / sellerReviews.length
      : sellerReviewsCount > 0
        ? sellerRatingNumber
        : 0;
  const modalAverageRatingLabel =
    sellerReviewsCount > 0 || sellerReviews.length > 0
      ? modalAverageRating.toFixed(1).replace(".", ",")
      : "-";

  return {
    seller,
    items,
    filters,
    sortBy,
    nextOffset,
    hasMore,
    isLoading,
    isLoadingMore,
    sellerReviews,
    isReviewsLoading,
    isReviewsModalOpen,
    reviewSort,
    joinedYear,
    sellerRatingNumber,
    sellerRatingDisplay,
    sellerReviewsCount,
    sortedSellerReviews,
    ratingDistribution,
    modalReviewsTotal,
    modalRatingTotal,
    modalAverageRating,
    modalAverageRatingLabel,
    setFilters,
    setIsReviewsModalOpen,
    setReviewSort,
    setSortBy,
    loadPage,
    formatReviewsWord,
  };
}
