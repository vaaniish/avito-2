import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
} from "lucide-react";
import { COMPLAINT_CATEGORIES } from "./product-detail.constants";
import {
  useProductComplaint,
  useProductQuestions,
  useProductReviews,
  useProductWishlistAndViews,
  useSelectedImageFit,
} from "./product-detail.hooks";
import {
  ProductComplaintModal,
  ProductImageGallerySection,
  ProductLocationSection,
  ProductQuestionsSection,
  ProductReviewsModal,
  ProductSellerSidebarSection,
} from "./product-detail.sections";
import type {
  ProductDetailProps,
} from "./product-detail.types";
import {
  buildYandexMapWidgetUrl,
  extractJoinedYear,
  extractLocationLabel,
  formatViewsWord,
  normalizeSpecificationEntry,
} from "./product-detail.utils";
import { notifyInfo } from "../../shared/ui/notifications";

export function ProductDetail({
  product,
  onBack,
  backLabel = "Назад к каталогу",
  onOpenSellerStore,
  onAddToCart,
  onBuyNow,
  onUpdateQuantity,
  cartQuantity = 0,
  relatedProducts: _relatedProducts,
  isWishlisted: isWishlistedProp = false,
  onWishlistToggle,
}: ProductDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [showLocationMap, setShowLocationMap] = useState(false);

  useEffect(() => {
    setSelectedImage(0);
    setShowLocationMap(false);
  }, [product.id]);

  const images = useMemo(() => {
    const raw = (product.images ?? []).filter(Boolean);
    return raw.length > 0 ? raw : [product.image];
  }, [product.image, product.images]);
  const selectedImageSrc = images[selectedImage] ?? images[0];
  const { selectedImageFitMode } = useSelectedImageFit(selectedImageSrc);
  const {
    sellerReviews,
    sellerMetrics,
    sellerJoinedAt,
    isReviewsModalOpen,
    reviewSort,
    sortedSellerReviews,
    ratingDistribution,
    setIsReviewsModalOpen,
    setReviewSort,
  } = useProductReviews(product);
  const {
    canAskQuestions,
    newQuestion,
    isQuestionsLoading,
    isQuestionsLoadingMore,
    questionSort,
    questionsTotal,
    hasMoreQuestions,
    questionHelpfulVotes,
    questionHelpfulLiked,
    questionAccessMessage,
    sortedQuestions,
    setNewQuestion,
    setQuestionSort,
    submitQuestion,
    loadMoreQuestions,
    toggleHelpful,
  } = useProductQuestions(product);
  const { isWishlisted, viewsCount, toggleWishlist } = useProductWishlistAndViews({
    product,
    isWishlisted: isWishlistedProp,
    onWishlistToggle,
  });
  const {
    isComplaintModalOpen,
    complaintStep,
    complaintReason,
    complaintDetails,
    isComplaintSending,
    selectedComplaintCategory,
    setComplaintReason,
    setComplaintDetails,
    setComplaintStep,
    openComplaintModal,
    closeComplaintModal,
    selectComplaintCategory,
    submitComplaint,
  } = useProductComplaint(product);
  const displayPrice = product.isSale && product.salePrice ? product.salePrice : product.price;
  const isInCart = cartQuantity > 0;
  const isUnavailable = product.isAvailable === false;

  const sellerReviewsCount =
    sellerMetrics?.reviewsCount ??
    product.sellerReviewsCount ??
    sellerReviews.length;

  const sellerRating =
    sellerMetrics?.rating ??
    product.sellerRating ??
    (sellerReviewsCount > 0 ? product.rating : 0);

  const sellerRatingValue = sellerReviewsCount > 0 ? sellerRating.toFixed(1) : "-";
  const viewsLabel = `${viewsCount} ${formatViewsWord(viewsCount)}`;
  const locationLabel = extractLocationLabel(product);
  const yandexMapWidgetUrl = buildYandexMapWidgetUrl(locationLabel);
  const sellerJoinedYear = extractJoinedYear(sellerJoinedAt);
  const specificationRows = useMemo(() => {
    if (!product.specifications) return [];
    return Object.entries(product.specifications).reduce<Array<{ label: string; value: string }>>(
      (acc, [key, value]) => {
        const normalized = normalizeSpecificationEntry(key, String(value));
        if (!normalized) return acc;

        const normalizedLabel = normalized.label.toLowerCase();
        if (
          normalized.normalizedKey === "city" ||
          normalized.normalizedKey === "город" ||
          normalizedLabel === "город"
        ) {
          return acc;
        }

        acc.push({ label: normalized.label, value: normalized.value });
        return acc;
      },
      [],
    );
  }, [product.specifications]);

  const specificationColumns = useMemo(() => {
    const mid = Math.ceil(specificationRows.length / 2);
    return [specificationRows.slice(0, mid), specificationRows.slice(mid)];
  }, [specificationRows]);
  const modalReviewsTotal = sellerReviews.length || sellerReviewsCount;
  const modalAverageRating = sellerReviews.length > 0
    ? sellerReviews.reduce((sum, review) => sum + review.rating, 0) / sellerReviews.length
    : sellerReviewsCount > 0
      ? sellerRating
      : 0;
  const modalAverageRatingLabel = sellerReviewsCount > 0 || sellerReviews.length > 0
    ? modalAverageRating.toFixed(1).replace(".", ",")
    : "-";


  const handlePrevImage = () => {
    if (images.length <= 1) return;
    setSelectedImage((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNextImage = () => {
    if (images.length <= 1) return;
    setSelectedImage((prev) => (prev + 1) % images.length);
  };

  const handleAddToCart = () => {
    if (isUnavailable) {
      notifyInfo(product.unavailableReason || "Объявление снято с публикации.");
      return;
    }
    if (!isInCart) {
      onAddToCart(product);
    }
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (onUpdateQuantity && newQuantity >= 0) {
      onUpdateQuantity(product.id, newQuantity);
    }
  };

  return (
    <div className="app-shell">
      <div className="page-container py-4 md:py-6">
        <button onClick={onBack} className="back-link text-sm md:text-base">
          <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          {backLabel}
        </button>
      </div>

      <div className="page-container">
        <h1 className="mb-6 text-2xl text-black md:text-4xl">{product.title}</h1>
      </div>

      <div className="page-container grid grid-cols-1 gap-8 pb-8 md:pb-16 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <ProductImageGallerySection
            images={images}
            productTitle={product.title}
            selectedImage={selectedImage}
            selectedImageFitMode={selectedImageFitMode}
            onSelectImage={setSelectedImage}
            onPrevImage={handlePrevImage}
            onNextImage={handleNextImage}
          />

          {specificationRows.length > 0 ? (
            <div className="mb-8">
              <h2 className="mb-3 text-xl text-gray-900 md:text-2xl">Характеристики</h2>
              <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 md:px-6">
                <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                  {specificationColumns.map((column, columnIndex) => (
                    <div key={columnIndex}>
                      {column.map((entry) => (
                        <div
                          key={`${columnIndex}-${entry.label}-${entry.value}`}
                          className="grid grid-cols-[minmax(128px,220px)_1fr] items-baseline gap-3 border-b border-gray-100 py-2 last:border-b-0"
                        >
                          <span className="text-sm text-gray-500">{entry.label}</span>
                          <span className="break-words text-sm text-gray-900">{entry.value}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mb-8">
            <h2 className="mb-2 text-xl text-gray-900 md:text-2xl">Описание</h2>
            <p className="whitespace-pre-line break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-gray-700 md:text-base">
              {product.description || "Описание отсутствует"}
            </p>
          </div>

          <ProductLocationSection
            locationLabel={locationLabel}
            showLocationMap={showLocationMap}
            yandexMapWidgetUrl={yandexMapWidgetUrl}
            onToggleMap={() => setShowLocationMap((prev) => !prev)}
          />

          <ProductQuestionsSection
            questionsTotal={questionsTotal}
            isUnavailable={isUnavailable}
            canAskQuestions={canAskQuestions}
            questionAccessMessage={questionAccessMessage}
            newQuestion={newQuestion}
            questionSort={questionSort}
            isQuestionsLoading={isQuestionsLoading}
            sortedQuestions={sortedQuestions}
            questionHelpfulVotes={questionHelpfulVotes}
            questionHelpfulLiked={questionHelpfulLiked}
            hasMoreQuestions={hasMoreQuestions}
            isQuestionsLoadingMore={isQuestionsLoadingMore}
            onQuestionChange={setNewQuestion}
            onQuestionSortChange={setQuestionSort}
            onSubmitQuestion={() => void submitQuestion(isUnavailable)}
            onToggleHelpful={toggleHelpful}
            onLoadMoreQuestions={() => void loadMoreQuestions()}
          />
        </div>
        <ProductSellerSidebarSection
          product={product}
          displayPrice={displayPrice}
          isWishlisted={isWishlisted}
          isUnavailable={isUnavailable}
          isInCart={isInCart}
          cartQuantity={cartQuantity}
          sellerRatingValue={sellerRatingValue}
          sellerRating={sellerRating}
          sellerReviewsCount={sellerReviewsCount}
          sellerJoinedYear={sellerJoinedYear}
          viewsLabel={viewsLabel}
          onToggleWishlist={() => void toggleWishlist(isUnavailable)}
          onQuantityChange={handleQuantityChange}
          onAddToCart={handleAddToCart}
          onBuyNow={() => onBuyNow(product)}
          onOpenSellerStore={onOpenSellerStore}
          onOpenReviews={() => setIsReviewsModalOpen(true)}
          onOpenComplaintModal={() => openComplaintModal(isUnavailable)}
        />
      </div>
      <ProductComplaintModal
        open={isComplaintModalOpen}
        step={complaintStep}
        categories={COMPLAINT_CATEGORIES}
        selectedCategory={selectedComplaintCategory}
        complaintReason={complaintReason}
        complaintDetails={complaintDetails}
        isComplaintSending={isComplaintSending}
        onClose={closeComplaintModal}
        onBack={() => setComplaintStep("category")}
        onCategorySelect={selectComplaintCategory}
        onReasonChange={setComplaintReason}
        onDetailsChange={setComplaintDetails}
        onSubmit={() => void submitComplaint()}
      />

      <ProductReviewsModal
        open={isReviewsModalOpen}
        reviews={sortedSellerReviews}
        reviewsCount={modalReviewsTotal}
        averageRating={modalAverageRating}
        averageRatingLabel={modalAverageRatingLabel}
        ratingDistribution={ratingDistribution}
        reviewSort={reviewSort}
        onClose={() => setIsReviewsModalOpen(false)}
        onReviewSortChange={setReviewSort}
      />
    </div>
  );
}
