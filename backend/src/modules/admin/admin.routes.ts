import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireRole } from "../../lib/session";
import { toAdminListingStatus, toClientRole } from "../../utils/format";
import {
  applyApprovedComplaintConsequences,
  toClientSanctionLevel,
} from "./complaint-sanctions";

const adminRouter = Router();
const ROLE_ADMIN = "ADMIN";

type ComplaintStatusValue = "NEW" | "PENDING" | "APPROVED" | "REJECTED";
type KycStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type ModerationStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type UserStatusValue = "ACTIVE" | "BLOCKED";
type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";
type AuditEntityType =
  | "complaint"
  | "kyc_request"
  | "listing"
  | "user"
  | "commission_tier";
type AuditAction =
  | "complaint.status_changed"
  | "kyc.status_changed"
  | "listing.moderation_changed"
  | "user.status_changed"
  | "commission_tier.rate_changed";

const AUDIT_ENTITY_TYPES: AuditEntityType[] = [
  "complaint",
  "kyc_request",
  "listing",
  "user",
  "commission_tier",
];

const AUDIT_ACTIONS: AuditAction[] = [
  "complaint.status_changed",
  "kyc.status_changed",
  "listing.moderation_changed",
  "user.status_changed",
  "commission_tier.rate_changed",
];

async function requireAdmin(
  req: Request,
  res: Response,
): Promise<{ ok: true; user: { id: number } } | { ok: false }> {
  const session = await requireRole(req, ROLE_ADMIN);
  if (!session.ok) {
    res.status(session.status).json({ error: session.message });
    return { ok: false };
  }

  return {
    ok: true,
    user: {
      id: session.user.id,
    },
  };
}

function parseComplaintStatus(status: unknown): ComplaintStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  if (status === "new") return "NEW";
  return null;
}

function parseKycStatus(status: unknown): KycStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function parseModerationStatus(status: unknown): ModerationStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function parseUserStatus(status: unknown): UserStatusValue | null {
  if (status === "active") return "ACTIVE";
  if (status === "blocked") return "BLOCKED";
  return null;
}

function toClientComplaintSanctionStatus(
  status: "ACTIVE" | "COMPLETED",
): "active" | "completed" {
  return status === "ACTIVE" ? "active" : "completed";
}

function parseAuditAction(value: unknown): AuditAction | undefined {
  if (typeof value !== "string") return undefined;
  return AUDIT_ACTIONS.find((action) => action === value);
}

function parseAuditEntityType(value: unknown): AuditEntityType | undefined {
  if (typeof value !== "string") return undefined;
  return AUDIT_ENTITY_TYPES.find((entity) => entity === value);
}

function parseLimit(value: unknown, defaultValue = 200): number {
  if (typeof value !== "string") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, 500);
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return req.ip || null;
}

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function writeAudit(params: {
  req: Request;
  actorUserId: number;
  action: AuditAction;
  entityType: AuditEntityType;
  entityPublicId?: string | null;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: params.actorUserId,
        action: params.action,
        entity_type: params.entityType,
        entity_public_id: params.entityPublicId ?? null,
        details: params.details,
        ip_address: getRequestIp(params.req),
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

function buildAutoFlags(listing: {
  description: string | null;
  seller: { joined_at: Date };
  complaints_count: number;
}): string[] {
  const flags: string[] = [];

  const joinedDays = Math.floor(
    (Date.now() - listing.seller.joined_at.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (joinedDays <= 30) {
    flags.push("new_seller");
  }

  const description = (listing.description ?? "").toLowerCase();
  if (/\b(telegram|whatsapp|prepayment|transfer)\b/.test(description)) {
    flags.push("forbidden_words");
  }

  if (/\+\d|@|\.ru|\.com/.test(description)) {
    flags.push("contacts_in_description");
  }

  if (
    (listing.description ?? "").length > 200 &&
    /(!!!|\bcheap\b|\burgent\b)/i.test(listing.description ?? "")
  ) {
    flags.push("spam_text");
  }

  if (listing.complaints_count > 0) {
    flags.push("seller_with_complaints");
  }

  if (listing.complaints_count > 1) {
    flags.push("multiple_reports");
  }

  return flags;
}

function buildListingPublicUrl(listingPublicId: string): string {
  return `/?listingId=${encodeURIComponent(listingPublicId)}`;
}

function splitEvidenceFiles(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\n;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractPrimaryAddressInfo(
  addresses: Array<{ city: string; region: string }>,
): { city: string; region: string } {
  const first = addresses[0];
  return {
    city: first?.city?.trim() ?? "",
    region: first?.region?.trim() ?? "",
  };
}

function toSearchText(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input.toLowerCase();
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input).toLowerCase();
  }
  if (input instanceof Date) return input.toISOString().toLowerCase();
  if (Array.isArray(input)) {
    return input.map((item) => toSearchText(item)).join(" ");
  }
  if (typeof input === "object") {
    return Object.values(input as Record<string, unknown>)
      .map((value) => toSearchText(value))
      .join(" ");
  }
  return "";
}

function matchesFullText(input: unknown, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return toSearchText(input).includes(normalized);
}

function buildComplaintEvaluation(params: {
  complaintType: string;
  listingComplaintCount: number;
  sellerComplaintCount: number;
}): {
  score: number;
  recommendation: "approve" | "reject" | "manual_review";
  reasons: string[];
} {
  let rawScore = 0;
  const reasons: string[] = [];

  if (params.sellerComplaintCount >= 5) {
    rawScore += 30;
    reasons.push("seller_has_many_complaints");
  } else if (params.sellerComplaintCount >= 2) {
    rawScore += 15;
    reasons.push("seller_has_repeat_complaints");
  }

  if (params.listingComplaintCount >= 3) {
    rawScore += 20;
    reasons.push("listing_has_multiple_reports");
  } else if (params.listingComplaintCount >= 2) {
    rawScore += 10;
    reasons.push("listing_has_repeat_reports");
  }

  const normalizedType = params.complaintType.toLowerCase();
  if (
    normalizedType.includes("вне") ||
    normalizedType.includes("platform") ||
    normalizedType.includes("payment")
  ) {
    rawScore += 20;
    reasons.push("high_risk_type_payment_off_platform");
  }

  if (reasons.length === 0) {
    reasons.push("insufficient_objective_signals");
  }

  const score = Math.round((rawScore / 70) * 100);
  const recommendation =
    score >= 60 ? "approve" : score <= 20 ? "reject" : "manual_review";

  return {
    score,
    recommendation,
    reasons,
  };
}

function buildKycEvaluation(params: {
  documentsCount: number;
  hasInn: boolean;
  hasAddress: boolean;
  sellerComplaintsCount: number;
  sellerStatus: "ACTIVE" | "BLOCKED";
}): {
  completenessScore: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: "approve" | "request_more_documents" | "reject";
  checklist: Array<{ key: string; passed: boolean }>;
} {
  const checklist = [
    { key: "documents_attached", passed: params.documentsCount > 0 },
    { key: "inn_provided", passed: params.hasInn },
    { key: "address_provided", passed: params.hasAddress },
    { key: "seller_not_blocked", passed: params.sellerStatus !== "BLOCKED" },
  ];

  const completenessScore = Math.round(
    (checklist.filter((item) => item.passed).length / checklist.length) * 100,
  );

  const riskPoints =
    (params.sellerStatus === "BLOCKED" ? 40 : 0) +
    (params.sellerComplaintsCount >= 5
      ? 35
      : params.sellerComplaintsCount >= 2
        ? 20
        : 5) +
    (params.documentsCount === 0 ? 35 : params.documentsCount < 2 ? 15 : 0);

  const riskLevel: "low" | "medium" | "high" =
    riskPoints >= 65 ? "high" : riskPoints >= 35 ? "medium" : "low";

  const recommendation =
    riskLevel === "high"
      ? "reject"
      : completenessScore < 75
        ? "request_more_documents"
        : "approve";

  return {
    completenessScore,
    riskLevel,
    recommendation,
    checklist,
  };
}

adminRouter.get("/transactions", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const transactions = await prisma.platformTransaction.findMany({
      include: {
        buyer: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        order: {
          include: {
            buyer: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            seller: {
              select: {
                public_id: true,
                name: true,
                email: true,
              },
            },
            items: {
              orderBy: [{ id: "asc" }],
              include: {
                listing: {
                  select: {
                    public_id: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      transactions.map((transaction) => ({
        id: transaction.public_id,
        orderId: transaction.order.public_id,
        orderStatus: transaction.order.status.toLowerCase(),
        buyerId: transaction.buyer.public_id,
        buyerName: transaction.buyer.name,
        buyerEmail: transaction.buyer.email,
        sellerId: transaction.seller.public_id,
        sellerName: transaction.seller.name,
        sellerEmail: transaction.seller.email,
        listingTitle: transaction.order.items[0]?.name ?? "Unnamed item",
        listingIds: transaction.order.items
          .map((item) => item.listing?.public_id)
          .filter((item): item is string => Boolean(item)),
        itemsCount: transaction.order.items.length,
        itemsTotalQuantity: transaction.order.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        ),
        deliveryType: transaction.order.delivery_type.toLowerCase(),
        deliveryAddress: transaction.order.delivery_address,
        amount: transaction.amount,
        commission: transaction.commission,
        commissionRate: transaction.commission_rate,
        sellerPayout: transaction.amount - transaction.commission,
        status: transaction.status.toLowerCase(),
        paymentProvider: transaction.payment_provider.toLowerCase(),
        paymentIntentId: transaction.payment_intent_id,
        createdAt: transaction.created_at,
      })),
    );
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/audit-logs", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const action = parseAuditAction(req.query.action);
    const entityType = parseAuditEntityType(req.query.entityType);
    const limit = parseLimit(req.query.limit, 200);

    const where: Prisma.AuditLogWhereInput = {};

    if (action) {
      where.action = action;
    }

    if (entityType) {
      where.entity_type = entityType;
    }

    const fetchedLogs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 1000,
    });

    const normalizedQuery = q.trim().toLowerCase();
    const logs = normalizedQuery
      ? fetchedLogs.filter((log) =>
          matchesFullText(
            {
              id: log.public_id,
              action: log.action,
              entityType: log.entity_type,
              entityId: log.entity_public_id,
              ipAddress: log.ip_address,
              details: log.details,
              createdAt: log.created_at.toISOString(),
              actor: log.actor
                ? {
                    id: log.actor.public_id,
                    name: log.actor.name,
                    email: log.actor.email,
                  }
                : null,
            },
            normalizedQuery,
          ),
        )
      : fetchedLogs;

    res.json({
      logs: logs.slice(0, limit).map((log) => ({
          id: log.public_id,
          createdAt: log.created_at,
          action: log.action,
          entityType: log.entity_type,
          entityId: log.entity_public_id,
          ipAddress: log.ip_address,
          details: log.details,
          actor: log.actor
            ? {
                id: log.actor.public_id,
                name: log.actor.name,
                email: log.actor.email,
              }
            : null,
        })),
      availableActions: AUDIT_ACTIONS,
      availableEntities: AUDIT_ENTITY_TYPES,
    });
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/complaints-legacy", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const complaints = await prisma.complaint.findMany({
      include: {
        listing: {
          select: {
            public_id: true,
            title: true,
            price: true,
            created_at: true,
            status: true,
            moderation_status: true,
            _count: {
              select: {
                complaints: true,
              },
            },
          },
        },
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            block_reason: true,
            blocked_until: true,
            joined_at: true,
            seller_profile: {
              select: {
                is_verified: true,
                average_response_minutes: true,
              },
            },
            addresses: {
              select: {
                city: true,
                region: true,
              },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
            _count: {
              select: {
                complaints_against: true,
                listings: true,
                orders_as_seller: true,
              },
            },
          },
        },
        reporter: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        checked_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    const sellerIds = Array.from(new Set(complaints.map((complaint) => complaint.seller_id)));
    const complaintIds = complaints.map((complaint) => complaint.id);

    const [approvedBySellerRaw, sanctionsByComplaintRaw, activeSanctionsRaw] =
      await Promise.all([
        sellerIds.length > 0
          ? prisma.complaint.groupBy({
              by: ["seller_id"],
              where: {
                seller_id: { in: sellerIds },
                status: "APPROVED",
              },
              _count: {
                _all: true,
              },
            })
          : Promise.resolve([]),
        complaintIds.length > 0
          ? prisma.complaintSanction.findMany({
              where: {
                complaint_id: { in: complaintIds },
              },
              select: {
                complaint_id: true,
                public_id: true,
                level: true,
                status: true,
                starts_at: true,
                ends_at: true,
                reason: true,
                created_at: true,
              },
            })
          : Promise.resolve([]),
        sellerIds.length > 0
          ? prisma.complaintSanction.findMany({
              where: {
                seller_id: { in: sellerIds },
                status: "ACTIVE",
              },
              select: {
                seller_id: true,
                public_id: true,
                level: true,
                status: true,
                starts_at: true,
                ends_at: true,
                reason: true,
                created_at: true,
              },
              orderBy: [{ created_at: "desc" }, { id: "desc" }],
            })
          : Promise.resolve([]),
      ]);

    const approvedBySeller = new Map<number, number>();
    for (const item of approvedBySellerRaw) {
      approvedBySeller.set(item.seller_id, item._count._all);
    }

    const sanctionByComplaint = new Map<number, (typeof sanctionsByComplaintRaw)[number]>();
    for (const sanction of sanctionsByComplaintRaw) {
      sanctionByComplaint.set(sanction.complaint_id, sanction);
    }

    const activeSanctionBySeller = new Map<number, (typeof activeSanctionsRaw)[number]>();
    for (const sanction of activeSanctionsRaw) {
      if (!activeSanctionBySeller.has(sanction.seller_id)) {
        activeSanctionBySeller.set(sanction.seller_id, sanction);
      }
    }

    res.json(
      complaints.map((complaint) => {
        const addressInfo = extractPrimaryAddressInfo(complaint.seller.addresses);
        return {
        id: complaint.public_id,
        createdAt: complaint.created_at,
        status: complaint.status.toLowerCase(),
        targetType: "listing",
        complaintType: complaint.complaint_type,
        listingId: complaint.listing.public_id,
        listingUrl: buildListingPublicUrl(complaint.listing.public_id),
        listingTitle: complaint.listing.title,
        listingPrice: complaint.listing.price,
        listingCreatedAt: complaint.listing.created_at,
        listingStatus: complaint.listing.status.toLowerCase(),
        listingModerationStatus: complaint.listing.moderation_status.toLowerCase(),
        listingCity: addressInfo.city,
        listingRegion: addressInfo.region,
        listingComplaintsCount: complaint.listing._count.complaints,
        sellerId: complaint.seller.public_id,
        sellerName: complaint.seller.name,
        sellerEmail: complaint.seller.email,
        sellerPhone: complaint.seller.phone,
        sellerStatus: complaint.seller.status.toLowerCase(),
        sellerBlockedUntil: complaint.seller.blocked_until,
        sellerBlockReason: complaint.seller.block_reason,
        sellerJoinedAt: complaint.seller.joined_at,
        sellerVerified: Boolean(complaint.seller.seller_profile?.is_verified),
        sellerResponseMinutes:
          complaint.seller.seller_profile?.average_response_minutes ?? null,
        reporterId: complaint.reporter.public_id,
        reporterName: complaint.reporter.name,
        reporterEmail: complaint.reporter.email,
        sellerViolationsCount: approvedBySeller.get(complaint.seller_id) ?? 0,
        sellerListingsCount: complaint.seller._count.listings,
        sellerOrdersCount: complaint.seller._count.orders_as_seller,
        description: complaint.description,
        checkedAt: complaint.checked_at,
        checkedBy: complaint.checked_by
          ? {
              id: complaint.checked_by.public_id,
              name: complaint.checked_by.name,
              email: complaint.checked_by.email,
            }
          : null,
        actionTaken: complaint.action_taken,
        sanction: sanctionByComplaint.get(complaint.id)
          ? {
              id: sanctionByComplaint.get(complaint.id)?.public_id,
              level: toClientSanctionLevel(
                sanctionByComplaint.get(complaint.id)?.level ?? "WARNING",
              ),
              status: toClientComplaintSanctionStatus(
                sanctionByComplaint.get(complaint.id)?.status ?? "COMPLETED",
              ),
              startsAt: sanctionByComplaint.get(complaint.id)?.starts_at ?? null,
              endsAt: sanctionByComplaint.get(complaint.id)?.ends_at ?? null,
              reason: sanctionByComplaint.get(complaint.id)?.reason ?? null,
              createdAt: sanctionByComplaint.get(complaint.id)?.created_at ?? null,
            }
          : null,
        activeSellerSanction: activeSanctionBySeller.get(complaint.seller_id)
          ? {
              id: activeSanctionBySeller.get(complaint.seller_id)?.public_id,
              level: toClientSanctionLevel(
                activeSanctionBySeller.get(complaint.seller_id)?.level ?? "WARNING",
              ),
              status: toClientComplaintSanctionStatus(
                activeSanctionBySeller.get(complaint.seller_id)?.status ?? "ACTIVE",
              ),
              startsAt: activeSanctionBySeller.get(complaint.seller_id)?.starts_at ?? null,
              endsAt: activeSanctionBySeller.get(complaint.seller_id)?.ends_at ?? null,
              reason: activeSanctionBySeller.get(complaint.seller_id)?.reason ?? null,
              createdAt: activeSanctionBySeller.get(complaint.seller_id)?.created_at ?? null,
            }
          : null,
        evaluation: buildComplaintEvaluation({
          complaintType: complaint.complaint_type,
          listingComplaintCount: complaint.listing._count.complaints,
          sellerComplaintCount: complaint.seller._count.complaints_against,
        }),
      }}),
    );
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/complaints/:publicId/legacy", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as {
      status?: unknown;
      actionTaken?: unknown;
    };

    const parsedStatus = parseComplaintStatus(body.status);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid complaint status" });
      return;
    }

    const existing = await prisma.complaint.findUnique({
      where: { public_id: String(publicId) },
      select: {
        id: true,
        public_id: true,
        status: true,
        action_taken: true,
        complaint_type: true,
        seller_id: true,
        listing_id: true,
        seller: {
          select: {
            public_id: true,
            status: true,
            block_reason: true,
            blocked_until: true,
          },
        },
        listing: {
          select: {
            public_id: true,
            status: true,
            moderation_status: true,
          },
        },
      },
    });

    if (!existing) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }

    // Prevent silent rollback of already-applied sanctions and listing actions.
    if (existing.status === "APPROVED" && parsedStatus !== "APPROVED") {
      res.status(400).json({
        error:
          "Approved complaint cannot be moved back. Create a separate compensating admin action.",
      });
      return;
    }

    const actionTaken =
      typeof body.actionTaken === "string" ? body.actionTaken.trim() : null;
    const txResult = await prisma.$transaction(async (tx) => {
      let enforcement:
        | {
            applied: true;
            approvedViolationsCount: number;
            level: string;
            sanctionId: string;
            sellerStatus: "active" | "blocked";
            blockedUntil: Date | null;
            listingStatus: "inactive";
            listingModerationStatus: "rejected";
            message: string;
          }
        | null = null;
      const next = await tx.complaint.update({
        where: { id: existing.id },
        data: {
          status: parsedStatus,
          checked_at: new Date(),
          checked_by_id: access.user.id,
          action_taken: actionTaken,
        },
      });

      if (parsedStatus === "APPROVED" && existing.status !== "APPROVED") {
        const enforcementResult = await applyApprovedComplaintConsequences(tx, {
          complaintId: existing.id,
          complaintPublicId: existing.public_id,
          complaintType: existing.complaint_type,
          sellerId: existing.seller_id,
          listingId: existing.listing_id,
          adminUserId: access.user.id,
          actionTaken,
        });
        enforcement = {
          applied: true,
          approvedViolationsCount: enforcementResult.approvedViolationsCount,
          level: toClientSanctionLevel(enforcementResult.level),
          sanctionId: enforcementResult.sanctionPublicId,
          sellerStatus: enforcementResult.sellerStatus.toLowerCase() as
            | "active"
            | "blocked",
          blockedUntil: enforcementResult.blockedUntil,
          listingStatus: enforcementResult.listingStatus.toLowerCase() as "inactive",
          listingModerationStatus:
            enforcementResult.listingModerationStatus.toLowerCase() as "rejected",
          message: enforcementResult.message,
        };
      }

      return {
        updated: next,
        enforcement,
      };
    });
    const updated = txResult.updated;
    const enforcement = txResult.enforcement;

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "complaint.status_changed",
      entityType: "complaint",
      entityPublicId: String(publicId),
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeActionTaken: existing.action_taken,
        afterActionTaken: updated.action_taken,
      },
    });

    if (enforcement) {
      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "listing.moderation_changed",
        entityType: "listing",
        entityPublicId: existing.listing.public_id,
        details: {
          source: "complaint_approved_auto_enforcement",
          complaintId: existing.public_id,
          beforeModerationStatus: existing.listing.moderation_status,
          afterModerationStatus: "REJECTED",
          beforeListingStatus: existing.listing.status,
          afterListingStatus: "INACTIVE",
        },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "user.status_changed",
        entityType: "user",
        entityPublicId: existing.seller.public_id,
        details: {
          source: "complaint_approved_auto_enforcement",
          complaintId: existing.public_id,
          sanctionLevel: enforcement.level,
          beforeStatus: existing.seller.status,
          afterStatus: enforcement.sellerStatus.toUpperCase(),
          beforeBlockReason: existing.seller.block_reason,
          afterBlockReason:
            actionTaken && actionTaken.length > 0 ? actionTaken : existing.seller.block_reason,
          beforeBlockedUntil: existing.seller.blocked_until,
          afterBlockedUntil: enforcement.blockedUntil,
        },
      });
    }

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
      enforcement,
    });
  } catch (error) {
    console.error("Error updating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

type ComplaintPriority = "low" | "medium" | "high";
type ComplaintSortBy = "createdAt" | "riskScore" | "queueScore";
type ComplaintSortOrder = "asc" | "desc";
type ComplaintStatusClient = "new" | "pending" | "approved" | "rejected";

type ComplaintDto = {
  id: string;
  createdAt: Date;
  status: ComplaintStatusClient;
  targetType: "listing";
  complaintType: string;
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  listingPrice: number;
  listingCreatedAt: Date;
  listingStatus: string;
  listingModerationStatus: string;
  listingCity: string;
  listingRegion: string;
  listingComplaintsCount: number;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string | null;
  sellerStatus: "active" | "blocked";
  sellerBlockedUntil: Date | null;
  sellerBlockReason: string | null;
  sellerJoinedAt: Date;
  sellerVerified: boolean;
  sellerResponseMinutes: number | null;
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  sellerViolationsCount: number;
  sellerListingsCount: number;
  sellerOrdersCount: number;
  description: string;
  checkedAt: Date | null;
  checkedBy: { id: string; name: string; email: string } | null;
  actionTaken: string | null;
  sanction: {
    id: string;
    level: string;
    status: "active" | "completed";
    startsAt: Date | null;
    endsAt: Date | null;
    reason: string | null;
    createdAt: Date | null;
  } | null;
  activeSellerSanction: {
    id: string;
    level: string;
    status: "active" | "completed";
    startsAt: Date | null;
    endsAt: Date | null;
    reason: string | null;
    createdAt: Date | null;
  } | null;
  evaluation: {
    score: number;
    recommendation: "approve" | "reject" | "manual_review";
    reasons: string[];
  };
  riskScore: number;
  queueScore: number;
  priority: ComplaintPriority;
  ageHours: number;
};

type ComplaintHistoryEventDto = {
  id: string;
  type: string;
  fromStatus: ComplaintStatusClient | null;
  toStatus: ComplaintStatusClient | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
};

type IdempotencyStartResult =
  | { kind: "created"; recordId: number }
  | { kind: "cached"; statusCode: number; body: unknown }
  | { kind: "conflict"; message: string };

const COMPLAINT_STATUS_IDEMPOTENCY_ACTION = "complaint.status.update";
const MAX_COMPLAINT_PAGE_SIZE = 100;

const COMPLAINT_LIST_INCLUDE = Prisma.validator<Prisma.ComplaintInclude>()({
  listing: {
    select: {
      public_id: true,
      title: true,
      price: true,
      created_at: true,
      status: true,
      moderation_status: true,
      _count: {
        select: {
          complaints: true,
        },
      },
    },
  },
  seller: {
    select: {
      public_id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      block_reason: true,
      blocked_until: true,
      joined_at: true,
      seller_profile: {
        select: {
          is_verified: true,
          average_response_minutes: true,
        },
      },
      addresses: {
        select: {
          city: true,
          region: true,
        },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        take: 1,
      },
      _count: {
        select: {
          complaints_against: true,
          listings: true,
          orders_as_seller: true,
        },
      },
    },
  },
  reporter: {
    select: {
      public_id: true,
      name: true,
      email: true,
    },
  },
  checked_by: {
    select: {
      public_id: true,
      name: true,
      email: true,
    },
  },
});

type ComplaintWithRelations = Prisma.ComplaintGetPayload<{
  include: typeof COMPLAINT_LIST_INCLUDE;
}>;

function makePublicId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function toClientComplaintStatus(status: ComplaintStatusValue): ComplaintStatusClient {
  if (status === "NEW") return "new";
  if (status === "PENDING") return "pending";
  if (status === "APPROVED") return "approved";
  return "rejected";
}

function parseQueryValues(input: unknown): string[] {
  if (typeof input === "string") {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(input)) {
    return input.flatMap((item) => parseQueryValues(item));
  }
  return [];
}

function parseComplaintStatusesFilter(input: unknown): ComplaintStatusValue[] {
  const parsed = parseQueryValues(input)
    .map((item) => parseComplaintStatus(item.toLowerCase()))
    .filter((item): item is ComplaintStatusValue => item !== null);
  return Array.from(new Set(parsed));
}

function parseComplaintPriorityFilter(input: unknown): ComplaintPriority[] {
  const parsed = parseQueryValues(input)
    .map((item) => item.toLowerCase())
    .filter((item): item is ComplaintPriority =>
      item === "low" || item === "medium" || item === "high",
    );
  return Array.from(new Set(parsed));
}

function parseDateQuery(input: unknown): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parsePageQuery(input: unknown): number {
  if (typeof input !== "string") return 1;
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
}

function parsePageSizeQuery(input: unknown): number {
  if (typeof input !== "string") return 20;
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_COMPLAINT_PAGE_SIZE);
}

function parseComplaintSortBy(input: unknown): ComplaintSortBy {
  if (input === "createdAt") return "createdAt";
  if (input === "riskScore") return "riskScore";
  if (input === "queueScore") return "queueScore";
  return "queueScore";
}

function parseComplaintSortOrder(input: unknown): ComplaintSortOrder {
  return input === "asc" ? "asc" : "desc";
}

function normalizeQueryText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

function computeComplaintQueueMetrics(params: {
  createdAt: Date;
  riskScore: number;
  listingComplaintsCount: number;
  sellerViolationsCount: number;
}): { queueScore: number; priority: ComplaintPriority; ageHours: number } {
  const ageHours = Math.max(
    0,
    Math.floor((Date.now() - params.createdAt.getTime()) / (1000 * 60 * 60)),
  );
  const ageBoost = Math.min(30, Math.floor(ageHours / 12) * 2);
  const repeatBoost = Math.min(36, params.sellerViolationsCount * 9);
  const listingBoost = Math.min(
    20,
    Math.max(0, params.listingComplaintsCount - 1) * 7,
  );
  const queueScore = params.riskScore + ageBoost + repeatBoost + listingBoost;

  if (queueScore >= 85) {
    return { queueScore, priority: "high", ageHours };
  }
  if (queueScore >= 50) {
    return { queueScore, priority: "medium", ageHours };
  }
  return { queueScore, priority: "low", ageHours };
}

function complaintPriorityRank(value: ComplaintPriority): number {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function sortComplaints(
  complaints: ComplaintDto[],
  sortBy: ComplaintSortBy,
  sortOrder: ComplaintSortOrder,
): ComplaintDto[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  return [...complaints].sort((left, right) => {
    let primaryDiff = 0;
    if (sortBy === "riskScore") {
      primaryDiff = left.riskScore - right.riskScore;
    } else if (sortBy === "queueScore") {
      primaryDiff = left.queueScore - right.queueScore;
      if (primaryDiff === 0) {
        primaryDiff =
          complaintPriorityRank(left.priority) - complaintPriorityRank(right.priority);
      }
    } else {
      primaryDiff =
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    }

    if (primaryDiff !== 0) {
      return primaryDiff * direction;
    }

    const secondaryDiff =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    if (secondaryDiff !== 0) {
      return secondaryDiff * -1;
    }

    return left.id.localeCompare(right.id);
  });
}

function buildComplaintWhere(filters: {
  statuses?: ComplaintStatusValue[];
  moderatorPublicId?: string;
  from?: Date | null;
  to?: Date | null;
  query?: string;
}): Prisma.ComplaintWhereInput {
  const where: Prisma.ComplaintWhereInput = {};

  if (filters.statuses && filters.statuses.length > 0) {
    where.status = { in: filters.statuses };
  }

  if (filters.from || filters.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) createdAt.gte = filters.from;
    if (filters.to) createdAt.lte = filters.to;
    where.created_at = createdAt;
  }

  const moderatorPublicId = filters.moderatorPublicId?.trim();
  if (moderatorPublicId) {
    if (moderatorPublicId === "unassigned") {
      where.checked_by_id = null;
    } else {
      where.checked_by = {
        is: {
          public_id: moderatorPublicId,
        },
      };
    }
  }

  const query = filters.query?.trim();
  if (query) {
    where.OR = [
      { public_id: { contains: query, mode: "insensitive" } },
      { complaint_type: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      {
        listing: {
          is: {
            public_id: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        listing: {
          is: {
            title: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        seller: {
          is: {
            public_id: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        seller: {
          is: {
            name: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        seller: {
          is: {
            email: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        reporter: {
          is: {
            public_id: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        reporter: {
          is: {
            name: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        reporter: {
          is: {
            email: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        checked_by: {
          is: {
            public_id: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        checked_by: {
          is: {
            name: { contains: query, mode: "insensitive" },
          },
        },
      },
      {
        checked_by: {
          is: {
            email: { contains: query, mode: "insensitive" },
          },
        },
      },
    ];
  }

  return where;
}

async function mapComplaintsForAdmin(
  complaints: ComplaintWithRelations[],
): Promise<ComplaintDto[]> {
  if (complaints.length === 0) return [];

  const sellerIds = Array.from(
    new Set(complaints.map((complaint) => complaint.seller_id)),
  );
  const complaintIds = complaints.map((complaint) => complaint.id);

  const [approvedBySellerRaw, sanctionsByComplaintRaw, activeSanctionsRaw] =
    await Promise.all([
      sellerIds.length > 0
        ? prisma.complaint.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: sellerIds },
              status: "APPROVED",
            },
            _count: {
              _all: true,
            },
          })
        : Promise.resolve([]),
      complaintIds.length > 0
        ? prisma.complaintSanction.findMany({
            where: {
              complaint_id: { in: complaintIds },
            },
            select: {
              complaint_id: true,
              public_id: true,
              level: true,
              status: true,
              starts_at: true,
              ends_at: true,
              reason: true,
              created_at: true,
            },
          })
        : Promise.resolve([]),
      sellerIds.length > 0
        ? prisma.complaintSanction.findMany({
            where: {
              seller_id: { in: sellerIds },
              status: "ACTIVE",
            },
            select: {
              seller_id: true,
              public_id: true,
              level: true,
              status: true,
              starts_at: true,
              ends_at: true,
              reason: true,
              created_at: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
          })
        : Promise.resolve([]),
    ]);

  const approvedBySeller = new Map<number, number>();
  for (const item of approvedBySellerRaw) {
    approvedBySeller.set(item.seller_id, item._count._all);
  }

  const sanctionByComplaint = new Map<number, (typeof sanctionsByComplaintRaw)[number]>();
  for (const sanction of sanctionsByComplaintRaw) {
    sanctionByComplaint.set(sanction.complaint_id, sanction);
  }

  const activeSanctionBySeller = new Map<number, (typeof activeSanctionsRaw)[number]>();
  for (const sanction of activeSanctionsRaw) {
    if (!activeSanctionBySeller.has(sanction.seller_id)) {
      activeSanctionBySeller.set(sanction.seller_id, sanction);
    }
  }

  return complaints.map((complaint) => {
    const evaluation = buildComplaintEvaluation({
      complaintType: complaint.complaint_type,
      listingComplaintCount: complaint.listing._count.complaints,
      sellerComplaintCount: complaint.seller._count.complaints_against,
    });
    const addressInfo = extractPrimaryAddressInfo(complaint.seller.addresses);

    const sellerViolationsCount = approvedBySeller.get(complaint.seller_id) ?? 0;
    const queueMetrics = computeComplaintQueueMetrics({
      createdAt: complaint.created_at,
      riskScore: evaluation.score,
      listingComplaintsCount: complaint.listing._count.complaints,
      sellerViolationsCount,
    });

    return {
      id: complaint.public_id,
      createdAt: complaint.created_at,
      status: toClientComplaintStatus(complaint.status),
      targetType: "listing",
      complaintType: complaint.complaint_type,
      listingId: complaint.listing.public_id,
      listingUrl: buildListingPublicUrl(complaint.listing.public_id),
      listingTitle: complaint.listing.title,
      listingPrice: complaint.listing.price,
      listingCreatedAt: complaint.listing.created_at,
      listingStatus: complaint.listing.status.toLowerCase(),
      listingModerationStatus: complaint.listing.moderation_status.toLowerCase(),
      listingCity: addressInfo.city,
      listingRegion: addressInfo.region,
      listingComplaintsCount: complaint.listing._count.complaints,
      sellerId: complaint.seller.public_id,
      sellerName: complaint.seller.name,
      sellerEmail: complaint.seller.email,
      sellerPhone: complaint.seller.phone,
      sellerStatus: complaint.seller.status.toLowerCase() as "active" | "blocked",
      sellerBlockedUntil: complaint.seller.blocked_until,
      sellerBlockReason: complaint.seller.block_reason,
      sellerJoinedAt: complaint.seller.joined_at,
      sellerVerified: Boolean(complaint.seller.seller_profile?.is_verified),
      sellerResponseMinutes:
        complaint.seller.seller_profile?.average_response_minutes ?? null,
      reporterId: complaint.reporter.public_id,
      reporterName: complaint.reporter.name,
      reporterEmail: complaint.reporter.email,
      sellerViolationsCount,
      sellerListingsCount: complaint.seller._count.listings,
      sellerOrdersCount: complaint.seller._count.orders_as_seller,
      description: complaint.description,
      checkedAt: complaint.checked_at,
      checkedBy: complaint.checked_by
        ? {
            id: complaint.checked_by.public_id,
            name: complaint.checked_by.name,
            email: complaint.checked_by.email,
          }
        : null,
      actionTaken: complaint.action_taken,
      sanction: sanctionByComplaint.get(complaint.id)
        ? {
            id: sanctionByComplaint.get(complaint.id)?.public_id ?? "",
            level: toClientSanctionLevel(
              sanctionByComplaint.get(complaint.id)?.level ?? "WARNING",
            ),
            status: toClientComplaintSanctionStatus(
              sanctionByComplaint.get(complaint.id)?.status ?? "COMPLETED",
            ),
            startsAt: sanctionByComplaint.get(complaint.id)?.starts_at ?? null,
            endsAt: sanctionByComplaint.get(complaint.id)?.ends_at ?? null,
            reason: sanctionByComplaint.get(complaint.id)?.reason ?? null,
            createdAt: sanctionByComplaint.get(complaint.id)?.created_at ?? null,
          }
        : null,
      activeSellerSanction: activeSanctionBySeller.get(complaint.seller_id)
        ? {
            id: activeSanctionBySeller.get(complaint.seller_id)?.public_id ?? "",
            level: toClientSanctionLevel(
              activeSanctionBySeller.get(complaint.seller_id)?.level ?? "WARNING",
            ),
            status: toClientComplaintSanctionStatus(
              activeSanctionBySeller.get(complaint.seller_id)?.status ?? "ACTIVE",
            ),
            startsAt: activeSanctionBySeller.get(complaint.seller_id)?.starts_at ?? null,
            endsAt: activeSanctionBySeller.get(complaint.seller_id)?.ends_at ?? null,
            reason: activeSanctionBySeller.get(complaint.seller_id)?.reason ?? null,
            createdAt: activeSanctionBySeller.get(complaint.seller_id)?.created_at ?? null,
          }
        : null,
      evaluation,
      riskScore: evaluation.score,
      queueScore: queueMetrics.queueScore,
      priority: queueMetrics.priority,
      ageHours: queueMetrics.ageHours,
    };
  });
}

async function fetchMappedComplaints(
  where: Prisma.ComplaintWhereInput,
): Promise<ComplaintDto[]> {
  const complaints = await prisma.complaint.findMany({
    where,
    include: COMPLAINT_LIST_INCLUDE,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
  });
  return mapComplaintsForAdmin(complaints);
}

function serializeForJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function makeIdempotencyHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function beginAdminIdempotency(params: {
  actorUserId: number;
  action: string;
  key: string;
  requestHash: string;
}): Promise<IdempotencyStartResult> {
  const lookupWhere = {
    actor_user_id: params.actorUserId,
    action: params.action,
    idempotency_key: params.key,
  };

  const existing = await prisma.adminIdempotencyKey.findFirst({
    where: lookupWhere,
    select: {
      id: true,
      request_hash: true,
      response_status: true,
      response_body: true,
    },
  });

  if (existing) {
    if (existing.request_hash !== params.requestHash) {
      return {
        kind: "conflict",
        message:
          "Idempotency-Key reuse with different payload is not allowed for this action.",
      };
    }
    if (existing.response_status && existing.response_body) {
      return {
        kind: "cached",
        statusCode: existing.response_status,
        body: existing.response_body,
      };
    }
    return {
      kind: "conflict",
      message: "Request with this Idempotency-Key is already in progress.",
    };
  }

  try {
    const created = await prisma.adminIdempotencyKey.create({
      data: {
        public_id: makePublicId("IDM"),
        actor_user_id: params.actorUserId,
        action: params.action,
        idempotency_key: params.key,
        request_hash: params.requestHash,
      },
      select: {
        id: true,
      },
    });
    return { kind: "created", recordId: created.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const resolved = await prisma.adminIdempotencyKey.findFirst({
      where: lookupWhere,
      select: {
        id: true,
        request_hash: true,
        response_status: true,
        response_body: true,
      },
    });

    if (!resolved) {
      throw error;
    }

    if (resolved.request_hash !== params.requestHash) {
      return {
        kind: "conflict",
        message:
          "Idempotency-Key reuse with different payload is not allowed for this action.",
      };
    }
    if (resolved.response_status && resolved.response_body) {
      return {
        kind: "cached",
        statusCode: resolved.response_status,
        body: resolved.response_body,
      };
    }
    return {
      kind: "conflict",
      message: "Request with this Idempotency-Key is already in progress.",
    };
  }
}

async function completeAdminIdempotency(params: {
  recordId: number;
  statusCode: number;
  body: unknown;
}): Promise<void> {
  await prisma.adminIdempotencyKey.update({
    where: { id: params.recordId },
    data: {
      response_status: params.statusCode,
      response_body: serializeForJson(params.body),
    },
  });
}

async function fetchComplaintHistory(
  complaintId: number,
): Promise<ComplaintHistoryEventDto[]> {
  const complaintEventDelegate = (
    prisma as unknown as {
      complaintEvent?: {
        findMany?: (args: Prisma.ComplaintEventFindManyArgs) => Promise<
          Array<{
            public_id: string;
            event_type: string;
            from_status: ComplaintStatusValue | null;
            to_status: ComplaintStatusValue | null;
            note: string | null;
            metadata: unknown;
            created_at: Date;
            actor: { public_id: string; name: string; email: string } | null;
          }>
        >;
      };
    }
  ).complaintEvent;

  if (!complaintEventDelegate?.findMany) {
    return [];
  }

  const events = await complaintEventDelegate.findMany({
    where: { complaint_id: complaintId },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    include: {
      actor: {
        select: {
          public_id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return events.map((event) => ({
    id: event.public_id,
    type: event.event_type,
    fromStatus: event.from_status
      ? toClientComplaintStatus(event.from_status)
      : null,
    toStatus: event.to_status ? toClientComplaintStatus(event.to_status) : null,
    note: event.note,
    metadata: event.metadata,
    createdAt: event.created_at,
    actor: event.actor
      ? {
          id: event.actor.public_id,
          name: event.actor.name,
          email: event.actor.email,
        }
      : null,
  }));
}

async function loadComplaintEntity(publicId: string): Promise<ComplaintWithRelations | null> {
  return prisma.complaint.findUnique({
    where: { public_id: publicId },
    include: COMPLAINT_LIST_INCLUDE,
  });
}

async function handleComplaintStatusUpdate(
  req: Request,
  res: Response,
  complaintPublicId: string,
): Promise<void> {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as {
      status?: unknown;
      actionTaken?: unknown;
    };
    const parsedStatus = parseComplaintStatus(body.status);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid complaint status" });
      return;
    }

    const idempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      res.status(400).json({ error: "Idempotency-Key header is required" });
      return;
    }

    const actionTakenRaw =
      typeof body.actionTaken === "string" ? body.actionTaken.trim() : "";
    const actionTaken = actionTakenRaw.length > 0 ? actionTakenRaw : null;
    const idempotencyHash = makeIdempotencyHash({
      complaintPublicId,
      status: parsedStatus,
      actionTaken,
    });

    const idempotencyStart = await beginAdminIdempotency({
      actorUserId: access.user.id,
      action: COMPLAINT_STATUS_IDEMPOTENCY_ACTION,
      key: idempotencyKey,
      requestHash: idempotencyHash,
    });

    if (idempotencyStart.kind === "cached") {
      res.status(idempotencyStart.statusCode).json(idempotencyStart.body);
      return;
    }

    if (idempotencyStart.kind === "conflict") {
      res.status(409).json({ error: idempotencyStart.message });
      return;
    }

    const existing = await prisma.complaint.findUnique({
      where: { public_id: complaintPublicId },
      select: {
        id: true,
        public_id: true,
        status: true,
        action_taken: true,
        complaint_type: true,
        seller_id: true,
        listing_id: true,
        seller: {
          select: {
            public_id: true,
            status: true,
            block_reason: true,
            blocked_until: true,
          },
        },
        listing: {
          select: {
            public_id: true,
            status: true,
            moderation_status: true,
          },
        },
      },
    });

    if (!existing) {
      const payload = { error: "Complaint not found" };
      await completeAdminIdempotency({
        recordId: idempotencyStart.recordId,
        statusCode: 404,
        body: payload,
      });
      res.status(404).json(payload);
      return;
    }

    if (existing.status === "APPROVED" && parsedStatus !== "APPROVED") {
      const payload = {
        error:
          "Approved complaint cannot be moved back. Create a separate compensating admin action.",
      };
      await completeAdminIdempotency({
        recordId: idempotencyStart.recordId,
        statusCode: 400,
        body: payload,
      });
      res.status(400).json(payload);
      return;
    }

    const txResult = await prisma.$transaction(async (tx) => {
      const nextUpdate = await tx.complaint.updateMany({
        where: {
          id: existing.id,
          status: existing.status,
        },
        data: {
          status: parsedStatus,
          checked_at: new Date(),
          checked_by_id: access.user.id,
          action_taken: actionTaken,
        },
      });

      if (nextUpdate.count !== 1) {
        throw new Error("COMPLAINT_STATUS_CONFLICT");
      }

      await tx.complaintEvent.create({
        data: {
          public_id: makePublicId("CME"),
          complaint_id: existing.id,
          actor_user_id: access.user.id,
          event_type: "STATUS_CHANGED",
          from_status: existing.status,
          to_status: parsedStatus,
          note: actionTaken,
          metadata: {
            source: "admin_panel",
          },
        },
      });

      let enforcement:
        | {
            applied: true;
            approvedViolationsCount: number;
            level: string;
            sanctionId: string;
            sellerStatus: "active" | "blocked";
            blockedUntil: Date | null;
            listingStatus: "inactive";
            listingModerationStatus: "rejected";
            message: string;
          }
        | null = null;

      if (parsedStatus === "APPROVED" && existing.status !== "APPROVED") {
        const enforcementResult = await applyApprovedComplaintConsequences(tx, {
          complaintId: existing.id,
          complaintPublicId: existing.public_id,
          complaintType: existing.complaint_type,
          sellerId: existing.seller_id,
          listingId: existing.listing_id,
          adminUserId: access.user.id,
          actionTaken,
        });

        enforcement = {
          applied: true,
          approvedViolationsCount: enforcementResult.approvedViolationsCount,
          level: toClientSanctionLevel(enforcementResult.level),
          sanctionId: enforcementResult.sanctionPublicId,
          sellerStatus: enforcementResult.sellerStatus.toLowerCase() as
            | "active"
            | "blocked",
          blockedUntil: enforcementResult.blockedUntil,
          listingStatus: enforcementResult.listingStatus.toLowerCase() as "inactive",
          listingModerationStatus:
            enforcementResult.listingModerationStatus.toLowerCase() as "rejected",
          message: enforcementResult.message,
        };

        await tx.complaintEvent.create({
          data: {
            public_id: makePublicId("CME"),
            complaint_id: existing.id,
            actor_user_id: access.user.id,
            event_type: "SANCTION_APPLIED",
            note: enforcement.message,
            metadata: {
              level: enforcement.level,
              sanctionId: enforcement.sanctionId,
              sellerStatus: enforcement.sellerStatus,
              blockedUntil: enforcement.blockedUntil,
            },
          },
        });
      }

      const updated = await tx.complaint.findUnique({
        where: { id: existing.id },
        select: {
          status: true,
          action_taken: true,
        },
      });

      if (!updated) {
        throw new Error("COMPLAINT_NOT_FOUND_AFTER_UPDATE");
      }

      return {
        updated,
        enforcement,
      };
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "complaint.status_changed",
      entityType: "complaint",
      entityPublicId: complaintPublicId,
      details: {
        beforeStatus: existing.status,
        afterStatus: txResult.updated.status,
        beforeActionTaken: existing.action_taken,
        afterActionTaken: txResult.updated.action_taken,
      },
    });

    if (txResult.enforcement) {
      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "listing.moderation_changed",
        entityType: "listing",
        entityPublicId: existing.listing.public_id,
        details: {
          source: "complaint_approved_auto_enforcement",
          complaintId: existing.public_id,
          beforeModerationStatus: existing.listing.moderation_status,
          afterModerationStatus: "REJECTED",
          beforeListingStatus: existing.listing.status,
          afterListingStatus: "INACTIVE",
        },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "user.status_changed",
        entityType: "user",
        entityPublicId: existing.seller.public_id,
        details: {
          source: "complaint_approved_auto_enforcement",
          complaintId: existing.public_id,
          sanctionLevel: txResult.enforcement.level,
          beforeStatus: existing.seller.status,
          afterStatus: txResult.enforcement.sellerStatus.toUpperCase(),
          beforeBlockReason: existing.seller.block_reason,
          afterBlockReason:
            actionTaken && actionTaken.length > 0
              ? actionTaken
              : existing.seller.block_reason,
          beforeBlockedUntil: existing.seller.blocked_until,
          afterBlockedUntil: txResult.enforcement.blockedUntil,
        },
      });
    }

    const payload = {
      success: true,
      status: txResult.updated.status.toLowerCase(),
      enforcement: txResult.enforcement,
    };

    await completeAdminIdempotency({
      recordId: idempotencyStart.recordId,
      statusCode: 200,
      body: payload,
    });

    res.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "COMPLAINT_STATUS_CONFLICT") {
      res.status(409).json({
        error: "Complaint status changed by another moderator. Reload and retry.",
      });
      return;
    }
    console.error("Error updating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

adminRouter.get("/complaints/stats", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const queryText = normalizeQueryText(req.query.q);
    const moderatorPublicId =
      typeof req.query.moderator === "string" ? req.query.moderator : undefined;
    const from = parseDateQuery(req.query.from);
    const to = parseDateQuery(req.query.to);
    const priorities = parseComplaintPriorityFilter(req.query.priority);

    const where = buildComplaintWhere({
      moderatorPublicId,
      from,
      to,
      query: queryText,
    });

    let complaints = await fetchMappedComplaints(where);
    if (priorities.length > 0) {
      complaints = complaints.filter((item) => priorities.includes(item.priority));
    }

    res.json({
      total: complaints.length,
      new: complaints.filter((item) => item.status === "new").length,
      pending: complaints.filter((item) => item.status === "pending").length,
      approved: complaints.filter((item) => item.status === "approved").length,
      rejected: complaints.filter((item) => item.status === "rejected").length,
      highPriority: complaints.filter((item) => item.priority === "high").length,
      mediumPriority: complaints.filter((item) => item.priority === "medium").length,
      lowPriority: complaints.filter((item) => item.priority === "low").length,
    });
  } catch (error) {
    console.error("Error fetching complaint stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/complaints", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const page = parsePageQuery(req.query.page);
    const pageSize = parsePageSizeQuery(req.query.pageSize);
    const statuses = parseComplaintStatusesFilter(req.query.status);
    const priorities = parseComplaintPriorityFilter(req.query.priority);
    const sortBy = parseComplaintSortBy(req.query.sortBy);
    const sortOrder = parseComplaintSortOrder(req.query.sortOrder);
    const queryText = normalizeQueryText(req.query.q);
    const moderatorPublicId =
      typeof req.query.moderator === "string" ? req.query.moderator : undefined;
    const from = parseDateQuery(req.query.from);
    const to = parseDateQuery(req.query.to);

    const where = buildComplaintWhere({
      statuses,
      moderatorPublicId,
      from,
      to,
      query: queryText,
    });

    let complaints = await fetchMappedComplaints(where);
    if (priorities.length > 0) {
      complaints = complaints.filter((item) => priorities.includes(item.priority));
    }

    const sorted = sortComplaints(complaints, sortBy, sortOrder);
    const total = sorted.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    const start = totalPages === 0 ? 0 : (safePage - 1) * pageSize;
    const items = sorted.slice(start, start + pageSize);

    const moderators = Array.from(
      new Map(
        complaints
          .filter((item) => item.checkedBy)
          .map((item) => [item.checkedBy?.id ?? "", item.checkedBy]),
      ).values(),
    ).filter((item): item is { id: string; name: string; email: string } => Boolean(item));

    res.json({
      items,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
      filters: {
        status: statuses.map((status) => status.toLowerCase()),
        priority: priorities,
        moderator: moderatorPublicId ?? null,
        from,
        to,
        q: queryText,
      },
      options: {
        moderators,
      },
    });
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/complaints/:id/related-listing", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const complaintPublicId = String(req.params.id);
    const complaint = await prisma.complaint.findUnique({
      where: { public_id: complaintPublicId },
      select: {
        id: true,
        listing_id: true,
      },
    });

    if (!complaint) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }

    const related = await prisma.complaint.findMany({
      where: {
        listing_id: complaint.listing_id,
      },
      include: COMPLAINT_LIST_INCLUDE,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 20,
    });

    const mapped = await mapComplaintsForAdmin(related);
    res.json({
      items: mapped.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        status: item.status,
        complaintType: item.complaintType,
        reporterName: item.reporterName,
        priority: item.priority,
        queueScore: item.queueScore,
        isCurrent: item.id === complaintPublicId,
      })),
    });
  } catch (error) {
    console.error("Error fetching related listing complaints:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/complaints/:id/seller-summary", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const complaintPublicId = String(req.params.id);
    const complaint = await prisma.complaint.findUnique({
      where: { public_id: complaintPublicId },
      select: {
        seller_id: true,
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            status: true,
            blocked_until: true,
            block_reason: true,
            seller_profile: {
              select: {
                is_verified: true,
              },
            },
            _count: {
              select: {
                listings: true,
                orders_as_seller: true,
              },
            },
          },
        },
      },
    });

    if (!complaint) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }

    const [countsRaw, activeSanctionsCount, recentCasesRaw] = await Promise.all([
      prisma.complaint.groupBy({
        by: ["status"],
        where: {
          seller_id: complaint.seller_id,
        },
        _count: {
          _all: true,
        },
      }),
      prisma.complaintSanction.count({
        where: {
          seller_id: complaint.seller_id,
          status: "ACTIVE",
        },
      }),
      prisma.complaint.findMany({
        where: {
          seller_id: complaint.seller_id,
        },
        include: {
          listing: {
            select: {
              public_id: true,
              title: true,
            },
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 8,
      }),
    ]);

    const counts = {
      total: 0,
      approved: 0,
      pending: 0,
      new: 0,
      rejected: 0,
    };

    for (const item of countsRaw) {
      counts.total += item._count._all;
      if (item.status === "APPROVED") counts.approved = item._count._all;
      if (item.status === "PENDING") counts.pending = item._count._all;
      if (item.status === "NEW") counts.new = item._count._all;
      if (item.status === "REJECTED") counts.rejected = item._count._all;
    }

    res.json({
      seller: {
        id: complaint.seller.public_id,
        name: complaint.seller.name,
        email: complaint.seller.email,
        status: complaint.seller.status.toLowerCase(),
        blockedUntil: complaint.seller.blocked_until,
        blockReason: complaint.seller.block_reason,
        verified: Boolean(complaint.seller.seller_profile?.is_verified),
        listingsCount: complaint.seller._count.listings,
        ordersCount: complaint.seller._count.orders_as_seller,
      },
      complaints: {
        total: counts.total,
        approved: counts.approved,
        pending: counts.pending,
        new: counts.new,
        rejected: counts.rejected,
      },
      activeSanctionsCount,
      recentCases: recentCasesRaw.map((item) => ({
        id: item.public_id,
        status: item.status.toLowerCase(),
        complaintType: item.complaint_type,
        listingId: item.listing.public_id,
        listingTitle: item.listing.title,
        createdAt: item.created_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching seller summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/complaints/:id", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const complaintPublicId = String(req.params.id);
    const complaint = await loadComplaintEntity(complaintPublicId);

    if (!complaint) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }

    const [mapped] = await mapComplaintsForAdmin([complaint]);
    const history = await fetchComplaintHistory(complaint.id);

    res.json({
      ...mapped,
      history,
    });
  } catch (error) {
    console.error("Error fetching complaint details:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/complaints/:id/status", async (req: Request, res: Response) => {
  await handleComplaintStatusUpdate(req, res, String(req.params.id));
});

// Backward compatibility with previous frontend route.
adminRouter.patch("/complaints/:publicId", async (req: Request, res: Response) => {
  await handleComplaintStatusUpdate(req, res, String(req.params.publicId));
});

adminRouter.get("/kyc-requests", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const requests = await prisma.kycRequest.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            joined_at: true,
            seller_profile: {
              select: {
                is_verified: true,
                average_response_minutes: true,
                commission_tier: {
                  select: {
                    public_id: true,
                    name: true,
                    commission_rate: true,
                  },
                },
              },
            },
            _count: {
              select: {
                listings: true,
                orders_as_seller: true,
                complaints_against: true,
              },
            },
          },
        },
        reviewed_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      requests.map((requestItem) => ({
        id: requestItem.public_id,
        createdAt: requestItem.created_at,
        status: requestItem.status.toLowerCase(),
        sellerId: requestItem.seller.public_id,
        sellerName: requestItem.seller.name,
        sellerEmail: requestItem.seller.email,
        sellerPhone: requestItem.seller.phone,
        sellerStatus: requestItem.seller.status.toLowerCase(),
        sellerJoinedAt: requestItem.seller.joined_at,
        sellerVerified: Boolean(requestItem.seller.seller_profile?.is_verified),
        sellerResponseMinutes:
          requestItem.seller.seller_profile?.average_response_minutes ?? null,
        sellerCommissionTier:
          requestItem.seller.seller_profile?.commission_tier
            ? {
                id: requestItem.seller.seller_profile.commission_tier.public_id,
                name: requestItem.seller.seller_profile.commission_tier.name,
                rate: requestItem.seller.seller_profile.commission_tier.commission_rate,
              }
            : null,
        sellerListingsCount: requestItem.seller._count.listings,
        sellerOrdersCount: requestItem.seller._count.orders_as_seller,
        sellerComplaintsCount: requestItem.seller._count.complaints_against,
        email: requestItem.email,
        phone: requestItem.phone,
        companyName: requestItem.company_name,
        inn: requestItem.inn,
        address: requestItem.address,
        documents: requestItem.documents,
        documentFiles: splitEvidenceFiles(requestItem.documents),
        notes: requestItem.notes,
        reviewedAt: requestItem.reviewed_at,
        reviewedBy: requestItem.reviewed_by
          ? {
              id: requestItem.reviewed_by.public_id,
              name: requestItem.reviewed_by.name,
              email: requestItem.reviewed_by.email,
            }
          : null,
        rejectionReason: requestItem.rejection_reason,
        evaluation: buildKycEvaluation({
          documentsCount: splitEvidenceFiles(requestItem.documents).length,
          hasInn: requestItem.inn.trim().length > 0,
          hasAddress: requestItem.address.trim().length > 0,
          sellerComplaintsCount: requestItem.seller._count.complaints_against,
          sellerStatus: requestItem.seller.status,
        }),
      })),
    );
  } catch (error) {
    console.error("Error fetching KYC requests:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/kyc-requests/:publicId", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as {
      status?: unknown;
      rejectionReason?: unknown;
    };

    const parsedStatus = parseKycStatus(body.status);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid KYC status" });
      return;
    }

    const existing = await prisma.kycRequest.findUnique({
      where: { public_id: String(publicId) },
      select: { id: true, status: true, rejection_reason: true },
    });

    if (!existing) {
      res.status(404).json({ error: "KYC request not found" });
      return;
    }

    const updated = await prisma.kycRequest.update({
      where: { id: existing.id },
      data: {
        status: parsedStatus,
        reviewed_at: new Date(),
        reviewed_by_id: access.user.id,
        rejection_reason:
          parsedStatus === "REJECTED" && typeof body.rejectionReason === "string"
            ? body.rejectionReason.trim()
            : null,
      },
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "kyc.status_changed",
      entityType: "kyc_request",
      entityPublicId: String(publicId),
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeRejectionReason: existing.rejection_reason,
        afterRejectionReason: updated.rejection_reason,
      },
    });

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
    });
  } catch (error) {
    console.error("Error updating KYC request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/listings", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const listings = await prisma.marketplaceListing.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            joined_at: true,
            status: true,
            addresses: {
              select: {
                city: true,
                region: true,
              },
              orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
              take: 1,
            },
          },
        },
        _count: {
          select: {
            complaints: true,
            order_items: true,
            wishlist_items: true,
            questions: true,
          },
        },
        item: {
          include: {
            subcategory: {
              include: {
                category: true,
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      listings.map((listing) => {
        const addressInfo = extractPrimaryAddressInfo(listing.seller.addresses);
        return {
        id: listing.public_id,
        listingUrl: buildListingPublicUrl(listing.public_id),
        title: listing.title,
        description: listing.description,
        sellerId: listing.seller.public_id,
        sellerName: listing.seller.name,
        sellerStatus: listing.seller.status.toLowerCase(),
        sellerJoinedAt: listing.seller.joined_at,
        status: toAdminListingStatus(listing.moderation_status),
        listingStatus: listing.status.toLowerCase(),
        createdAt: listing.created_at,
        category: listing.item?.name ?? "No category",
        city: addressInfo.city,
        region: addressInfo.region,
        price: listing.price,
        salePrice: listing.sale_price,
        views: listing.views,
        rating: listing.rating,
        complaintsCount: listing._count.complaints,
        ordersCount: listing._count.order_items,
        wishlistCount: listing._count.wishlist_items,
        questionsCount: listing._count.questions,
        autoFlags: buildAutoFlags({
          description: listing.description,
          seller: listing.seller,
          complaints_count: listing._count.complaints,
        }),
      }}),
    );
  } catch (error) {
    console.error("Error fetching listings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch(
  "/listings/:publicId/moderation",
  async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { status?: unknown };
      const parsedStatus = parseModerationStatus(body.status);

      if (!parsedStatus) {
        res.status(400).json({ error: "Invalid moderation status" });
        return;
      }

      const existing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(publicId) },
        select: { id: true, moderation_status: true, status: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const nextListingStatus: ListingStatusValue =
        parsedStatus === "APPROVED"
          ? "ACTIVE"
          : parsedStatus === "REJECTED"
            ? "INACTIVE"
            : "MODERATION";

      const updated = await prisma.marketplaceListing.update({
        where: { id: existing.id },
        data: {
          moderation_status: parsedStatus,
          status: nextListingStatus,
        },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "listing.moderation_changed",
        entityType: "listing",
        entityPublicId: String(publicId),
        details: {
          beforeModerationStatus: existing.moderation_status,
          afterModerationStatus: updated.moderation_status,
          beforeListingStatus: existing.status,
          afterListingStatus: updated.status,
        },
      });

      res.json({
        success: true,
        status: toAdminListingStatus(updated.moderation_status),
      });
    } catch (error) {
      console.error("Error moderating listing:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

adminRouter.get("/users", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const users = await prisma.appUser.findMany({
      include: {
        addresses: {
          select: {
            city: true,
            region: true,
          },
          orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
          take: 1,
        },
        seller_profile: {
          select: {
            is_verified: true,
            average_response_minutes: true,
          },
        },
        orders_as_buyer: {
          orderBy: [{ created_at: "desc" }],
          select: {
            public_id: true,
            status: true,
            total_price: true,
            created_at: true,
          },
        },
        orders_as_seller: {
          orderBy: [{ created_at: "desc" }],
          select: {
            public_id: true,
            status: true,
            total_price: true,
            created_at: true,
          },
        },
        listings: {
          select: {
            public_id: true,
            status: true,
            moderation_status: true,
            created_at: true,
          },
        },
        complaints_reported: {
          select: {
            id: true,
          },
        },
        complaints_against: {
          select: {
            id: true,
          },
        },
        kyc_requests: {
          orderBy: [{ created_at: "desc" }],
          take: 1,
          select: {
            public_id: true,
            status: true,
            created_at: true,
            reviewed_at: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
    const userIds = users.map((user) => user.id);
    const [
      approvedViolationsRaw,
      sanctionsTotalRaw,
      activeSanctionsRaw,
      latestSanctionsRaw,
    ] = await Promise.all([
      userIds.length > 0
        ? prisma.complaint.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
              status: "APPROVED",
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.complaintSanction.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.complaintSanction.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
              status: "ACTIVE",
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? prisma.complaintSanction.findMany({
            where: {
              seller_id: { in: userIds },
            },
            select: {
              seller_id: true,
              public_id: true,
              level: true,
              status: true,
              starts_at: true,
              ends_at: true,
              reason: true,
              created_at: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
          })
        : Promise.resolve([]),
    ]);

    const approvedViolationsByUser = new Map<number, number>();
    for (const item of approvedViolationsRaw) {
      approvedViolationsByUser.set(item.seller_id, item._count._all);
    }

    const sanctionsTotalByUser = new Map<number, number>();
    for (const item of sanctionsTotalRaw) {
      sanctionsTotalByUser.set(item.seller_id, item._count._all);
    }

    const activeSanctionsByUser = new Map<number, number>();
    for (const item of activeSanctionsRaw) {
      activeSanctionsByUser.set(item.seller_id, item._count._all);
    }

    const latestSanctionByUser = new Map<number, (typeof latestSanctionsRaw)[number]>();
    for (const sanction of latestSanctionsRaw) {
      if (!latestSanctionByUser.has(sanction.seller_id)) {
        latestSanctionByUser.set(sanction.seller_id, sanction);
      }
    }

    res.json(
      users.map((user) => {
        const buyerSpent = user.orders_as_buyer.reduce(
          (sum, order) => sum + order.total_price,
          0,
        );
        const sellerRevenue = user.orders_as_seller.reduce(
          (sum, order) => sum + order.total_price,
          0,
        );
        const activeListings = user.listings.filter(
          (listing) =>
            listing.status === "ACTIVE" &&
            listing.moderation_status === "APPROVED",
        ).length;
        const pendingListings = user.listings.filter(
          (listing) => listing.moderation_status === "PENDING",
        ).length;
        const lastBuyerOrderDate = user.orders_as_buyer[0]?.created_at ?? null;
        const lastSellerOrderDate = user.orders_as_seller[0]?.created_at ?? null;
        const kycLatest = user.kyc_requests[0] ?? null;
        const latestSanction = latestSanctionByUser.get(user.id) ?? null;

        return {
          id: user.public_id,
          name: user.name,
          email: user.email,
          role: toClientRole(user.role),
          status: user.status.toLowerCase(),
          joinedAt: user.joined_at,
          city: extractPrimaryAddressInfo(user.addresses).city || null,
          phone: user.phone,
          blockReason: user.block_reason,
          blockedUntil: user.blocked_until,
          buyerOrders: user.orders_as_buyer.length,
          sellerOrders: user.orders_as_seller.length,
          buyerSpent,
          sellerRevenue,
          avgBuyerCheck:
            user.orders_as_buyer.length > 0
              ? Math.round(buyerSpent / user.orders_as_buyer.length)
              : 0,
          avgSellerCheck:
            user.orders_as_seller.length > 0
              ? Math.round(sellerRevenue / user.orders_as_seller.length)
              : 0,
          activeListings,
          pendingListings,
          totalListings: user.listings.length,
          complaintsMade: user.complaints_reported.length,
          complaintsAgainst: user.complaints_against.length,
          approvedViolations: approvedViolationsByUser.get(user.id) ?? 0,
          sanctionsTotal: sanctionsTotalByUser.get(user.id) ?? 0,
          sanctionsActive: activeSanctionsByUser.get(user.id) ?? 0,
          latestSanction: latestSanction
            ? {
                id: latestSanction.public_id,
                level: toClientSanctionLevel(latestSanction.level),
                status: toClientComplaintSanctionStatus(latestSanction.status),
                startsAt: latestSanction.starts_at,
                endsAt: latestSanction.ends_at,
                reason: latestSanction.reason,
                createdAt: latestSanction.created_at,
              }
            : null,
          isSellerVerified: Boolean(user.seller_profile?.is_verified),
          sellerResponseMinutes:
            user.seller_profile?.average_response_minutes ?? null,
          lastBuyerOrderDate,
          lastSellerOrderDate,
          kycLatest: kycLatest
            ? {
                id: kycLatest.public_id,
                status: kycLatest.status.toLowerCase(),
                createdAt: kycLatest.created_at,
                reviewedAt: kycLatest.reviewed_at,
              }
            : null,
        };
      }),
    );
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/users/:publicId/status", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as {
      status?: unknown;
      blockReason?: unknown;
    };

    const parsedStatus = parseUserStatus(body.status);
    if (!parsedStatus) {
      res.status(400).json({ error: "Invalid user status" });
      return;
    }

    const existing = await prisma.appUser.findUnique({
      where: { public_id: String(publicId) },
      select: {
        id: true,
        role: true,
        status: true,
        block_reason: true,
        blocked_until: true,
      },
    });

    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (existing.role === "ADMIN") {
      res.status(400).json({ error: "Cannot update admin status" });
      return;
    }

    const updated = await prisma.appUser.update({
      where: { id: existing.id },
      data: {
        status: parsedStatus,
        block_reason:
          parsedStatus === "BLOCKED" && typeof body.blockReason === "string"
            ? body.blockReason.trim()
            : null,
        blocked_until: null,
      },
    });

    await writeAudit({
      req,
      actorUserId: access.user.id,
      action: "user.status_changed",
      entityType: "user",
      entityPublicId: String(publicId),
      details: {
        beforeStatus: existing.status,
        afterStatus: updated.status,
        beforeBlockReason: existing.block_reason,
        afterBlockReason: updated.block_reason,
        beforeBlockedUntil: existing.blocked_until,
        afterBlockedUntil: updated.blocked_until,
      },
    });

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
      blockedUntil: updated.blocked_until,
    });
  } catch (error) {
    console.error("Error updating user status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/commission-tiers", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const tiers = await prisma.commissionTier.findMany({
      include: {
        _count: {
          select: {
            seller_profiles: true,
          },
        },
      },
      orderBy: [{ min_sales: "asc" }, { id: "asc" }],
    });

    res.json(
      tiers.map((tier) => ({
        id: tier.public_id,
        name: tier.name,
        minSales: tier.min_sales,
        maxSales: tier.max_sales,
        commissionRate: tier.commission_rate,
        description: tier.description,
        sellersCount: tier._count.seller_profiles,
      })),
    );
  } catch (error) {
    console.error("Error fetching commission tiers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch(
  "/commission-tiers/:publicId",
  async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { commissionRate?: unknown };
      const nextRate = Number(body.commissionRate);

      if (!Number.isFinite(nextRate) || nextRate <= 0 || nextRate > 100) {
        res.status(400).json({ error: "Invalid commission rate" });
        return;
      }

      const existing = await prisma.commissionTier.findUnique({
        where: { public_id: String(publicId) },
        select: { id: true, commission_rate: true },
      });

      if (!existing) {
        res.status(404).json({ error: "Commission tier not found" });
        return;
      }

      const updated = await prisma.commissionTier.update({
        where: { id: existing.id },
        data: { commission_rate: nextRate },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "commission_tier.rate_changed",
        entityType: "commission_tier",
        entityPublicId: String(publicId),
        details: {
          beforeCommissionRate: existing.commission_rate,
          afterCommissionRate: updated.commission_rate,
        },
      });

      res.json({
        success: true,
        commissionRate: updated.commission_rate,
      });
    } catch (error) {
      console.error("Error updating commission tier:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export { adminRouter };
