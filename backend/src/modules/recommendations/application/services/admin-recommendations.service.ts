import type { RecommendationsRepository } from "../../infrastructure/repositories/recommendations.repository";
import type { RecommendationContext } from "../../domain/recommendations.types";

export class AdminRecomputeRecommendationsService {
  constructor(private readonly repository: RecommendationsRepository) {}

  async execute() {
    await this.repository.recomputeAll();
    return { success: true };
  }
}

export class ExplainRecommendationsService {
  constructor(private readonly repository: RecommendationsRepository) {}

  async execute(input: {
    userId: number | null;
    context: RecommendationContext;
    listingPublicId?: string | null;
    listingPublicIds?: string[];
  }) {
    return this.repository.explainRecommendations(input);
  }
}
