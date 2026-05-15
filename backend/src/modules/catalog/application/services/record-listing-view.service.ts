import { notFound, validationError } from "../../../../common/application-error";
import type { CatalogRepositoryPort } from "../catalog.types";

export class RecordListingViewService {
  constructor(private readonly repository: CatalogRepositoryPort) {}

  async execute(input: { publicId: string }) {
    const publicId = String(input.publicId ?? "").trim();
    if (!publicId) {
      throw validationError("Invalid listing ID");
    }

    const views = await this.repository.incrementListingViews(publicId);
    if (!views) {
      throw notFound("Listing not found");
    }

    return {
      success: true,
      views,
    };
  }
}
