import { notFound, validationError } from "../../../../../common/application-error";
import type { AdminComplaintsRepositoryPort } from "../admin-complaints.types";

export class GetComplaintDetailsService {
  constructor(
    private readonly repository: AdminComplaintsRepositoryPort,
  ) {}

  async execute(input: { complaintPublicId: string }) {
    const complaintPublicId = String(input.complaintPublicId ?? "").trim();
    if (!complaintPublicId) {
      throw validationError("Complaint id is required");
    }

    const details = await this.repository.fetchComplaintDetails(complaintPublicId);
    if (!details) {
      throw notFound("Complaint not found");
    }

    return {
      ...details.complaint,
      history: details.history,
    };
  }
}
