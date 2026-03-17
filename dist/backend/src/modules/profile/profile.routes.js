"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.profileRouter = void 0;
const crypto_1 = require("crypto");
const express_1 = require("express");
const prisma_1 = require("../../lib/prisma");
const session_1 = require("../../lib/session");
const format_1 = require("../../utils/format");
const profileRouter = (0, express_1.Router)();
exports.profileRouter = profileRouter;
const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const FALLBACK_LISTING_IMAGE = "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";
const DELIVERY_PROVIDER_LABELS = {
    cdek: "CDEK",
    russian_post: "Почта России",
    ozon: "Ozon Доставка",
};
const CITY_CENTER_COORDS = {
    москва: [55.751244, 37.618423],
    "санкт-петербург": [59.93428, 30.335099],
    казань: [55.796127, 49.106414],
    екатеринбург: [56.838011, 60.597465],
    новосибирск: [55.028739, 82.906927],
    краснодар: [45.03547, 38.975313],
    сочи: [43.585472, 39.723098],
    "нижний новгород": [56.326797, 44.006516],
};
function isRetryableNetworkError(error) {
    if (!(error instanceof TypeError))
        return false;
    const cause = error.cause;
    const code = typeof cause?.code === "string" ? cause.code : "";
    return (code === "ENOTFOUND" ||
        code === "EAI_AGAIN" ||
        code === "ECONNRESET" ||
        code === "ETIMEDOUT");
}
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function toLocalizedDeliveryDate(date) {
    const deliveryDate = new Date(date.getTime());
    deliveryDate.setDate(deliveryDate.getDate() + 3);
    return deliveryDate.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
    });
}
function getYooKassaConfig() {
    const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
    const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();
    if (!shopId || !secretKey) {
        throw new Error("YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.");
    }
    return {
        shopId,
        secretKey,
        returnUrl: process.env.YOOKASSA_RETURN_URL?.trim() || "http://127.0.0.1:3000",
        apiUrl: process.env.YOOKASSA_API_URL?.trim() || "https://api.yookassa.ru/v3",
    };
}
async function createYooKassaPayment(params) {
    const config = getYooKassaConfig();
    const authToken = Buffer.from(`${config.shopId}:${config.secretKey}`, "utf8").toString("base64");
    const payloadBody = JSON.stringify({
        amount: {
            value: params.amountRub.toFixed(2),
            currency: "RUB",
        },
        capture: true,
        payment_method_data: {
            type: "bank_card",
        },
        save_payment_method: false,
        confirmation: {
            type: "redirect",
            return_url: config.returnUrl,
        },
        description: params.description,
        metadata: params.metadata,
    });
    let response = null;
    let lastError = null;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            response = await fetch(`${config.apiUrl}/payments`, {
                method: "POST",
                headers: {
                    Authorization: `Basic ${authToken}`,
                    "Content-Type": "application/json",
                    "Idempotence-Key": (0, crypto_1.randomUUID)(),
                },
                body: payloadBody,
            });
            break;
        }
        catch (error) {
            lastError = error;
            if (!isRetryableNetworkError(error) || attempt === maxAttempts) {
                throw error;
            }
            await delay(300 * attempt);
        }
    }
    if (!response) {
        if (isRetryableNetworkError(lastError)) {
            throw new Error("YooKassa is temporarily unavailable (DNS/network). Check internet, VPN/proxy, and DNS settings.");
        }
        throw new Error("YooKassa request failed");
    }
    const rawBody = await response.text();
    const payload = rawBody ? JSON.parse(rawBody) : {};
    if (!response.ok) {
        const message = typeof payload === "object" &&
            payload !== null &&
            "description" in payload &&
            typeof payload.description === "string"
            ? payload.description
            : `YooKassa request failed with status ${response.status}`;
        throw new Error(message);
    }
    if (typeof payload !== "object" ||
        payload === null ||
        typeof payload.id !== "string" ||
        typeof payload.status !== "string") {
        throw new Error("Invalid YooKassa response");
    }
    return payload;
}
function normalizeCityForMap(city) {
    return city.trim().toLowerCase();
}
function getCityCenter(city) {
    return CITY_CENTER_COORDS[normalizeCityForMap(city)] ?? CITY_CENTER_COORDS["москва"];
}
function buildFallbackDeliveryPoints(city) {
    const [lat, lng] = getCityCenter(city);
    return [
        {
            id: `${normalizeCityForMap(city)}-cdek-1`,
            provider: "cdek",
            providerLabel: DELIVERY_PROVIDER_LABELS.cdek,
            name: "CDEK ПВЗ №1",
            address: `${city}, ул. Центральная, 12`,
            city,
            lat: lat + 0.008,
            lng: lng + 0.006,
            workHours: "09:00-21:00",
            etaDays: 2,
            cost: 280,
        },
        {
            id: `${normalizeCityForMap(city)}-cdek-2`,
            provider: "cdek",
            providerLabel: DELIVERY_PROVIDER_LABELS.cdek,
            name: "CDEK ПВЗ №2",
            address: `${city}, пр-т Ленина, 54`,
            city,
            lat: lat - 0.006,
            lng: lng + 0.01,
            workHours: "10:00-20:00",
            etaDays: 3,
            cost: 260,
        },
        {
            id: `${normalizeCityForMap(city)}-post-1`,
            provider: "russian_post",
            providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
            name: "Почтовое отделение",
            address: `${city}, ул. Почтовая, 7`,
            city,
            lat: lat + 0.004,
            lng: lng - 0.009,
            workHours: "08:00-20:00",
            etaDays: 4,
            cost: 220,
        },
        {
            id: `${normalizeCityForMap(city)}-post-2`,
            provider: "russian_post",
            providerLabel: DELIVERY_PROVIDER_LABELS.russian_post,
            name: "Почта России ПВЗ",
            address: `${city}, ул. Советская, 18`,
            city,
            lat: lat - 0.01,
            lng: lng - 0.004,
            workHours: "09:00-19:00",
            etaDays: 5,
            cost: 190,
        },
        {
            id: `${normalizeCityForMap(city)}-ozon-1`,
            provider: "ozon",
            providerLabel: DELIVERY_PROVIDER_LABELS.ozon,
            name: "Ozon Пункт выдачи",
            address: `${city}, ул. Торговая, 22`,
            city,
            lat: lat + 0.011,
            lng: lng - 0.002,
            workHours: "10:00-22:00",
            etaDays: 2,
            cost: 240,
        },
        {
            id: `${normalizeCityForMap(city)}-ozon-2`,
            provider: "ozon",
            providerLabel: DELIVERY_PROVIDER_LABELS.ozon,
            name: "Ozon Express ПВЗ",
            address: `${city}, ул. Молодежная, 5`,
            city,
            lat: lat - 0.004,
            lng: lng + 0.014,
            workHours: "09:00-22:00",
            etaDays: 1,
            cost: 310,
        },
    ];
}
async function loadExternalDeliveryPoints(_city) {
    return [];
}
async function getDeliveryPoints(city) {
    const externalPoints = await loadExternalDeliveryPoints(city);
    if (externalPoints.length > 0) {
        return externalPoints;
    }
    return buildFallbackDeliveryPoints(city);
}
function normalizeTextField(value) {
    return typeof value === "string" ? value.trim() : "";
}
function parseLegacyBuilding(value) {
    const raw = value.trim();
    if (!raw) {
        return {
            house: "",
            apartment: "",
            entrance: "",
        };
    }
    const houseMatch = raw.match(/(?:^|,\s*)(?:д(?:ом)?\.?)\s*([^,]+)/iu);
    const apartmentMatch = raw.match(/(?:^|,\s*)(?:кв(?:артира)?\.?)\s*([^,]+)/iu);
    const entranceMatch = raw.match(/(?:^|,\s*)(?:под[ъь]?езд)\s*([^,]+)/iu);
    const fallbackHouse = raw.split(",")[0]?.trim() ?? "";
    return {
        house: (houseMatch?.[1] ?? fallbackHouse).trim(),
        apartment: (apartmentMatch?.[1] ?? "").trim(),
        entrance: (entranceMatch?.[1] ?? "").trim(),
    };
}
function buildAddressFullAddress(parts) {
    const region = normalizeTextField(parts.region);
    const city = normalizeTextField(parts.city);
    const street = normalizeTextField(parts.street);
    const house = normalizeTextField(parts.house);
    const apartment = normalizeTextField(parts.apartment);
    const entrance = normalizeTextField(parts.entrance);
    const housePart = house ? `д. ${house}` : "";
    const entrancePart = entrance ? `подъезд ${entrance}` : "";
    const apartmentPart = apartment ? `кв. ${apartment}` : "";
    return [region, city, street, housePart, entrancePart, apartmentPart]
        .filter(Boolean)
        .join(", ");
}
function buildAddressBuildingLabel(parts) {
    const house = normalizeTextField(parts.house);
    const apartment = normalizeTextField(parts.apartment);
    const entrance = normalizeTextField(parts.entrance);
    return [
        house ? `д. ${house}` : "",
        entrance ? `подъезд ${entrance}` : "",
        apartment ? `кв. ${apartment}` : "",
    ]
        .filter(Boolean)
        .join(", ");
}
function mapUserAddressToDto(address) {
    const fullAddress = normalizeTextField(address.full_address) ||
        buildAddressFullAddress({
            region: address.region,
            city: address.city,
            street: address.street,
            house: address.house,
            apartment: address.apartment ?? "",
            entrance: address.entrance ?? "",
        });
    return {
        id: String(address.id),
        name: address.label,
        label: address.label,
        fullAddress,
        region: address.region,
        city: address.city,
        street: address.street,
        house: address.house,
        apartment: address.apartment ?? "",
        entrance: address.entrance ?? "",
        building: buildAddressBuildingLabel({
            house: address.house,
            apartment: address.apartment ?? "",
            entrance: address.entrance ?? "",
        }),
        postalCode: address.postal_code,
        lat: address.lat ?? null,
        lon: address.lon ?? null,
        isDefault: address.is_default,
    };
}
profileRouter.get("/me", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const user = await prisma_1.prisma.appUser.findUnique({
            where: { id: session.user.id },
            include: {
                city: true,
                addresses: {
                    orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                },
                wishlist_items: {
                    include: {
                        listing: {
                            include: {
                                seller: { include: { city: true } },
                                images: {
                                    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                                },
                                city: true,
                            },
                        },
                    },
                    orderBy: [{ added_at: "desc" }],
                },
                orders_as_buyer: {
                    include: {
                        seller: { include: { city: true } },
                        items: {
                            include: {
                                listing: {
                                    select: {
                                        public_id: true,
                                    },
                                },
                            },
                        },
                    },
                    orderBy: [{ created_at: "desc" }],
                },
            },
        });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        const userWithRelations = user;
        res.json({
            user: {
                id: userWithRelations.id,
                public_id: userWithRelations.public_id,
                role: (0, format_1.toClientRole)(userWithRelations.role),
                firstName: userWithRelations.first_name ?? "",
                lastName: userWithRelations.last_name ?? "",
                displayName: userWithRelations.display_name ?? userWithRelations.name,
                name: userWithRelations.name,
                email: userWithRelations.email,
                avatar: userWithRelations.avatar,
                city: userWithRelations.city?.name ?? null,
                joinDate: userWithRelations.joined_at.getFullYear().toString(),
            },
            addresses: userWithRelations.addresses.map((address) => ({
                ...mapUserAddressToDto(address),
            })),
            orders: userWithRelations.orders_as_buyer.map((order) => ({
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
                    address: `${order.seller.city?.name ?? "Город не указан"}`,
                    workingHours: "пн — вс: 9:00-21:00",
                },
                items: order.items.map((item) => ({
                    id: String(item.id),
                    listingPublicId: item.listing?.public_id ?? "",
                    name: item.name,
                    image: item.image ?? "",
                    price: item.price,
                    quantity: item.quantity,
                })),
            })),
            wishlist: userWithRelations.wishlist_items.map((item) => ({
                id: item.listing.public_id,
                name: item.listing.title,
                price: item.listing.sale_price ?? item.listing.price,
                image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
                location: item.listing.city.name,
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
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
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
        const displayName = typeof body.displayName === "string"
            ? body.displayName.trim()
            : undefined;
        const email = typeof body.email === "string"
            ? body.email.trim().toLowerCase()
            : undefined;
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
                name: displayName ||
                    [firstName, lastName].filter(Boolean).join(" ") ||
                    undefined,
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
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const addresses = await prisma_1.prisma.userAddress.findMany({
            where: { user_id: session.user.id },
            orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        });
        res.json(addresses.map((address) => mapUserAddressToDto(address)));
    }
    catch (error) {
        console.error("Error fetching addresses:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.post("/addresses", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const body = (req.body ?? {});
        const label = normalizeTextField(body.name ?? body.label);
        const fullAddress = normalizeTextField(body.fullAddress);
        const region = normalizeTextField(body.region ?? body.regionName);
        const city = normalizeTextField(body.city ?? body.cityName);
        const street = normalizeTextField(body.street);
        const postalCode = normalizeTextField(body.postalCode);
        const legacyBuilding = normalizeTextField(body.building);
        const parsedLegacyBuilding = parseLegacyBuilding(legacyBuilding);
        const house = normalizeTextField(body.house) || parsedLegacyBuilding.house;
        const apartment = normalizeTextField(body.apartment) || parsedLegacyBuilding.apartment;
        const entrance = normalizeTextField(body.entrance) || parsedLegacyBuilding.entrance;
        const lat = typeof body.lat === "number" && Number.isFinite(body.lat)
            ? body.lat
            : null;
        const lon = typeof body.lon === "number" && Number.isFinite(body.lon)
            ? body.lon
            : null;
        const isDefault = Boolean(body.isDefault);
        const normalizedFullAddress = fullAddress ||
            buildAddressFullAddress({
                region,
                city,
                street,
                house,
                apartment,
                entrance,
            }) ||
            [region, city, street, house].filter(Boolean).join(", ");
        if (!label) {
            res.status(400).json({ error: "Address label is required" });
            return;
        }
        if (!normalizedFullAddress) {
            res.status(400).json({ error: "Address text is required" });
            return;
        }
        if (lat === null || lon === null) {
            res.status(400).json({ error: "Address coordinates are required" });
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
                full_address: normalizedFullAddress,
                region: region || "",
                city: city || "",
                street: street || "",
                house: house || "",
                apartment,
                entrance,
                postal_code: postalCode || "",
                lat,
                lon,
                is_default: isDefault,
            },
        });
        res.status(201).json(mapUserAddressToDto(created));
    }
    catch (error) {
        console.error("Error creating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.patch("/addresses/:id", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
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
        const hasIsDefault = typeof body.isDefault === "boolean";
        const isDefault = hasIsDefault ? Boolean(body.isDefault) : undefined;
        if (isDefault) {
            await prisma_1.prisma.userAddress.updateMany({
                where: { user_id: session.user.id },
                data: { is_default: false },
            });
        }
        const legacyBuilding = normalizeTextField(body.building);
        const parsedLegacyBuilding = parseLegacyBuilding(legacyBuilding);
        const updated = await prisma_1.prisma.userAddress.update({
            where: { id: existing.id },
            data: {
                label: normalizeTextField(body.name ?? body.label) || undefined,
                full_address: normalizeTextField(body.fullAddress) || undefined,
                region: normalizeTextField(body.region) || undefined,
                city: normalizeTextField(body.city) || undefined,
                street: typeof body.street === "string" ? body.street.trim() : undefined,
                house: normalizeTextField(body.house) ||
                    parsedLegacyBuilding.house ||
                    undefined,
                apartment: normalizeTextField(body.apartment) ||
                    parsedLegacyBuilding.apartment ||
                    undefined,
                entrance: normalizeTextField(body.entrance) ||
                    parsedLegacyBuilding.entrance ||
                    undefined,
                postal_code: typeof body.postalCode === "string"
                    ? body.postalCode.trim()
                    : undefined,
                lat: typeof body.lat === "number" && Number.isFinite(body.lat)
                    ? body.lat
                    : undefined,
                lon: typeof body.lon === "number" && Number.isFinite(body.lon)
                    ? body.lon
                    : undefined,
                is_default: isDefault,
            },
        });
        res.json(mapUserAddressToDto(updated));
    }
    catch (error) {
        console.error("Error updating address:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.delete("/addresses/:id", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
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
        if (existing.is_default) {
            res.status(400).json({ error: "Default address cannot be deleted" });
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
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
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
profileRouter.get("/delivery-points", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const cityRaw = typeof req.query.city === "string" ? req.query.city.trim() : "";
        const city = cityRaw || "Москва";
        const points = await getDeliveryPoints(city);
        res.json({
            city,
            providers: Object.entries(DELIVERY_PROVIDER_LABELS).map(([code, label]) => ({
                code,
                label,
            })),
            points,
        });
    }
    catch (error) {
        console.error("Error loading delivery points:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.post("/orders", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
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
            .filter((item) => item.listingId &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0);
        if (parsedItems.length === 0) {
            res
                .status(400)
                .json({ error: "Корзина пуста или содержит некорректные позиции" });
            return;
        }
        const listingPublicIds = [
            ...new Set(parsedItems.map((item) => item.listingId)),
        ];
        const listings = await prisma_1.prisma.marketplaceListing.findMany({
            where: {
                public_id: { in: listingPublicIds },
                moderation_status: "APPROVED",
                status: "ACTIVE",
            },
            include: {
                images: {
                    select: { url: true },
                    orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                    take: 1,
                },
            },
        });
        if (listings.length !== listingPublicIds.length) {
            res
                .status(400)
                .json({ error: "Некоторые товары недоступны для заказа" });
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
                image: listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
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
                deliveryAddress =
                    normalizeTextField(selectedAddress.full_address) ||
                        buildAddressFullAddress({
                            region: selectedAddress.region,
                            city: selectedAddress.city,
                            street: selectedAddress.street,
                            house: selectedAddress.house,
                            apartment: selectedAddress.apartment ?? "",
                            entrance: selectedAddress.entrance ?? "",
                        });
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
                deliveryAddress =
                    normalizeTextField(defaultAddress.full_address) ||
                        buildAddressFullAddress({
                            region: defaultAddress.region,
                            city: defaultAddress.city,
                            street: defaultAddress.street,
                            house: defaultAddress.house,
                            apartment: defaultAddress.apartment ?? "",
                            entrance: defaultAddress.entrance ?? "",
                        });
            }
        }
        if (deliveryType === "DELIVERY" && !deliveryAddress) {
            res.status(400).json({ error: "Укажите адрес доставки" });
            return;
        }
        const preparedOrders = Array.from(groupedBySeller.entries()).map(([sellerId, items], index) => {
            const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const deliveryCost = deliveryType === "DELIVERY" ? 500 : 0;
            const discount = 0;
            const totalPrice = subtotal + deliveryCost - discount;
            const publicId = `ORD-${Date.now()}-${index + 1}`;
            return {
                sellerId,
                items,
                subtotal,
                deliveryCost,
                discount,
                totalPrice,
                publicId,
            };
        });
        const totalAmount = preparedOrders.reduce((sum, order) => sum + order.totalPrice, 0);
        const yookassaPayment = paymentMethod === "card"
            ? await createYooKassaPayment({
                amountRub: totalAmount,
                description: `Оплата заказа в Ecomm (${preparedOrders.length} шт.)`,
                metadata: {
                    source: "avito-2",
                    buyer_id: String(session.user.id),
                    orders_count: String(preparedOrders.length),
                },
            })
            : null;
        if (paymentMethod === "card" &&
            !yookassaPayment?.confirmation?.confirmation_url) {
            throw new Error("YooKassa did not return confirmation URL for redirect payment");
        }
        const createdOrders = await prisma_1.prisma.$transaction(async (tx) => {
            const result = [];
            let sequence = 0;
            for (const preparedOrder of preparedOrders) {
                sequence += 1;
                const order = await tx.marketOrder.create({
                    data: {
                        public_id: preparedOrder.publicId,
                        buyer_id: session.user.id,
                        seller_id: preparedOrder.sellerId,
                        status: "CREATED",
                        delivery_type: deliveryType,
                        delivery_address: deliveryType === "DELIVERY" ? deliveryAddress : "Самовывоз",
                        total_price: preparedOrder.totalPrice,
                        delivery_cost: preparedOrder.deliveryCost,
                        discount: preparedOrder.discount,
                        items: {
                            create: preparedOrder.items.map((item) => ({
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
                const commission = Math.round((preparedOrder.totalPrice * commissionRate) / 100);
                await tx.platformTransaction.create({
                    data: {
                        public_id: `TXN-${Date.now()}-${sequence}`,
                        order_id: order.id,
                        buyer_id: session.user.id,
                        seller_id: preparedOrder.sellerId,
                        amount: preparedOrder.totalPrice,
                        status: paymentMethod === "cash" ? "SUCCESS" : "HELD",
                        commission_rate: commissionRate,
                        commission,
                        payment_provider: paymentMethod === "cash" ? "CASH" : "YOOMONEY",
                        payment_intent_id: paymentMethod === "cash"
                            ? `pay_${Date.now()}_${sequence}`
                            : yookassaPayment?.id ?? `pay_${Date.now()}_${sequence}`,
                    },
                });
                result.push({
                    order_id: order.public_id,
                    total_price: preparedOrder.totalPrice,
                });
            }
            return result;
        });
        res.status(201).json({
            success: true,
            orders: createdOrders,
            total: createdOrders.reduce((sum, order) => sum + order.total_price, 0),
            payment: paymentMethod === "card"
                ? {
                    provider: "yoomoney",
                    paymentId: yookassaPayment?.id ?? null,
                    status: yookassaPayment?.status ?? null,
                    confirmationUrl: yookassaPayment?.confirmation?.confirmation_url ?? null,
                }
                : null,
        });
    }
    catch (error) {
        console.error("Error creating orders:", error);
        const message = error instanceof Error ? error.message : "Internal server error";
        if (message.includes("YooKassa") || message.includes("YooMoney")) {
            res.status(502).json({ error: message });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.get("/orders", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const orders = await prisma_1.prisma.marketOrder.findMany({
            where: { buyer_id: session.user.id },
            include: {
                seller: { include: { city: true } },
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
                address: `${order.seller.city?.name ?? "Город не указан"}`,
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
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const wishlist = await prisma_1.prisma.wishlistItem.findMany({
            where: { user_id: session.user.id },
            include: {
                listing: {
                    include: {
                        seller: true,
                        images: {
                            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                        },
                        city: true,
                    },
                },
            },
            orderBy: [{ added_at: "desc" }],
        });
        res.json(wishlist.map((item) => ({
            id: item.listing.public_id,
            name: item.listing.title,
            price: item.listing.sale_price ?? item.listing.price,
            image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
            location: item.listing.city.name,
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
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { listingPublicId } = req.params;
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: String(listingPublicId) },
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
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { listingPublicId } = req.params;
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: String(listingPublicId) },
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
        const session = await (0, session_1.requireAnyRole)(req, [
            ROLE_BUYER,
            ROLE_SELLER,
            ROLE_ADMIN,
        ]);
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
                social_profile: typeof body.socialProfile === "string"
                    ? body.socialProfile.trim()
                    : null,
                credibility: typeof body.credibility === "string"
                    ? body.credibility.trim()
                    : null,
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
profileRouter.post("/listings/:listingPublicId/review", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER]);
        if (!session.ok) {
            res.status(session.status).json({ error: session.message });
            return;
        }
        const { listingPublicId } = req.params;
        const body = (req.body ?? {});
        const rating = Number(body.rating);
        const comment = typeof body.comment === "string" ? body.comment.trim() : "";
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            res.status(400).json({ error: "Rating must be an integer from 1 to 5" });
            return;
        }
        if (comment.length < 3) {
            res.status(400).json({ error: "Comment is too short" });
            return;
        }
        const listing = await prisma_1.prisma.marketplaceListing.findUnique({
            where: { public_id: String(listingPublicId) },
            select: { id: true },
        });
        if (!listing) {
            res.status(404).json({ error: "Listing not found" });
            return;
        }
        const orderCount = await prisma_1.prisma.marketOrder.count({
            where: {
                buyer_id: session.user.id,
                status: "COMPLETED",
                items: {
                    some: {
                        listing_id: listing.id,
                    },
                },
            },
        });
        if (orderCount === 0) {
            res.status(403).json({ error: "You can only review items you have purchased." });
            return;
        }
        const existingReview = await prisma_1.prisma.listingReview.findUnique({
            where: {
                listing_id_author_id: {
                    listing_id: listing.id,
                    author_id: session.user.id,
                },
            },
        });
        if (existingReview) {
            res.status(409).json({ error: "You have already reviewed this item." });
            return;
        }
        const newReview = await prisma_1.prisma.listingReview.create({
            data: {
                listing_id: listing.id,
                author_id: session.user.id,
                rating,
                comment,
            },
            include: {
                author: {
                    select: {
                        display_name: true,
                        avatar: true,
                    },
                },
            },
        });
        const avgRating = await prisma_1.prisma.listingReview.aggregate({
            _avg: {
                rating: true,
            },
            where: {
                listing_id: listing.id,
            },
        });
        await prisma_1.prisma.marketplaceListing.update({
            where: { id: listing.id },
            data: {
                rating: avgRating._avg.rating ?? 0,
            },
        });
        res.status(201).json({
            id: String(newReview.id),
            author: newReview.author.display_name ?? "Аноним",
            rating: newReview.rating,
            date: newReview.created_at,
            comment: newReview.comment,
            avatar: newReview.author.avatar,
        });
    }
    catch (error) {
        console.error("Error creating review:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.get("/notifications", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            return res.status(session.status).json({ error: session.message });
        }
        const notifications = await prisma_1.prisma.notification.findMany({
            where: { user_id: session.user.id },
            orderBy: { created_at: "desc" },
        });
        const unreadCount = await prisma_1.prisma.notification.count({
            where: { user_id: session.user.id, is_read: false },
        });
        return res.json({
            notifications: notifications.map((n) => ({
                id: n.id,
                type: n.type,
                message: n.message,
                url: n.target_url,
                isRead: n.is_read,
                date: n.created_at,
            })),
            unreadCount,
        });
    }
    catch (error) {
        console.error("Error fetching notifications:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
profileRouter.patch("/notifications/mark-as-read", async (req, res) => {
    try {
        const session = await (0, session_1.requireAnyRole)(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
        if (!session.ok) {
            return res.status(session.status).json({ error: session.message });
        }
        await prisma_1.prisma.notification.updateMany({
            where: { user_id: session.user.id, is_read: false },
            data: { is_read: true },
        });
        return res.json({ success: true });
    }
    catch (error) {
        console.error("Error marking notifications as read:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});
//# sourceMappingURL=profile.routes.js.map