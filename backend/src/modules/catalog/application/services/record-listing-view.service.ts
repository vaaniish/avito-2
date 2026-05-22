import { notFound, validationError } from "../../../../common/application-error";
import type { RecordRecommendationEventService } from "../../../recommendations/application/services/record-recommendation-event.service";
import type { CatalogRepositoryPort } from "../catalog.types";

export class RecordListingViewService {
  constructor(
    private readonly repository: CatalogRepositoryPort,
    private readonly recommendationEvents: RecordRecommendationEventService,
  ) {}

  async execute(input: {
    publicId: string;
    actorUserId?: number | null;
    sessionId?: string | null;
    sourcePage?: string | null;
  }) {
    const publicId = String(input.publicId ?? "").trim();
    if (!publicId) {
      throw validationError("Invalid listing ID");
    }

    const views = await this.repository.incrementListingViews(publicId);
    if (!views) {
      throw notFound("Listing not found");
    }

    if (input.actorUserId) {
      await this.recommendationEvents.execute({
        userId: input.actorUserId,
        listingPublicId: publicId,
        eventType: "VIEW",
        sourcePage: input.sourcePage ?? "product-detail",
        sessionId: input.sessionId ?? null,
      });
    }

    return {
      success: true,
      views,
    };
  }
}
