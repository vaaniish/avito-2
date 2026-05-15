import { draftToClient } from "../../domain/partner-drafts.helpers";
import type { PartnerDraftsRepositoryPort } from "../../domain/partner-drafts.types";

export class ListListingDraftsService {
  constructor(private readonly repository: PartnerDraftsRepositoryPort) {}

  async execute(input: { sellerId: number; type: "PRODUCT" }) {
    const drafts = await this.repository.listDrafts(input);
    return drafts.map(draftToClient);
  }
}
