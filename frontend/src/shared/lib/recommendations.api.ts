import { apiGet, apiPost } from "./api";
import type { RecommendationItem } from "../types/recommendations";

export function fetchHomeRecommendations() {
  return apiGet<RecommendationItem[]>("/recommendations/home");
}

export function fetchSimilarRecommendations(listingPublicId: string) {
  return apiGet<RecommendationItem[]>(
    `/recommendations/listings/${encodeURIComponent(listingPublicId)}/similar`,
  );
}

export function fetchCartRecommendations(listingPublicIds: string[]) {
  return apiPost<RecommendationItem[]>("/recommendations/cart", {
    listingPublicIds,
  });
}

export function trackRecommendationEvent(params: {
  listingPublicId: string;
  eventType: "VIEW" | "WISHLIST" | "ADD_TO_CART";
  sourcePage: string;
}) {
  return apiPost("/recommendations/events", params);
}
