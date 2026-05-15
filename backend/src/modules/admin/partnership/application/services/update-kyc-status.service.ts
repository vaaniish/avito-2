import {
  notFound,
  validationError,
} from "../../../../../common/application-error";
import { parseKycStatus } from "../../domain/admin-partnership.helpers";
import type {
  AdminAuditWriterPort,
  AdminKycRepositoryPort,
  AdminPartnershipNotificationPort,
  AdminRequestMeta,
} from "../../domain/admin-partnership.types";

export class UpdateKycStatusService {
  constructor(
    private readonly repository: AdminKycRepositoryPort,
    private readonly notificationPort: AdminPartnershipNotificationPort,
    private readonly auditWriter: AdminAuditWriterPort,
  ) {}

  async execute(input: {
    publicId: string;
    status: unknown;
    rejectionReason?: unknown;
    requestMeta: AdminRequestMeta;
  }) {
    const nextStatus = parseKycStatus(input.status);
    if (!nextStatus) {
      throw validationError("Invalid KYC status");
    }

    const existing = await this.repository.findByPublicId(input.publicId);
    if (!existing) {
      throw notFound("KYC request not found");
    }

    const rejectionReason =
      nextStatus === "REJECTED" && typeof input.rejectionReason === "string"
        ? input.rejectionReason.trim()
        : null;
    const updated = await this.repository.updateStatus({
      requestId: existing.id,
      actorUserId: input.requestMeta.actorUserId,
      nextStatus,
      rejectionReason,
    });

    await this.auditWriter.write({
      actorUserId: input.requestMeta.actorUserId,
      requestIp: input.requestMeta.requestIp,
      action: "kyc.status_changed",
      entityType: "kyc_request",
      entityPublicId: input.publicId,
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeRejectionReason: existing.rejection_reason,
        afterRejectionReason: updated.rejectionReason,
      },
    });

    await this.notificationPort.notify({
      kind: "kyc",
      userId: updated.sellerId,
      nextStatus,
      rejectionReason: updated.rejectionReason,
    });

    return {
      success: true,
      status: updated.status.toLowerCase(),
    };
  }
}
