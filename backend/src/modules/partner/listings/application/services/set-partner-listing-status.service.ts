import type { PartnerListingsWriteRepositoryPort } from "../../domain/partner-listings.types";
import type { ProcessPartnerListingModerationService } from "./process-partner-listing-moderation.service";

export class SetPartnerListingStatusService {
  constructor(
    private readonly repository: PartnerListingsWriteRepositoryPort,
    private readonly moderation: ProcessPartnerListingModerationService,
  ) {}

  execute(input: { sellerId: number; publicId: string; status: unknown }) {
    return this.repository.setListingStatus(input).then((result) => {
      this.moderation.schedule(result.moderationJob);
      return result.response;
    });
  }
}
