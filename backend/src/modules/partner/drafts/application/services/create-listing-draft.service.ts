import { draftToClient, safeJsonPayload } from "../../domain/partner-drafts.helpers";
import type { PartnerDraftsRepositoryPort } from "../../domain/partner-drafts.types";

export class CreateListingDraftService {
  constructor(private readonly repository: PartnerDraftsRepositoryPort) {}

  async execute(input: {
    sellerId: number;
    type: "PRODUCT";
    body: Record<string, unknown>;
  }) {
    const created = await this.repository.createDraft({
      sellerId: input.sellerId,
      type: input.type,
      title:
        typeof input.body.title === "string"
          ? input.body.title.trim().slice(0, 160)
          : null,
      categoryId: Number.isInteger(Number(input.body.categoryId))
        ? Number(input.body.categoryId)
        : null,
      subcategoryId: Number.isInteger(Number(input.body.subcategoryId))
        ? Number(input.body.subcategoryId)
        : null,
      itemId: Number.isInteger(Number(input.body.itemId))
        ? Number(input.body.itemId)
        : null,
      payload: safeJsonPayload(input.body.payload),
      currentScreen:
        typeof input.body.currentScreen === "string"
          ? input.body.currentScreen.trim().slice(0, 40) || "start"
          : "start",
    });
    return draftToClient(created);
  }
}
