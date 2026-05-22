import type { RecommendationEventType } from "@prisma/client";
import { validationError } from "../../../../common/application-error";
import type { RecommendationsRepository } from "../../infrastructure/repositories/recommendations.repository";

export class RecordRecommendationEventService {
  constructor(private readonly repository: RecommendationsRepository) {}

  async execute(input: {
    userId: number;
    listingPublicId?: string;
    listingId?: number;
    eventType: RecommendationEventType;
    sourcePage?: string | null;
    sessionId?: string | null;
    eventWeight?: number;
  }) {
    if (!input.userId || !Number.isInteger(input.userId)) {
      throw validationError("User id is required");
    }
    if (!input.listingPublicId && !input.listingId) {
      throw validationError("Listing id is required");
    }
    return this.repository.recordEvent(input);
  }
}
