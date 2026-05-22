import { validationError } from "../../../../common/application-error";
import type { RecommendationsRepository } from "../../infrastructure/repositories/recommendations.repository";

export class GetCartRecommendationsService {
  constructor(private readonly repository: RecommendationsRepository) {}

  async execute(input: { userId: number | null; listingPublicIds: unknown }) {
    const listingPublicIds = Array.isArray(input.listingPublicIds)
      ? input.listingPublicIds
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [];

    if (listingPublicIds.length === 0) {
      throw validationError("Cart listing ids are required");
    }

    return this.repository.getCartRecommendations({
      userId: input.userId,
      listingPublicIds,
    });
  }
}
