import type { PartnerListingsReadRepositoryPort } from "../../domain/partner-listings.types";

export class ListPartnerListingsService {
  constructor(private readonly repository: PartnerListingsReadRepositoryPort) {}

  execute(input: { sellerId: number; type?: unknown }) {
    return this.repository.listListings(input);
  }
}
