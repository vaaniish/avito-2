import {
  notFound,
  validationError,
} from "../../../../../common/application-error";
import {
  getAllowedPartnershipActions,
  parsePartnershipStatus,
  toClientReviewAction,
} from "../../domain/admin-partnership.helpers";
import type {
  AdminAuditWriterPort,
  AdminPartnershipNotificationPort,
  AdminPartnershipRequestRepositoryPort,
  AdminRequestMeta,
} from "../../domain/admin-partnership.types";

export class UpdatePartnershipRequestStatusService {
  constructor(
    private readonly repository: AdminPartnershipRequestRepositoryPort,
    private readonly notificationPort: AdminPartnershipNotificationPort,
    private readonly auditWriter: AdminAuditWriterPort,
  ) {}

  async execute(input: {
    publicId: string;
    status: unknown;
    rejectionReason?: unknown;
    adminNote?: unknown;
    requestMeta: AdminRequestMeta;
  }) {
    const nextStatus = parsePartnershipStatus(input.status);
    if (!nextStatus) {
      throw validationError("Invalid partnership request status");
    }

    const existing = await this.repository.findRequestByPublicId(input.publicId);
    if (!existing) {
      throw notFound("Partnership request not found");
    }

    const rejectionReason =
      nextStatus === "REJECTED" && typeof input.rejectionReason === "string"
        ? input.rejectionReason.trim()
        : null;
    const adminNote =
      typeof input.adminNote === "string" ? input.adminNote.trim() : null;
    const requiresAdminNote =
      nextStatus === "REJECTED" || nextStatus === "NEEDS_MORE_INFO";
    if (requiresAdminNote && !rejectionReason && !adminNote) {
      throw validationError(
        "Admin note or rejection reason is required for rejected/needs_more_info.",
      );
    }

    const payoutVerified = existing.user.payout_profile?.status === "VERIFIED";
    if (nextStatus === "APPROVED" && !payoutVerified && !adminNote) {
      throw validationError(
        "Verified payout profile or explicit admin override note is required for full approval.",
      );
    }

    const allowedActions = getAllowedPartnershipActions(existing.status);
    if (!allowedActions.includes(toClientReviewAction(nextStatus))) {
      throw validationError(
        "This partnership request transition is not allowed anymore.",
        { allowedActions },
      );
    }

    const updated = await this.repository.applyStatusTransition({
      requestId: existing.id,
      actorUserId: input.requestMeta.actorUserId,
      nextStatus,
      rejectionReason,
      adminNote,
      payoutVerified,
      currentListingLimit: existing.onboarding_profile?.listing_limit ?? null,
      currentAllowedCategories: existing.onboarding_profile?.categories ?? [],
    });

    await this.auditWriter.write({
      actorUserId: input.requestMeta.actorUserId,
      requestIp: input.requestMeta.requestIp,
      action: "partnership_request.status_changed",
      entityType: "partnership_request",
      entityPublicId: input.publicId,
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeUserRole: existing.user.role,
        afterUserRole:
          updated.status === "APPROVED" || updated.status === "APPROVED_LIMITED"
            ? "SELLER"
            : updated.status === "REJECTED"
              ? "BUYER"
              : existing.user.role,
        beforeRejectionReason: existing.rejection_reason,
        afterRejectionReason: rejectionReason,
        beforeAdminNote: existing.admin_note,
        afterAdminNote: adminNote,
      },
    });

    await this.notificationPort.notify({
      kind: "partnership",
      userId: existing.user_id,
      nextStatus,
      rejectionReason,
    });

    return {
      success: true,
      status: updated.status.toLowerCase(),
      userRole:
        nextStatus === "APPROVED" || nextStatus === "APPROVED_LIMITED"
          ? "partner"
          : nextStatus === "REJECTED"
            ? "regular"
            : existing.user.role === "SELLER"
              ? "partner"
              : "regular",
      allowedActions: getAllowedPartnershipActions(updated.status),
    };
  }
}
