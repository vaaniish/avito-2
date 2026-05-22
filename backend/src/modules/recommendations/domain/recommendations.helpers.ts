import type { RecommendationEventType, ItemSimilaritySource } from "@prisma/client";
import type { RecommendationCandidate, RecommendationContext } from "./recommendations.types";

export const RECOMMENDATION_EVENT_WEIGHTS: Record<RecommendationEventType, number> = {
  VIEW: 1,
  WISHLIST: 3,
  ADD_TO_CART: 4,
  PURCHASE_PAID: 6,
  PURCHASE_COMPLETED: 8,
  REVIEW: 5,
};

export const VIEW_DEDUP_MINUTES = 30;
export const PROFILE_LOOKBACK_DAYS = 90;
export const REFRESH_POLL_INTERVAL_MS = 45_000;
export const REFRESH_JOB_BATCH_SIZE = 12;

export function resolveRecommendationEventWeight(
  eventType: RecommendationEventType,
  explicitWeight?: number,
) {
  if (Number.isFinite(explicitWeight) && Number(explicitWeight) > 0) {
    return Number(explicitWeight);
  }
  return RECOMMENDATION_EVENT_WEIGHTS[eventType];
}

export function computeTimeDecay(params: {
  occurredAt: Date;
  now?: Date;
  eventType: RecommendationEventType;
}) {
  const now = params.now ?? new Date();
  const ageMs = Math.max(0, now.getTime() - params.occurredAt.getTime());
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  const halfLifeDays =
    params.eventType === "PURCHASE_PAID" || params.eventType === "PURCHASE_COMPLETED"
      ? 45
      : params.eventType === "REVIEW"
        ? 30
        : 14;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function bucketPrice(price: number) {
  if (price < 5_000) return "budget";
  if (price < 20_000) return "value";
  if (price < 60_000) return "mid";
  if (price < 150_000) return "premium";
  return "luxury";
}

export function buildReasonLabel(
  source: ItemSimilaritySource | "SEGMENT" | "RECENT" | "POPULAR" | "CROSS_SELL",
) {
  if (source === "CO_VIEW" || source === "RECENT") return "Похоже на то, что вы смотрели";
  if (source === "CO_PURCHASE") return "Покупают вместе";
  if (source === "CROSS_SELL") return "Сопутствующие товары";
  if (source === "CONTENT") return "Похожие товары";
  if (source === "SEGMENT" || source === "POPULAR") return "Популярно в вашей категории";
  return "Рекомендуем вам";
}

export function normalizeScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1000) / 1000);
}

export function dedupeCandidates(candidates: RecommendationCandidate[]) {
  const byListingId = new Map<number, RecommendationCandidate>();
  for (const candidate of candidates) {
    const existing = byListingId.get(candidate.listingId);
    if (!existing || candidate.score > existing.score) {
      byListingId.set(candidate.listingId, candidate);
    }
  }
  return Array.from(byListingId.values());
}

export function sortCandidates(candidates: RecommendationCandidate[]) {
  return [...candidates].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.listingId - right.listingId;
  });
}

export function limitCandidates(candidates: RecommendationCandidate[], limit: number) {
  return sortCandidates(dedupeCandidates(candidates)).slice(0, limit);
}

export function getRecommendationLimit(context: RecommendationContext) {
  if (context === "cart") return 6;
  if (context === "similar") return 8;
  return 10;
}
