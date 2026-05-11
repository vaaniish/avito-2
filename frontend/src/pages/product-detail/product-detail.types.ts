import type { Product } from "../../shared/types";

export interface ProductDetailProps {
  product: Product;
  onBack: () => void;
  backLabel?: string;
  onOpenSellerStore?: (sellerId: string) => void;
  onAddToCart: (product: Product) => void;
  onBuyNow: (product: Product) => void;
  onUpdateQuantity?: (productId: string, quantity: number) => void;
  cartQuantity?: number;
  relatedProducts: Product[];
  isWishlisted?: boolean;
  onWishlistToggle?: (productId: string, isWishlisted: boolean) => void;
}

export type QuestionItem = {
  id: string;
  user: string;
  date: string;
  sortTs?: number;
  question: string;
  answer?: string | null;
  answerDate?: string | null;
  helpful?: number;
};

export type QuestionsPageResponse = {
  items: QuestionItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

export type ListingViewTrackResponse = {
  success: boolean;
  views: number;
};

export type ReviewSort = "newest" | "oldest" | "highest" | "lowest";
export type QuestionSort = "useful" | "newest" | "with_answer" | "without_answer";
export type ComplaintModalStep = "category" | "details" | "success";
export type ComplaintCategoryKey = "listing_info" | "communication" | "fraud";
export type ComplaintApiType = "suspicious_listing" | "other" | "fraud";
export type SelectedImageFitMode = "fit-height" | "fit-width";

export type ComplaintCategoryConfig = {
  key: ComplaintCategoryKey;
  title: string;
  detailsTitle: string;
  subtitle: string;
  apiType: ComplaintApiType;
  reasons: string[];
  detailsPlaceholder: string;
};
