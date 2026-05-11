import { useEffect, useMemo, useState } from "react";
import type { Product, Review } from "../../shared/types";
import { getSessionUser } from "../../shared/lib/api";
import { trackListingViewInMetrika } from "../../shared/lib/metrika";
import {
  createListingComplaint,
  createListingQuestion,
  fetchListingDetails,
  fetchListingQuestions,
  trackListingView,
} from "./product-detail.api";
import { COMPLAINT_CATEGORIES } from "./product-detail.constants";
import type {
  ComplaintCategoryKey,
  ComplaintModalStep,
  ProductDetailProps,
  QuestionItem,
  QuestionSort,
  ReviewSort,
  SelectedImageFitMode,
} from "./product-detail.types";
import { normalizeQuestions, toDateLabel, toSortTime } from "./product-detail.utils";
import { notifyError, notifyInfo, notifySuccess } from "../../shared/ui/notifications";

export function useSelectedImageFit(selectedImageSrc: string | undefined) {
  const [selectedImageFitMode, setSelectedImageFitMode] =
    useState<SelectedImageFitMode>("fit-height");

  useEffect(() => {
    if (!selectedImageSrc || typeof Image === "undefined") {
      setSelectedImageFitMode("fit-height");
      return;
    }

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) return;
      const isWide = image.naturalWidth > image.naturalHeight;
      setSelectedImageFitMode(isWide ? "fit-width" : "fit-height");
    };

    image.onerror = () => {
      if (cancelled) return;
      setSelectedImageFitMode("fit-height");
    };

    image.src = selectedImageSrc;

    return () => {
      cancelled = true;
    };
  }, [selectedImageSrc]);

  return { selectedImageFitMode };
}

export function useProductReviews(product: Product) {
  const [sellerReviews, setSellerReviews] = useState<Review[]>(product.reviews ?? []);
  const [sellerMetrics, setSellerMetrics] = useState<{ rating: number; reviewsCount: number } | null>(
    null,
  );
  const [sellerJoinedAt, setSellerJoinedAt] = useState<string | undefined>(product.sellerJoinedAt);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [reviewSort, setReviewSort] = useState<ReviewSort>("newest");

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

  useEffect(() => {
    setSellerReviews(product.reviews ?? []);
    setSellerMetrics(null);

    let ignore = false;

    const loadSellerReviews = async () => {
      try {
        const listing = await fetchListingDetails(product.id);
        if (ignore) return;

        const reviews = listing.reviews ?? [];
        setSellerReviews(reviews);
        setSellerMetrics({
          rating:
            typeof listing.sellerRating === "number"
              ? listing.sellerRating
              : product.sellerRating ?? product.rating,
          reviewsCount:
            typeof listing.sellerReviewsCount === "number"
              ? listing.sellerReviewsCount
              : reviews.length,
        });
        setSellerJoinedAt(listing.sellerJoinedAt ?? product.sellerJoinedAt);
      } catch {
        // Keep existing data from card/list payload.
      }
    };

    void loadSellerReviews();

    return () => {
      ignore = true;
    };
  }, [product.id, product.rating, product.reviews, product.sellerJoinedAt, product.sellerRating]);

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

  return {
    sellerReviews,
    sellerMetrics,
    sellerJoinedAt,
    isReviewsModalOpen,
    reviewSort,
    sortedSellerReviews,
    ratingDistribution,
    setSellerJoinedAt,
    setIsReviewsModalOpen,
    setReviewSort,
  };
}

export function useProductQuestions(product: Product) {
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [isQuestionsLoading, setIsQuestionsLoading] = useState(false);
  const [isQuestionsLoadingMore, setIsQuestionsLoadingMore] = useState(false);
  const [questionSort, setQuestionSort] = useState<QuestionSort>("useful");
  const [questionsTotal, setQuestionsTotal] = useState(0);
  const [questionsOffset, setQuestionsOffset] = useState(0);
  const [hasMoreQuestions, setHasMoreQuestions] = useState(false);
  const [questionHelpfulVotes, setQuestionHelpfulVotes] = useState<Record<string, number>>({});
  const [questionHelpfulLiked, setQuestionHelpfulLiked] = useState<Record<string, boolean>>({});
  const sessionUser = getSessionUser();
  const isBuyerRole = sessionUser?.role === "regular" || sessionUser?.role === "partner";
  const isOwnListing = Boolean(sessionUser && product.sellerId && sessionUser.public_id === product.sellerId);
  const canAskQuestions = Boolean(sessionUser && isBuyerRole && !isOwnListing);
  const questionAccessMessage = !sessionUser
    ? "Чтобы задать вопрос, войдите в аккаунт."
    : isOwnListing
      ? "Нельзя задавать вопрос по собственному объявлению."
      : !isBuyerRole
        ? "Администратор не может задавать вопросы по товарам."
      : null;

  const resetQuestions = () => {
    setQuestionSort("useful");
    setQuestions([]);
    setQuestionsTotal(0);
    setQuestionsOffset(0);
    setHasMoreQuestions(false);
    setQuestionHelpfulVotes({});
    setQuestionHelpfulLiked({});
    setNewQuestion("");
  };

  const loadQuestionsPage = async (offset: number, append: boolean) => {
    if (append) setIsQuestionsLoadingMore(true);
    else setIsQuestionsLoading(true);

    try {
      const result = await fetchListingQuestions({ productId: product.id, offset });
      const normalized = normalizeQuestions(result.items);

      setQuestions((prev) => {
        if (!append) return normalized;

        const known = new Set(prev.map((question) => question.id));
        const merged = [...prev];
        for (const question of normalized) {
          if (known.has(question.id)) continue;
          known.add(question.id);
          merged.push(question);
        }
        return merged;
      });

      setQuestionsTotal(result.pagination.total);
      setQuestionsOffset(offset + normalized.length);
      setHasMoreQuestions(result.pagination.hasMore);
    } catch {
      if (!append) {
        setQuestions([]);
        setQuestionsTotal(0);
        setQuestionsOffset(0);
        setHasMoreQuestions(false);
      }
    } finally {
      if (append) setIsQuestionsLoadingMore(false);
      else setIsQuestionsLoading(false);
    }
  };

  useEffect(() => {
    resetQuestions();
  }, [product.id]);

  useEffect(() => {
    void loadQuestionsPage(0, false);
  }, [product.id]);

  const sortedQuestions = useMemo(() => {
    const source = [...questions];

    if (questionSort === "newest") {
      source.sort((a, b) => (b.sortTs ?? 0) - (a.sortTs ?? 0));
      return source;
    }

    if (questionSort === "with_answer") {
      source.sort((a, b) => {
        const aScore = a.answer ? 1 : 0;
        const bScore = b.answer ? 1 : 0;
        if (bScore !== aScore) return bScore - aScore;
        return (b.sortTs ?? 0) - (a.sortTs ?? 0);
      });
      return source;
    }

    if (questionSort === "without_answer") {
      source.sort((a, b) => {
        const aScore = a.answer ? 0 : 1;
        const bScore = b.answer ? 0 : 1;
        if (bScore !== aScore) return bScore - aScore;
        return (b.sortTs ?? 0) - (a.sortTs ?? 0);
      });
      return source;
    }

    source.sort((a, b) => {
      const aHelpful = Number(a.helpful ?? 0);
      const bHelpful = Number(b.helpful ?? 0);
      if (bHelpful !== aHelpful) return bHelpful - aHelpful;
      return (b.sortTs ?? 0) - (a.sortTs ?? 0);
    });
    return source;
  }, [questionSort, questions]);

  const submitQuestion = async (isUnavailable: boolean) => {
    if (isUnavailable) {
      notifyInfo("По снятому с публикации объявлению нельзя задать новый вопрос.");
      return;
    }
    if (!sessionUser) {
      notifyInfo("Чтобы задать вопрос, войдите в аккаунт.");
      return;
    }
    if (isOwnListing) {
      notifyInfo("Нельзя задавать вопрос по собственному объявлению.");
      return;
    }
    if (!isBuyerRole) {
      notifyInfo("Администратор не может задавать вопросы по товарам.");
      return;
    }
    const questionText = newQuestion.trim();
    if (questionText.length < 3) return;

    try {
      const created = await createListingQuestion({
        productId: product.id,
        question: questionText,
      });

      setQuestions((prev) => [
        {
          ...created,
          sortTs: Number.isNaN(new Date(created.date).getTime())
            ? Date.now()
            : new Date(created.date).getTime(),
          date: toDateLabel(created.date),
          answerDate: created.answerDate ? toDateLabel(created.answerDate) : null,
        },
        ...prev,
      ]);
      setQuestionsTotal((prev) => prev + 1);
      setNewQuestion("");
      notifySuccess("Вопрос отправлен продавцу.");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить вопрос");
    }
  };

  const loadMoreQuestions = async () => {
    if (isQuestionsLoadingMore || !hasMoreQuestions) return;
    await loadQuestionsPage(questionsOffset, true);
  };

  const toggleHelpful = (questionId: string, initialHelpful: number) => {
    const currentVotes = questionHelpfulVotes[questionId] ?? Math.max(0, initialHelpful);
    const liked = Boolean(questionHelpfulLiked[questionId]);

    setQuestionHelpfulLiked((prev) => ({
      ...prev,
      [questionId]: !liked,
    }));
    setQuestionHelpfulVotes((prev) => ({
      ...prev,
      [questionId]: liked ? Math.max(0, currentVotes - 1) : currentVotes + 1,
    }));
  };

  return {
    canAskQuestions,
    questions,
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
    resetQuestions,
  };
}

export function useProductWishlistAndViews(params: {
  product: Product;
  isWishlisted: boolean;
  onWishlistToggle?: ProductDetailProps["onWishlistToggle"];
}) {
  const [viewsCount, setViewsCount] = useState(Math.max(0, Number(params.product.views ?? 0)));

  useEffect(() => {
    setViewsCount(Math.max(0, Number(params.product.views ?? 0)));
  }, [params.product.id, params.product.views]);

  useEffect(() => {
    let cancelled = false;

    const trackCurrentListingView = async () => {
      trackListingViewInMetrika({
        listingId: params.product.id,
        sellerId: params.product.sellerId,
      });

      try {
        const response = await trackListingView(params.product.id);
        if (!cancelled && typeof response.views === "number") {
          setViewsCount(Math.max(0, response.views));
        }
      } catch {
        // Keep local counter from list payload if tracking request fails.
      }
    };

    void trackCurrentListingView();

    return () => {
      cancelled = true;
    };
  }, [params.product.id, params.product.sellerId]);

  const toggleWishlist = async (isUnavailable: boolean) => {
    if (isUnavailable) {
      notifyInfo("Снятое с публикации объявление доступно только для просмотра.");
      return;
    }

    try {
      await params.onWishlistToggle?.(params.product.id, !params.isWishlisted);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось изменить избранное");
    }
  };

  return {
    isWishlisted: params.isWishlisted,
    viewsCount,
    toggleWishlist,
  };
}

export function useProductComplaint(product: Product) {
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [complaintStep, setComplaintStep] = useState<ComplaintModalStep>("category");
  const [complaintCategoryKey, setComplaintCategoryKey] = useState<ComplaintCategoryKey | null>(null);
  const [complaintReason, setComplaintReason] = useState("");
  const [complaintDetails, setComplaintDetails] = useState("");
  const [isComplaintSending, setIsComplaintSending] = useState(false);

  useEffect(() => {
    if (!isComplaintModalOpen || typeof document === "undefined") return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isComplaintModalOpen]);

  const resetComplaintFlow = () => {
    setIsComplaintModalOpen(false);
    setComplaintStep("category");
    setComplaintCategoryKey(null);
    setComplaintReason("");
    setComplaintDetails("");
  };

  useEffect(() => {
    resetComplaintFlow();
  }, [product.id]);

  const selectedComplaintCategory = useMemo(
    () => COMPLAINT_CATEGORIES.find((item) => item.key === complaintCategoryKey) ?? null,
    [complaintCategoryKey],
  );

  const openComplaintModal = (isUnavailable: boolean) => {
    if (isUnavailable) {
      notifyInfo("Снятое с публикации объявление доступно только для просмотра.");
      return;
    }
    setComplaintStep("category");
    setComplaintCategoryKey(null);
    setComplaintReason("");
    setComplaintDetails("");
    setIsComplaintModalOpen(true);
  };

  const closeComplaintModal = () => {
    if (isComplaintSending) return;
    setIsComplaintModalOpen(false);
    setComplaintStep("category");
    setComplaintCategoryKey(null);
    setComplaintReason("");
    setComplaintDetails("");
  };

  const selectComplaintCategory = (key: ComplaintCategoryKey) => {
    setComplaintCategoryKey(key);
    setComplaintReason("");
    setComplaintDetails("");
    setComplaintStep("details");
  };

  const submitComplaint = async () => {
    const session = getSessionUser();
    if (!session) {
      notifyInfo("Войдите в аккаунт покупателя, чтобы отправить жалобу.");
      return;
    }

    const selectedCategory =
      COMPLAINT_CATEGORIES.find((category) => category.key === complaintCategoryKey) ?? null;
    if (!selectedCategory) {
      notifyInfo("Выберите категорию жалобы.");
      return;
    }

    const reason = complaintReason.trim() || "Другая причина";
    const details = complaintDetails.trim();
    const description = [
      `Категория: ${selectedCategory.detailsTitle}`,
      `Причина: ${reason}`,
      details ? `Комментарий: ${details}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    if (description.length < 8 || description.length > 3000) {
      notifyInfo("Описание жалобы должно быть от 8 до 3000 символов.");
      return;
    }

    setIsComplaintSending(true);
    try {
      const result = await createListingComplaint({
        productId: product.id,
        complaintType: selectedCategory.apiType,
        description,
      });

      if (result.deduplicated) {
        notifyInfo("Похожая жалоба уже есть в обработке.");
        setComplaintStep("success");
        return;
      }
      notifySuccess("Жалоба отправлена.");
      setComplaintStep("success");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить жалобу");
    } finally {
      setIsComplaintSending(false);
    }
  };

  return {
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
  };
}
