"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const catalogRouter = (0, express_1.Router)();
exports.catalogRouter = catalogRouter;
const FALLBACK_LISTING_IMAGE = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
function resolveListingType(rawType) {
    if (rawType === "services")
        return "SERVICE";
    return "PRODUCT";
}
function formatPublishDate(date) {
    const formatted = new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
    return formatted.replace(",", " в");
}
function formatResponseTime(minutes) {
    if (!minutes || minutes <= 0)
        return null;
    if (minutes < 60)
        return `около ${minutes} минут`;
    if (minutes < 120)
        return "около 1 часа";
    return `около ${Math.round(minutes / 60)} часов`;
}
function listingCategoryName(listing) {
    return listing.item?.name ?? "Без категории";
}
function listingBreadcrumbs(listing) {
    if (!listing.item)
        return ["Главная", "Без категории"];
    return [
        "Главная",
        listing.item.subcategory.category.name,
        listing.item.subcategory.name,
        listing.item.name,
    ];
}
function listingSpecifications(attributes) {
    if (!attributes.length)
        return undefined;
    const object = Object.fromEntries(attributes.map((attribute) => [
        attribute.key,
        attribute.value,
    ]));
    return Object.keys(object).length ? object : undefined;
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
                            orderBy: [{ order_index: "asc" }, { id: "asc" }],
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
                status: "ACTIVE",
                moderation_status: "APPROVED",
            },
            include: {
                city: true,
                seller: {
                    select: {
                        name: true,
                        avatar: true,
                        _count: {
                            select: {
                                listings: true,
                            },
                        },
                        seller_profile: {
                            select: {
                                is_verified: true,
                                average_response_minutes: true,
                            },
                        },
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
                images: {
                    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                },
                attributes: {
                    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                },
                reviews: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
        res.json(listings.map((listing) => {
            const primaryImage = listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE;
            const salePrice = listing.sale_price !== null && listing.sale_price < listing.price
                ? listing.sale_price
                : null;
            return {
                id: listing.public_id,
                title: listing.title,
                price: listing.price,
                salePrice,
                image: primaryImage,
                images: listing.images.map((image) => image.url),
                rating: listing.rating,
                seller: listing.seller.name,
                sellerAvatar: listing.seller.avatar,
                category: listingCategoryName(listing),
                sku: listing.sku,
                isNew: listing.condition === "NEW",
                isSale: salePrice !== null,
                isVerified: Boolean(listing.seller.seller_profile?.is_verified),
                description: listing.description,
                shippingBySeller: listing.shipping_by_seller,
                city: listing.city.name,
                publishDate: formatPublishDate(listing.created_at),
                views: listing.views,
                sellerResponseTime: formatResponseTime(listing.seller.seller_profile?.average_response_minutes),
                sellerListings: listing.seller._count.listings,
                breadcrumbs: listingBreadcrumbs(listing),
                specifications: listingSpecifications(listing.attributes),
                isPriceLower: salePrice !== null,
                condition: (0, format_1.toClientCondition)(listing.condition),
                reviews: listing.reviews.map((review) => ({
                    id: String(review.id),
                    author: review.author_name,
                    rating: review.rating,
                    date: review.date,
                    comment: review.comment,
                    avatar: review.avatar,
                })),
            };
        }));
    }
    catch (error) {
        console.error("Error fetching listings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.get("/cities", async (_req, res) => {
    try {
        const citiesFromListings = await prisma_1.prisma.marketplaceListing.findMany({
            where: {
                status: "ACTIVE",
                moderation_status: "APPROVED",
            },
            select: {
                city: {
                    select: { id: true, name: true, region: true, created_at: true, updated_at: true }
                },
            },
            distinct: ["city_id"],
        });
        const uniqueCities = [];
        const seenCityIds = new Set();
        for (const listing of citiesFromListings) {
            if (!seenCityIds.has(listing.city.id)) {
                uniqueCities.push(listing.city);
                seenCityIds.add(listing.city.id);
            }
        }
        res.json(uniqueCities
            .sort((left, right) => left.name.localeCompare(right.name, "ru-RU")));
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
                where: {
                    status: "ACTIVE",
                    moderation_status: "APPROVED",
                },
                select: {
                    title: true,
                    type: true,
                    item: {
                        select: {
                            name: true,
                            subcategory: {
                                select: {
                                    name: true,
                                    category: {
                                        select: {
                                            name: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            }),
            prisma_1.prisma.catalogCategory.findMany({
                include: {
                    subcategories: {
                        include: {
                            items: true,
                        },
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
                subtitle: listing.item?.subcategory.name ??
                    listing.item?.subcategory.category.name ??
                    "Категория",
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
            .filter((item, index, list) => index ===
            list.findIndex((candidate) => candidate.title.toLowerCase() === item.title.toLowerCase()))
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
            where: { public_id: String(publicId) },
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
            where: { public_id: String(publicId) },
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