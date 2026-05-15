import type { PartnerListingsCatalogRepositoryPort } from "../../domain/partner-listings.types";

export class GetCatalogReferenceService {
  constructor(private readonly repository: PartnerListingsCatalogRepositoryPort) {}

  execute(input: { itemName: string; brand: string; model: string }) {
    return this.repository.getCatalogReference(input);
  }
}
