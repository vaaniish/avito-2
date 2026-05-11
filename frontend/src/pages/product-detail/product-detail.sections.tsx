import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  Minus,
  Plus,
  Send,
  ShieldAlert,
  ShoppingCart,
  Star,
  ThumbsUp,
  User,
  Zap,
} from "lucide-react";
import type { Product, Review } from "../../shared/types";
import type {
  ComplaintCategoryConfig,
  ComplaintCategoryKey,
  ComplaintModalStep,
  ProductDetailProps,
  QuestionItem,
  QuestionSort,
  ReviewSort,
  SelectedImageFitMode,
} from "./product-detail.types";
import { ModalRatingStars } from "./product-detail.components";
import { COMPLAINT_DETAILS_MAX } from "./product-detail.constants";
import { formatReviewsWord, toDateLabel } from "./product-detail.utils";
import { AppModal } from "../../shared/ui/app-modal";

export function ProductImageGallerySection({
  images,
  productTitle,
  selectedImage,
  selectedImageFitMode,
  onSelectImage,
  onPrevImage,
  onNextImage,
}: {
  images: string[];
  productTitle: string;
  selectedImage: number;
  selectedImageFitMode: SelectedImageFitMode;
  onSelectImage: (index: number) => void;
  onPrevImage: () => void;
  onNextImage: () => void;
}) {
  return (
    <div className="mb-8">
      <div
        className="relative mb-3 w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100"
        style={{ height: "min(69vh)" }}
      >
        <div className="relative h-full w-full">
          <img
            src={images[selectedImage]}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
            style={{ objectFit: "cover", filter: "blur(28px)", transform: "scale(1.12)" }}
          />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.06) 24%, rgba(15,23,42,0.06) 76%, rgba(15,23,42,0.18) 100%)",
            }}
          />
          <div className="relative z-[1] flex h-full w-full items-center justify-center">
            <img
              src={images[selectedImage]}
              alt={productTitle}
              draggable={false}
              className="block select-none rounded-md"
              style={
                selectedImageFitMode === "fit-width"
                  ? { width: "100%", height: "auto", maxWidth: "100%", maxHeight: "100%" }
                  : { width: "auto", height: "100%", maxWidth: "100%", maxHeight: "100%" }
              }
            />
          </div>
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={onPrevImage}
              className="group/prev absolute inset-y-0 left-0 z-10 flex w-16 items-center justify-center md:w-20"
              aria-label="Предыдущее фото"
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/35 via-black/15 to-transparent opacity-0 transition-opacity duration-200 group-hover/prev:opacity-100" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-black/60 text-white shadow-[0_2px_10px_rgba(0,0,0,0.45)] transition group-hover/prev:scale-105 group-hover/prev:bg-black/75">
                <ChevronLeft className="h-6 w-6" />
              </span>
            </button>
            <button
              type="button"
              onClick={onNextImage}
              className="group/next absolute inset-y-0 right-0 z-10 flex w-16 items-center justify-center md:w-20"
              aria-label="Следующее фото"
            >
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-l from-black/35 via-black/15 to-transparent opacity-0 transition-opacity duration-200 group-hover/next:opacity-100" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-black/60 text-white shadow-[0_2px_10px_rgba(0,0,0,0.45)] transition group-hover/next:scale-105 group-hover/next:bg-black/75">
                <ChevronRight className="h-6 w-6" />
              </span>
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              onClick={() => onSelectImage(index)}
              className={`shrink-0 overflow-hidden rounded-lg border-2 ${
                selectedImage === index ? "border-gray-900" : "border-gray-200"
              }`}
              style={{ width: 84, height: 64 }}
              aria-label={`Открыть фото ${index + 1}`}
            >
              <img src={image} alt={`preview-${index}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProductQuestionsSection({
  questionsTotal,
  isUnavailable,
  canAskQuestions,
  questionAccessMessage,
  newQuestion,
  questionSort,
  isQuestionsLoading,
  sortedQuestions,
  questionHelpfulVotes,
  questionHelpfulLiked,
  hasMoreQuestions,
  isQuestionsLoadingMore,
  onQuestionChange,
  onQuestionSortChange,
  onSubmitQuestion,
  onToggleHelpful,
  onLoadMoreQuestions,
}: {
  questionsTotal: number;
  isUnavailable: boolean;
  canAskQuestions: boolean;
  questionAccessMessage: string | null;
  newQuestion: string;
  questionSort: QuestionSort;
  isQuestionsLoading: boolean;
  sortedQuestions: QuestionItem[];
  questionHelpfulVotes: Record<string, number>;
  questionHelpfulLiked: Record<string, boolean>;
  hasMoreQuestions: boolean;
  isQuestionsLoadingMore: boolean;
  onQuestionChange: (value: string) => void;
  onQuestionSortChange: (value: QuestionSort) => void;
  onSubmitQuestion: () => void;
  onToggleHelpful: (questionId: string, initialHelpful: number) => void;
  onLoadMoreQuestions: () => void;
}) {
  return (
    <div className="mt-8 pt-2">
      <h2 className="text-xl text-gray-900 md:text-2xl">Вопросы и ответы</h2>
      <p className="mb-4 mt-2 text-sm text-gray-600">Всего: {questionsTotal}</p>

      <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="mb-3 text-sm text-gray-700">
          {isUnavailable
            ? "Объявление снято с публикации. Старые вопросы доступны для чтения, новые действия отключены."
            : !canAskQuestions
              ? (questionAccessMessage ?? "Задавать вопросы могут только покупатели.")
              : "Задайте вопрос о товаре. Ответ продавца появится здесь."}
        </p>
        {!isUnavailable && canAskQuestions ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              placeholder="Задайте вопрос продавцу"
              value={newQuestion}
              onChange={(event) => onQuestionChange(event.target.value)}
              className="field-control text-sm"
            />
            <button
              onClick={onSubmitQuestion}
              className="btn-primary flex items-center justify-center gap-2 px-6 py-3 text-sm"
            >
              <Send className="h-4 w-4" /> Отправить
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-5 w-full sm:w-[360px]">
        <select
          value={questionSort}
          onChange={(event) => onQuestionSortChange(event.target.value as QuestionSort)}
          className="field-control min-h-[56px] px-4 py-3 text-base font-semibold leading-6 text-gray-900"
        >
          <option value="useful">Сначала полезные</option>
          <option value="newest">Сначала новые</option>
          <option value="with_answer">Сначала с ответом</option>
          <option value="without_answer">Сначала без ответа</option>
        </select>
      </div>

      <div className="space-y-4">
        {isQuestionsLoading ? <p className="text-sm text-gray-500">Загрузка вопросов...</p> : null}
        {!isQuestionsLoading && questionsTotal === 0 ? (
          <p className="text-sm text-gray-500">Пока нет вопросов по этому объявлению.</p>
        ) : null}

        {sortedQuestions.map((item) => (
          <div key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="text-sm text-gray-600">{item.user}</span>
              <span className="text-sm text-gray-500">{item.date}</span>
            </div>
            <p className="mb-3 text-base text-gray-900">{item.question}</p>
            <button
              type="button"
              onClick={() => onToggleHelpful(item.id, Number(item.helpful ?? 0))}
              className={`mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                questionHelpfulLiked[item.id]
                  ? "border-[rgb(38,83,141)] bg-[rgb(38,83,141)] text-white shadow-sm"
                  : "border-gray-300/70 bg-gray-100/90 text-gray-600 hover:border-gray-400 hover:bg-gray-200 hover:text-gray-800"
              }`}
            >
              <ThumbsUp className="h-4 w-4" />
              <span>{questionHelpfulVotes[item.id] ?? Number(item.helpful ?? 0)}</span>
            </button>
            {item.answer ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                <div className="mb-1 text-xs text-[rgb(38,83,141)]">
                  Ответ продавца {item.answerDate || ""}
                </div>
                <p className="text-sm text-gray-800">{item.answer}</p>
              </div>
            ) : (
              <div className="text-xs text-gray-500">Ожидает ответа продавца</div>
            )}
          </div>
        ))}
      </div>

      {hasMoreQuestions ? (
        <div className="mt-4">
          <button
            type="button"
            className="btn-secondary px-4 py-2 text-sm"
            onClick={onLoadMoreQuestions}
            disabled={isQuestionsLoadingMore}
          >
            {isQuestionsLoadingMore ? "Загрузка..." : "Показать еще вопросы"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ProductSellerSidebarSection({
  product,
  displayPrice,
  isWishlisted,
  isUnavailable,
  isInCart,
  cartQuantity,
  sellerRatingValue,
  sellerRating,
  sellerReviewsCount,
  sellerJoinedYear,
  viewsLabel,
  onToggleWishlist,
  onQuantityChange,
  onAddToCart,
  onBuyNow,
  onOpenSellerStore,
  onOpenReviews,
  onOpenComplaintModal,
}: {
  product: Product;
  displayPrice: number;
  isWishlisted: boolean;
  isUnavailable: boolean;
  isInCart: boolean;
  cartQuantity: number;
  sellerRatingValue: string;
  sellerRating: number;
  sellerReviewsCount: number;
  sellerJoinedYear: string | null;
  viewsLabel: string;
  onToggleWishlist: () => void;
  onQuantityChange: (value: number) => void;
  onAddToCart: () => void;
  onBuyNow: () => void;
  onOpenSellerStore?: ProductDetailProps["onOpenSellerStore"];
  onOpenReviews: () => void;
  onOpenComplaintModal: () => void;
}) {
  return (
    <div className="min-w-0 h-fit lg:sticky lg:top-32">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-3xl text-black">{displayPrice.toLocaleString("ru-RU")} ₽</div>
            {product.isSale && product.salePrice ? (
              <div className="text-base text-gray-400 line-through">
                {product.price.toLocaleString("ru-RU")} ₽
              </div>
            ) : null}
          </div>
          <button
            onClick={onToggleWishlist}
            disabled={isUnavailable}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50"
          >
            <Heart
              className={`h-5 w-5 ${isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"}`}
            />
          </button>
        </div>

        {isUnavailable ? (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700">
            Снято с публикации
          </div>
        ) : isInCart ? (
          <div className="mb-4 flex w-full items-center justify-center gap-6 rounded-xl border border-gray-200 bg-gray-100 py-3 text-gray-900">
            <button
              onClick={() => onQuantityChange(cartQuantity - 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white transition-all duration-300 hover:bg-gray-900 hover:text-white"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-[40px] text-center text-base">{cartQuantity}</span>
            <button
              onClick={() => onQuantityChange(cartQuantity + 1)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white transition-all duration-300 hover:bg-gray-900 hover:text-white"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="mb-4 flex w-full flex-col items-center gap-2">
            <button
              onClick={onAddToCart}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm"
            >
              <ShoppingCart className="h-4 w-4" />
              Добавить в корзину
            </button>
            <button
              onClick={onBuyNow}
              className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm"
            >
              <Zap className="h-4 w-4" />
              Купить сейчас
            </button>
          </div>
        )}

        <div className="rounded-xl bg-gray-50 p-4">
          <div className="mb-3 flex items-start gap-3">
            <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-gray-300">
              {product.sellerAvatar ? (
                <img src={product.sellerAvatar} alt={product.seller} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-600">
                  <User className="h-5 w-5" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="min-w-0 truncate text-lg font-semibold leading-tight text-gray-900">
                {product.seller}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-900">
                <span className="tabular-nums font-semibold">{sellerRatingValue}</span>
                <div className="flex items-center gap-0.5" aria-label={`Рейтинг продавца ${sellerRatingValue}`}>
                  {[...Array(5)].map((_, index) => (
                    <Star
                      key={index}
                      className={`h-3.5 w-3.5 ${
                        index < Math.round(sellerRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                      }`}
                    />
                  ))}
                </div>
                {sellerReviewsCount > 0 ? (
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-[rgb(38,83,141)] transition hover:border-[rgb(38,83,141)] hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-[rgb(38,83,141)] focus:ring-offset-1"
                    onClick={onOpenReviews}
                    aria-label={`Открыть отзывы продавца: ${sellerReviewsCount} ${formatReviewsWord(sellerReviewsCount)}`}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Смотреть {sellerReviewsCount} {formatReviewsWord(sellerReviewsCount)}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
                    Пока нет отзывов
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-gray-600">
                {sellerJoinedYear ? `На Ecomm с ${sellerJoinedYear}` : "На Ecomm"}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-xs text-gray-900 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              if (product.sellerId) {
                onOpenSellerStore?.(product.sellerId);
              }
            }}
            disabled={!product.sellerId}
          >
            Перейти в профиль продавца
          </button>
        </div>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <p className="text-center text-sm text-gray-700">
            № {product.id} • {product.publishDate || "дата публикации не указана"} • {viewsLabel}
          </p>
          {!isUnavailable ? (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={onOpenComplaintModal}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-base text-gray-900 transition hover:bg-gray-200"
              >
                <Flag className="h-4 w-4 text-red-500" />
                Пожаловаться на объявление
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProductComplaintModal({
  open,
  step,
  categories,
  selectedCategory,
  complaintReason,
  complaintDetails,
  isComplaintSending,
  onClose,
  onBack,
  onCategorySelect,
  onReasonChange,
  onDetailsChange,
  onSubmit,
}: {
  open: boolean;
  step: ComplaintModalStep;
  categories: ComplaintCategoryConfig[];
  selectedCategory: ComplaintCategoryConfig | null;
  complaintReason: string;
  complaintDetails: string;
  isComplaintSending: boolean;
  onClose: () => void;
  onBack: () => void;
  onCategorySelect: (key: ComplaintCategoryKey) => void;
  onReasonChange: (value: string) => void;
  onDetailsChange: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <AppModal open={open} onClose={onClose} size="md" bodyClassName="app-modal__body--wide">
      {step === "category" ? (
        <div>
          <h3 className="mb-6 text-3xl font-semibold leading-tight text-gray-900">
            Выберите причину жалобы
          </h3>
          <div className="space-y-4">
            {categories.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => onCategorySelect(category.key)}
                className="flex w-full items-center justify-between rounded-xl border-2 border-gray-200 bg-gray-100 py-5 pl-8 pr-5 text-left transition hover:bg-gray-200"
                style={{ paddingLeft: 14 }}
              >
                <div className="pr-5">
                  <div className="text-2xl font-semibold leading-tight text-gray-900">
                    {category.title}
                  </div>
                  <p className="mt-2 text-base text-gray-600">{category.subtitle}</p>
                </div>
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-500">
                  {category.key === "listing_info" ? <FileText className="h-8 w-8" /> : null}
                  {category.key === "communication" ? <MessageCircle className="h-8 w-8" /> : null}
                  {category.key === "fraud" ? <ShieldAlert className="h-8 w-8" /> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "details" && selectedCategory ? (
        <div className="flex min-h-[520px] flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <h3 className="mb-4 text-3xl font-semibold leading-tight text-gray-900">
              {selectedCategory.detailsTitle}
            </h3>

            <div className="space-y-1.5">
              {selectedCategory.reasons.map((reason) => {
                const isActive = complaintReason === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => onReasonChange(reason)}
                    className="flex w-full items-center gap-4 rounded-2xl px-4 py-2.5 text-left transition hover:bg-gray-100"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-gray-100">
                      {isActive ? (
                        <span className="h-3.5 w-3.5 rounded-full bg-[rgb(38,83,141)]" />
                      ) : null}
                    </span>
                    <span className="text-xl leading-tight text-gray-900">{reason}</span>
                  </button>
                );
              })}
            </div>

            <p className="mt-5 text-2xl font-semibold leading-tight text-gray-900">
              Нам помогут любые детали
            </p>
            <textarea
              className="field-control mt-3 text-base md:text-lg"
              style={{ minHeight: 200 }}
              placeholder={selectedCategory.detailsPlaceholder}
              value={complaintDetails}
              onChange={(event) => onDetailsChange(event.target.value)}
              maxLength={COMPLAINT_DETAILS_MAX}
            />
            <p className="mt-2 text-sm text-gray-500">
              {complaintDetails.length} из {COMPLAINT_DETAILS_MAX.toLocaleString("ru-RU")} символов
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-200 bg-white pt-4">
            <button
              type="button"
              className="inline-flex h-14 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-2xl bg-gray-100 px-8 text-lg text-gray-900 transition hover:bg-gray-200"
              onClick={onBack}
              disabled={isComplaintSending}
            >
              Назад
            </button>
            <button
              type="button"
              className="inline-flex h-14 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-2xl bg-gray-900 px-8 text-lg text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onSubmit}
              disabled={isComplaintSending}
            >
              {isComplaintSending ? "Отправка..." : "Отправить"}
            </button>
          </div>
        </div>
      ) : null}

      {step === "success" ? (
        <div className="py-4 text-center">
          <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-blue-50 text-sky-500">
            <Heart className="h-14 w-14 fill-current" />
          </div>
          <h3 className="text-3xl font-semibold text-gray-900 md:text-4xl">Спасибо за помощь!</h3>
          <p className="mx-auto mt-4 max-w-[460px] text-xl text-gray-700 md:text-2xl">
            Мы всё проверим и напишем вам, когда примем меры.
          </p>
          <button
            type="button"
            className="mt-8 inline-flex h-14 w-[380px] min-w-[380px] shrink-0 items-center justify-center whitespace-nowrap rounded-2xl bg-gray-900 px-10 text-lg text-white transition hover:bg-gray-800"
            style={{ minWidth: 380, width: 380 }}
            onClick={onClose}
          >
            Буду иметь в виду
          </button>
        </div>
      ) : null}
    </AppModal>,
    document.body,
  );
}

export function ProductReviewsModal({
  open,
  reviews,
  reviewsCount,
  averageRating,
  averageRatingLabel,
  ratingDistribution,
  reviewSort,
  onClose,
  onReviewSortChange,
}: {
  open: boolean;
  reviews: Review[];
  reviewsCount: number;
  averageRating: number;
  averageRatingLabel: string;
  ratingDistribution: number[];
  reviewSort: ReviewSort;
  onClose: () => void;
  onReviewSortChange: (value: ReviewSort) => void;
}) {
  if (!open || typeof document === "undefined") return null;

  const modalRatingTotal = Math.max(1, reviewsCount);

  return createPortal(
    <AppModal
      open={open}
      onClose={onClose}
      title="Отзывы о продавце"
      size="lg"
      bodyClassName="app-modal__body--wide"
    >
      <div className="px-1 pb-2">
        <div className="flex flex-col gap-8 sm:flex-row sm:gap-12">
          <div className="flex flex-col items-center">
            <div className="mb-1 text-5xl font-black leading-none text-black">
              {averageRatingLabel}
            </div>
            <div className="mb-2 flex gap-1">
              <ModalRatingStars value={averageRating} size={24} gap={1} />
            </div>
            <div className="text-base text-black">
              {reviewsCount} {formatReviewsWord(reviewsCount)}
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

        <div className="mt-8">
          <select
            className="rounded-full bg-gray-100 px-5 py-3 text-base font-medium text-black outline-none transition hover:bg-gray-200"
            value={reviewSort}
            onChange={(event) => onReviewSortChange(event.target.value as ReviewSort)}
            aria-label="Сортировка отзывов"
          >
            <option value="newest">Сначала новые</option>
            <option value="oldest">Сначала старые</option>
            <option value="highest">Высокая оценка</option>
            <option value="lowest">Низкая оценка</option>
          </select>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {reviews.map((review) => (
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
                    <span className="ml-2 text-xs text-gray-600">
                      Сделка состоялась · {review.listingTitle}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-gray-700">{review.comment}</p>
              </div>
            </div>
          </article>
        ))}

        {reviews.length === 0 ? (
          <p className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
            {reviewsCount > 0
              ? "Отзывы есть, но список пока не удалось загрузить. Попробуйте открыть позже."
              : "Пока нет отзывов о продавце."}
          </p>
        ) : null}
      </div>
    </AppModal>,
    document.body,
  );
}

export function ProductLocationSection({
  locationLabel,
  showLocationMap,
  yandexMapWidgetUrl,
  onToggleMap,
}: {
  locationLabel: string;
  showLocationMap: boolean;
  yandexMapWidgetUrl: string;
  onToggleMap: () => void;
}) {
  return (
    <div className="mb-8 pb-4">
      <h2 className="mb-2 text-xl text-gray-900 md:text-2xl">Местоположение</h2>
      <div className="mb-3 flex items-center gap-2 text-gray-700">
        <MapPin className="h-4 w-4" />
        <span>{locationLabel}</span>
      </div>
      <button
        type="button"
        onClick={onToggleMap}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 transition hover:bg-gray-100"
      >
        {showLocationMap ? "Скрыть карту" : "Показать на карте"}
      </button>

      {showLocationMap ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
          <iframe
            src={yandexMapWidgetUrl}
            title="Карта расположения"
            className="h-[520px] w-full md:h-[560px]"
            loading="lazy"
          />
        </div>
      ) : null}
    </div>
  );
}
