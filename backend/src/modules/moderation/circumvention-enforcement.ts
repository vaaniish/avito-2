import type { Prisma, UserRole } from "@prisma/client";
import type { Request } from "express";
import { prisma } from "../../lib/prisma";

const VIOLATION_ACTION = "anti_circumvention.violation_detected";
const SANCTION_ACTION = "anti_circumvention.sanction_applied";
const COMPLAINT_TYPE = "off_platform_contact_attempt";

const STRIKES_WINDOW_DAYS = parsePositiveInt(
  process.env.ANTI_CIRCUMVENTION_STRIKES_WINDOW_DAYS,
  30,
);
const TEMP_BLOCK_THRESHOLD = parsePositiveInt(
  process.env.ANTI_CIRCUMVENTION_TEMP_BLOCK_THRESHOLD,
  3,
);
const LONG_BLOCK_THRESHOLD = parsePositiveInt(
  process.env.ANTI_CIRCUMVENTION_LONG_BLOCK_THRESHOLD,
  5,
);
const TEMP_BLOCK_DAYS = parsePositiveInt(
  process.env.ANTI_CIRCUMVENTION_TEMP_BLOCK_DAYS,
  3,
);
const LONG_BLOCK_DAYS = parsePositiveInt(
  process.env.ANTI_CIRCUMVENTION_LONG_BLOCK_DAYS,
  30,
);
const AUTO_COMPLAINT_DEDUPE_HOURS = parsePositiveInt(
  process.env.ANTI_CIRCUMVENTION_COMPLAINT_DEDUPE_HOURS,
  24,
);

type ViolationChannel = "buyer_question" | "seller_answer";

type ViolationParams = {
  req: Request;
  actorUserId: number;
  actorRole: string;
  channel: ViolationChannel;
  text: string;
  signals: string[];
  listingPublicId: string | null;
  questionPublicId?: string | null;
  autoComplaint?: {
    listingId: number;
    listingPublicId: string;
    sellerId: number;
    reporterId: number;
    questionPublicId: string;
  };
};

export type CircumventionEnforcementResult = {
  strikeCount: number;
  blocked: boolean;
  blockedUntil: Date | null;
  complaintPublicId: string | null;
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function makeComplaintPublicId(): string {
  return `CMP-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function makeComplaintEventPublicId(): string {
  return `CEV-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return req.ip || null;
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

function canAutoBlock(role: string): role is UserRole {
  return role === "BUYER" || role === "SELLER";
}

function resolveBlockDecision(strikeCount: number): Date | null {
  if (strikeCount >= LONG_BLOCK_THRESHOLD) {
    return addDays(new Date(), LONG_BLOCK_DAYS);
  }

  if (strikeCount >= TEMP_BLOCK_THRESHOLD) {
    return addDays(new Date(), TEMP_BLOCK_DAYS);
  }

  return null;
}

function buildViolationMessage(params: {
  channel: ViolationChannel;
  strikeCount: number;
  signals: string[];
}): string {
  const channelText =
    params.channel === "buyer_question" ? "buyer_question" : "seller_answer";
  return [
    `auto-detected circumvention in ${channelText}`,
    `signals: ${params.signals.join(", ")}`,
    `strikes_in_window: ${params.strikeCount}`,
  ].join("; ");
}

async function createAutoComplaintIfNeeded(
  tx: Prisma.TransactionClient,
  params: {
    autoComplaint: NonNullable<ViolationParams["autoComplaint"]>;
    text: string;
    signals: string[];
  },
): Promise<string | null> {
  const dedupeWindowStart = new Date(
    Date.now() - AUTO_COMPLAINT_DEDUPE_HOURS * 60 * 60 * 1000,
  );

  const existing = await tx.complaint.findFirst({
    where: {
      listing_id: params.autoComplaint.listingId,
      seller_id: params.autoComplaint.sellerId,
      reporter_id: params.autoComplaint.reporterId,
      complaint_type: COMPLAINT_TYPE,
      status: {
        in: ["NEW", "PENDING"],
      },
      created_at: {
        gte: dedupeWindowStart,
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      public_id: true,
    },
  });

  if (existing) {
    return existing.public_id;
  }

  const description = [
    "Автоматически обнаружена попытка увести сделку вне платформы в ответе продавца.",
    `Листинг: ${params.autoComplaint.listingPublicId}.`,
    `Вопрос: ${params.autoComplaint.questionPublicId}.`,
    `Сигналы: ${params.signals.join(", ")}.`,
  ].join(" ");

  const complaint = await tx.complaint.create({
    data: {
      public_id: makeComplaintPublicId(),
      status: "NEW",
      complaint_type: COMPLAINT_TYPE,
      listing_id: params.autoComplaint.listingId,
      seller_id: params.autoComplaint.sellerId,
      reporter_id: params.autoComplaint.reporterId,
      description,
      evidence: clipText(params.text, 500),
    },
    select: {
      id: true,
      public_id: true,
    },
  });

  await tx.complaintEvent.create({
    data: {
      public_id: makeComplaintEventPublicId(),
      complaint_id: complaint.id,
      actor_user_id: params.autoComplaint.reporterId,
      event_type: "AUTO_SUBMITTED",
      to_status: "NEW",
      note: clipText(description, 280),
      metadata: {
        source: "anti_circumvention_auto",
        questionId: params.autoComplaint.questionPublicId,
      },
    },
  });

  return complaint.public_id;
}

export async function enforceCircumventionViolation(
  params: ViolationParams,
): Promise<CircumventionEnforcementResult> {
  const now = new Date();
  const ipAddress = getRequestIp(params.req);
  const windowStart = addDays(now, -STRIKES_WINDOW_DAYS);

  const result = await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: params.actorUserId,
        action: VIOLATION_ACTION,
        entity_type: "moderation",
        entity_public_id: params.questionPublicId ?? params.listingPublicId,
        details: {
          channel: params.channel,
          signals: params.signals,
          listingId: params.listingPublicId,
          questionId: params.questionPublicId ?? null,
          textPreview: clipText(params.text, 200),
        },
        ip_address: ipAddress,
      },
    });

    const strikeCount = await tx.auditLog.count({
      where: {
        actor_user_id: params.actorUserId,
        action: VIOLATION_ACTION,
        created_at: {
          gte: windowStart,
        },
      },
    });

    const actor = await tx.appUser.findUnique({
      where: { id: params.actorUserId },
      select: {
        id: true,
        public_id: true,
        role: true,
        status: true,
        blocked_until: true,
      },
    });

    if (!actor) {
      return {
        strikeCount,
        blocked: false,
        blockedUntil: null,
        complaintPublicId: null,
      };
    }

    let blocked = false;
    let blockedUntil = actor.blocked_until;

    if (canAutoBlock(params.actorRole)) {
      const nextBlockedUntil = resolveBlockDecision(strikeCount);
      if (nextBlockedUntil) {
        const shouldApplyBlock =
          actor.status !== "BLOCKED" ||
          !actor.blocked_until ||
          actor.blocked_until.getTime() < nextBlockedUntil.getTime();

        if (shouldApplyBlock) {
          const updated = await tx.appUser.update({
            where: { id: actor.id },
            data: {
              status: "BLOCKED",
              blocked_until: nextBlockedUntil,
              block_reason: buildViolationMessage({
                channel: params.channel,
                strikeCount,
                signals: params.signals,
              }),
            },
            select: {
              blocked_until: true,
            },
          });

          blocked = true;
          blockedUntil = updated.blocked_until;

          await tx.auditLog.create({
            data: {
              public_id: makeAuditPublicId(),
              actor_user_id: actor.id,
              action: SANCTION_ACTION,
              entity_type: "user",
              entity_public_id: actor.public_id,
              details: {
                channel: params.channel,
                signals: params.signals,
                strikesInWindow: strikeCount,
                blockedUntil: updated.blocked_until?.toISOString() ?? null,
              },
              ip_address: ipAddress,
            },
          });
        }
      }
    }

    const complaintPublicId = params.autoComplaint
      ? await createAutoComplaintIfNeeded(tx, {
          autoComplaint: params.autoComplaint,
          text: params.text,
          signals: params.signals,
        })
      : null;

    const admins = await tx.appUser.findMany({
      where: {
        role: "ADMIN",
        status: "ACTIVE",
      },
      select: {
        id: true,
      },
    });

    if (admins.length > 0) {
      await tx.notification.createMany({
        data: admins.map((admin) => ({
          user_id: admin.id,
          type: "SYSTEM",
          message: `Anti-circumvention: detected ${params.channel} by user #${params.actorUserId}.`,
          target_url: "/admin/complaints",
        })),
      });
    }

    return {
      strikeCount,
      blocked,
      blockedUntil,
      complaintPublicId,
    };
  });

  return result;
}
