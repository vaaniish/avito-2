import type { PartnerListingsSearchRepositoryPort } from "../../domain/partner-listings.types";

export class GuessListingCategoryService {
  constructor(private readonly repository: PartnerListingsSearchRepositoryPort) {}

  execute(input: { title: string; type?: unknown }) {
    return this.repository.guessCategory(input);
  }
}
