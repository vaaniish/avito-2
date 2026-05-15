import type { PartnerListingsCatalogRepositoryPort } from "../../domain/partner-listings.types";

export class CreateCatalogRequestService {
  constructor(private readonly repository: PartnerListingsCatalogRepositoryPort) {}

  execute(input: { sellerId: number; body: Record<string, unknown> }) {
    return this.repository.createCatalogRequest(input);
  }
}
