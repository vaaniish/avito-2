import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, MapPin, Star, User, X } from "lucide-react";
import { apiGet } from "../lib/api";
import type { CartItem, Product, Review } from "../types";
import { ProductCard } from "./ProductCard";
import { notifyError } from "./ui/notifications";

type SellerProfile = {
  id: string;
  name: string;
  avatar: string | null;
  city: string;
  isVerified: boolean;
  responseTime: string | null;
  rating: number;
  reviewsCount: number;
  listingsCount: number;
  joinedAt: string;
};

type SellerStorefrontResponse = {
  seller: SellerProfile;
  items: Product[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

type SellerStorePageProps = {
  sellerId: string;
  onBack: () => void;
  onOpenListing: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  cartItems: CartItem[];
  wishlistProductIds: Set<string>;
  onWishlistToggle: (productId: string, isWishlisted: boolean) => void;
};

const PAGE_SIZE = 24;
type ReviewSort = "newest" | "highest" | "lowest";

function formatReviewsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

function toDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

function extractJoinedYear(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return String(date.getFullYear());
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

export function SellerStorePage({
  sellerId,
  onBack,
  onOpenListing,
  onAddToCart,
  onUpdateQuantity,
  cartItems,
  wishlistProductIds,
  onWishlistToggle,
}: SellerStorePageProps) {
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [items, setItems] = useState<Product[]>([]);
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
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = await apiGet<SellerStorefrontResponse>(
          `/catalog/sellers/${encodeURIComponent(sellerId)}/listings?limit=${PAGE_SIZE}&offset=${offset}`,
        );

        setSeller(response.seller);
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
        notifyError(
          error instanceof Error ? error.message : "Не удалось загрузить витрину продавца",
        );
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [sellerId],
  );

  useEffect(() => {
    setSeller(null);
    setItems([]);
    setNextOffset(0);
    setHasMore(false);
    setIsLoading(true);
    setIsLoadingMore(false);
    void loadPage(0, false);
  }, [loadPage]);

  const firstListingId = items[0]?.id ?? null;

  useEffect(() => {
    let ignore = false;

    const loadSellerReviews = async () => {
      if (!firstListingId) {
        setSellerReviews([]);
        setIsReviewsLoading(false);
        return;
      }

      setIsReviewsLoading(true);
      try {
        const listing = await apiGet<Product>(`/catalog/listings/${firstListingId}`);
        if (!ignore) {
          setSellerReviews(listing.reviews ?? []);
        }
      } catch {
        if (!ignore) {
          setSellerReviews([]);
        }
      } finally {
        if (!ignore) {
          setIsReviewsLoading(false);
        }
      }
    };

    void loadSellerReviews();

    return () => {
      ignore = true;
    };
  }, [firstListingId]);

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
      source.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      return source;
    }

    if (reviewSort === "lowest") {
      source.sort((a, b) => {
        if (a.rating !== b.rating) return a.rating - b.rating;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      return source;
    }

    source.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return source;
  }, [reviewSort, sellerReviews]);

  const ratingDistribution = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    for (const review of sellerReviews) {
      if (review.rating >= 1 && review.rating <= 5) {
        counts[review.rating - 1] += 1;
      }
    }
    return counts;
  }, [sellerReviews]);

  return (
    <div className="app-shell">
      <div className="page-container py-4 md:py-6">
        <button onClick={onBack} className="back-link text-sm md:text-base">
          <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          Назад в каталог
        </button>
      </div>

      <div className="page-container pb-10 md:pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          {isLoading && !seller ? (
            <div className="text-sm text-gray-500">Загрузка витрины продавца...</div>
          ) : seller ? (
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full bg-gray-100">
                  {seller.avatar ? (
                    <img
                      src={seller.avatar}
                      alt={seller.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-500">
                      <User className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div>
                  <div className="max-w-[420px] truncate text-3xl font-semibold leading-none text-gray-900 md:text-4xl">{seller.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-gray-900">
                    <span className="tabular-nums text-2xl font-semibold leading-none">{sellerRatingDisplay}</span>
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, index) => (
                        <Star
                          key={index}
                          className={`h-4 w-4 ${
                            index < Math.round(sellerRatingNumber) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="tabular-nums text-xl text-gray-700 transition hover:text-red-500"
                      onClick={() => setIsReviewsModalOpen(true)}
                    >
                      {seller.reviewsCount} {formatReviewsWord(seller.reviewsCount)}
                    </button>
                  </div>
                  <p className="mt-1 text-lg text-gray-900 md:text-xl">
                    Партнёр{joinedYear ? ` · На Ecomm с ${joinedYear}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">
                    <span>{seller.listingsCount} объявлений</span>
                    {seller.city ? (
                      <>
                        <span aria-hidden="true">•</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {seller.city}
                        </span>
                      </>
                    ) : null}
                    {seller.responseTime ? (
                      <>
                        <span aria-hidden="true">•</span>
                        <span>Отвечает: {seller.responseTime}</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Продавец не найден</div>
          )}
        </div>

        <div className="mt-6">
          <div className="mb-4 text-sm text-gray-600">Найдено объявлений: {items.length}</div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((product) => {
              const cartItem = cartItems.find((item) => item.id === product.id);
              const cartQuantity = cartItem ? cartItem.quantity : 0;

              return (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => onOpenListing(product)}
                  onAddToCart={() => onAddToCart(product)}
                  onUpdateQuantity={(quantity) => onUpdateQuantity(product.id, quantity)}
                  cartQuantity={cartQuantity}
                  viewMode="products"
                  displayMode="grid"
                  isWishlisted={wishlistProductIds.has(product.id)}
                  onWishlistToggle={onWishlistToggle}
                />
              );
            })}
          </div>

          {!isLoading && items.length === 0 ? (
            <div className="dashboard-empty mt-4">У продавца пока нет активных объявлений.</div>
          ) : null}

          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="btn-secondary px-4 py-2 text-sm"
                onClick={() => {
                  if (!isLoadingMore) {
                    void loadPage(nextOffset, true);
                  }
                }}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Загрузка..." : "Показать еще"}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {isReviewsModalOpen && typeof document !== "undefined"
        ? createPortal(
        <div
          className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/50 p-3 md:p-4"
          onClick={() => setIsReviewsModalOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-[min(760px,96vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h3 className="text-2xl text-gray-900">Отзывы о пользователе</h3>
              <button
                type="button"
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                onClick={() => setIsReviewsModalOpen(false)}
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-1 gap-6 border-b border-gray-200 pb-6 md:grid-cols-[180px_1fr]">
                <div>
                  <div className="text-6xl font-semibold leading-none text-gray-900">{sellerRatingValue}</div>
                  <div className="mt-2 flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-5 w-5 ${
                          i < Math.round(sellerRatingNumber) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xl text-gray-900">{sellerReviewsCount} {formatReviewsWord(sellerReviewsCount)}</p>
                </div>

                <div className="grid gap-2">
                  {[5, 4, 3, 2, 1].map((score) => {
                    const count = ratingDistribution[score - 1] ?? 0;
                    const width = sellerReviewsCount > 0 ? (count / sellerReviewsCount) * 100 : 0;
                    return (
                      <div key={score} className="grid grid-cols-[72px_1fr_38px] items-center gap-2">
                        <div className="flex items-center gap-1 text-sm text-gray-700">
                          <span>{score}</span>
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                          <div className="h-full rounded-full bg-gray-500" style={{ width: `${width}%` }} />
                        </div>
                        <span className="text-right text-sm text-gray-700">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    reviewSort === "newest" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => setReviewSort("newest")}
                >
                  Сначала новые
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    reviewSort === "highest" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => setReviewSort("highest")}
                >
                  Высокая оценка
                </button>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm transition ${
                    reviewSort === "lowest" ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => setReviewSort("lowest")}
                >
                  Низкая оценка
                </button>
              </div>

              <div className="mt-5 space-y-5">
                {isReviewsLoading ? <p className="text-sm text-gray-500">Загрузка отзывов...</p> : null}

                {sortedSellerReviews.map((review) => (
                  <article key={review.id} className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-full bg-gray-200">
                        {review.avatar ? (
                          <img src={review.avatar} alt={review.author} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-500">
                            <User className="h-5 w-5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-lg font-semibold text-gray-900">{review.author}</span>
                          <span className="text-sm text-gray-500">{toDateLabel(review.date)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`h-4 w-4 ${
                                i < review.rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                        {review.listingTitle ? <p className="mt-2 text-sm text-gray-500">Сделка: {review.listingTitle}</p> : null}
                        <p className="mt-2 whitespace-pre-line text-base leading-6 text-gray-800">{review.comment}</p>
                      </div>
                    </div>
                  </article>
                ))}

                {!isReviewsLoading && sortedSellerReviews.length === 0 ? (
                  <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                    {sellerReviewsCount > 0
                      ? "Отзывы есть, но список пока не удалось загрузить. Попробуйте открыть позже."
                      : "Пока нет отзывов о продавце."}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
        : null}
    </div>
  );
}
