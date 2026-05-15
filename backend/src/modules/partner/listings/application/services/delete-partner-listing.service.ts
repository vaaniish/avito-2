import type { PartnerListingsWriteRepositoryPort } from "../../domain/partner-listings.types";

export class DeletePartnerListingService {
  constructor(private readonly repository: PartnerListingsWriteRepositoryPort) {}

  execute(input: { sellerId: number; publicId: string }) {
    return this.repository.deleteListing(input);
  }
}
