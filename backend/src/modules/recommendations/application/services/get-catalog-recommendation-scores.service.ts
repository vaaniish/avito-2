import type { RecommendationsRepository } from "../../infrastructure/repositories/recommendations.repository";

export class GetCatalogRecommendationScoresService {
  constructor(private readonly repository: RecommendationsRepository) {}

  async execute(input: { userId: number | null; listingIds: number[] }) {
    return this.repository.getCatalogRecommendationScores({
      userId: input.userId,
      listingIds: input.listingIds,
    });
  }
}
