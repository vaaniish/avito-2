import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
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
  X,
  Zap,
} from "lucide-react";
import type { Product, Review } from "../types";
import { apiDelete, apiGet, apiPost, getSessionUser } from "../lib/api";
import { trackListingViewInMetrika } from "../lib/metrika";
import { notifyError, notifyInfo, notifySuccess } from "./ui/notifications";

interface ProductDetailProps {
  product: Product;
  onBack: () => void;
  onOpenSellerStore?: (sellerId: string) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onUpdateQuantity?: (productId: string, quantity: number) => void;
  cartQuantity?: number;
  relatedProducts: Product[];
  initialIsWishlisted?: boolean;
  onWishlistToggle?: (productId: string, isWishlisted: boolean) => void;
}

type QuestionItem = {
  id: string;
  user: string;
  date: string;
  sortTs?: number;
  question: string;
  answer?: string | null;
  answerDate?: string | null;
  helpful?: number;
};

type QuestionsPageResponse = {
  items: QuestionItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

type ListingViewTrackResponse = {
  success: boolean;
  views: number;
};

type ReviewSort = "newest" | "highest" | "lowest";
type QuestionSort = "useful" | "newest" | "with_answer" | "without_answer";
type ComplaintModalStep = "category" | "details" | "success";
type ComplaintCategoryKey = "listing_info" | "communication" | "fraud";
type ComplaintApiType = "suspicious_listing" | "other" | "fraud";
type SelectedImageFitMode = "fit-height" | "fit-width";

type ComplaintCategoryConfig = {
  key: ComplaintCategoryKey;
  title: string;
  detailsTitle: string;
  subtitle: string;
  apiType: ComplaintApiType;
  reasons: string[];
  detailsPlaceholder: string;
};

const QUESTIONS_PAGE_SIZE = 6;
const COMPLAINT_DETAILS_MAX = 2000;
const COMPLAINT_CATEGORIES: ComplaintCategoryConfig[] = [
  {
    key: "listing_info",
    title: "Информация в объявлении",
    detailsTitle: "Информация в объявлении",
    subtitle: "Неверная цена или другие параметры, актуальность",
    apiType: "suspicious_listing",
    reasons: [
      "Неверная цена",
      "Неправдивые фото или описание",
      "Неверный адрес",
      "Уже продано",
      "Объявление должно быть в другой категории",
      "Телефон или ссылки в описании",
    ],
    detailsPlaceholder: "Проверка",
  },
  {
    key: "communication",
    title: "Общение с продавцом",
    detailsTitle: "Общение с продавцом",
    subtitle: "Хамство в ответах, невозможно связаться",
    apiType: "other",
    reasons: [
      "Невозможно связаться",
      "Хамство, грубость",
      "Хамил в ответах на вопросы",
      "Кажется, это мошенники",
    ],
    detailsPlaceholder: "Расскажите, что не так",
  },
  {
    key: "fraud",
    title: "Нарушение правил или обман",
    detailsTitle: "Нарушение правил или обман",
    subtitle: "Мошенничество, дубли, чужие фото",
    apiType: "fraud",
    reasons: [
      "Дубль другого объявления",
      "Чужие фото",
      "Запрещенный товар",
      "Просят оплатить комиссию за доставку",
      "Просят предоплату",
      "Кажется, это мошенники",
    ],
    detailsPlaceholder: "Расскажите, что не так",
  },
];

function formatReviewsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отзыв";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отзыва";
  return "отзывов";
}

function formatViewsWord(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "просмотр";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "просмотра";
  return "просмотров";
}

function extractLocationLabel(product: Product): string {
  if (product.location?.trim()) return product.location.trim();

  if (product.specifications) {
    for (const [key, value] of Object.entries(product.specifications)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("адрес") ||
        normalizedKey.includes("мест") ||
        normalizedKey.includes("location")
      ) {
        const normalizedValue = String(value ?? "").trim();
        if (normalizedValue) return normalizedValue;
      }
    }
  }

  return product.city?.trim() || "Москва";
}

function resolveCoordinatesByLocation(locationLabel: string): { lat: number; lon: number } | null {
  const label = locationLabel.toLowerCase();

  const cityCoordinates: Array<{ match: string; lat: number; lon: number }> = [
    { match: "москва", lat: 55.751244, lon: 37.618423 },
    { match: "санкт-петербург", lat: 59.93863, lon: 30.31413 },
    { match: "казань", lat: 55.796127, lon: 49.106414 },
    { match: "екатеринбург", lat: 56.838011, lon: 60.597465 },
    { match: "краснодар", lat: 45.03547, lon: 38.975313 },
    { match: "сочи", lat: 43.585472, lon: 39.723098 },
    { match: "нижний новгород", lat: 56.326887, lon: 44.005986 },
    { match: "новосибирск", lat: 55.030199, lon: 82.92043 },
    { match: "киров", lat: 58.603595, lon: 49.667919 },
    { match: "кириши", lat: 59.448078, lon: 32.008781 },
  ];

  for (const city of cityCoordinates) {
    if (label.includes(city.match)) {
      return { lat: city.lat, lon: city.lon };
    }
  }

  return null;
}

function buildYandexMapWidgetUrl(locationLabel: string): string {
  const coordinates = resolveCoordinatesByLocation(locationLabel);
  if (!coordinates) {
    return `https://yandex.ru/map-widget/v1/?text=${encodeURIComponent(locationLabel)}&z=12`;
  }

  const ll = `${coordinates.lon},${coordinates.lat}`;
  const pt = `${coordinates.lon},${coordinates.lat},pm2blm`;
  return `https://yandex.ru/map-widget/v1/?ll=${encodeURIComponent(ll)}&z=15&pt=${encodeURIComponent(pt)}`;
}

function toDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
}

function formatSpecificationLabel(rawKey: string): string {
  const cleaned = rawKey.replace(/^_+/, "").trim();
  const normalized = cleaned.toLowerCase();

  const dictionary: Record<string, string> = {
    meeting_address: "Адрес встречи",
    address: "Адрес",
    city: "Город",
    condition: "Состояние",
    brand: "Бренд",
    model: "Модель",
    memory: "Память",
    color: "Цвет",
  };

  if (dictionary[normalized]) {
    return dictionary[normalized];
  }

  const words = cleaned
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!words) return "Параметр";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function extractJoinedYear(raw: string | null | undefined): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return String(date.getFullYear());
  }
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

function normalizeSpecificationEntry(
  rawKey: string,
  rawValue: string,
): { normalizedKey: string; label: string; value: string } | null {
  const key = rawKey.trim();
  let value = String(rawValue ?? "").trim();
  let normalizedKey = key;

  if (!value) {
    const mergedMatch = key.match(/^_*(meeting_address|address|city|condition)(.+)$/i);
    if (mergedMatch) {
      normalizedKey = mergedMatch[1];
      value = mergedMatch[2]?.trim() ?? "";
    }
  }

  if (!value) return null;
  return {
    normalizedKey: normalizedKey.replace(/^_+/, "").trim().toLowerCase(),
    label: formatSpecificationLabel(normalizedKey),
    value,
  };
}

export function ProductDetail({
  product,
  onBack,
  onOpenSellerStore,
  onAddToCart,
  onBuyNow,
  onUpdateQuantity,
  cartQuantity = 0,
  relatedProducts: _relatedProducts,
  initialIsWishlisted = false,
  onWishlistToggle,
}: ProductDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedImageFitMode, setSelectedImageFitMode] = useState<SelectedImageFitMode>("fit-width");
  const [isWishlisted, setIsWishlisted] = useState(initialIsWishlisted);

  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [isQuestionsLoading, setIsQuestionsLoading] = useState(false);
  const [isQuestionsLoadingMore, setIsQuestionsLoadingMore] = useState(false);
  const [questionSort, setQuestionSort] = useState<QuestionSort>("useful");
  const [questionsTotal, setQuestionsTotal] = useState(0);
  const [questionsOffset, setQuestionsOffset] = useState(0);
  const [hasMoreQuestions, setHasMoreQuestions] = useState(false);

  const [sellerReviews, setSellerReviews] = useState<Review[]>(product.reviews ?? []);
  const [sellerMetrics, setSellerMetrics] = useState<{ rating: number; reviewsCount: number } | null>(null);
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false);
  const [reviewSort, setReviewSort] = useState<ReviewSort>("newest");

  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [complaintStep, setComplaintStep] = useState<ComplaintModalStep>("category");
  const [complaintCategoryKey, setComplaintCategoryKey] = useState<ComplaintCategoryKey | null>(null);
  const [complaintReason, setComplaintReason] = useState("");
  const [complaintDetails, setComplaintDetails] = useState("");
  const [isComplaintSending, setIsComplaintSending] = useState(false);

  const [showLocationMap, setShowLocationMap] = useState(false);
  const [viewsCount, setViewsCount] = useState(Math.max(0, Number(product.views ?? 0)));
  const [sellerJoinedAt, setSellerJoinedAt] = useState<string | undefined>(product.sellerJoinedAt);
  const [questionHelpfulVotes, setQuestionHelpfulVotes] = useState<Record<string, number>>({});
  const [questionHelpfulLiked, setQuestionHelpfulLiked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setIsWishlisted(initialIsWishlisted);
  }, [initialIsWishlisted]);

  useEffect(() => {
    if (!isComplaintModalOpen || typeof document === "undefined") return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isComplaintModalOpen]);

  useEffect(() => {
    setSelectedImage(0);
    setQuestionSort("useful");
    setShowLocationMap(false);
    setQuestions([]);
    setQuestionsTotal(0);
    setQuestionsOffset(0);
    setHasMoreQuestions(false);
    setViewsCount(Math.max(0, Number(product.views ?? 0)));
    setSellerJoinedAt(product.sellerJoinedAt);
    setQuestionHelpfulVotes({});
    setQuestionHelpfulLiked({});
    setIsComplaintModalOpen(false);
    setComplaintStep("category");
    setComplaintCategoryKey(null);
    setComplaintReason("");
    setComplaintDetails("");
  }, [product.id]);

  const images = useMemo(() => {
    const raw = (product.images ?? []).filter(Boolean);
    return raw.length > 0 ? raw : [product.image];
  }, [product.image, product.images]);
  const selectedImageSrc = images[selectedImage] ?? images[0];

  const displayPrice = product.isSale && product.salePrice ? product.salePrice : product.price;
  const isInCart = cartQuantity > 0;

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
  const selectedComplaintCategory = useMemo(
    () => COMPLAINT_CATEGORIES.find((item) => item.key === complaintCategoryKey) ?? null,
    [complaintCategoryKey],
  );
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

  useEffect(() => {
    if (!selectedImageSrc || typeof Image === "undefined") {
      setSelectedImageFitMode("fit-width");
      return;
    }

    let cancelled = false;
    const image = new Image();

    image.onload = () => {
      if (cancelled) return;
      setSelectedImageFitMode(image.naturalHeight >= image.naturalWidth ? "fit-height" : "fit-width");
    };

    image.onerror = () => {
      if (cancelled) return;
      setSelectedImageFitMode("fit-width");
    };

    image.src = selectedImageSrc;

    return () => {
      cancelled = true;
    };
  }, [selectedImageSrc]);
  const specificationColumns = useMemo(() => {
    const mid = Math.ceil(specificationRows.length / 2);
    return [specificationRows.slice(0, mid), specificationRows.slice(mid)];
  }, [specificationRows]);

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

  useEffect(() => {
    setSellerReviews(product.reviews ?? []);
    setSellerMetrics(null);

    let ignore = false;

    const loadSellerReviews = async () => {
      try {
        const listing = await apiGet<Product>(`/catalog/listings/${product.id}`);
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
  }, [product.id, product.rating, product.sellerJoinedAt, product.sellerRating, product.reviews]);

  const normalizeQuestions = (items: QuestionItem[]) =>
    items.map((item) => ({
      ...item,
      sortTs: Number.isNaN(new Date(item.date).getTime()) ? 0 : new Date(item.date).getTime(),
      date: toDateLabel(item.date),
      answerDate: item.answerDate ? toDateLabel(item.answerDate) : null,
    }));

  const loadQuestionsPage = async (offset: number, append: boolean) => {
    if (append) {
      setIsQuestionsLoadingMore(true);
    } else {
      setIsQuestionsLoading(true);
    }

    try {
      const result = await apiGet<QuestionsPageResponse>(
        `/catalog/listings/${product.id}/questions?paginated=1&limit=${QUESTIONS_PAGE_SIZE}&offset=${offset}`,
      );
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
      if (append) {
        setIsQuestionsLoadingMore(false);
      } else {
        setIsQuestionsLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadQuestionsPage(0, false);
  }, [product.id]);

  useEffect(() => {
    let cancelled = false;

    const trackListingView = async () => {
      trackListingViewInMetrika({
        listingId: product.id,
        sellerId: product.sellerId,
      });

      try {
        const response = await apiPost<ListingViewTrackResponse>(`/catalog/listings/${product.id}/view`);
        if (!cancelled && typeof response.views === "number") {
          setViewsCount(Math.max(0, response.views));
        }
      } catch {
        // Keep local counter from list payload if tracking request fails.
      }
    };

    void trackListingView();

    return () => {
      cancelled = true;
    };
  }, [product.id, product.sellerId]);

  const handlePrevImage = () => {
    if (images.length <= 1) return;
    setSelectedImage((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNextImage = () => {
    if (images.length <= 1) return;
    setSelectedImage((prev) => (prev + 1) % images.length);
  };

  const handleAddToCart = () => {
    if (!isInCart) {
      onAddToCart(product);
    }
  };

  const handleQuantityChange = (newQuantity: number) => {
    if (onUpdateQuantity && newQuantity >= 0) {
      onUpdateQuantity(product.id, newQuantity);
    }
  };

  const handleSubmitQuestion = async () => {
    const questionText = newQuestion.trim();
    if (questionText.length < 3) return;

    try {
      const created = await apiPost<QuestionItem>(`/catalog/listings/${product.id}/questions`, {
        question: questionText,
      });

      setQuestions((prev) => [
        {
          ...created,
          sortTs: Number.isNaN(new Date(created.date).getTime()) ? Date.now() : new Date(created.date).getTime(),
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

  const handleLoadMoreQuestions = async () => {
    if (isQuestionsLoadingMore || !hasMoreQuestions) return;
    await loadQuestionsPage(questionsOffset, true);
  };

  const handleToggleHelpful = (questionId: string, initialHelpful: number) => {
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

  const handleToggleWishlist = async () => {
    try {
      if (isWishlisted) {
        await apiDelete<{ success: boolean }>(`/profile/wishlist/${product.id}`);
      } else {
        await apiPost<{ success: boolean }>(`/profile/wishlist/${product.id}`);
      }
      setIsWishlisted((prev) => !prev);
      onWishlistToggle?.(product.id, !isWishlisted);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось изменить избранное");
    }
  };

  const resetComplaintFlow = () => {
    setComplaintStep("category");
    setComplaintCategoryKey(null);
    setComplaintReason("");
    setComplaintDetails("");
  };

  const handleOpenComplaintModal = () => {
    resetComplaintFlow();
    setIsComplaintModalOpen(true);
  };

  const handleCloseComplaintModal = () => {
    if (isComplaintSending) return;
    setIsComplaintModalOpen(false);
    resetComplaintFlow();
  };

  const handleSelectComplaintCategory = (key: ComplaintCategoryKey) => {
    setComplaintCategoryKey(key);
    setComplaintReason("");
    setComplaintDetails("");
    setComplaintStep("details");
  };

  const handleSubmitComplaint = async () => {
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
      const result = await apiPost<{ deduplicated?: boolean }>(
        `/catalog/listings/${product.id}/complaints`,
        {
          complaintType: selectedCategory.apiType,
          description,
        },
      );

      if (result.deduplicated) {
        notifyInfo("Похожая жалоба уже есть в обработке.");
      }
      notifySuccess("Жалоба отправлена.");
      setComplaintStep("success");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить жалобу");
    } finally {
      setIsComplaintSending(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="page-container py-4 md:py-6">
        <button onClick={onBack} className="back-link text-sm md:text-base">
          <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          Назад к каталогу
        </button>
      </div>

      <div className="page-container grid grid-cols-1 gap-8 pb-8 md:pb-16 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0">
          <h1 className="mb-6 text-2xl text-black md:text-4xl">{product.title}</h1>

          <div className="mb-8">
            <div
              className="relative mb-3 w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-100"
              style={{ maxWidth: 760 }}
            >
              <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
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
                    alt={product.title}
                    draggable={false}
                    className="block select-none rounded-md"
                    style={
                      selectedImageFitMode === "fit-height"
                        ? { width: "auto", height: "100%", maxWidth: "none", maxHeight: "none" }
                        : { width: "100%", height: "auto", maxWidth: "none", maxHeight: "none" }
                    }
                  />
                </div>
              </div>

              {images.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={handlePrevImage}
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
                    onClick={handleNextImage}
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
                    onClick={() => setSelectedImage(index)}
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

          <div className="mb-8 pb-4">
            <h2 className="mb-2 text-xl text-gray-900 md:text-2xl">Местоположение</h2>
            <div className="mb-3 flex items-center gap-2 text-gray-700">
              <MapPin className="h-4 w-4" />
              <span>{locationLabel}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowLocationMap((prev) => !prev)}
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

          <div className="mt-8 pt-2">
            <h2 className="text-xl text-gray-900 md:text-2xl">Вопросы и ответы</h2>
            <p className="mb-4 mt-2 text-sm text-gray-600">Всего: {questionsTotal}</p>

            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-sm text-gray-700">
                Задайте вопрос о товаре. Ответ продавца появится здесь.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  placeholder="Задайте вопрос продавцу"
                  value={newQuestion}
                  onChange={(event) => setNewQuestion(event.target.value)}
                  className="field-control text-sm"
                />
                <button
                  onClick={() => void handleSubmitQuestion()}
                  className="btn-primary flex items-center justify-center gap-2 px-6 py-3 text-sm"
                >
                  <Send className="h-4 w-4" /> Отправить
                </button>
              </div>
            </div>

            <div className="mb-5 w-full sm:w-[360px]">
              <select
                value={questionSort}
                onChange={(event) => setQuestionSort(event.target.value as QuestionSort)}
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
                    onClick={() => handleToggleHelpful(item.id, Number(item.helpful ?? 0))}
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
                  onClick={() => void handleLoadMoreQuestions()}
                  disabled={isQuestionsLoadingMore}
                >
                  {isQuestionsLoadingMore ? "Загрузка..." : "Показать еще вопросы"}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 h-fit lg:sticky lg:top-32">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <div className="text-3xl text-black">{displayPrice.toLocaleString("ru-RU")} ₽</div>
                {product.isSale && product.salePrice ? (
                  <div className="text-base text-gray-400 line-through">{product.price.toLocaleString("ru-RU")} ₽</div>
                ) : null}
              </div>
              <button
                onClick={() => void handleToggleWishlist()}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                <Heart className={`h-5 w-5 ${isWishlisted ? "fill-red-500 text-red-500" : "text-gray-600"}`} />
              </button>
            </div>

            {isInCart ? (
              <div className="mb-4 flex w-full items-center justify-center gap-6 rounded-xl border border-gray-200 bg-gray-100 py-3 text-gray-900">
                <button
                  onClick={() => handleQuantityChange(cartQuantity - 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white transition-all duration-300 hover:bg-gray-900 hover:text-white"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-[40px] text-center text-base">{cartQuantity}</span>
                <button
                  onClick={() => handleQuantityChange(cartQuantity + 1)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white transition-all duration-300 hover:bg-gray-900 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="mb-4 flex w-full flex-col items-center gap-2">
                <button
                  onClick={handleAddToCart}
                  className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-sm"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Добавить в корзину
                </button>
                <button
                  onClick={() => onBuyNow(product)}
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
                  <div className="min-w-0 truncate text-lg font-semibold leading-tight text-gray-900">{product.seller}</div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-gray-900">
                    <span className="tabular-nums font-semibold">{sellerRatingValue}</span>
                    <div className="flex items-center gap-0.5">
                      {[...Array(5)].map((_, index) => (
                        <Star
                          key={index}
                          className={`h-3.5 w-3.5 ${
                            index < Math.round(sellerRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center rounded-full bg-gray-100/90 px-2.5 py-0.5 text-sm text-gray-700 transition hover:bg-gray-200 hover:text-[rgb(38,83,141)] hover:underline"
                      onClick={() => setIsReviewsModalOpen(true)}
                    >
                      {sellerReviewsCount} {formatReviewsWord(sellerReviewsCount)}
                    </button>
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
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={handleOpenComplaintModal}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-6 py-3 text-base text-gray-900 transition hover:bg-gray-200"
                >
                  <Flag className="h-4 w-4 text-red-500" />
                  Пожаловаться на объявление
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {isComplaintModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[140] flex items-center justify-center p-4"
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 1400,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
              }}
              onClick={handleCloseComplaintModal}
            >
              <div
                className="relative z-[1] rounded-2xl border border-gray-200 bg-white p-5 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.6)] md:p-6"
                style={{
                  width: "min(660px, 94vw)",
                  maxHeight: "min(92vh, 860px)",
                  overflow: "hidden",
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={handleCloseComplaintModal}
                  className="absolute right-4 top-4 rounded-lg p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                  aria-label="Закрыть"
                  disabled={isComplaintSending}
                >
                  <X className="h-6 w-6" />
                </button>

                {complaintStep === "category" ? (
                  <div className="px-5 pb-4 pt-4 md:px-6">
                    <h3 className="mb-6 text-3xl font-semibold leading-tight text-gray-900">
                      Выберите причину жалобы
                    </h3>
                    <div className="space-y-4">
                      {COMPLAINT_CATEGORIES.map((category) => (
                        <button
                          key={category.key}
                          type="button"
                          onClick={() => handleSelectComplaintCategory(category.key)}
                          className="flex w-full items-center justify-between rounded-xl border-2 border-gray-200 bg-gray-100 pr-5 pl-8 py-5 text-left transition hover:bg-gray-200" style={{ paddingLeft: 14 }}
                        >
                          <div className="pr-5">
                            <div className="text-2xl font-semibold leading-tight text-gray-900">{category.title}</div>
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

                {complaintStep === "details" && selectedComplaintCategory ? (
                  <div className="flex h-[min(84vh,760px)] flex-col px-5 pt-4 md:px-6">
                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                      <h3 className="mb-4 text-3xl font-semibold leading-tight text-gray-900">
                        {selectedComplaintCategory.detailsTitle}
                      </h3>

                      <div className="space-y-1.5">
                        {selectedComplaintCategory.reasons.map((reason) => {
                          const isActive = complaintReason === reason;
                          return (
                            <button
                              key={reason}
                              type="button"
                              onClick={() => setComplaintReason(reason)}
                              className="flex w-full items-center gap-4 rounded-2xl px-4 py-2.5 text-left transition hover:bg-gray-100"
                            >
                              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-gray-100">
                                {isActive ? <span className="h-3.5 w-3.5 rounded-full bg-[rgb(38,83,141)]" /> : null}
                              </span>
                              <span className="text-xl leading-tight text-gray-900">{reason}</span>
                            </button>
                          );
                        })}
                      </div>

                      <p className="mt-5 text-2xl font-semibold leading-tight text-gray-900">Нам помогут любые детали</p>
                      <textarea
                        className="field-control mt-3 text-base md:text-lg"
                        style={{ minHeight: 200 }}
                        placeholder={selectedComplaintCategory.detailsPlaceholder}
                        value={complaintDetails}
                        onChange={(event) => setComplaintDetails(event.target.value)}
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
                        onClick={() => setComplaintStep("category")}
                        disabled={isComplaintSending}
                      >
                        Назад
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-14 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-2xl bg-gray-900 px-8 text-lg text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => void handleSubmitComplaint()}
                        disabled={isComplaintSending}
                      >
                        {isComplaintSending ? "Отправка..." : "Отправить"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {complaintStep === "success" ? (
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
                      onClick={handleCloseComplaintModal}
                    >
                      Буду иметь в виду
                    </button>
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

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
                          i < Math.round(sellerRating) ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
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

                {sortedSellerReviews.length === 0 ? (
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

