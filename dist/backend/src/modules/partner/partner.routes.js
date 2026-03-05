"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.partnerRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const partnerRouter = (0, express_1.Router)();
exports.partnerRouter = partnerRouter;
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const LISTING_ACTIVE = "ACTIVE";
const LISTING_INACTIVE = "INACTIVE";
const LISTING_MODERATION = "MODERATION";
const FALLBACK_LISTING_IMAGE = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
function parseListingType(value) {
    return value === "services" ? "SERVICE" : "PRODUCT";
}
function toDeliveryType(value) {
    return value === "PICKUP" ? "pickup" : "delivery";
}
function parseCondition(value) {
    return value === "used" ? "USED" : "NEW";
}
function parseOrderStatus(value) {
    const raw = typeof value === "string" ? value.toUpperCase() : "";
    const allowed = [
        "CREATED",
        "PAID",
        "PREPARED",
        "SHIPPED",
        "DELIVERED",
        "COMPLETED",
        "CANCELLED",
    ];
    if (allowed.includes(raw)) {
        return raw;
    }
    return null;
}
function makePublicId(prefix) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
function normalizeCategory(category) {
    const normalized = category.trim();
    return normalized || "Без категории";
}
async function getOrCreateFallbackItem(type, itemName) {
    const fallbackCategoryName = type === "SERVICE" ? "Услуги" : "Товары";
    const fallbackCategoryPublicId = type === "SERVICE" ? "service-fallback" : "product-fallback";
    const fallbackSubcategoryPublicId = type === "SERVICE" ? "service-fallback-other" : "product-fallback-other";
    let category = await prisma_1.prisma.catalogCategory.findFirst({
        where: {
            type,
            name: fallbackCategoryName,
        },
    });
    if (!category) {
        category = await prisma_1.prisma.catalogCategory.create({
            data: {
                public_id: fallbackCategoryPublicId,
                type,
                name: fallbackCategoryName,
                icon_key: "box",
                order_index: 9999,
            },
        });
    }
    let subcategory = await prisma_1.prisma.catalogSubcategory.findFirst({
        where: {
            category_id: category.id,
            name: "Другое",
        },
    });
    if (!subcategory) {
        subcategory = await prisma_1.prisma.catalogSubcategory.create({
            data: {
                category_id: category.id,
                public_id: fallbackSubcategoryPublicId,
                name: "Другое",
                order_index: 9999,
            },
        });
    }
    const item = await prisma_1.prisma.catalogItem.create({
        data: {
            subcategory_id: subcategory.id,
            public_id: makePublicId("ITM"),
            name: itemName,
            order_index: 9999,
        },
    });
    return item.id;
}
async function resolveCatalogItemId(type, rawCategory) {
    const categoryName = normalizeCategory(rawCategory);
    if (!categoryName || categoryName === "Без категории")
        return null;
    const existing = await prisma_1.prisma.catalogItem.findFirst({
        where: {
            name: {
                equals: categoryName,
                mode: "insensitive",
            },
            subcategory: {
                category: {
                    type,
                },
            },
        },
        select: { id: true },
    });
    if (existing) {
        return existing.id;
    }
    return getOrCreateFallbackItem(type, categoryName);
}
function listingImageUrl(images) {
    return images[0]?.url ?? FALLBACK_LISTING_IMAGE;
}
partnerRouter.get("/listings", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const type = parseListingType(req.query.type);
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
            where: {
                seller_id: session.user.id,
                type,
            },
            include: {
                item: true,
                images: {
                    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                },
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
        res.json(listings.map((listing) => ({
            id: listing.public_id,
            title: listing.title,
            price: listing.price,
            condition: (0, format_1.toClientCondition)(listing.condition),
            status: (0, format_1.toPartnerListingStatus)(listing.status),
            views: listing.views,
            created_at: listing.created_at,
            image: listingImageUrl(listing.images),
            description: listing.description,
            category: listing.item?.name ?? "Без категории",
        })));
    }
    catch (error) {
        console.error("Error fetching partner listings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.post("/listings", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const body = (req.body ?? {});
        const title = typeof body.title === "string" ? body.title.trim() : "";
        const price = Number(body.price ?? 0);
        const condition = parseCondition(body.condition);
        const description = typeof body.description === "string" ? body.description.trim() : "";
        const category = typeof body.category === "string" ? body.category.trim() : "Без категории";
        const image = typeof body.image === "string" ? body.image.trim() : "";
        const type = parseListingType(body.type);
        const cityId = typeof body.cityId === "number" ? body.cityId : undefined;
        if (!title || !Number.isFinite(price) || price <= 0 || cityId === undefined) {
            res.status(400).json({ error: "Укажите корректные title, price и city" });
            return;
        }
        const itemId = await resolveCatalogItemId(type, category);
        const lastListing = await prisma_1.prisma.marketplaceListing.findFirst({
            orderBy: { id: 'desc' },
            select: { public_id: true }
        });
        const currentMaxId = lastListing ? parseInt(lastListing.public_id.replace('LST-', '')) : 0;
        const publicId = `LST-${String(currentMaxId + 1).padStart(4, "0")}`;
        const imageUrl = image || FALLBACK_LISTING_IMAGE;
        const created = await prisma_1.prisma.$transaction(async (tx) => {
            const listing = await tx.marketplaceListing.create({
                data: {
                    public_id: publicId,
                    seller_id: session.user.id,
                    type,
                    title,
                    description: description || null,
                    item_id: itemId,
                    price: Math.round(price),
                    condition,
                    status: LISTING_MODERATION,
                    moderation_status: "PENDING",
                    city_id: cityId,
                },
            });
            await tx.listingImage.create({
                data: {
                    listing_id: listing.id,
                    url: imageUrl,
                    sort_order: 0,
                },
            });
            return listing;
        });
        res.status(201).json({
            id: created.public_id,
            title: created.title,
            price: created.price,
            condition: (0, format_1.toClientCondition)(created.condition),
            status: (0, format_1.toPartnerListingStatus)(created.status),
            views: created.views,
            created_at: created.created_at,
            image: imageUrl,
            description: created.description,
            category: normalizeCategory(category),
        });
    }
    catch (error) {
        console.error("Error creating listing:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.patch("/listings/:publicId", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { publicId } = req.params;
        const existing = await prisma_1.prisma.marketplaceListing.findFirst({
            where: {
                public_id: String(publicId),
                seller_id: session.user.id,
            },
            include: {
                item: true,
                images: {
                    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                },
                city: true,
            },
        });
        if (!existing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        const body = (req.body ?? {});
        const price = body.price === undefined ? undefined : Number(body.price);
        if (price !== undefined && (!Number.isFinite(price) || price <= 0)) {
            res.status(400).json({ error: "Некорректная цена" });
            return;
        }
        const nextCategory = typeof body.category === "string" ? body.category.trim() : undefined;
        const nextItemId = nextCategory === undefined
            ? undefined
            : await resolveCatalogItemId(existing.type, nextCategory);
        const nextImage = typeof body.image === "string" ? body.image.trim() : undefined;
        const updated = await prisma_1.prisma.$transaction(async (tx) => {
            const listing = await tx.marketplaceListing.update({
                where: { id: existing.id },
                data: {
                    title: typeof body.title === "string" ? body.title.trim() : undefined,
                    price: price === undefined ? undefined : Math.round(price),
                    condition: body.condition === undefined
                        ? undefined
                        : parseCondition(body.condition),
                    description: typeof body.description === "string"
                        ? body.description.trim()
                        : undefined,
                    item_id: nextItemId,
                    city_id: typeof body.cityId === "number" ? body.cityId : undefined,
                    status: LISTING_MODERATION,
                    moderation_status: "PENDING",
                },
            });
            if (nextImage !== undefined) {
                const normalizedImage = nextImage || FALLBACK_LISTING_IMAGE;
                const primaryImage = existing.images[0];
                if (primaryImage) {
                    await tx.listingImage.update({
                        where: { id: primaryImage.id },
                        data: {
                            url: normalizedImage,
                        },
                    });
                }
                else {
                    await tx.listingImage.create({
                        data: {
                            listing_id: listing.id,
                            url: normalizedImage,
                            sort_order: 0,
                        },
                    });
                }
            }
            return listing;
        });
        const reloaded = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { id: updated.id },
            include: {
                item: true,
                images: {
                    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                },
                city: true,
            },
        });
        if (!reloaded) {
            res.status(404).json({ error: "Listing not found after update" });
            return;
        }
        res.json({
            id: reloaded.public_id,
            title: reloaded.title,
            price: reloaded.price,
            condition: (0, format_1.toClientCondition)(reloaded.condition),
            status: (0, format_1.toPartnerListingStatus)(reloaded.status),
            views: reloaded.views,
            created_at: reloaded.created_at,
            image: listingImageUrl(reloaded.images),
            description: reloaded.description,
            category: reloaded.item?.name ?? "Без категории",
            city: reloaded.city?.name ?? null,
        });
    }
    catch (error) {
        console.error("Error updating listing:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.post("/listings/:publicId/toggle-status", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { publicId } = req.params;
        const existing = await prisma_1.prisma.marketplaceListing.findFirst({
            where: {
                public_id: String(publicId),
                seller_id: session.user.id,
            },
        });
        if (!existing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        let nextStatus = existing.status;
        if (existing.status === LISTING_ACTIVE) {
            nextStatus = LISTING_INACTIVE;
        }
        else if (existing.status === LISTING_INACTIVE) {
            nextStatus = LISTING_MODERATION;
        }
        const updated = await prisma_1.prisma.marketplaceListing.update({
            where: { id: existing.id },
            data: {
                status: nextStatus,
                moderation_status: nextStatus === LISTING_MODERATION
                    ? "PENDING"
                    : existing.moderation_status,
            },
        });
        res.json({
            success: true,
            status: (0, format_1.toPartnerListingStatus)(updated.status),
        });
    }
    catch (error) {
        console.error("Error toggling listing status:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.delete("/listings/:publicId", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { publicId } = req.params;
        const existing = await prisma_1.prisma.marketplaceListing.findFirst({
            where: {
                public_id: String(publicId),
                seller_id: session.user.id,
            },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        await prisma_1.prisma.marketplaceListing.delete({
            where: { id: existing.id },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error deleting listing:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.get("/orders", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const orders = await prisma_1.prisma.marketOrder.findMany({
            where: {
                seller_id: session.user.id,
            },
            include: {
                buyer: {
                    select: {
                        public_id: true,
                        name: true,
                    },
                },
                items: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
        res.json(orders.map((order) => ({
            id: order.public_id,
            buyer_name: order.buyer.name,
            buyer_id: order.buyer.public_id,
            total_price: order.total_price,
            status: order.status,
            delivery_type: toDeliveryType(order.delivery_type),
            created_at: order.created_at,
            items: order.items.map((item) => ({
                id: String(item.id),
                name: item.name,
                quantity: item.quantity,
                price: item.price,
            })),
        })));
    }
    catch (error) {
        console.error("Error fetching partner orders:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.patch("/orders/:publicId/status", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const nextStatus = parseOrderStatus(body.status);
        if (!nextStatus) {
            res.status(400).json({ error: "Некорректный статус заказа" });
            return;
        }
        const existing = await prisma_1.prisma.marketOrder.findFirst({
            where: {
                public_id: String(publicId),
                seller_id: session.user.id,
            },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Order not found" });
            return;
        }
        const updated = await prisma_1.prisma.marketOrder.update({
            where: { id: existing.id },
            data: { status: nextStatus },
        });
        res.json({
            success: true,
            status: updated.status,
        });
    }
    catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.get("/questions", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const questions = await prisma_1.prisma.listingQuestion.findMany({
            where: {
                listing: {
                    seller_id: session.user.id,
                },
            },
            include: {
                listing: {
                    select: {
                        public_id: true,
                        title: true,
                    },
                },
                buyer: {
                    select: {
                        public_id: true,
                        name: true,
                    },
                },
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
        res.json(questions.map((question) => ({
            id: question.public_id,
            listingId: question.listing.public_id,
            listingTitle: question.listing.title,
            buyerName: question.buyer.name,
            buyerId: question.buyer.public_id,
            question: question.question,
            answer: question.answer,
            status: (0, format_1.toQuestionStatus)(question.status),
            createdAt: question.created_at,
            answeredAt: question.answered_at,
        })));
    }
    catch (error) {
        console.error("Error fetching questions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
partnerRouter.post("/questions/:publicId/answer", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const answer = typeof body.answer === "string" ? body.answer.trim() : "";
        if (!answer) {
            res.status(400).json({ error: "Ответ не может быть пустым" });
            return;
        }
        const existing = await prisma_1.prisma.listingQuestion.findFirst({
            where: {
                public_id: String(publicId),
                listing: {
                    seller_id: session.user.id,
                },
            },
            select: { id: true },
        });
        if (!existing) {
            res.status(404).json({ error: "Question not found" });
            return;
        }
        const updated = await prisma_1.prisma.listingQuestion.update({
            where: { id: existing.id },
            data: {
                answer,
                status: "ANSWERED",
                answered_at: new Date(),
            },
        });
        res.json({
            success: true,
            id: updated.public_id,
            answer: updated.answer,
            answeredAt: updated.answered_at,
            status: (0, format_1.toQuestionStatus)(updated.status),
        });
    }
    catch (error) {
        console.error("Error answering question:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=partner.routes.js.map