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
const CP1251_SPECIAL_CHAR_TO_BYTE = {
    0x0402: 0x80,
    0x0403: 0x81,
    0x201a: 0x82,
    0x0453: 0x83,
    0x201e: 0x84,
    0x2026: 0x85,
    0x2020: 0x86,
    0x2021: 0x87,
    0x20ac: 0x88,
    0x2030: 0x89,
    0x0409: 0x8a,
    0x2039: 0x8b,
    0x040a: 0x8c,
    0x040c: 0x8d,
    0x040b: 0x8e,
    0x040f: 0x8f,
    0x0452: 0x90,
    0x2018: 0x91,
    0x2019: 0x92,
    0x201c: 0x93,
    0x201d: 0x94,
    0x2022: 0x95,
    0x2013: 0x96,
    0x2014: 0x97,
    0x2122: 0x99,
    0x0459: 0x9a,
    0x203a: 0x9b,
    0x045a: 0x9c,
    0x045c: 0x9d,
    0x045b: 0x9e,
    0x045f: 0x9f,
    0x040e: 0xa1,
    0x045e: 0xa2,
    0x0408: 0xa3,
    0x00a4: 0xa4,
    0x0490: 0xa5,
    0x00a6: 0xa6,
    0x00a7: 0xa7,
    0x0401: 0xa8,
    0x00a9: 0xa9,
    0x0404: 0xaa,
    0x00ab: 0xab,
    0x00ac: 0xac,
    0x00ad: 0xad,
    0x00ae: 0xae,
    0x0407: 0xaf,
    0x00b0: 0xb0,
    0x00b1: 0xb1,
    0x0406: 0xb2,
    0x0456: 0xb3,
    0x0491: 0xb4,
    0x00b5: 0xb5,
    0x00b6: 0xb6,
    0x00b7: 0xb7,
    0x0451: 0xb8,
    0x2116: 0xb9,
    0x0454: 0xba,
    0x00bb: 0xbb,
    0x0458: 0xbc,
    0x0405: 0xbd,
    0x0455: 0xbe,
    0x0457: 0xbf,
};
const MOJIBAKE_WEIRD_RE = /[ЃЉЊЋЌЎЏђѓ‚„…†‡€‰™љњћќўџ]/u;
function looksLikeMojibake(value) {
    const text = value.trim();
    if (!text)
        return false;
    if (/^\?{3,}$/.test(text.replace(/\s+/g, "")))
        return true;
    if (MOJIBAKE_WEIRD_RE.test(text))
        return true;
    if (text.length >= 8) {
        const rsCount = (text.match(/[РС]/g) ?? []).length;
        return rsCount / text.length > 0.28;
    }
    return false;
}
function decodeCp1251Mojibake(value) {
    const bytes = [];
    for (const char of value) {
        const codePoint = char.codePointAt(0);
        if (!codePoint)
            return null;
        if (codePoint <= 0x7f) {
            bytes.push(codePoint);
            continue;
        }
        if (codePoint >= 0x0410 && codePoint <= 0x044f) {
            bytes.push(codePoint - 0x0350);
            continue;
        }
        const special = CP1251_SPECIAL_CHAR_TO_BYTE[codePoint];
        if (special !== undefined) {
            bytes.push(special);
            continue;
        }
        return null;
    }
    const decoded = Buffer.from(bytes).toString("utf8");
    if (!decoded || decoded.includes("�"))
        return null;
    return decoded;
}
function normalizeDisplayText(value, fallback = "") {
    const raw = String(value ?? "").trim();
    if (!raw)
        return fallback;
    if (/^\?{3,}$/.test(raw.replace(/\s+/g, "")))
        return fallback || "Без названия";
    if (!looksLikeMojibake(raw))
        return raw;
    const decoded = decodeCp1251Mojibake(raw)?.trim();
    if (!decoded)
        return raw;
    if (/^\?{3,}$/.test(decoded.replace(/\s+/g, "")))
        return fallback || "Без названия";
    return decoded;
}
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
    return normalizeDisplayText(listing.item?.name, "Без категории");
}
function listingBreadcrumbs(listing) {
    if (!listing.item)
        return ["Главная", "Без категории"];
    return [
        "Главная",
        normalizeDisplayText(listing.item.subcategory.category.name, "Без категории"),
        normalizeDisplayText(listing.item.subcategory.name, "Без категории"),
        normalizeDisplayText(listing.item.name, "Без категории"),
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
            name: normalizeDisplayText(category.name, "Без названия"),
            icon_key: category.icon_key,
            subcategories: category.subcategories.map((subcategory) => ({
                id: subcategory.public_id,
                name: normalizeDisplayText(subcategory.name, "Без названия"),
                items: subcategory.items.map((item) => normalizeDisplayText(item.name, "Без названия")),
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
        const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : 0;
        if (req.query.cityId && (isNaN(cityId) || cityId <= 0)) {
            return res.status(400).json({ error: "Invalid city ID" });
        }
        if (req.query.limit && (!Number.isInteger(limit) || (limit ?? 0) <= 0)) {
            return res.status(400).json({ error: "Invalid limit" });
        }
        if (req.query.offset && (!Number.isInteger(offset) || offset < 0)) {
            return res.status(400).json({ error: "Invalid offset" });
        }
        const take = typeof limit === "number" ? Math.min(limit, 100) : undefined;
        const skip = take ? offset : undefined;
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
            where: {
                type,
                city_id: cityId,
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
                reviews: {
                    orderBy: [{ created_at: "desc" }],
                    include: {
                        author: {
                            select: {
                                display_name: true,
                                avatar: true,
                            },
                        },
                    },
                },
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
            ...(typeof take === "number" ? { take, skip } : {}),
        });
        return res.json(listings.map((listing) => {
            const primaryImage = listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE;
            const salePrice = listing.sale_price !== null && listing.sale_price < listing.price
                ? listing.sale_price
                : null;
            return {
                id: listing.public_id,
                title: normalizeDisplayText(listing.title, "Без названия"),
                price: listing.price,
                salePrice,
                image: primaryImage,
                images: listing.images.map((image) => image.url),
                rating: listing.rating,
                seller: normalizeDisplayText(listing.seller.name, "Продавец"),
                sellerAvatar: listing.seller.avatar,
                category: listingCategoryName(listing),
                sku: listing.sku,
                isNew: listing.condition === "NEW",
                isSale: salePrice !== null,
                isVerified: Boolean(listing.seller.seller_profile?.is_verified),
                description: normalizeDisplayText(listing.description ?? "", ""),
                shippingBySeller: listing.shipping_by_seller,
                city: normalizeDisplayText(listing.city.name, "Город"),
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
                    author: normalizeDisplayText(review.author.display_name, "Аноним"),
                    rating: review.rating,
                    date: formatPublishDate(review.created_at),
                    comment: normalizeDisplayText(review.comment, review.comment),
                    avatar: review.author.avatar,
                })),
            };
        }));
    }
    catch (error) {
        console.error("Error fetching listings:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.get("/listings/:publicId", async (req, res) => {
    try {
        const publicId = String(req.params.publicId ?? "").trim();
        if (!publicId) {
            return res.status(400).json({ error: "Invalid listing ID" });
        }
        const sessionUser = await (0, session_1.getSessionUser)(req);
        const listing = await prisma_1.prisma.marketplaceListing.findFirst({
            where: {
                public_id: publicId,
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
                reviews: {
                    orderBy: [{ created_at: "desc" }],
                    include: {
                        author: {
                            select: {
                                display_name: true,
                                avatar: true,
                            },
                        },
                    },
                },
            },
        });
        if (!listing) {
            return res.status(404).json({ error: "Listing not found" });
        }
        if (listing.status !== "ACTIVE") {
            if (!sessionUser) {
                return res.status(404).json({ error: "Listing not found" });
            }
            let hasRelatedAccess = sessionUser.role === "ADMIN" || listing.seller_id === sessionUser.id;
            if (!hasRelatedAccess) {
                const [relatedOrderItem, relatedWishlistItem] = await Promise.all([
                    prisma_1.prisma.marketOrderItem.findFirst({
                        where: {
                            listing_id: listing.id,
                            order: {
                                buyer_id: sessionUser.id,
                            },
                        },
                        select: { id: true },
                    }),
                    prisma_1.prisma.wishlistItem.findFirst({
                        where: {
                            user_id: sessionUser.id,
                            listing_id: listing.id,
                        },
                        select: { id: true },
                    }),
                ]);
                hasRelatedAccess = Boolean(relatedOrderItem || relatedWishlistItem);
            }
            if (!hasRelatedAccess) {
                return res.status(404).json({ error: "Listing not found" });
            }
        }
        const primaryImage = listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE;
        const salePrice = listing.sale_price !== null && listing.sale_price < listing.price
            ? listing.sale_price
            : null;
        return res.json({
            id: listing.public_id,
            title: normalizeDisplayText(listing.title, "Без названия"),
            price: listing.price,
            salePrice,
            image: primaryImage,
            images: listing.images.map((image) => image.url),
            rating: listing.rating,
            seller: normalizeDisplayText(listing.seller.name, "Продавец"),
            sellerAvatar: listing.seller.avatar,
            category: listingCategoryName(listing),
            sku: listing.sku,
            isNew: listing.condition === "NEW",
            isSale: salePrice !== null,
            isVerified: Boolean(listing.seller.seller_profile?.is_verified),
            description: normalizeDisplayText(listing.description ?? "", ""),
            shippingBySeller: listing.shipping_by_seller,
            location: listing.city?.name ?? "",
            city: listing.city?.name ?? "",
            publishDate: formatPublishDate(listing.created_at),
            views: listing.views,
            sellerListings: listing.seller._count.listings,
            sellerResponseTime: formatResponseTime(listing.seller.seller_profile?.average_response_minutes),
            breadcrumbs: listingBreadcrumbs(listing),
            condition: (0, format_1.toClientCondition)(listing.condition),
            specifications: listingSpecifications(listing.attributes),
            reviews: listing.reviews.map((review) => ({
                id: String(review.id),
                author: normalizeDisplayText(review.author.display_name ?? "", "Покупатель"),
                avatar: review.author.avatar,
                rating: review.rating,
                comment: normalizeDisplayText(review.comment, ""),
                date: review.created_at.toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                }),
            })),
        });
    }
    catch (error) {
        console.error("Error fetching listing by id:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
catalogRouter.get("/cities", async (_req, res) => {
    try {
        const cities = await prisma_1.prisma.city.findMany({
            select: { id: true, name: true, region: true },
            orderBy: [{ region: "asc" }, { name: "asc" }],
        });
        res.json(cities);
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
            const listingTitle = normalizeDisplayText(listing.title, "");
            if (!listingTitle.toLowerCase().includes(normalized))
                continue;
            const suggestionSubtitle = normalizeDisplayText(listing.item?.subcategory.name ??
                listing.item?.subcategory.category.name ??
                "Категория", "Категория");
            suggestions.push({
                type: listing.type === "SERVICE" ? "service" : "product",
                title: listingTitle,
                subtitle: suggestionSubtitle,
                query: listingTitle,
            });
        }
        for (const category of categories) {
            const categoryName = normalizeDisplayText(category.name, "Категория");
            if (categoryName.toLowerCase().includes(normalized)) {
                suggestions.push({
                    type: "category",
                    title: categoryName,
                    subtitle: "Категория",
                    query: categoryName,
                });
            }
            for (const subcategory of category.subcategories) {
                const subcategoryName = normalizeDisplayText(subcategory.name, "Категория");
                if (subcategoryName.toLowerCase().includes(normalized)) {
                    suggestions.push({
                        type: "category",
                        title: subcategoryName,
                        subtitle: categoryName,
                        query: subcategoryName,
                    });
                }
                for (const item of subcategory.items) {
                    const itemName = normalizeDisplayText(item.name, "Без названия");
                    if (!itemName.toLowerCase().includes(normalized))
                        continue;
                    suggestions.push({
                        type: "category",
                        title: itemName,
                        subtitle: subcategoryName,
                        query: itemName,
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
        const session = await (0, session_1.requireAnyRole)(req, ["BUYER"]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: String(publicId) },
            select: { id: true, title: true, seller_id: true, public_id: true },
        });
        if (!listing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        const created = await prisma_1.prisma.listingQuestion.create({
            data: {
                public_id: `Q-${Date.now()}`,
                listing_id: listing.id,
                buyer_id: session.user.id,
                question: questionText,
                status: "PENDING",
            },
            include: {
                buyer: {
                    select: { name: true },
                },
            },
        });
        await prisma_1.prisma.notification.create({
            data: {
                user_id: listing.seller_id,
                type: "NEW_QUESTION",
                message: `Новый вопрос по вашему товару "${listing.title}"`,
                target_url: `/products/${listing.public_id}`,
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