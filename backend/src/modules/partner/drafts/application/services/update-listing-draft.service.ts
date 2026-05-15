import { notFound } from "../../../../../common/application-error";
import { draftToClient, safeJsonPayload } from "../../domain/partner-drafts.helpers";
import type { PartnerDraftsRepositoryPort } from "../../domain/partner-drafts.types";

export class UpdateListingDraftService {
  constructor(private readonly repository: PartnerDraftsRepositoryPort) {}

  async execute(input: {
    sellerId: number;
    publicId: string;
    body: Record<string, unknown>;
  }) {
    const existing = await this.repository.findDraft({
      sellerId: input.sellerId,
      publicId: input.publicId,
    });
    if (!existing) {
      throw notFound("Draft not found");
    }

    const updated = await this.repository.updateDraft({
      draftId: existing.id,
      data: {
        type: input.body.type === undefined ? undefined : "PRODUCT",
        title:
          input.body.title === undefined
            ? undefined
            : typeof input.body.title === "string"
              ? input.body.title.trim().slice(0, 160)
              : null,
        categoryId:
          input.body.categoryId === undefined
            ? undefined
            : Number.isInteger(Number(input.body.categoryId))
              ? Number(input.body.categoryId)
              : null,
        subcategoryId:
          input.body.subcategoryId === undefined
            ? undefined
            : Number.isInteger(Number(input.body.subcategoryId))
              ? Number(input.body.subcategoryId)
              : null,
        itemId:
          input.body.itemId === undefined
            ? undefined
            : Number.isInteger(Number(input.body.itemId))
              ? Number(input.body.itemId)
              : null,
        payload:
          input.body.payload === undefined
            ? undefined
            : safeJsonPayload(input.body.payload),
        currentScreen:
          input.body.currentScreen === undefined
            ? undefined
            : typeof input.body.currentScreen === "string"
              ? input.body.currentScreen.trim().slice(0, 40) || "start"
              : "start",
      },
    });

    return draftToClient(updated);
  }
}
