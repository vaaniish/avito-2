import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronRight, MapPin, MessageCircle, Star, User } from "lucide-react";
import { apiGet } from "../lib/api";
import type { CartItem, Product, Review } from "../types";
import { ProductCard } from "./ProductCard";
import { AppModal } from "./ui/app-modal";
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
  reviews?: Review[];
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
type ReviewSort = "newest" | "oldest" | "highest" | "lowest";

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

const REVIEW_MONTH_INDEX: Record<string, number> = {
  января: 0,
  февраль: 1,
  февраля: 1,
  март: 2,
  марта: 2,
  апрель: 3,
  апреля: 3,
  май: 4,
  мая: 4,
  июнь: 5,
  июня: 5,
  июль: 6,
  июля: 6,
  август: 7,
  августа: 7,
  сентябрь: 8,
  сентября: 8,
  октябрь: 9,
  октября: 9,
  ноябрь: 10,
  ноября: 10,
  декабрь: 11,
  декабря: 11,
};

function parseReviewDateLabel(value: string): number {
  const nativeTime = new Date(value).getTime();
  if (!Number.isNaN(nativeTime)) return nativeTime;

  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\s+([а-яё]+)(?:\s+|\s*,\s*| в )(\d{1,2}):(\d{2})/u);
  if (!match) return 0;

  const [, dayRaw, monthRaw, hourRaw, minuteRaw] = match;
  const month = REVIEW_MONTH_INDEX[monthRaw];
  if (month === undefined) return 0;

  const now = new Date();
  const parsed = new Date(
    now.getFullYear(),
    month,
    Number(dayRaw),
    Number(hourRaw),
    Number(minuteRaw),
  );
  return parsed.getTime();
}

function toSortTime(review: Review): number {
  if (typeof review.sortTs === "number") return review.sortTs;
  return parseReviewDateLabel(review.date);
}

function ModalRatingStars({
  value,
  size = 16,
  gap = 1,
}: {
  value: number;
  size?: number;
  gap?: number;
}) {
  return (
    <span className="inline-flex items-center" style={{ gap }} aria-label={`Рейтинг ${value.toFixed(1)}`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fillPercent = Math.max(0, Math.min(1, value - index)) * 100;
        return (
          <span
            key={index}
            className="relative inline-block flex-shrink-0 overflow-hidden"
            style={{ width: size, height: size, fontSize: size, lineHeight: `${size}px` }}
            aria-hidden="true"
          >
            <span className="absolute inset-0 text-gray-300">★</span>
            <span className="absolute inset-0 overflow-hidden text-yellow-400" style={{ width: `${fillPercent}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
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
      if (event.key === "Escape") {
        setIsReviewsModalOpen(false);
      }
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
      source.sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return toSortTime(b) - toSortTime(a);
      });
      return source;
    }

    if (reviewSort === "lowest") {
      source.sort((a, b) => {
        if (a.rating !== b.rating) return a.rating - b.rating;
        return toSortTime(b) - toSortTime(a);
      });
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
      if (review.rating >= 1 && review.rating <= 5) {
        counts[review.rating - 1] += 1;
      }
    }
    return counts;
  }, [sellerReviews]);

  const modalReviewsTotal = sellerReviews.length || sellerReviewsCount;
  const modalRatingTotal = Math.max(1, modalReviewsTotal);
  const modalAverageRating = sellerReviews.length > 0
    ? sellerReviews.reduce((sum, review) => sum + review.rating, 0) / sellerReviews.length
    : sellerReviewsCount > 0
      ? sellerRatingNumber
      : 0;
  const modalAverageRatingLabel = sellerReviewsCount > 0 || sellerReviews.length > 0
    ? modalAverageRating.toFixed(1).replace(".", ",")
    : "-";

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
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-900">
                    <span className="tabular-nums text-2xl font-semibold leading-none">{sellerRatingDisplay}</span>
                    <div className="flex items-center gap-0.5" aria-label={`Рейтинг продавца ${sellerRatingDisplay}`}>
                      {[...Array(5)].map((_, index) => (
                        <Star
                          key={index}
                          className={`h-4 w-4 ${
                            index < Math.round(sellerRatingNumber) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    {seller.reviewsCount > 0 ? (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-[rgb(38,83,141)] transition hover:border-[rgb(38,83,141)] hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-[rgb(38,83,141)] focus:ring-offset-1"
                        onClick={() => setIsReviewsModalOpen(true)}
                        aria-label={`Открыть отзывы продавца: ${seller.reviewsCount} ${formatReviewsWord(seller.reviewsCount)}`}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Смотреть {seller.reviewsCount} {formatReviewsWord(seller.reviewsCount)}
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-500">Пока нет отзывов</span>
                    )}
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
            <AppModal
              open={isReviewsModalOpen}
              onClose={() => setIsReviewsModalOpen(false)}
              title="Отзывы о пользователе"
              size="lg"
              bodyClassName="app-modal__body--wide"
            >
              <div className="flex flex-col gap-8 sm:flex-row sm:gap-12">
                <div className="flex flex-col items-center">
                  <div className="mb-1 text-5xl font-black leading-none text-black">
                    {modalAverageRatingLabel}
                  </div>
                  <div className="mb-2 flex gap-1">
                    <ModalRatingStars value={modalAverageRating} size={24} gap={1} />
                  </div>
                  <div className="text-base text-black">
                    {modalReviewsTotal} {formatReviewsWord(modalReviewsTotal)}
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  {[5, 4, 3, 2, 1].map((score) => {
                    const count = ratingDistribution[score - 1] ?? 0;
                    const width = (count / modalRatingTotal) * 100;
                    return (
                      <div key={score} className="flex items-center gap-3">
                        <div className="flex w-[112px] gap-1" aria-label={`${score} звезд`}>
                          <ModalRatingStars value={score} size={19} gap={0} />
                        </div>
                        <div
                          className="h-2.5 flex-1 overflow-hidden rounded-full"
                          style={{ backgroundColor: "#d4d8de" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${width}%`,
                              minWidth: count > 0 ? 5 : 0,
                              backgroundColor: "#777777",
                            }}
                          />
                        </div>
                        <div className="w-8 text-right text-black">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <select
                  className="rounded-full bg-gray-100 px-5 py-3 text-base font-medium text-black outline-none transition hover:bg-gray-200"
                  value={reviewSort}
                  onChange={(event) => setReviewSort(event.target.value as ReviewSort)}
                  aria-label="Сортировка отзывов"
                >
                  <option value="newest">Сначала новые</option>
                  <option value="oldest">Сначала старые</option>
                  <option value="highest">Высокая оценка</option>
                  <option value="lowest">Низкая оценка</option>
                </select>
              </div>

              <div className="space-y-4">
                {isReviewsLoading ? <p className="text-sm text-gray-500">Загрузка отзывов...</p> : null}

                {sortedSellerReviews.map((review) => (
                  <article key={review.id} className="border-b border-gray-200 pb-4 last:border-0">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-[rgb(38,83,141)]">
                        {review.avatar ? (
                          <img src={review.avatar} alt={review.author} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-semibold text-white">
                            {review.author.trim().charAt(0).toUpperCase() || <User className="h-5 w-5" />}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-medium text-black">{review.author}</span>
                          <span className="text-xs text-gray-500">{toDateLabel(review.date)}</span>
                        </div>
                        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <ModalRatingStars value={review.rating} size={16} gap={0} />
                          {review.listingTitle ? (
                            <span className="ml-2 text-xs text-gray-600">Сделка состоялась · {review.listingTitle}</span>
                          ) : null}
                        </div>
                        <p className="text-sm text-gray-700">{review.comment}</p>
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
            </AppModal>,
            document.body,
          )
        : null}
    </div>
  );
}
