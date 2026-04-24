"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const format_1 = require("../../utils/format");
const complaint_sanctions_1 = require("./complaint-sanctions");
const admin_complaints_routes_1 = require("./admin.complaints.routes");
const admin_shared_1 = require("./admin.shared");
const adminRouter = (0, express_1.Router)();
exports.adminRouter = adminRouter;
const AUDIT_ENTITY_TYPES = [
    "complaint",
    "kyc_request",
    "partnership_request",
    "listing",
    "user",
    "seller_payout_profile",
    "commission_tier",
    "moderation",
];
const AUDIT_ACTIONS = [
    "complaint.status_changed",
    "kyc.status_changed",
    "partnership_request.status_changed",
    "seller.payout_profile.status_changed",
    "listing.moderation_changed",
    "user.status_changed",
    "commission_tier.rate_changed",
    "anti_circumvention.violation_detected",
    "anti_circumvention.sanction_applied",
];
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
function parsePartnershipStatus(status) {
    if (status === "approved")
        return "APPROVED";
    if (status === "rejected")
        return "REJECTED";
    if (status === "pending")
        return "PENDING";
    return null;
}
function parsePayoutStatus(status) {
    if (status === "verified")
        return "VERIFIED";
    if (status === "rejected")
        return "REJECTED";
    if (status === "pending")
        return "PENDING";
    return null;
}
function parseAuditAction(value) {
    if (typeof value !== "string")
        return undefined;
    return AUDIT_ACTIONS.find((action) => action === value);
}
function parseAuditEntityType(value) {
    if (typeof value !== "string")
        return undefined;
    return AUDIT_ENTITY_TYPES.find((entity) => entity === value);
}
function buildAutoFlags(listing) {
    const flags = [];
    const joinedDays = Math.floor((Date.now() - listing.seller.joined_at.getTime()) / (1000 * 60 * 60 * 24));
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
    if ((listing.description ?? "").length > 200 &&
        /(!!!|\bcheap\b|\burgent\b)/i.test(listing.description ?? "")) {
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
async function hasBlockingOrderForListing(listingId) {
    const linkedOrderItem = await prisma_1.prisma.marketOrderItem.findFirst({
        where: {
            listing_id: listingId,
            order: {
                status: {
                    not: "CANCELLED",
                },
            },
        },
        select: { id: true },
    });
    return Boolean(linkedOrderItem);
}
function splitEvidenceFiles(value) {
    if (!value)
        return [];
    return value
        .split(/[,\n;|]/g)
        .map((item) => item.trim())
        .filter(Boolean);
}
function toSearchText(input) {
    if (input === null || input === undefined)
        return "";
    if (typeof input === "string")
        return input.toLowerCase();
    if (typeof input === "number" || typeof input === "boolean") {
        return String(input).toLowerCase();
    }
    if (input instanceof Date)
        return input.toISOString().toLowerCase();
    if (Array.isArray(input)) {
        return input.map((item) => toSearchText(item)).join(" ");
    }
    if (typeof input === "object") {
        return Object.values(input)
            .map((value) => toSearchText(value))
            .join(" ");
    }
    return "";
}
function matchesFullText(input, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized)
        return true;
    return toSearchText(input).includes(normalized);
}
function buildKycEvaluation(params) {
    const checklist = [
        { key: "documents_attached", passed: params.documentsCount > 0 },
        { key: "inn_provided", passed: params.hasInn },
        { key: "address_provided", passed: params.hasAddress },
        { key: "seller_not_blocked", passed: params.sellerStatus !== "BLOCKED" },
    ];
    const completenessScore = Math.round((checklist.filter((item) => item.passed).length / checklist.length) * 100);
    const riskPoints = (params.sellerStatus === "BLOCKED" ? 40 : 0) +
        (params.sellerComplaintsCount >= 5
            ? 35
            : params.sellerComplaintsCount >= 2
                ? 20
                : 5) +
        (params.documentsCount === 0 ? 35 : params.documentsCount < 2 ? 15 : 0);
    const riskLevel = riskPoints >= 65 ? "high" : riskPoints >= 35 ? "medium" : "low";
    const recommendation = riskLevel === "high"
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
adminRouter.get("/transactions", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const transactions = await prisma_1.prisma.platformTransaction.findMany({
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
        res.json(transactions.map((transaction) => ({
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
                .filter((item) => Boolean(item)),
            itemsCount: transaction.order.items.length,
            itemsTotalQuantity: transaction.order.items.reduce((sum, item) => sum + item.quantity, 0),
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
        })));
    }
    catch (error) {
        console.error("Error fetching transactions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/audit-logs", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const action = parseAuditAction(req.query.action);
        const entityType = parseAuditEntityType(req.query.entityType);
        const limit = (0, admin_shared_1.parseLimit)(req.query.limit, 200);
        const where = {};
        if (action) {
            where.action = action;
        }
        if (entityType) {
            where.entity_type = entityType;
        }
        const fetchedLogs = await prisma_1.prisma.auditLog.findMany({
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
            ? fetchedLogs.filter((log) => matchesFullText({
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
            }, normalizedQuery))
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
    }
    catch (error) {
        console.error("Error fetching audit logs:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.use("/", admin_complaints_routes_1.complaintsRouter);
adminRouter.get("/partnership-requests", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const requests = await prisma_1.prisma.partnershipRequest.findMany({
            include: {
                user: {
                    select: {
                        public_id: true,
                        role: true,
                        status: true,
                        email: true,
                        name: true,
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
        res.json(requests.map((requestItem) => ({
            id: requestItem.public_id,
            status: requestItem.status.toLowerCase(),
            sellerType: requestItem.seller_type,
            name: requestItem.name,
            email: requestItem.email,
            contact: requestItem.contact,
            link: requestItem.link,
            category: requestItem.category,
            inn: requestItem.inn,
            geography: requestItem.geography,
            socialProfile: requestItem.social_profile,
            credibility: requestItem.credibility,
            whyUs: requestItem.why_us,
            createdAt: requestItem.created_at,
            reviewedAt: requestItem.reviewed_at,
            rejectionReason: requestItem.rejection_reason,
            adminNote: requestItem.admin_note,
            applicant: {
                id: requestItem.user.public_id,
                role: requestItem.user.role.toLowerCase(),
                status: requestItem.user.status.toLowerCase(),
                email: requestItem.user.email,
                name: requestItem.user.name,
            },
            reviewedBy: requestItem.reviewed_by
                ? {
                    id: requestItem.reviewed_by.public_id,
                    name: requestItem.reviewed_by.name,
                    email: requestItem.reviewed_by.email,
                }
                : null,
        })));
    }
    catch (error) {
        console.error("Error fetching partnership requests:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/partnership-requests/:publicId", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const nextStatus = parsePartnershipStatus(body.status);
        if (!nextStatus) {
            res.status(400).json({ error: "Invalid partnership request status" });
            return;
        }
        const existing = await prisma_1.prisma.partnershipRequest.findUnique({
            where: { public_id: String(publicId) },
            select: {
                id: true,
                status: true,
                user_id: true,
                rejection_reason: true,
                admin_note: true,
            },
        });
        if (!existing) {
            res.status(404).json({ error: "Partnership request not found" });
            return;
        }
        const rejectionReason = nextStatus === "REJECTED" && typeof body.rejectionReason === "string"
            ? body.rejectionReason.trim()
            : null;
        const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim() : null;
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const next = await tx.partnershipRequest.update({
                where: { id: existing.id },
                data: {
                    status: nextStatus,
                    reviewed_by_id: access.user.id,
                    reviewed_at: new Date(),
                    rejection_reason: rejectionReason,
                    admin_note: adminNote,
                },
            });
            if (nextStatus === "APPROVED") {
                await tx.appUser.update({
                    where: { id: existing.user_id },
                    data: {
                        role: "SELLER",
                        status: "ACTIVE",
                    },
                });
                await tx.sellerProfile.upsert({
                    where: { user_id: existing.user_id },
                    create: {
                        user_id: existing.user_id,
                        is_verified: false,
                    },
                    update: {},
                });
            }
            return next;
        });
        await (0, admin_shared_1.writeAudit)({
            req,
            actorUserId: access.user.id,
            action: "partnership_request.status_changed",
            entityType: "partnership_request",
            entityPublicId: String(publicId),
            details: {
                beforeStatus: existing.status,
                afterStatus: updated.status,
                beforeRejectionReason: existing.rejection_reason,
                afterRejectionReason: updated.rejection_reason,
                beforeAdminNote: existing.admin_note,
                afterAdminNote: updated.admin_note,
            },
        });
        res.json({
            success: true,
            status: updated.status.toLowerCase(),
        });
    }
    catch (error) {
        console.error("Error updating partnership request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/kyc-requests", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const requests = await prisma_1.prisma.kycRequest.findMany({
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
        res.json(requests.map((requestItem) => ({
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
            sellerResponseMinutes: requestItem.seller.seller_profile?.average_response_minutes ?? null,
            sellerCommissionTier: requestItem.seller.seller_profile?.commission_tier
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
        })));
    }
    catch (error) {
        console.error("Error fetching KYC requests:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/kyc-requests/:publicId", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const parsedStatus = parseKycStatus(body.status);
        if (!parsedStatus) {
            res.status(400).json({ error: "Invalid KYC status" });
            return;
        }
        const existing = await prisma_1.prisma.kycRequest.findUnique({
            where: { public_id: String(publicId) },
            select: { id: true, status: true, rejection_reason: true },
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
        await (0, admin_shared_1.writeAudit)({
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
    }
    catch (error) {
        console.error("Error updating KYC request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/payout-profiles", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const profiles = await prisma_1.prisma.sellerPayoutProfile.findMany({
            include: {
                seller: {
                    select: {
                        public_id: true,
                        name: true,
                        email: true,
                        status: true,
                    },
                },
                verified_by: {
                    select: {
                        public_id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        });
        res.json(profiles.map((profile) => ({
            id: profile.public_id,
            status: profile.status.toLowerCase(),
            legalType: profile.legal_type,
            legalName: profile.legal_name,
            taxId: profile.tax_id,
            bankAccount: profile.bank_account,
            bankBic: profile.bank_bic,
            correspondentAccount: profile.correspondent_account,
            bankName: profile.bank_name,
            recipientName: profile.recipient_name,
            rejectionReason: profile.rejection_reason,
            verifiedAt: profile.verified_at,
            updatedAt: profile.updated_at,
            seller: {
                id: profile.seller.public_id,
                name: profile.seller.name,
                email: profile.seller.email,
                status: profile.seller.status.toLowerCase(),
            },
            verifiedBy: profile.verified_by
                ? {
                    id: profile.verified_by.public_id,
                    name: profile.verified_by.name,
                    email: profile.verified_by.email,
                }
                : null,
        })));
    }
    catch (error) {
        console.error("Error fetching payout profiles:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/payout-profiles/:publicId", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const nextStatus = parsePayoutStatus(body.status);
        if (!nextStatus) {
            res.status(400).json({ error: "Invalid payout profile status" });
            return;
        }
        const existing = await prisma_1.prisma.sellerPayoutProfile.findUnique({
            where: { public_id: String(publicId) },
            select: {
                id: true,
                status: true,
                rejection_reason: true,
            },
        });
        if (!existing) {
            res.status(404).json({ error: "Payout profile not found" });
            return;
        }
        const rejectionReason = nextStatus === "REJECTED" && typeof body.rejectionReason === "string"
            ? body.rejectionReason.trim()
            : null;
        const updated = await prisma_1.prisma.sellerPayoutProfile.update({
            where: { id: existing.id },
            data: {
                status: nextStatus,
                verified_by_id: nextStatus === "PENDING" ? null : access.user.id,
                verified_at: nextStatus === "PENDING" ? null : new Date(),
                rejection_reason: rejectionReason,
            },
        });
        await (0, admin_shared_1.writeAudit)({
            req,
            actorUserId: access.user.id,
            action: "seller.payout_profile.status_changed",
            entityType: "seller_payout_profile",
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
    }
    catch (error) {
        console.error("Error updating payout profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/listings", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
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
        res.json(listings.map((listing) => {
            const addressInfo = (0, admin_shared_1.extractPrimaryAddressInfo)(listing.seller.addresses);
            return {
                id: listing.public_id,
                listingUrl: (0, admin_shared_1.buildListingPublicUrl)(listing.public_id),
                title: listing.title,
                description: listing.description,
                sellerId: listing.seller.public_id,
                sellerName: listing.seller.name,
                sellerStatus: listing.seller.status.toLowerCase(),
                sellerJoinedAt: listing.seller.joined_at,
                status: (0, format_1.toAdminListingStatus)(listing.moderation_status),
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
            };
        }));
    }
    catch (error) {
        console.error("Error fetching listings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/listings/:publicId/moderation", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const parsedStatus = parseModerationStatus(body.status);
        if (!parsedStatus) {
            res.status(400).json({ error: "Invalid moderation status" });
            return;
        }
        const existing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: String(publicId) },
            select: { id: true, moderation_status: true, status: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        const activationBlockedByOrder = parsedStatus === "APPROVED" ? await hasBlockingOrderForListing(existing.id) : false;
        const nextListingStatus = parsedStatus === "APPROVED"
            ? activationBlockedByOrder
                ? "INACTIVE"
                : "ACTIVE"
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
        await (0, admin_shared_1.writeAudit)({
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
                activationBlockedByOrder,
            },
        });
        res.json({
            success: true,
            status: (0, format_1.toAdminListingStatus)(updated.moderation_status),
            listingStatus: updated.status.toLowerCase(),
            activationBlockedByOrder,
        });
    }
    catch (error) {
        console.error("Error moderating listing:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/users", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const users = await prisma_1.prisma.appUser.findMany({
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
        const [approvedViolationsRaw, sanctionsTotalRaw, activeSanctionsRaw, latestSanctionsRaw,] = await Promise.all([
            userIds.length > 0
                ? prisma_1.prisma.complaint.groupBy({
                    by: ["seller_id"],
                    where: {
                        seller_id: { in: userIds },
                        status: "APPROVED",
                    },
                    _count: { _all: true },
                })
                : Promise.resolve([]),
            userIds.length > 0
                ? prisma_1.prisma.complaintSanction.groupBy({
                    by: ["seller_id"],
                    where: {
                        seller_id: { in: userIds },
                    },
                    _count: { _all: true },
                })
                : Promise.resolve([]),
            userIds.length > 0
                ? prisma_1.prisma.complaintSanction.groupBy({
                    by: ["seller_id"],
                    where: {
                        seller_id: { in: userIds },
                        status: "ACTIVE",
                    },
                    _count: { _all: true },
                })
                : Promise.resolve([]),
            userIds.length > 0
                ? prisma_1.prisma.complaintSanction.findMany({
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
        const approvedViolationsByUser = new Map();
        for (const item of approvedViolationsRaw) {
            approvedViolationsByUser.set(item.seller_id, item._count._all);
        }
        const sanctionsTotalByUser = new Map();
        for (const item of sanctionsTotalRaw) {
            sanctionsTotalByUser.set(item.seller_id, item._count._all);
        }
        const activeSanctionsByUser = new Map();
        for (const item of activeSanctionsRaw) {
            activeSanctionsByUser.set(item.seller_id, item._count._all);
        }
        const latestSanctionByUser = new Map();
        for (const sanction of latestSanctionsRaw) {
            if (!latestSanctionByUser.has(sanction.seller_id)) {
                latestSanctionByUser.set(sanction.seller_id, sanction);
            }
        }
        res.json(users.map((user) => {
            const buyerSpent = user.orders_as_buyer.reduce((sum, order) => sum + order.total_price, 0);
            const sellerRevenue = user.orders_as_seller.reduce((sum, order) => sum + order.total_price, 0);
            const activeListings = user.listings.filter((listing) => listing.status === "ACTIVE" &&
                listing.moderation_status === "APPROVED").length;
            const pendingListings = user.listings.filter((listing) => listing.moderation_status === "PENDING").length;
            const lastBuyerOrderDate = user.orders_as_buyer[0]?.created_at ?? null;
            const lastSellerOrderDate = user.orders_as_seller[0]?.created_at ?? null;
            const kycLatest = user.kyc_requests[0] ?? null;
            const latestSanction = latestSanctionByUser.get(user.id) ?? null;
            return {
                id: user.public_id,
                name: user.name,
                email: user.email,
                role: (0, format_1.toClientRole)(user.role),
                status: user.status.toLowerCase(),
                joinedAt: user.joined_at,
                city: (0, admin_shared_1.extractPrimaryAddressInfo)(user.addresses).city || null,
                phone: user.phone,
                blockReason: user.block_reason,
                blockedUntil: user.blocked_until,
                buyerOrders: user.orders_as_buyer.length,
                sellerOrders: user.orders_as_seller.length,
                buyerSpent,
                sellerRevenue,
                avgBuyerCheck: user.orders_as_buyer.length > 0
                    ? Math.round(buyerSpent / user.orders_as_buyer.length)
                    : 0,
                avgSellerCheck: user.orders_as_seller.length > 0
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
                        level: (0, complaint_sanctions_1.toClientSanctionLevel)(latestSanction.level),
                        status: (0, admin_shared_1.toClientComplaintSanctionStatus)(latestSanction.status),
                        startsAt: latestSanction.starts_at,
                        endsAt: latestSanction.ends_at,
                        reason: latestSanction.reason,
                        createdAt: latestSanction.created_at,
                    }
                    : null,
                isSellerVerified: Boolean(user.seller_profile?.is_verified),
                sellerResponseMinutes: user.seller_profile?.average_response_minutes ?? null,
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
        }));
    }
    catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/users/:publicId/status", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const parsedStatus = parseUserStatus(body.status);
        if (!parsedStatus) {
            res.status(400).json({ error: "Invalid user status" });
            return;
        }
        const existing = await prisma_1.prisma.appUser.findUnique({
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
        const updated = await prisma_1.prisma.appUser.update({
            where: { id: existing.id },
            data: {
                status: parsedStatus,
                block_reason: parsedStatus === "BLOCKED" && typeof body.blockReason === "string"
                    ? body.blockReason.trim()
                    : null,
                blocked_until: null,
            },
        });
        await (0, admin_shared_1.writeAudit)({
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
    }
    catch (error) {
        console.error("Error updating user status:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.get("/commission-tiers", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const tiers = await prisma_1.prisma.commissionTier.findMany({
            include: {
                _count: {
                    select: {
                        seller_profiles: true,
                    },
                },
            },
            orderBy: [{ min_sales: "asc" }, { id: "asc" }],
        });
        res.json(tiers.map((tier) => ({
            id: tier.public_id,
            name: tier.name,
            minSales: tier.min_sales,
            maxSales: tier.max_sales,
            commissionRate: tier.commission_rate,
            description: tier.description,
            sellersCount: tier._count.seller_profiles,
        })));
    }
    catch (error) {
        console.error("Error fetching commission tiers:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
adminRouter.patch("/commission-tiers/:publicId", async (req, res) => {
    try {
        const access = await (0, admin_shared_1.requireAdmin)(req, res);
        if (!access.ok)
            return;
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const nextRate = Number(body.commissionRate);
        if (!Number.isFinite(nextRate) || nextRate <= 0 || nextRate > 100) {
            res.status(400).json({ error: "Invalid commission rate" });
            return;
        }
        const existing = await prisma_1.prisma.commissionTier.findUnique({
            where: { public_id: String(publicId) },
            select: { id: true, commission_rate: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Commission tier not found" });
            return;
        }
        const updated = await prisma_1.prisma.commissionTier.update({
            where: { id: existing.id },
            data: { commission_rate: nextRate },
        });
        await (0, admin_shared_1.writeAudit)({
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
    }
    catch (error) {
        console.error("Error updating commission tier:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=admin.routes.js.map