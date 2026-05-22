import type {
  ItemSimilaritySource,
  RecommendationEntityType,
  RecommendationEventType,
} from "@prisma/client";

export type RecommendationProduct = {
  id: string;
  title: string;
  price: number;
  image: string;
  rating: number;
  sellerRating?: number;
  sellerReviewsCount?: number;
  seller: string;
  sellerId?: string;
  category: string;
  catalogCategoryId?: string | null;
  catalogSubcategoryId?: string | null;
  catalogItemId?: string | null;
  sku?: string | null;
  isNew?: boolean;
  isSale?: boolean;
  salePrice?: number | null;
  isVerified?: boolean;
  description?: string;
  shippingBySeller?: boolean;
  images?: string[];
  publishDate?: string;
  views?: number;
  specifications?: Record<string, string>;
  sellerAvatar?: string | null;
  sellerListings?: number;
  sellerJoinedAt?: Date | null;
  breadcrumbs?: string[];
  condition?: "new" | "used";
  city?: string;
  listingStatus?: "active" | "inactive" | "moderation";
  moderationStatus?: "approved" | "pending" | "rejected";
  isAvailable?: boolean;
  unavailableReason?: string;
};

export type RecommendationItemDto = {
  listing: RecommendationProduct;
  score: number;
  reason: string;
  source: string;
  debug?: Record<string, unknown>;
};

export type RecommendationContext = "home" | "similar" | "cart";

export type RecommendationEventInput = {
  userId: number;
  listingPublicId?: string;
  listingId?: number;
  eventType: RecommendationEventType;
  sourcePage?: string | null;
  sessionId?: string | null;
  eventWeight?: number;
};

export type RecommendationEventResult = {
  success: true;
  recorded: boolean;
  listingId: number | null;
  eventType: RecommendationEventType;
};

export type RecommendationCandidate = {
  listingId: number;
  score: number;
  source: ItemSimilaritySource | "SEGMENT" | "RECENT" | "POPULAR" | "CROSS_SELL";
  reason: string;
  debug: Record<string, unknown>;
};

export type RecommendationRefreshJob = {
  id: number;
  entity_type: RecommendationEntityType;
  entity_id: number;
  reason: string;
  attempts: number;
};
