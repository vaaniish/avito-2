import type { PartnerListingsWriteRepositoryPort } from "../../domain/partner-listings.types";
import type { ProcessPartnerListingModerationService } from "./process-partner-listing-moderation.service";

export class TogglePartnerListingStatusService {
  constructor(
    private readonly repository: PartnerListingsWriteRepositoryPort,
    private readonly moderation: ProcessPartnerListingModerationService,
  ) {}

  execute(input: { sellerId: number; publicId: string }) {
    return this.repository.toggleListingStatus(input).then((result) => {
      this.moderation.schedule(result.moderationJob);
      return result.response;
    });
  }
}
