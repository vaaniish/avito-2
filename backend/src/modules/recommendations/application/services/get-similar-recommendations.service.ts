import { validationError } from "../../../../common/application-error";
import type { RecommendationsRepository } from "../../infrastructure/repositories/recommendations.repository";

export class GetSimilarRecommendationsService {
  constructor(private readonly repository: RecommendationsRepository) {}

  async execute(input: { userId: number | null; listingPublicId: string }) {
    const listingPublicId = String(input.listingPublicId ?? "").trim();
    if (!listingPublicId) {
      throw validationError("Listing id is required");
    }
    return this.repository.getSimilarRecommendations({
      userId: input.userId,
      listingPublicId,
    });
  }
}
