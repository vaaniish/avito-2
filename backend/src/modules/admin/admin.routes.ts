import {
  AppUser,
  CatalogCategory,
  CatalogItem,
  CatalogSubcategory,
  CommissionTier,
  Complaint,
  KycRequest,
  MarketplaceListing,
  MarketOrderItem,
  PlatformTransaction,
  City, // Added City import if not already there, but AppUser has it
} from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireRole } from "../../lib/session";
import { toAdminListingStatus, toClientRole } from "../../utils/format";

const adminRouter = Router();
const ROLE_ADMIN = "ADMIN";

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

// Removed writeAudit function

function parseComplaintStatus(status: unknown): string | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "new") return "NEW";
  return null;
}

function parseKycStatus(status: unknown): string | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function parseModerationStatus(status: unknown): string | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function parseUserStatus(status: unknown): string | null {
  if (status === "active") return "ACTIVE";
  if (status === "blocked") return "BLOCKED";
  return null;
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
      transactions.map(
        (
          transaction: PlatformTransaction & {
            order: { public_id: string; items: MarketOrderItem[] };
            buyer: { name: string };
            seller: { name: string };
          },
        ) => ({
          id: transaction.public_id,
          orderId: transaction.order.public_id,
          buyerName: transaction.buyer.name,
          sellerName: transaction.seller.name,
          listingTitle: transaction.order.items[0]?.name ?? "Позиция без названия",
          amount: transaction.amount,
          commission: transaction.commission,
          commissionRate: transaction.commission_rate,
          status: transaction.status.toLowerCase(),
          paymentProvider: transaction.payment_provider,
          createdAt: transaction.created_at,
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching transactions:", error);
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
      complaints.map(
        (
          complaint: Complaint & {
            listing: { public_id: string; title: string };
            seller: {
              public_id: string;
              name: string;
              _count: { complaints_against: number };
            };
            reporter: { name: string };
            checked_by: { name: string } | null;
          },
        ) => ({
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
        }),
      ),
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
      res.status(400).json({ error: "Некорректный статус жалобы" });
      return;
    }

    const existing = await prisma.complaint.findUnique({
      where: { public_id: String(publicId) },
      select: { id: true },
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
        action_taken: typeof body.actionTaken === "string" ? body.actionTaken.trim() : null,
      },
    });

    // await writeAudit( // Removed writeAudit
    //   access.user.id,
    //   parsedStatus === "APPROVED" ? "approve_complaint" : "reject_complaint",
    //   String(publicId),
    //   "complaint",
    //   `Статус жалобы изменен на ${parsedStatus}`,
    //   req,
    // );

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
      requests.map(
        (
          requestItem: KycRequest & {
            seller: { public_id: string; name: string };
            reviewed_by: { name: string } | null;
          },
        ) => ({
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
        }),
      ),
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
      res.status(400).json({ error: "Некорректный статус KYC" });
      return;
    }

    const existing = await prisma.kycRequest.findUnique({
      where: { public_id: String(publicId) },
      select: { id: true },
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

    // await writeAudit( // Removed writeAudit
    //   access.user.id,
    //   parsedStatus === "APPROVED" ? "approve_kyc" : "reject_kyc",
    //   String(publicId),
    //   "kyc_request",
    //   `Статус KYC изменен на ${parsedStatus}`,
    //   req,
    // );

    res.json({
      success: true,
      status: updated.status.toLowerCase(),
    });
  } catch (error) {
    console.error("Error updating KYC request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function buildAutoFlags(listing: {
  description: string | null;
  seller: { joined_at: Date };
  complaints_count: number;
}): string[] {
  const flags: string[] = [];

  const joinedDays = Math.floor((Date.now() - listing.seller.joined_at.getTime()) / (1000 * 60 * 60 * 24));
  if (joinedDays <= 30) {
    flags.push("new_seller");
  }

  const description = (listing.description ?? "").toLowerCase();
  if (/\b(telegram|whatsapp|перевод|предоплата)\b/.test(description)) {
    flags.push("forbidden_words");
  }

  if (/\+\d|@|\.ru|\.com/.test(description)) {
    flags.push("contacts_in_description");
  }

  if ((listing.description ?? "").length > 200 && /(!!!|\bдешево\b|\bсрочно\b)/i.test(listing.description ?? "")) {
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
      listings.map(
        (
          listing: MarketplaceListing & {
            seller: { public_id: string; name: string; joined_at: Date };
            _count: { complaints: number };
            item: (CatalogItem & {
              subcategory: CatalogSubcategory & {
                category: CatalogCategory;
              };
            }) | null;
          },
        ) => ({
          id: listing.public_id,
          title: listing.title,
          sellerId: listing.seller.public_id,
          sellerName: listing.seller.name,
          status: toAdminListingStatus(listing.moderation_status),
          createdAt: listing.created_at,
          category: listing.item?.name ?? "Без категории",
          price: listing.price,
          complaintsCount: listing._count.complaints,
          autoFlags: buildAutoFlags({
            description: listing.description,
            seller: listing.seller,
            complaints_count: listing._count.complaints,
          }),
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching listings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.patch("/listings/:publicId/moderation", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const { publicId } = req.params;
    const body = (req.body ?? {}) as { status?: unknown };
    const parsedStatus = parseModerationStatus(body.status);

    if (!parsedStatus) {
      res.status(400).json({ error: "Некорректный статус модерации" });
      return;
    }

    const existing = await prisma.marketplaceListing.findUnique({
      where: { public_id: String(publicId) },
      select: { id: true },
    });

    if (!existing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const nextListingStatus =
      parsedStatus === "APPROVED" ? "ACTIVE" : parsedStatus === "REJECTED" ? "INACTIVE" : "MODERATION";

    const updated = await prisma.marketplaceListing.update({
      where: { id: existing.id },
      data: {
        moderation_status: parsedStatus,
        status: nextListingStatus,
      },
    });

    // await writeAudit( // Removed writeAudit
    //   access.user.id,
    //   "approve_listing",
    //   String(publicId),
    //   "listing",
    //   `Статус модерации объявления изменен на ${parsedStatus}`,
    //   req,
    // );

    res.json({
      success: true,
      status: toAdminListingStatus(updated.moderation_status),
    });
  } catch (error) {
    console.error("Error moderating listing:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

adminRouter.get("/users", async (req: Request, res: Response) => {
  try {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const users = await prisma.appUser.findMany({
      include: {
        city: true, // Include City for AppUser
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
      users.map(
        (
          user: AppUser & {
            orders_as_buyer: { total_price: number }[];
            orders_as_seller: { total_price: number }[];
            city: City | null; // Include City in type definition
          },
        ) => ({
          id: user.public_id,
          name: user.name,
          email: user.email,
          role: toClientRole(user.role),
          status: user.status.toLowerCase(),
          joinedAt: user.joined_at,
          city: user.city?.name ?? null, // Use user.city.name
          phone: user.phone,
          blockReason: user.block_reason,
          buyerOrders: user.orders_as_buyer.length,
          sellerOrders: user.orders_as_seller.length,
          buyerSpent: user.orders_as_buyer.reduce((sum: number, order: { total_price: number }) => sum + order.total_price, 0),
          sellerRevenue: user.orders_as_seller.reduce(
            (sum: number, order: { total_price: number }) => sum + order.total_price,
            0,
          ),
        }),
      ),
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
      res.status(400).json({ error: "Некорректный статус пользователя" });
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
      res.status(400).json({ error: "Нельзя менять статус администратора" });
      return;
    }

    const updated = await prisma.appUser.update({
      where: { id: existing.id },
      data: {
        status: parsedStatus,
        block_reason:
          parsedStatus === "BLOCKED" && typeof body.blockReason === "string" ? body.blockReason.trim() : null,
      },
    });

    // await writeAudit( // Removed writeAudit
    //   access.user.id,
    //   "block_user",
    //   String(publicId),
    //   "user",
    //   `Статус пользователя изменен на ${parsedStatus}`,
    //   req,
    // );

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
      tiers.map(
        (
          tier: CommissionTier & {
            _count: { seller_profiles: number };
          },
        ) => ({
          id: tier.public_id,
          name: tier.name,
          minSales: tier.min_sales,
          maxSales: tier.max_sales,
          commissionRate: tier.commission_rate,
          description: tier.description,
          sellersCount: tier._count.seller_profiles,
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching commission tiers:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Removed adminRouter.get("/audit-logs", ...)
// Removed AuditLog import at the top

export { adminRouter };