import type { PartnerListingsSearchRepositoryPort } from "../../domain/partner-listings.types";

export class GetListingTitleSuggestionsService {
  constructor(private readonly repository: PartnerListingsSearchRepositoryPort) {}

  execute(input: { query: string; type?: unknown }) {
    return this.repository.getTitleSuggestions(input);
  }
}
