"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const adminRouter = (0, express_1.Router)();
exports.adminRouter = adminRouter;
const ROLE_ADMIN = "ADMIN";
async function requireAdmin(req, res) {
    const session = await (0, session_1.requireRole)(req, ROLE_ADMIN);
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
async function writeAudit(adminId, action, targetId, targetType, details, req) {
    await prisma_1.prisma.auditLog.create({
        data: {
            public_id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            admin_id: adminId,
            action,
            target_id: targetId,
            target_type: targetType,
            details,
            ip_address: req.ip || "127.0.0.1",
        },
    });
}
function parseComplaintStatus(status) {
    if (status === "approved")
        return "APPROVED";
    if (status === "rejected")
        return "REJECTED";
    if (status === "new")
        return "NEW";
    return null;
}
function parseKycStatus(status) {
    if (status === "approved")
        return "APPROVED";
    if (status === "rejected")
        return "REJECTED";
    if (status === "pending")
        return "PENDING";
    return null;
}
function parseModerationStatus(status) {
    if (status === "approved")
        return "APPROVED";
    if (status === "rejected")
        return "REJECTED";
    if (status === "pending")
        return "PENDING";
    return null;
}
function parseUserStatus(status) {
    if (status === "active")
        return "ACTIVE";
    if (status === "blocked")
        return "BLOCKED";
    return null;
}
adminRouter.get("/transactions", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const transactions = await prisma_1.prisma.platformTransaction.findMany({
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
        res.json(transactions.map((transaction) => ({
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
        })));
    }
    catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/complaints", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const complaints = await prisma_1.prisma.complaint.findMany({
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
        res.json(complaints.map((complaint) => ({
            id: complaint.public_id,
            createdAt: complaint.created_at,
            status: complaint.status.toLowerCase(),
            complaintType: complaint.complaint_type,
            listingId: complaint.listing.public_id,
            listingTitle: complaint.listing.title,
            sellerId: complaint.seller.public_id,
            sellerName: complaint.seller.name,
            reporterName: complaint.reporter.name,
            sellerViolationsCount: complaint.seller_violations_count,
            description: complaint.description,
            evidence: complaint.evidence,
            checkedAt: complaint.checked_at,
            checkedBy: complaint.checked_by?.name ?? null,
            actionTaken: complaint.action_taken,
        })));
    }
    catch (error) {
        console.error("Error fetching complaints:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/complaints/:publicId", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const parsedStatus = parseComplaintStatus(body.status);
        if (!parsedStatus) {
            res.status(400).json({ error: "Некорректный статус жалобы" });
            return;
        }
        const existing = await prisma_1.prisma.complaint.findUnique({
            where: { public_id: publicId },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Complaint not found" });
            return;
        }
        const updated = await prisma_1.prisma.complaint.update({
            where: { id: existing.id },
            data: {
                status: parsedStatus,
                checked_at: new Date(),
                checked_by_id: access.user.id,
                action_taken: typeof body.actionTaken === "string" ? body.actionTaken.trim() : null,
            },
        });
        await writeAudit(access.user.id, parsedStatus === "APPROVED" ? "approve_complaint" : "reject_complaint", publicId, "complaint", `Complaint status changed to ${parsedStatus}`, req);
        res.json({
            success: true,
            status: updated.status.toLowerCase(),
        });
    }
    catch (error) {
        console.error("Error updating complaint:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/kyc-requests", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const requests = await prisma_1.prisma.kycRequest.findMany({
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
        res.json(requests.map((requestItem) => ({
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
        })));
    }
    catch (error) {
        console.error("Error fetching KYC requests:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/kyc-requests/:publicId", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const parsedStatus = parseKycStatus(body.status);
        if (!parsedStatus) {
            res.status(400).json({ error: "Некорректный статус KYC" });
            return;
        }
        const existing = await prisma_1.prisma.kycRequest.findUnique({
            where: { public_id: publicId },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: "KYC request not found" });
            return;
        }
        const updated = await prisma_1.prisma.kycRequest.update({
            where: { id: existing.id },
            data: {
                status: parsedStatus,
                reviewed_at: new Date(),
                reviewed_by_id: access.user.id,
                rejection_reason: parsedStatus === "REJECTED" && typeof body.rejectionReason === "string"
                    ? body.rejectionReason.trim()
                    : null,
            },
        });
        await writeAudit(access.user.id, parsedStatus === "APPROVED" ? "approve_kyc" : "reject_kyc", publicId, "kyc_request", `KYC status changed to ${parsedStatus}`, req);
        res.json({
            success: true,
            status: updated.status.toLowerCase(),
        });
    }
    catch (error) {
        console.error("Error updating KYC request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
function buildAutoFlags(listing) {
    const flags = [];
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
adminRouter.get("/listings", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
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
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
        res.json(listings.map((listing) => ({
            id: listing.public_id,
            title: listing.title,
            sellerId: listing.seller.public_id,
            sellerName: listing.seller.name,
            status: (0, format_1.toAdminListingStatus)(listing.moderation_status),
            createdAt: listing.created_at,
            category: listing.category_name,
            price: listing.price,
            complaintsCount: listing._count.complaints,
            autoFlags: buildAutoFlags({
                description: listing.description,
                seller: listing.seller,
                complaints_count: listing._count.complaints,
            }),
        })));
    }
    catch (error) {
        console.error("Error fetching listings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/listings/:publicId/moderation", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const parsedStatus = parseModerationStatus(body.status);
        if (!parsedStatus) {
            res.status(400).json({ error: "Некорректный статус модерации" });
            return;
        }
        const existing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: publicId },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        const nextListingStatus = parsedStatus === "APPROVED"
            ? "ACTIVE"
            : parsedStatus === "REJECTED"
                ? "INACTIVE"
                : "MODERATION";
        const updated = await prisma_1.prisma.marketplaceListing.update({
            where: { id: existing.id },
            data: {
                moderation_status: parsedStatus,
                status: nextListingStatus,
            },
        });
        await writeAudit(access.user.id, parsedStatus === "APPROVED" ? "approve_listing" : "reject_listing", publicId, "listing", `Listing moderation changed to ${parsedStatus}`, req);
        res.json({
            success: true,
            status: (0, format_1.toAdminListingStatus)(updated.moderation_status),
        });
    }
    catch (error) {
        console.error("Error moderating listing:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/users", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const users = await prisma_1.prisma.appUser.findMany({
            include: {
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
        res.json(users.map((user) => ({
            id: user.public_id,
            name: user.name,
            email: user.email,
            role: (0, format_1.toClientRole)(user.role),
            status: user.status.toLowerCase(),
            joinedAt: user.joined_at,
            city: user.city,
            phone: user.phone,
            blockReason: user.block_reason,
            buyerOrders: user.orders_as_buyer.length,
            sellerOrders: user.orders_as_seller.length,
            buyerSpent: user.orders_as_buyer.reduce((sum, order) => sum + order.total_price, 0),
            sellerRevenue: user.orders_as_seller.reduce((sum, order) => sum + order.total_price, 0),
        })));
    }
    catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/users/:publicId/status", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const parsedStatus = parseUserStatus(body.status);
        if (!parsedStatus) {
            res.status(400).json({ error: "Некорректный статус пользователя" });
            return;
        }
        const existing = await prisma_1.prisma.appUser.findUnique({
            where: { public_id: publicId },
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
        const updated = await prisma_1.prisma.appUser.update({
            where: { id: existing.id },
            data: {
                status: parsedStatus,
                block_reason: parsedStatus === "BLOCKED" && typeof body.blockReason === "string"
                    ? body.blockReason.trim()
                    : null,
            },
        });
        await writeAudit(access.user.id, parsedStatus === "BLOCKED" ? "block_user" : "unblock_user", publicId, "user", `User status changed to ${parsedStatus}`, req);
        res.json({
            success: true,
            status: updated.status.toLowerCase(),
        });
    }
    catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/commission-tiers", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const tiers = await prisma_1.prisma.commissionTier.findMany({
            orderBy: [{ min_sales: "asc" }, { id: "asc" }],
        });
        res.json(tiers.map((tier) => ({
            id: tier.public_id,
            name: tier.name,
            minSales: tier.min_sales,
            maxSales: tier.max_sales,
            commissionRate: tier.commission_rate,
            description: tier.description,
            sellersCount: tier.sellers_count,
        })));
    }
    catch (error) {
        console.error("Error fetching commission tiers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/commission-tiers/:publicId", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const existing = await prisma_1.prisma.commissionTier.findUnique({
            where: { public_id: publicId },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Tier not found" });
            return;
        }
        const updated = await prisma_1.prisma.commissionTier.update({
            where: { id: existing.id },
            data: {
                name: typeof body.name === "string" ? body.name.trim() : undefined,
                min_sales: body.minSales === undefined ? undefined : Math.max(0, Number(body.minSales)),
                max_sales: body.maxSales === undefined
                    ? undefined
                    : body.maxSales === null
                        ? null
                        : Math.max(0, Number(body.maxSales)),
                commission_rate: body.commissionRate === undefined ? undefined : Number(body.commissionRate),
                description: typeof body.description === "string" ? body.description.trim() : undefined,
                sellers_count: body.sellersCount === undefined ? undefined : Math.max(0, Number(body.sellersCount)),
            },
        });
        await writeAudit(access.user.id, "update_commission_tier", publicId, "commission_tier", `Commission tier ${publicId} updated`, req);
        res.json({
            success: true,
            tier: {
                id: updated.public_id,
                name: updated.name,
                minSales: updated.min_sales,
                maxSales: updated.max_sales,
                commissionRate: updated.commission_rate,
                description: updated.description,
                sellersCount: updated.sellers_count,
            },
        });
    }
    catch (error) {
        console.error("Error updating commission tier:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/audit-logs", async (req, res) => {
    try {
        const access = await requireAdmin(req, res);
        if (!access.ok)
            return;
        const logs = await prisma_1.prisma.auditLog.findMany({
            include: {
                admin: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        });
        res.json(logs.map((log) => ({
            id: log.public_id,
            timestamp: log.timestamp,
            admin: log.admin.name,
            action: log.action,
            targetId: log.target_id,
            targetType: log.target_type,
            details: log.details,
            ipAddress: log.ip_address,
        })));
    }
    catch (error) {
        console.error("Error fetching audit logs:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=admin.routes.js.map