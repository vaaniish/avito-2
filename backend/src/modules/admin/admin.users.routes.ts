import { type Request, type Response, type Router } from "express";
import { prisma } from "../../lib/prisma";
import { toClientRole } from "../../utils/format";
import { toClientSanctionLevel } from "./complaint-sanctions";
import {
  extractPrimaryAddressInfo,
  requireAdmin,
  toClientComplaintSanctionStatus,
  writeAudit,
} from "./admin.shared";

const MAX_BLOCK_REASON_LENGTH = 500;

type UserStatusValue = "ACTIVE" | "BLOCKED";
type UserRoleValue = "BUYER" | "SELLER";

function parseUserStatus(status: unknown): UserStatusValue | null {
  if (status === "active") return "ACTIVE";
  if (status === "blocked") return "BLOCKED";
  return null;
}

function parseUserRole(role: unknown): UserRoleValue | null {
  if (role === "regular") return "BUYER";
  if (role === "partner") return "SELLER";
  return null;
}

export function registerAdminUserRoutes(adminRouter: Router) {
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

      const rawBlockReason =
        parsedStatus === "BLOCKED" && typeof body.blockReason === "string"
          ? body.blockReason.trim()
          : "";
      if (rawBlockReason.length > MAX_BLOCK_REASON_LENGTH) {
        res.status(400).json({
          error: `Причина блокировки не должна превышать ${MAX_BLOCK_REASON_LENGTH} символов`,
        });
        return;
      }

      const updated = await prisma.appUser.update({
        where: { id: existing.id },
        data: {
          status: parsedStatus,
          block_reason:
            parsedStatus === "BLOCKED"
              ? rawBlockReason || "Нарушение правил платформы"
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

  adminRouter.patch("/users/:publicId/role", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { role?: unknown };
      const nextRole = parseUserRole(body.role);
      if (!nextRole) {
        res.status(400).json({ error: "Invalid user role" });
        return;
      }

      const existing = await prisma.appUser.findUnique({
        where: { public_id: String(publicId) },
        select: {
          id: true,
          role: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (existing.role === "ADMIN") {
        res.status(400).json({ error: "Cannot update admin role" });
        return;
      }

      if (existing.role === nextRole) {
        res.json({ success: true, role: nextRole === "SELLER" ? "partner" : "regular" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.appUser.update({
          where: { id: existing.id },
          data: {
            role: nextRole,
          },
        });

        if (nextRole === "SELLER") {
          await tx.sellerProfile.upsert({
            where: { user_id: existing.id },
            create: {
              user_id: existing.id,
              is_verified: false,
            },
            update: {},
          });
        }
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "user.role_changed",
        entityType: "user",
        entityPublicId: String(publicId),
        details: {
          beforeRole: existing.role,
          afterRole: nextRole,
        },
      });

      res.json({
        success: true,
        role: nextRole === "SELLER" ? "partner" : "regular",
      });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
