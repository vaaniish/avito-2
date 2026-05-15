import { notFound, validationError } from "../../../../../common/application-error";
import {
  parseComplaintStatus,
} from "../admin-complaints.service";
import type {
  AdminComplaintsNotificationPort,
  AdminComplaintsRepositoryPort,
  ComplaintStatusUpdatePayload,
} from "../admin-complaints.types";

export class UpdateComplaintLegacyService {
  constructor(
    private readonly repository: AdminComplaintsRepositoryPort,
    private readonly notificationGateway: AdminComplaintsNotificationPort,
  ) {}

  async execute(input: {
    complaintPublicId: string;
    status: unknown;
    actionTaken?: unknown;
    actorUserId: number;
    requestIp: string | null;
  }): Promise<ComplaintStatusUpdatePayload> {
    const complaintPublicId = String(input.complaintPublicId ?? "").trim();
    if (!complaintPublicId) {
      throw validationError("Complaint id is required");
    }

    const nextStatus = parseComplaintStatus(input.status);
    if (!nextStatus) {
      throw validationError("Invalid complaint status");
    }

    const actionTaken =
      typeof input.actionTaken === "string" && input.actionTaken.trim().length > 0
        ? input.actionTaken.trim()
        : null;

    const result = await this.repository.updateLegacyComplaintStatus({
      complaintPublicId,
      nextStatus,
      actionTaken,
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
    });

    if (result.kind === "not_found") {
      throw notFound("Complaint not found");
    }

    if (result.kind === "invalid_transition") {
      throw validationError(result.message);
    }

    await this.notificationGateway.notifyComplaintStatusUpdate(
      result.notifications,
    );

    return result.payload;
  }
}
