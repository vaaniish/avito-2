import type {
  PartnerListingsNotificationPort,
  PartnerListingsWriteRepositoryPort,
} from "../../domain/partner-listings.types";
import type { ProcessPartnerListingModerationService } from "./process-partner-listing-moderation.service";

export class CreatePartnerListingService {
  constructor(
    private readonly repository: PartnerListingsWriteRepositoryPort,
    private readonly notifications: PartnerListingsNotificationPort,
    private readonly moderation: ProcessPartnerListingModerationService,
  ) {}

  execute(input: {
    sellerId: number;
    sellerRole: string;
    body: Record<string, unknown>;
  }) {
    return this.repository.createListing(input).then(async (result) => {
      await this.notifications.notifyAdminsAboutQueuedListing({
        listingPublicId: result.response.id,
        title: result.response.title,
      });
      this.moderation.schedule(result.moderationJob);
      return result.response;
    });
  }
}
