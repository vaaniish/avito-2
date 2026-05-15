import {
  notFound,
  validationError,
} from "../../../../../common/application-error";
import {
  MAX_BLOCK_REASON_LENGTH,
  parseUserStatus,
} from "../../domain/admin-users.helpers";
import type {
  AdminAuditWriterPort,
  AdminUsersRepositoryPort,
} from "../../domain/admin-users.types";

export class UpdateAdminUserStatusService {
  constructor(
    private readonly repository: AdminUsersRepositoryPort,
    private readonly auditWriter: AdminAuditWriterPort,
  ) {}

  async execute(input: {
    publicId: string;
    status: unknown;
    blockReason: unknown;
    actorUserId: number;
    requestIp: string | null;
  }) {
    const parsedStatus = parseUserStatus(input.status);
    if (!parsedStatus) {
      throw validationError("Invalid user status");
    }

    const existing = await this.repository.findUserForStatusUpdate(
      input.publicId,
    );
    if (!existing) {
      throw notFound("User not found");
    }
    if (existing.role === "ADMIN") {
      throw validationError("Cannot update admin status");
    }

    const rawBlockReason =
      parsedStatus === "BLOCKED" && typeof input.blockReason === "string"
        ? input.blockReason.trim()
        : "";
    if (rawBlockReason.length > MAX_BLOCK_REASON_LENGTH) {
      throw validationError(
        `Причина блокировки не должна превышать ${MAX_BLOCK_REASON_LENGTH} символов`,
      );
    }

    const updated = await this.repository.updateUserStatus({
      userId: existing.id,
      status: parsedStatus,
      blockReason:
        parsedStatus === "BLOCKED"
          ? rawBlockReason || "Нарушение правил платформы"
          : null,
    });

    await this.auditWriter.write({
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
      action: "user.status_changed",
      entityPublicId: input.publicId,
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeBlockReason: existing.block_reason,
        afterBlockReason: updated.block_reason,
        beforeBlockedUntil: existing.blocked_until,
        afterBlockedUntil: updated.blocked_until,
      },
    });

    return {
      success: true,
      status: updated.status.toLowerCase(),
      blockedUntil: updated.blocked_until,
    };
  }
}
