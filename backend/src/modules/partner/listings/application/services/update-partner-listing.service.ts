import type { PartnerListingsWriteRepositoryPort } from "../../domain/partner-listings.types";
import type { ProcessPartnerListingModerationService } from "./process-partner-listing-moderation.service";

export class UpdatePartnerListingService {
  constructor(
    private readonly repository: PartnerListingsWriteRepositoryPort,
    private readonly moderation: ProcessPartnerListingModerationService,
  ) {}

  execute(input: {
    sellerId: number;
    sellerRole: string;
    publicId: string;
    body: Record<string, unknown>;
  }) {
    return this.repository.updateListing(input).then((result) => {
      this.moderation.schedule(result.moderationJob);
      return result.response;
    });
  }
}
