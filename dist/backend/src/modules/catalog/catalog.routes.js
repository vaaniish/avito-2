"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const catalogRouter = (0, express_1.Router)();
exports.catalogRouter = catalogRouter;
function resolveListingType(rawType) {
    if (rawType === "services")
        return "SERVICE";
    return "PRODUCT";
}
function parseJsonArray(value) {
    if (!value)
        return undefined;
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
            return parsed;
        }
    }
    catch (_error) {
        return undefined;
    }
    return undefined;
}
function parseJsonObject(value) {
    if (!value)
        return undefined;
    try {
        const parsed = JSON.parse(value);
        const entries = Object.entries(parsed).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "string");
        return Object.fromEntries(entries);
    }
    catch (_error) {
        return undefined;
    }
}
catalogRouter.get("/categories", async (req, res) => {
    try {
        const type = resolveListingType(req.query.type);
        const categories = await prisma_1.prisma.catalogCategory.findMany({
            where: { type },
            include: {
                subcategories: {
                    orderBy: { order_index: "asc" },
                    include: {
                        items: {
                            orderBy: { order_index: "asc" },
                        },
                    },
                },
            },
            orderBy: { order_index: "asc" },
        });
        res.json(categories.map((category) => ({
            id: category.public_id,
            name: category.name,
            icon_key: category.icon_key,
            subcategories: category.subcategories.map((subcategory) => ({
                id: subcategory.public_id,
                name: subcategory.name,
                items: subcategory.items.map((item) => item.name),
            })),
        })));
    }
    catch (error) {
        console.error("Error fetching categories:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.get("/listings", async (req, res) => {
    try {
        const type = resolveListingType(req.query.type);
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
            where: {
                type,
                moderation_status: "APPROVED",
            },
            include: {
                seller: true,
                reviews: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
        res.json(listings.map((listing) => ({
            id: listing.public_id,
            title: listing.title,
            price: listing.price,
            salePrice: listing.sale_price,
            image: listing.image,
            images: parseJsonArray(listing.images),
            rating: listing.rating,
            seller: listing.seller.name,
            sellerAvatar: listing.seller.avatar,
            category: listing.category_name,
            sku: listing.sku,
            isNew: listing.is_new,
            isSale: listing.is_sale,
            isVerified: listing.is_verified,
            description: listing.description,
            shippingBySeller: listing.shipping_by_seller,
            city: listing.city,
            publishDate: listing.publish_date,
            views: listing.views,
            sellerResponseTime: listing.seller_response_time,
            sellerListings: listing.seller_listings,
            breadcrumbs: parseJsonArray(listing.breadcrumbs),
            specifications: parseJsonObject(listing.specifications),
            isPriceLower: listing.is_price_lower,
            condition: (0, format_1.toClientCondition)(listing.condition),
            reviews: listing.reviews.map((review) => ({
                id: String(review.id),
                author: review.author_name,
                rating: review.rating,
                date: review.date,
                comment: review.comment,
                avatar: review.avatar,
            })),
        })));
    }
    catch (error) {
        console.error("Error fetching listings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.get("/cities", async (_req, res) => {
    try {
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
            where: {
                moderation_status: "APPROVED",
            },
            select: {
                city: true,
            },
            distinct: ["city"],
        });
        res.json(listings
            .map((listing) => listing.city)
            .filter((city, index, list) => city && list.indexOf(city) === index)
            .sort((left, right) => left.localeCompare(right, "ru-RU")));
    }
    catch (error) {
        console.error("Error fetching cities:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.get("/suggestions", async (req, res) => {
    try {
        const query = String(req.query.q ?? "").trim();
        if (query.length < 2) {
            res.json([]);
            return;
        }
        const normalized = query.toLowerCase();
        const [listings, categories] = await Promise.all([
            prisma_1.prisma.marketplaceListing.findMany({
                where: { moderation_status: "APPROVED" },
                select: {
                    public_id: true,
                    title: true,
                    type: true,
                    category_name: true,
                },
            }),
            prisma_1.prisma.catalogCategory.findMany({
                include: {
                    subcategories: {
                        include: { items: true },
                    },
                },
            }),
        ]);
        const suggestions = [];
        for (const listing of listings) {
            if (!listing.title.toLowerCase().includes(normalized))
                continue;
            suggestions.push({
                type: listing.type === "SERVICE" ? "service" : "product",
                title: listing.title,
                subtitle: listing.category_name,
                query: listing.title,
            });
        }
        for (const category of categories) {
            if (category.name.toLowerCase().includes(normalized)) {
                suggestions.push({
                    type: "category",
                    title: category.name,
                    subtitle: "Категория",
                    query: category.name,
                });
            }
            for (const subcategory of category.subcategories) {
                if (subcategory.name.toLowerCase().includes(normalized)) {
                    suggestions.push({
                        type: "category",
                        title: subcategory.name,
                        subtitle: category.name,
                        query: subcategory.name,
                    });
                }
                for (const item of subcategory.items) {
                    if (!item.name.toLowerCase().includes(normalized))
                        continue;
                    suggestions.push({
                        type: "category",
                        title: item.name,
                        subtitle: subcategory.name,
                        query: item.name,
                    });
                }
            }
        }
        const deduped = suggestions
            .sort((left, right) => {
            const leftStarts = left.title.toLowerCase().startsWith(normalized);
            const rightStarts = right.title.toLowerCase().startsWith(normalized);
            if (leftStarts === rightStarts)
                return 0;
            return leftStarts ? -1 : 1;
        })
            .filter((item, index, list) => index === list.findIndex((candidate) => candidate.title.toLowerCase() === item.title.toLowerCase()))
            .slice(0, 7);
        res.json(deduped);
    }
    catch (error) {
        console.error("Error fetching suggestions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.get("/listings/:publicId/questions", async (req, res) => {
    try {
        const { publicId } = req.params;
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: publicId },
            select: { id: true, seller: { select: { name: true } } },
        });
        if (!listing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        const questions = await prisma_1.prisma.listingQuestion.findMany({
            where: { listing_id: listing.id },
            include: {
                buyer: {
                    select: { name: true },
                },
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
        res.json(questions.map((question) => ({
            id: question.public_id,
            user: question.buyer.name,
            date: question.created_at,
            question: question.question,
            answer: question.answer,
            answerDate: question.answered_at,
            helpful: 0,
        })));
    }
    catch (error) {
        console.error("Error fetching listing questions:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.post("/listings/:publicId/questions", async (req, res) => {
    try {
        const { publicId } = req.params;
        const body = (req.body ?? {});
        const questionText = typeof body.question === "string" ? body.question.trim() : "";
        if (questionText.length < 3) {
            res.status(400).json({ error: "Question is too short" });
            return;
        }
        const sessionUser = await (0, session_1.getSessionUser)(req);
        if (!sessionUser) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: publicId },
            select: { id: true },
        });
        if (!listing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        const created = await prisma_1.prisma.listingQuestion.create({
            data: {
                public_id: `Q-${Date.now()}`,
                listing_id: listing.id,
                buyer_id: sessionUser.id,
                question: questionText,
                status: "PENDING",
            },
            include: {
                buyer: {
                    select: { name: true },
                },
            },
        });
        res.status(201).json({
            id: created.public_id,
            user: created.buyer.name,
            date: created.created_at,
            question: created.question,
            answer: created.answer,
            answerDate: created.answered_at,
            helpful: 0,
        });
    }
    catch (error) {
        console.error("Error creating listing question:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=catalog.routes.js.map