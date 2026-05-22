import type { RecommendationsRepository } from "../../infrastructure/repositories/recommendations.repository";

export class GetHomeRecommendationsService {
  constructor(private readonly repository: RecommendationsRepository) {}

  async execute(input: { userId: number | null }) {
    return this.repository.getHomeRecommendations({
      userId: input.userId,
    });
  }
}
