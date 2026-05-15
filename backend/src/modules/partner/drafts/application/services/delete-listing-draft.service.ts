import { notFound } from "../../../../../common/application-error";
import type { PartnerDraftsRepositoryPort } from "../../domain/partner-drafts.types";

export class DeleteListingDraftService {
  constructor(private readonly repository: PartnerDraftsRepositoryPort) {}

  async execute(input: { sellerId: number; publicId: string }) {
    const existing = await this.repository.findDraft(input);
    if (!existing) {
      throw notFound("Draft not found");
    }

    await this.repository.deleteDraft(existing.id);
    return { success: true };
  }
}
