import { Prisma } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireRole } from "../../lib/session";
import { toAdminListingStatus, toClientRole } from "../../utils/format";

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

adminRouter.get("/transactions", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const transactions = await prisma.platformTransaction.findMany({
      include: {
        buyer: {
          select: {
            name: true,
          },
        },
        seller: {
          select: {
            name: true,
          },
        },
        order: {
          include: {
            items: {
              orderBy: { id: "asc" },
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
        buyerName: transaction.buyer.name,
        sellerName: transaction.seller.name,
        listingTitle: transaction.order.items[0]?.name ?? "Unnamed item",
        amount: transaction.amount,
        commission: transaction.commission,
        commissionRate: transaction.commission_rate,
        status: transaction.status.toLowerCase(),
        paymentProvider: transaction.payment_provider,
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

    if (q) {
      where.OR = [
        { public_id: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { entity_type: { contains: q, mode: "insensitive" } },
        { entity_public_id: { contains: q, mode: "insensitive" } },
        {
          actor: {
            is: {
              name: { contains: q, mode: "insensitive" },
            },
          },
        },
        {
          actor: {
            is: {
              email: { contains: q, mode: "insensitive" },
            },
          },
        },
      ];
    }

    const logs = await prisma.auditLog.findMany({
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
      take: limit,
    });

    res.json({
      logs: logs.map((log) => ({
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

adminRouter.get("/complaints", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const complaints = await prisma.complaint.findMany({
      include: {
        listing: {
          select: {
            public_id: true,
            title: true,
          },
        },
        seller: {
          select: {
            public_id: true,
            name: true,
            _count: {
              select: {
                complaints_against: true,
              },
            },
          },
        },
        reporter: {
          select: {
            name: true,
          },
        },
        checked_by: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      complaints.map((complaint) => ({
        id: complaint.public_id,
        createdAt: complaint.created_at,
        status: complaint.status.toLowerCase(),
        complaintType: complaint.complaint_type,
        listingId: complaint.listing.public_id,
        listingTitle: complaint.listing.title,
        sellerId: complaint.seller.public_id,
        sellerName: complaint.seller.name,
        reporterName: complaint.reporter.name,
        sellerViolationsCount: complaint.seller._count.complaints_against,
        description: complaint.description,
        evidence: complaint.evidence,
        checkedAt: complaint.checked_at,
        checkedBy: complaint.checked_by?.name ?? null,
        actionTaken: complaint.action_taken,
      })),
    );
  } catch (error) {
    console.error("Error fetching complaints:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/complaints/:publicId", async (req: Request, res: Response) => {
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
      select: { id: true, status: true, action_taken: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Complaint not found" });
      return;
    }

    const updated = await prisma.complaint.update({
      where: { id: existing.id },
      data: {
        status: parsedStatus,
        checked_at: new Date(),
        checked_by_id: access.user.id,
        action_taken:
          typeof body.actionTaken === "string" ? body.actionTaken.trim() : null,
      },
    });

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

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
    });
  } catch (error) {
    console.error("Error updating complaint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
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
          },
        },
        reviewed_by: {
          select: {
            name: true,
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
        email: requestItem.email,
        phone: requestItem.phone,
        companyName: requestItem.company_name,
        inn: requestItem.inn,
        address: requestItem.address,
        documents: requestItem.documents,
        notes: requestItem.notes,
        reviewedAt: requestItem.reviewed_at,
        reviewedBy: requestItem.reviewed_by?.name ?? null,
        rejectionReason: requestItem.rejection_reason,
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
          },
        },
        _count: {
          select: {
            complaints: true,
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
      listings.map((listing) => ({
        id: listing.public_id,
        title: listing.title,
        sellerId: listing.seller.public_id,
        sellerName: listing.seller.name,
        status: toAdminListingStatus(listing.moderation_status),
        createdAt: listing.created_at,
        category: listing.item?.name ?? "No category",
        price: listing.price,
        complaintsCount: listing._count.complaints,
        autoFlags: buildAutoFlags({
          description: listing.description,
          seller: listing.seller,
          complaints_count: listing._count.complaints,
        }),
      })),
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
        city: true,
        orders_as_buyer: {
          select: {
            total_price: true,
          },
        },
        orders_as_seller: {
          select: {
            total_price: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    res.json(
      users.map((user) => ({
        id: user.public_id,
        name: user.name,
        email: user.email,
        role: toClientRole(user.role),
        status: user.status.toLowerCase(),
        joinedAt: user.joined_at,
        city: user.city?.name ?? null,
        phone: user.phone,
        blockReason: user.block_reason,
        buyerOrders: user.orders_as_buyer.length,
        sellerOrders: user.orders_as_seller.length,
        buyerSpent: user.orders_as_buyer.reduce(
          (sum, order) => sum + order.total_price,
          0,
        ),
        sellerRevenue: user.orders_as_seller.reduce(
          (sum, order) => sum + order.total_price,
          0,
        ),
      })),
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
      },
    });

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
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
