import { notFound, validationError } from "../../../../../common/application-error";
import type { AdminComplaintsRepositoryPort } from "../admin-complaints.types";

export class GetRelatedListingComplaintsService {
  constructor(
    private readonly repository: AdminComplaintsRepositoryPort,
  ) {}

  async execute(input: { complaintPublicId: string }) {
    const complaintPublicId = String(input.complaintPublicId ?? "").trim();
    if (!complaintPublicId) {
      throw validationError("Complaint id is required");
    }

    const result =
      await this.repository.fetchRelatedListingComplaints(complaintPublicId);
    if (result.kind === "not_found") {
      throw notFound("Complaint not found");
    }

    return {
      items: result.items.map((item) => ({
        ...item,
        isCurrent: item.id === result.currentComplaintId,
      })),
    };
  }
}
