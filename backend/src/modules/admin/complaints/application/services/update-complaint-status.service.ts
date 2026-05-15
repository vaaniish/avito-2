import {
  conflict,
  notFound,
  validationError,
} from "../../../../../common/application-error";
import {
  COMPLAINT_STATUS_IDEMPOTENCY_ACTION,
  makeIdempotencyHash,
  parseComplaintStatus,
} from "../admin-complaints.service";
import type {
  AdminComplaintsNotificationPort,
  AdminComplaintsRepositoryPort,
  ComplaintStatusUpdatePayload,
} from "../admin-complaints.types";

export class UpdateComplaintStatusService {
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
    idempotencyKey: string;
  }): Promise<ComplaintStatusUpdatePayload> {
    const complaintPublicId = String(input.complaintPublicId ?? "").trim();
    if (!complaintPublicId) {
      throw validationError("Complaint id is required");
    }

    const nextStatus = parseComplaintStatus(input.status);
    if (!nextStatus) {
      throw validationError("Invalid complaint status");
    }

    const idempotencyKey = String(input.idempotencyKey ?? "").trim();
    if (!idempotencyKey) {
      throw validationError("Idempotency-Key header is required");
    }

    const actionTaken =
      typeof input.actionTaken === "string" && input.actionTaken.trim().length > 0
        ? input.actionTaken.trim()
        : null;

    const idempotencyHash = makeIdempotencyHash({
      complaintPublicId,
      status: nextStatus,
      actionTaken,
    });

    const start = await this.repository.beginAdminIdempotency({
      actorUserId: input.actorUserId,
      action: COMPLAINT_STATUS_IDEMPOTENCY_ACTION,
      key: idempotencyKey,
      requestHash: idempotencyHash,
    });

    if (start.kind === "cached") {
      return start.body as ComplaintStatusUpdatePayload;
    }

    if (start.kind === "conflict") {
      throw conflict(start.message);
    }

    const complete = async (statusCode: number, body: unknown) => {
      await this.repository.completeAdminIdempotency({
        recordId: start.recordId,
        statusCode,
        body,
      });
    };

    const result = await this.repository.updateComplaintStatus({
      complaintPublicId,
      nextStatus,
      actionTaken,
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
    });

    if (result.kind === "cached") {
      return result.payload;
    }

    if (result.kind === "not_found") {
      const body = { error: "Complaint not found" };
      await complete(404, body);
      throw notFound(body.error);
    }

    if (result.kind === "locked") {
      const body = { error: result.message };
      await complete(400, body);
      throw validationError(result.message);
    }

    if (result.kind === "conflict") {
      const body = { error: result.message };
      await complete(409, body);
      throw conflict(result.message);
    }

    await this.notificationGateway.notifyComplaintStatusUpdate(
      result.notifications,
    );
    await complete(200, result.payload);
    return result.payload;
  }
}
