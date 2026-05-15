import { notFound, validationError } from "../../../../../common/application-error";
import type {
  AdminComplaintsRepositoryPort,
  ComplaintSellerSummaryDto,
} from "../admin-complaints.types";

export class GetSellerSummaryService {
  constructor(
    private readonly repository: AdminComplaintsRepositoryPort,
  ) {}

  async execute(input: {
    complaintPublicId: string;
  }): Promise<ComplaintSellerSummaryDto> {
    const complaintPublicId = String(input.complaintPublicId ?? "").trim();
    if (!complaintPublicId) {
      throw validationError("Complaint id is required");
    }

    const summary = await this.repository.fetchSellerSummary(complaintPublicId);
    if (!summary) {
      throw notFound("Complaint not found");
    }
    return summary;
  }
}
