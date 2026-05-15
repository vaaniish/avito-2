import {
  notFound,
  validationError,
} from "../../../../../common/application-error";
import { parsePayoutStatus } from "../../domain/admin-partnership.helpers";
import type {
  AdminAuditWriterPort,
  AdminPartnershipNotificationPort,
  AdminPayoutRepositoryPort,
  AdminRequestMeta,
} from "../../domain/admin-partnership.types";

export class UpdatePayoutProfileStatusService {
  constructor(
    private readonly repository: AdminPayoutRepositoryPort,
    private readonly notificationPort: AdminPartnershipNotificationPort,
    private readonly auditWriter: AdminAuditWriterPort,
  ) {}

  async execute(input: {
    publicId: string;
    status: unknown;
    rejectionReason?: unknown;
    requestMeta: AdminRequestMeta;
  }) {
    const nextStatus = parsePayoutStatus(input.status);
    if (!nextStatus) {
      throw validationError("Invalid payout profile status");
    }

    const existing = await this.repository.findByPublicId(input.publicId);
    if (!existing) {
      throw notFound("Payout profile not found");
    }

    const rejectionReason =
      nextStatus === "REJECTED" && typeof input.rejectionReason === "string"
        ? input.rejectionReason.trim()
        : null;

    const updated = await this.repository.updateStatus({
      profileId: existing.id,
      actorUserId: input.requestMeta.actorUserId,
      nextStatus,
      rejectionReason,
    });

    await this.auditWriter.write({
      actorUserId: input.requestMeta.actorUserId,
      requestIp: input.requestMeta.requestIp,
      action: "seller.payout_profile.status_changed",
      entityType: "seller_payout_profile",
      entityPublicId: input.publicId,
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeRejectionReason: existing.rejection_reason,
        afterRejectionReason: updated.rejectionReason,
      },
    });

    await this.notificationPort.notify({
      kind: "payout",
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
