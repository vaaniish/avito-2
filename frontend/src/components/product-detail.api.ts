import type { Product } from "../types";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import { QUESTIONS_PAGE_SIZE } from "./product-detail.constants";
import type {
  ComplaintApiType,
  ListingViewTrackResponse,
  QuestionItem,
  QuestionsPageResponse,
} from "./product-detail.types";

export function fetchListingDetails(productId: string): Promise<Product> {
  return apiGet<Product>(`/catalog/listings/${productId}`);
}

export function fetchListingQuestions(params: {
  productId: string;
  offset: number;
}): Promise<QuestionsPageResponse> {
  return apiGet<QuestionsPageResponse>(
    `/catalog/listings/${params.productId}/questions?paginated=1&limit=${QUESTIONS_PAGE_SIZE}&offset=${params.offset}`,
  );
}

export function trackListingView(productId: string): Promise<ListingViewTrackResponse> {
  return apiPost<ListingViewTrackResponse>(`/catalog/listings/${productId}/view`);
}

export function createListingQuestion(params: {
  productId: string;
  question: string;
}): Promise<QuestionItem> {
  return apiPost<QuestionItem>(`/catalog/listings/${params.productId}/questions`, {
    question: params.question,
  });
}

export function addListingToWishlist(productId: string): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>(`/profile/wishlist/${productId}`);
}

export function removeListingFromWishlist(productId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/profile/wishlist/${productId}`);
}

export function createListingComplaint(params: {
  productId: string;
  complaintType: ComplaintApiType;
  description: string;
}): Promise<{ deduplicated?: boolean }> {
  return apiPost<{ deduplicated?: boolean }>(
    `/catalog/listings/${params.productId}/complaints`,
    {
      complaintType: params.complaintType,
      description: params.description,
    },
  );
}
