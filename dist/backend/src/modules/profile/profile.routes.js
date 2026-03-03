"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const profileRouter = (0, express_1.Router)();
exports.profileRouter = profileRouter;
const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
function toLocalizedDeliveryDate(date) {
    const deliveryDate = new Date(date.getTime());
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    return deliveryDate.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
    });
}
profileRouter.get("/me", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const user = await prisma_1.prisma.appUser.findUnique({
            where: { id: session.user.id },
            include: {
                addresses: {
                    orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                },
                wishlist_items: {
                    include: {
                        listing: {
                            include: {
                                seller: true,
                            },
                        },
                    },
                    orderBy: [{ added_at: "desc" }],
                },
                orders_as_buyer: {
                    include: {
                        seller: true,
                        items: true,
                    },
                    orderBy: [{ created_at: "desc" }],
                },
            },
        });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        res.json({
            user: {
                id: user.id,
                public_id: user.public_id,
                role: (0, format_1.toClientRole)(user.role),
                firstName: user.first_name ?? "",
                lastName: user.last_name ?? "",
                displayName: user.display_name ?? user.name,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                city: user.city,
                joinDate: user.joined_at.getFullYear().toString(),
            },
            addresses: user.addresses.map((address) => ({
                id: String(address.id),
                name: address.label,
                region: address.region,
                city: address.city,
                street: address.street,
                building: address.building,
                postalCode: address.postal_code,
                isDefault: address.is_default,
            })),
            orders: user.orders_as_buyer.map((order) => ({
                id: String(order.id),
                orderNumber: `#${order.public_id}`,
                date: order.created_at,
                status: (0, format_1.toProfileOrderStatus)(order.status),
                total: order.total_price,
                deliveryDate: toLocalizedDeliveryDate(order.created_at),
                deliveryAddress: order.delivery_address ?? "Адрес не указан",
                deliveryCost: order.delivery_cost,
                discount: order.discount,
                seller: {
                    name: order.seller.name,
                    avatar: order.seller.avatar,
                    phone: order.seller.phone ?? "",
                    address: `${order.seller.city ?? "Город не указан"}`,
                    workingHours: "пн — вс: 9:00-21:00",
                },
                items: order.items.map((item) => ({
                    id: String(item.id),
                    name: item.name,
                    image: item.image ?? "",
                    price: item.price,
                    quantity: item.quantity,
                })),
            })),
            wishlist: user.wishlist_items.map((item) => ({
                id: item.listing.public_id,
                name: item.listing.title,
                price: item.listing.sale_price ?? item.listing.price,
                image: item.listing.image,
                location: item.listing.city,
                condition: (0, format_1.toClientCondition)(item.listing.condition),
                seller: item.listing.seller.name,
                addedDate: item.added_at.toISOString().split("T")[0],
            })),
        });
    }
    catch (error) {
        console.error("Error fetching profile data:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.patch("/me", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const body = (req.body ?? {});
        const user = await prisma_1.prisma.appUser.findUnique({
            where: { id: session.user.id },
            select: { id: true, password: true },
        });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        const firstName = typeof body.firstName === "string" ? body.firstName.trim() : undefined;
        const lastName = typeof body.lastName === "string" ? body.lastName.trim() : undefined;
        const displayName = typeof body.displayName === "string" ? body.displayName.trim() : undefined;
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : undefined;
        const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
        if (newPassword && oldPassword !== user.password) {
            res.status(400).json({ error: "Старый пароль указан неверно" });
            return;
        }
        const updated = await prisma_1.prisma.appUser.update({
            where: { id: session.user.id },
            data: {
                first_name: firstName ?? undefined,
                last_name: lastName ?? undefined,
                display_name: displayName ?? undefined,
                email: email ?? undefined,
                name: displayName || [firstName, lastName].filter(Boolean).join(" ") || undefined,
                password: newPassword || undefined,
            },
            select: {
                id: true,
                public_id: true,
                role: true,
                first_name: true,
                last_name: true,
                display_name: true,
                email: true,
                name: true,
            },
        });
        res.json({
            success: true,
            user: {
                id: updated.id,
                public_id: updated.public_id,
                role: (0, format_1.toClientRole)(updated.role),
                firstName: updated.first_name ?? "",
                lastName: updated.last_name ?? "",
                displayName: updated.display_name ?? updated.name,
                email: updated.email,
            },
        });
    }
    catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.get("/addresses", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const addresses = await prisma_1.prisma.userAddress.findMany({
            where: { user_id: session.user.id },
            orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        });
        res.json(addresses.map((address) => ({
            id: String(address.id),
            label: address.label,
            fullAddress: `${address.region}, ${address.city}, ${address.street}, ${address.building}`,
            isDefault: address.is_default,
            region: address.region,
            city: address.city,
            street: address.street,
            building: address.building,
            postalCode: address.postal_code,
        })));
    }
    catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.post("/addresses", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const body = (req.body ?? {});
        const label = typeof body.name === "string" ? body.name.trim() : "";
        const region = typeof body.region === "string" ? body.region.trim() : "";
        const city = typeof body.city === "string" ? body.city.trim() : "";
        const street = typeof body.street === "string" ? body.street.trim() : "";
        const building = typeof body.building === "string" ? body.building.trim() : "";
        const postalCode = typeof body.postalCode === "string" ? body.postalCode.trim() : "";
        const isDefault = Boolean(body.isDefault);
        if (!label || !city || !street) {
            res.status(400).json({ error: "Missing required address fields" });
            return;
        }
        if (isDefault) {
            await prisma_1.prisma.userAddress.updateMany({
                where: { user_id: session.user.id },
                data: { is_default: false },
            });
        }
        const created = await prisma_1.prisma.userAddress.create({
            data: {
                user_id: session.user.id,
                label,
                region,
                city,
                street,
                building,
                postal_code: postalCode,
                is_default: isDefault,
            },
        });
        res.status(201).json({
            id: String(created.id),
            name: created.label,
            region: created.region,
            city: created.city,
            street: created.street,
            building: created.building,
            postalCode: created.postal_code,
            isDefault: created.is_default,
        });
    }
    catch (error) {
        console.error("Error creating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.patch("/addresses/:id", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            res.status(400).json({ error: "Invalid address id" });
            return;
        }
        const existing = await prisma_1.prisma.userAddress.findFirst({
            where: { id, user_id: session.user.id },
        });
        if (!existing) {
            res.status(404).json({ error: "Address not found" });
            return;
        }
        const body = (req.body ?? {});
        const isDefault = Boolean(body.isDefault);
        if (isDefault) {
            await prisma_1.prisma.userAddress.updateMany({
                where: { user_id: session.user.id },
                data: { is_default: false },
            });
        }
        const updated = await prisma_1.prisma.userAddress.update({
            where: { id: existing.id },
            data: {
                label: typeof body.name === "string" ? body.name.trim() : undefined,
                region: typeof body.region === "string" ? body.region.trim() : undefined,
                city: typeof body.city === "string" ? body.city.trim() : undefined,
                street: typeof body.street === "string" ? body.street.trim() : undefined,
                building: typeof body.building === "string" ? body.building.trim() : undefined,
                postal_code: typeof body.postalCode === "string" ? body.postalCode.trim() : undefined,
                is_default: isDefault,
            },
        });
        res.json({
            id: String(updated.id),
            name: updated.label,
            region: updated.region,
            city: updated.city,
            street: updated.street,
            building: updated.building,
            postalCode: updated.postal_code,
            isDefault: updated.is_default,
        });
    }
    catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.delete("/addresses/:id", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            res.status(400).json({ error: "Invalid address id" });
            return;
        }
        const existing = await prisma_1.prisma.userAddress.findFirst({
            where: { id, user_id: session.user.id },
        });
        if (!existing) {
            res.status(404).json({ error: "Address not found" });
            return;
        }
        await prisma_1.prisma.userAddress.delete({
            where: { id: existing.id },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error deleting address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.post("/addresses/:id/default", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            res.status(400).json({ error: "Invalid address id" });
            return;
        }
        const existing = await prisma_1.prisma.userAddress.findFirst({
            where: { id, user_id: session.user.id },
        });
        if (!existing) {
            res.status(404).json({ error: "Address not found" });
            return;
        }
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.userAddress.updateMany({
                where: { user_id: session.user.id },
                data: { is_default: false },
            }),
            prisma_1.prisma.userAddress.update({
                where: { id: existing.id },
                data: { is_default: true },
            }),
        ]);
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error changing default address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.post("/orders", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const body = (req.body ?? {});
        const rawItems = Array.isArray(body.items) ? body.items : [];
        const parsedItems = rawItems
            .map((item) => item)
            .map((item) => ({
            listingId: typeof item.listingId === "string" ? item.listingId : "",
            quantity: Number(item.quantity ?? 0),
        }))
            .filter((item) => item.listingId && Number.isInteger(item.quantity) && item.quantity > 0);
        if (parsedItems.length === 0) {
            res.status(400).json({ error: "Корзина пуста или содержит некорректные позиции" });
            return;
        }
        const listingPublicIds = [...new Set(parsedItems.map((item) => item.listingId))];
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
            where: {
                public_id: { in: listingPublicIds },
                moderation_status: "APPROVED",
                status: "ACTIVE",
            },
            select: {
                id: true,
                public_id: true,
                seller_id: true,
                title: true,
                image: true,
                price: true,
            },
        });
        if (listings.length !== listingPublicIds.length) {
            res.status(400).json({ error: "Некоторые товары недоступны для заказа" });
            return;
        }
        const listingByPublicId = new Map(listings.map((listing) => [listing.public_id, listing]));
        const groupedBySeller = new Map();
        for (const item of parsedItems) {
            const listing = listingByPublicId.get(item.listingId);
            if (!listing) {
                res.status(400).json({ error: `Товар ${item.listingId} не найден` });
                return;
            }
            const current = groupedBySeller.get(listing.seller_id) ?? [];
            current.push({
                listing_id: listing.id,
                name: listing.title,
                image: listing.image,
                price: listing.price,
                quantity: item.quantity,
            });
            groupedBySeller.set(listing.seller_id, current);
        }
        const deliveryType = body.deliveryType === "pickup" ? "PICKUP" : "DELIVERY";
        const paymentMethod = body.paymentMethod === "cash" ? "cash" : "card";
        const customAddress = typeof body.customAddress === "string" ? body.customAddress.trim() : "";
        const addressId = Number(body.addressId ?? 0);
        let deliveryAddress = customAddress;
        if (!deliveryAddress && Number.isInteger(addressId) && addressId > 0) {
            const selectedAddress = await prisma_1.prisma.userAddress.findFirst({
                where: {
                    id: addressId,
                    user_id: session.user.id,
                },
            });
            if (selectedAddress) {
                deliveryAddress = `${selectedAddress.region}, ${selectedAddress.city}, ${selectedAddress.street}, ${selectedAddress.building}`;
            }
        }
        if (!deliveryAddress) {
            const defaultAddress = await prisma_1.prisma.userAddress.findFirst({
                where: {
                    user_id: session.user.id,
                    is_default: true,
                },
            });
            if (defaultAddress) {
                deliveryAddress = `${defaultAddress.region}, ${defaultAddress.city}, ${defaultAddress.street}, ${defaultAddress.building}`;
            }
        }
        if (deliveryType === "DELIVERY" && !deliveryAddress) {
            res.status(400).json({ error: "Укажите адрес доставки" });
            return;
        }
        const createdOrders = await prisma_1.prisma.$transaction(async (tx) => {
            const result = [];
            let sequence = 0;
            for (const [sellerId, items] of groupedBySeller.entries()) {
                sequence += 1;
                const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
                const deliveryCost = deliveryType === "DELIVERY" ? 500 : 0;
                const discount = 0;
                const totalPrice = subtotal + deliveryCost - discount;
                const publicId = `ORD-${Date.now()}-${sequence}`;
                const order = await tx.marketOrder.create({
                    data: {
                        public_id: publicId,
                        buyer_id: session.user.id,
                        seller_id: sellerId,
                        status: "PAID",
                        delivery_type: deliveryType,
                        delivery_address: deliveryType === "DELIVERY" ? deliveryAddress : "Самовывоз",
                        total_price: totalPrice,
                        delivery_cost: deliveryCost,
                        discount,
                        items: {
                            create: items.map((item) => ({
                                listing_id: item.listing_id,
                                name: item.name,
                                image: item.image,
                                price: item.price,
                                quantity: item.quantity,
                            })),
                        },
                    },
                });
                const commissionRate = 3.5;
                const commission = Math.round((totalPrice * commissionRate) / 100);
                await tx.platformTransaction.create({
                    data: {
                        public_id: `TXN-${Date.now()}-${sequence}`,
                        order_id: order.id,
                        buyer_id: session.user.id,
                        seller_id: sellerId,
                        amount: totalPrice,
                        status: paymentMethod === "cash" ? "SUCCESS" : "HELD",
                        commission_rate: commissionRate,
                        commission,
                        payment_provider: paymentMethod === "cash" ? "Cash" : "Card",
                        payment_intent_id: `pay_${Date.now()}_${sequence}`,
                    },
                });
                result.push({
                    order_id: order.public_id,
                    total_price: totalPrice,
                });
            }
            return result;
        });
        res.status(201).json({
            success: true,
            orders: createdOrders,
            total: createdOrders.reduce((sum, order) => sum + order.total_price, 0),
        });
    }
    catch (error) {
        console.error("Error creating orders:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.get("/orders", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const orders = await prisma_1.prisma.marketOrder.findMany({
            where: { buyer_id: session.user.id },
            include: {
                seller: true,
                items: true,
            },
            orderBy: [{ created_at: "desc" }],
        });
        res.json(orders.map((order) => ({
            id: String(order.id),
            orderNumber: `#${order.public_id}`,
            date: order.created_at,
            status: (0, format_1.toProfileOrderStatus)(order.status),
            total: order.total_price,
            deliveryDate: toLocalizedDeliveryDate(order.created_at),
            deliveryAddress: order.delivery_address ?? "Адрес не указан",
            deliveryCost: order.delivery_cost,
            discount: order.discount,
            seller: {
                name: order.seller.name,
                avatar: order.seller.avatar,
                phone: order.seller.phone ?? "",
                address: `${order.seller.city ?? "Город не указан"}`,
                workingHours: "пн — вс: 9:00-21:00",
            },
            items: order.items.map((item) => ({
                id: String(item.id),
                name: item.name,
                image: item.image ?? "",
                price: item.price,
                quantity: item.quantity,
            })),
        })));
    }
    catch (error) {
        console.error("Error fetching orders:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.get("/wishlist", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const wishlist = await prisma_1.prisma.wishlistItem.findMany({
            where: { user_id: session.user.id },
            include: {
                listing: {
                    include: { seller: true },
                },
            },
            orderBy: [{ added_at: "desc" }],
        });
        res.json(wishlist.map((item) => ({
            id: item.listing.public_id,
            name: item.listing.title,
            price: item.listing.sale_price ?? item.listing.price,
            image: item.listing.image,
            location: item.listing.city,
            condition: (0, format_1.toClientCondition)(item.listing.condition),
            seller: item.listing.seller.name,
            addedDate: item.added_at.toISOString().split("T")[0],
        })));
    }
    catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.post("/wishlist/:listingPublicId", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { listingPublicId } = req.params;
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: listingPublicId },
            select: { id: true },
        });
        if (!listing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        await prisma_1.prisma.wishlistItem.upsert({
            where: {
                user_id_listing_id: {
                    user_id: session.user.id,
                    listing_id: listing.id,
                },
            },
            create: {
                user_id: session.user.id,
                listing_id: listing.id,
            },
            update: {},
        });
        res.status(201).json({ success: true });
    }
    catch (error) {
        console.error("Error adding wishlist item:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.delete("/wishlist/:listingPublicId", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { listingPublicId } = req.params;
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: listingPublicId },
            select: { id: true },
        });
        if (!listing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        await prisma_1.prisma.wishlistItem.deleteMany({
            where: {
                user_id: session.user.id,
                listing_id: listing.id,
            },
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Error deleting wishlist item:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.post("/partnership-requests", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const body = (req.body ?? {});
        const sellerTypeRaw = typeof body.sellerType === "string" ? body.sellerType : "company";
        const sellerType = sellerTypeRaw === "private" ? "PRIVATE" : "COMPANY";
        const name = typeof body.name === "string" ? body.name.trim() : "";
        const email = typeof body.email === "string" ? body.email.trim() : "";
        const contact = typeof body.contact === "string" ? body.contact.trim() : "";
        const link = typeof body.link === "string" ? body.link.trim() : "";
        const category = typeof body.category === "string" ? body.category.trim() : "";
        const whyUs = typeof body.whyUs === "string" ? body.whyUs.trim() : "";
        if (!name || !email || !contact || !link || !category || !whyUs) {
            res.status(400).json({ error: "Заполните обязательные поля заявки" });
            return;
        }
        const created = await prisma_1.prisma.partnershipRequest.create({
            data: {
                public_id: `PRQ-${Date.now()}`,
                user_id: session.user.id,
                seller_type: sellerType,
                name,
                email,
                contact,
                link,
                category,
                inn: typeof body.inn === "string" ? body.inn.trim() : null,
                geography: typeof body.geography === "string" ? body.geography.trim() : null,
                social_profile: typeof body.socialProfile === "string" ? body.socialProfile.trim() : null,
                credibility: typeof body.credibility === "string" ? body.credibility.trim() : null,
                why_us: whyUs,
            },
        });
        res.status(201).json({
            success: true,
            request_id: created.public_id,
        });
    }
    catch (error) {
        console.error("Error creating partnership request:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=profile.routes.js.map