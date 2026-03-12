import { Prisma, type ComplaintSanctionLevel } from "@prisma/client";

const SANCTION_PUBLIC_ID_PREFIX = "SNC";

type EnforcementParams = {
  complaintId: number;
  complaintPublicId: string;
  complaintType: string;
  sellerId: number;
  listingId: number;
  adminUserId: number;
  actionTaken: string | null;
  now?: Date;
};

export type ComplaintEnforcementResult = {
  applied: true;
  approvedViolationsCount: number;
  level: ComplaintSanctionLevel;
  sanctionPublicId: string;
  sellerStatus: "ACTIVE" | "BLOCKED";
  blockedUntil: Date | null;
  listingStatus: "INACTIVE";
  listingModerationStatus: "REJECTED";
  message: string;
};

function makeSanctionPublicId(): string {
  return `${SANCTION_PUBLIC_ID_PREFIX}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveSanctionLevel(approvedViolationsCount: number): ComplaintSanctionLevel {
  if (approvedViolationsCount <= 1) return "WARNING";
  if (approvedViolationsCount === 2) return "TEMP_3_DAYS";
  if (approvedViolationsCount === 3) return "TEMP_30_DAYS";
  return "PERMANENT";
}

function buildSanctionMessage(level: ComplaintSanctionLevel, blockedUntil: Date | null): string {
  if (level === "WARNING") {
    return "Подтверждено первое нарушение. Вынесено предупреждение.";
  }
  if (level === "TEMP_3_DAYS") {
    return `Подтверждено повторное нарушение. Продавец заблокирован до ${blockedUntil?.toISOString()}.`;
  }
  if (level === "TEMP_30_DAYS") {
    return `Подтверждено третье нарушение. Продавец заблокирован до ${blockedUntil?.toISOString()}.`;
  }
  return "Подтверждено четвертое и более нарушение. Продавец заблокирован бессрочно.";
}

function buildSanctionReason(params: {
  complaintPublicId: string;
  complaintType: string;
  actionTaken: string | null;
}): string {
  const customAction = params.actionTaken?.trim();
  if (customAction) {
    return customAction;
  }
  return `Complaint ${params.complaintPublicId} approved: ${params.complaintType}`;
}

export function toClientSanctionLevel(level: ComplaintSanctionLevel): string {
  if (level === "WARNING") return "warning";
  if (level === "TEMP_3_DAYS") return "temp_3_days";
  if (level === "TEMP_30_DAYS") return "temp_30_days";
  return "permanent";
}

export async function applyApprovedComplaintConsequences(
  tx: Prisma.TransactionClient,
  params: EnforcementParams,
): Promise<ComplaintEnforcementResult> {
  const now = params.now ?? new Date();
  const approvedViolationsCount = await tx.complaint.count({
    where: {
      seller_id: params.sellerId,
      status: "APPROVED",
    },
  });
  const level = resolveSanctionLevel(approvedViolationsCount);
  const reason = buildSanctionReason({
    complaintPublicId: params.complaintPublicId,
    complaintType: params.complaintType,
    actionTaken: params.actionTaken,
  });

  const sellerBefore = await tx.appUser.findUnique({
    where: { id: params.sellerId },
    select: {
      id: true,
      status: true,
      blocked_until: true,
      block_reason: true,
    },
  });

  if (!sellerBefore) {
    throw new Error("Seller not found while applying complaint sanction");
  }

  const nextBlockedUntil =
    level === "TEMP_3_DAYS"
      ? addDays(now, 3)
      : level === "TEMP_30_DAYS"
        ? addDays(now, 30)
        : null;

  const sellerUpdateData: Prisma.AppUserUpdateInput = {};
  if (level === "PERMANENT") {
    sellerUpdateData.status = "BLOCKED";
    sellerUpdateData.blocked_until = null;
    sellerUpdateData.block_reason = reason;
  } else if (level === "TEMP_3_DAYS" || level === "TEMP_30_DAYS") {
    sellerUpdateData.status = "BLOCKED";
    sellerUpdateData.blocked_until = nextBlockedUntil;
    sellerUpdateData.block_reason = reason;
  }

  const sellerAfter =
    Object.keys(sellerUpdateData).length === 0
      ? sellerBefore
      : await tx.appUser.update({
          where: { id: params.sellerId },
          data: sellerUpdateData,
          select: {
            status: true,
            blocked_until: true,
          },
        });

  await tx.marketplaceListing.update({
    where: { id: params.listingId },
    data: {
      status: "INACTIVE",
      moderation_status: "REJECTED",
    },
  });

  await tx.complaintSanction.updateMany({
    where: {
      seller_id: params.sellerId,
      status: "ACTIVE",
    },
    data: {
      status: "COMPLETED",
    },
  });

  const sanction = await tx.complaintSanction.upsert({
    where: { complaint_id: params.complaintId },
    update: {
      level,
      status: level === "WARNING" ? "COMPLETED" : "ACTIVE",
      reason,
      starts_at: now,
      ends_at: nextBlockedUntil,
      created_by_id: params.adminUserId,
    },
    create: {
      public_id: makeSanctionPublicId(),
      complaint_id: params.complaintId,
      seller_id: params.sellerId,
      level,
      status: level === "WARNING" ? "COMPLETED" : "ACTIVE",
      reason,
      starts_at: now,
      ends_at: nextBlockedUntil,
      created_by_id: params.adminUserId,
    },
    select: {
      public_id: true,
    },
  });

  return {
    applied: true,
    approvedViolationsCount,
    level,
    sanctionPublicId: sanction.public_id,
    sellerStatus: sellerAfter.status,
    blockedUntil: sellerAfter.blocked_until,
    listingStatus: "INACTIVE",
    listingModerationStatus: "REJECTED",
    message: buildSanctionMessage(level, sellerAfter.blocked_until),
  };
}
