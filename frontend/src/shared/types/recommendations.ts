import type { Product } from ".";

export type RecommendationItem = {
  listing: Product;
  score: number;
  reason: string;
  source: string;
  debug?: Record<string, unknown>;
};
