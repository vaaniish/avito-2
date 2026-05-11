import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, ChevronRight, MapPin, MessageCircle, User } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";
import type { CartItem, FilterState, Product, Review } from "../../shared/types";
import { ProductCard } from "../../entities/ProductCard";
import { AppModal } from "../../shared/ui/app-modal";
import { FilterPanel, type CatalogCategory } from "../../widgets/FilterPanel";
import type { ReviewSort, SellerProfile } from "./seller-store.types";
import {
  EmptyReviewAvatar,
  ModalRatingStars,
  RatingStars,
  formatReviewsWord,
  toDateLabel,
} from "./seller-store.utils";

export function SellerStoreHeader({
  seller,
  isLoading,
  joinedYear,
  sellerRatingDisplay,
  sellerRatingNumber,
  onBack,
  onOpenReviews,
}: {
  seller: SellerProfile | null;
  isLoading: boolean;
  joinedYear: string | null;
  sellerRatingDisplay: string;
  sellerRatingNumber: number;
  onBack: () => void;
  onOpenReviews: () => void;
}) {
  return (
    <>
      <div className="page-container py-4 md:py-6">
        <button onClick={onBack} className="back-link text-sm md:text-base">
          <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          Назад в каталог
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        {isLoading && !seller ? (
          <div className="text-sm text-gray-500">Загрузка витрины продавца...</div>
        ) : seller ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
            <div className="flex items-stretch gap-4">
              <div className="aspect-square h-auto w-auto min-h-[132px] flex-shrink-0 self-stretch overflow-hidden rounded-full bg-gray-100 sm:min-h-[156px]">
                {seller.avatar ? (
                  <img src={seller.avatar} alt={seller.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center rounded-full text-gray-500">
                    <User className="h-12 w-12" />
                  </div>
                )}
              </div>
              <div className="flex min-h-[132px] flex-col justify-between sm:min-h-[156px]">
                <div className="max-w-[420px] truncate text-3xl font-semibold leading-none text-gray-900 md:text-4xl">
                  {seller.name}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-900">
                  <span className="tabular-nums text-2xl font-semibold leading-none">
                    {sellerRatingDisplay}
                  </span>
                  <div className="flex items-center gap-0.5" aria-label={`Рейтинг продавца ${sellerRatingDisplay}`}>
                    <RatingStars rating={sellerRatingNumber} />
                  </div>
                  {seller.reviewsCount > 0 ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm font-medium text-[rgb(38,83,141)] transition hover:border-[rgb(38,83,141)] hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-[rgb(38,83,141)] focus:ring-offset-1"
                      onClick={onOpenReviews}
                      aria-label={`Открыть отзывы продавца: ${seller.reviewsCount} ${formatReviewsWord(seller.reviewsCount)}`}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Смотреть {seller.reviewsCount} {formatReviewsWord(seller.reviewsCount)}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-500">
                      Пока нет отзывов
                    </span>
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
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500">Продавец не найден</div>
        )}
      </div>
    </>
  );
}

export function SellerStoreListingsSection({
  categories,
  filters,
  sortBy,
  items,
  cartItems,
  wishlistProductIds,
  hasMore,
  isLoading,
  isLoadingMore,
  onFilterChange,
  onSortChange,
  onOpenListing,
  onAddToCart,
  onUpdateQuantity,
  onWishlistToggle,
  onLoadMore,
}: {
  categories: CatalogCategory[];
  filters: FilterState;
  sortBy: string;
  items: Product[];
  cartItems: CartItem[];
  wishlistProductIds: Set<string>;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onFilterChange: Dispatch<SetStateAction<FilterState>>;
  onSortChange: Dispatch<SetStateAction<string>>;
  onOpenListing: (product: Product) => void;
  onAddToCart: (product: Product) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onWishlistToggle: (productId: string, isWishlisted: boolean) => void;
  onLoadMore: () => void;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const sortOptions = [
    { value: "popular", label: "Популярные" },
    { value: "price-asc", label: "Цена: по возрастанию" },
    { value: "price-desc", label: "Цена: по убыванию" },
    { value: "rating", label: "Высокий рейтинг" },
    { value: "newest", label: "Новинки" },
  ];
  const currentSort = sortOptions.find((option) => option.value === sortBy) ?? sortOptions[0];

  return (
    <div className="mt-6 flex gap-6 lg:items-start lg:gap-12 xl:gap-14">
      <aside className="hidden w-80 flex-shrink-0 self-start lg:block">
        <FilterPanel
          filters={filters}
          onFilterChange={(next) => onFilterChange(next)}
          viewMode="products"
          onViewModeChange={() => undefined}
          categories={categories}
        />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="text-sm text-gray-600">Найдено объявлений: {items.length}</div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((prev) => !prev)}
              onBlur={() => window.setTimeout(() => setSortOpen(false), 150)}
              className="flex min-w-[240px] items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 transition hover:border-gray-900"
            >
              <span>{currentSort.label}</span>
              <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform ${sortOpen ? "rotate-180" : ""}`} />
            </button>

            {sortOpen ? (
              <div className="absolute right-0 z-10 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onSortChange(option.value);
                      setSortOpen(false);
                    }}
                    className={`w-full px-4 py-3 text-left text-sm transition hover:bg-gray-50 ${
                      sortBy === option.value ? "bg-gray-100 text-gray-900" : "text-gray-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-6 lg:hidden">
          <FilterPanel
            filters={filters}
            onFilterChange={(next) => onFilterChange(next)}
            viewMode="products"
            onViewModeChange={() => undefined}
            categories={categories}
          />
        </div>

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
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Загрузка..." : "Показать еще"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SellerStoreReviewsModal({
  isOpen,
  onClose,
  isReviewsLoading,
  reviewSort,
  onSortChange,
  ratingDistribution,
  modalRatingTotal,
  modalAverageRating,
  modalAverageRatingLabel,
  modalReviewsTotal,
  sortedSellerReviews,
  sellerReviewsCount,
}: {
  isOpen: boolean;
  onClose: () => void;
  isReviewsLoading: boolean;
  reviewSort: ReviewSort;
  onSortChange: (sort: ReviewSort) => void;
  ratingDistribution: number[];
  modalRatingTotal: number;
  modalAverageRating: number;
  modalAverageRatingLabel: string;
  modalReviewsTotal: number;
  sortedSellerReviews: Review[];
  sellerReviewsCount: number;
}) {
  if (!isOpen || typeof document === "undefined") return null;
  return createPortal(
    <AppModal
      open={isOpen}
      onClose={onClose}
      title="Отзывы о пользователе"
      size="lg"
      bodyClassName="app-modal__body--wide"
    >
      <div className="flex flex-col gap-8 sm:flex-row sm:gap-12">
        <div className="flex flex-col items-center">
          <div className="mb-1 text-5xl font-black leading-none text-black">{modalAverageRatingLabel}</div>
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
                <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "#d4d8de" }}>
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
          onChange={(event) => onSortChange(event.target.value as ReviewSort)}
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
                  <EmptyReviewAvatar author={review.author} />
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
  );
}
