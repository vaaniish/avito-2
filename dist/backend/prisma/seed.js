"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const adapter_pg_1 = require("@prisma/adapter-pg");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl)
    throw new Error("Переменная DATABASE_URL не задана");
const prisma = new client_1.PrismaClient({
    adapter: new adapter_pg_1.PrismaPg({ connectionString: databaseUrl }),
});
const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const getRequired = (map, key, name) => {
    const value = map.get(key);
    if (value === undefined)
        throw new Error(`${name} не найден: ${String(key)}`);
    return value;
};
async function main() {
    console.log("Очистка таблиц...");
    await prisma.auditLog.deleteMany();
    await prisma.orderStatusHistory.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.kycRequest.deleteMany();
    await prisma.platformTransaction.deleteMany();
    await prisma.marketOrderItem.deleteMany();
    await prisma.marketOrder.deleteMany();
    await prisma.listingQuestion.deleteMany();
    await prisma.listingReview.deleteMany();
    await prisma.wishlistItem.deleteMany();
    await prisma.listingAttribute.deleteMany();
    await prisma.listingImage.deleteMany();
    await prisma.marketplaceListing.deleteMany();
    await prisma.catalogItem.deleteMany();
    await prisma.catalogSubcategory.deleteMany();
    await prisma.catalogCategory.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.partnershipRequest.deleteMany();
    await prisma.sellerProfile.deleteMany();
    await prisma.commissionTier.deleteMany();
    await prisma.userAddress.deleteMany();
    await prisma.appUser.deleteMany();
    await prisma.city.deleteMany();
    const cities = [
        ["Москва", "Москва"],
        ["Санкт-Петербург", "Ленинградская область"],
        ["Казань", "Республика Татарстан"],
        ["Екатеринбург", "Свердловская область"],
        ["Новосибирск", "Новосибирская область"],
        ["Краснодар", "Краснодарский край"],
        ["Сочи", "Краснодарский край"],
        ["Нижний Новгород", "Нижегородская область"],
    ];
    await prisma.city.createMany({
        data: cities.map(([name, region]) => ({ name, region })),
    });
    const cityMap = new Map((await prisma.city.findMany({ select: { id: true, name: true } })).map((c) => [
        c.name,
        c.id,
    ]));
    const users = [
        ["ADM-001", "ADMIN", "ACTIVE", "admin@ecomm.local", "admin123", "Главный администратор", "admin_main", "Москва", 800, "+79001000100", null],
        ["BUY-001", "BUYER", "ACTIVE", "buyer1@ecomm.local", "buyer123", "Анна Орлова", "anna_orlova", "Москва", 260, "+79001000101", null],
        ["BUY-002", "BUYER", "ACTIVE", "buyer2@ecomm.local", "buyer123", "Иван Петров", "ivan_petrov", "Санкт-Петербург", 210, "+79001000102", null],
        ["BUY-003", "BUYER", "ACTIVE", "buyer3@ecomm.local", "buyer123", "Никита Смирнов", "nikita_smirnov", "Казань", 180, "+79001000103", null],
        ["BUY-004", "BUYER", "ACTIVE", "buyer4@ecomm.local", "buyer123", "Ольга Волкова", "olga_volkova", "Сочи", 140, "+79001000104", null],
        ["SLR-001", "SELLER", "ACTIVE", "seller1@ecomm.local", "seller123", "Тех Поинт", "tech_point", "Москва", 420, "+79002000101", null],
        ["SLR-002", "SELLER", "ACTIVE", "seller2@ecomm.local", "seller123", "Мобайл Эксперт", "mobile_expert", "Казань", 350, "+79002000102", null],
        ["SLR-003", "SELLER", "ACTIVE", "seller3@ecomm.local", "seller123", "Домашний Комфорт", "home_comfort", "Екатеринбург", 220, "+79002000103", null],
        ["SLR-004", "SELLER", "ACTIVE", "seller4@ecomm.local", "seller123", "Сервис Хаб", "service_hub", "Краснодар", 170, "+79002000104", null],
        ["SLR-005", "SELLER", "BLOCKED", "seller5@ecomm.local", "seller123", "КвикФикс Про", "quickfix_pro", "Москва", 70, "+79002000105", "Просьбы об оплате вне платформы"],
    ];
    await prisma.appUser.createMany({
        data: await Promise.all(users.map(async (u) => ({
            public_id: u[0],
            role: u[1],
            status: u[2],
            email: u[3],
            password: await bcrypt_1.default.hash(u[4], 10),
            name: u[5],
            username: u[6],
            city_id: getRequired(cityMap, u[7], "City"),
            joined_at: daysAgo(u[8]),
            phone: u[9],
            block_reason: u[10],
        }))),
    });
    const userMap = new Map((await prisma.appUser.findMany({ select: { id: true, public_id: true } })).map((u) => [
        u.public_id,
        u.id,
    ]));
    await prisma.notification.createMany({
        data: [
            ["BUY-001", "ORDER_STATUS", "Заказ ORD-1001 завершен", "/orders/ORD-1001", false],
            ["BUY-002", "NEW_QUESTION", "Продавец ответил на ваш вопрос", "/listing/LST-003/questions", true],
            ["SLR-001", "SYSTEM", "Верификация KYC одобрена", "/seller/kyc", true],
            ["SLR-002", "INFO", "Обновлен уровень комиссии", "/seller/commission", false],
            ["BUY-003", "ORDER_STATUS", "Заказ ORD-1008 подготовлен", "/orders/ORD-1008", false],
            ["BUY-004", "ORDER_STATUS", "Заказ ORD-1004 отправлен", "/orders/ORD-1004", false],
            ["SLR-004", "SYSTEM", "Получена новая жалоба", "/seller/complaints", false],
            ["ADM-001", "SYSTEM", "Готов ежедневный отчет модерации", "/admin/listings", true],
        ].map((n) => ({
            user_id: getRequired(userMap, n[0], "User"),
            type: n[1],
            message: n[2],
            target_url: n[3],
            is_read: n[4],
        })),
    });
    await prisma.userAddress.createMany({
        data: [
            ["BUY-001", "дом", "Москва", "Тверская", "12", "125009", true],
            ["BUY-001", "работа", "Москва", "Ленина", "4", "125047", false],
            ["BUY-002", "дом", "Санкт-Петербург", "Невский проспект", "101", "191025", true],
            ["BUY-003", "дом", "Казань", "Баумана", "9", "420111", true],
            ["BUY-004", "дом", "Сочи", "Навагинская", "15", "354000", true],
            ["SLR-001", "склад", "Москва", "Профсоюзная", "45", "117335", true],
            ["SLR-002", "склад", "Казань", "Пушкина", "22", "420015", true],
            ["SLR-003", "склад", "Екатеринбург", "Малышева", "36", "620014", true],
            ["SLR-004", "склад", "Краснодар", "Красная", "120", "350000", true],
        ].map((a) => ({
            user_id: getRequired(userMap, a[0], "User"),
            label: a[1],
            city_id: getRequired(cityMap, a[2], "City"),
            street: a[3],
            building: a[4],
            postal_code: a[5],
            is_default: a[6],
        })),
    });
    await prisma.commissionTier.createMany({
        data: [
            ["TIER-001", "Старт", 0, 100000, 6, "Базовый уровень для новых продавцов"],
            ["TIER-002", "База", 100001, 500000, 4.5, "Уровень для активных продавцов"],
            ["TIER-003", "Продвинутый", 500001, 1500000, 3.5, "Уровень для продавцов с высоким оборотом"],
            ["TIER-004", "Профи", 1500001, 4000000, 2.8, "Уровень для топ-продавцов"],
            ["TIER-005", "Корпоративный", 4000001, null, 2.2, "Уровень для крупных партнеров"],
        ].map((t) => ({
            public_id: t[0],
            name: t[1],
            min_sales: t[2],
            max_sales: t[3],
            commission_rate: t[4],
            description: t[5],
        })),
    });
    const tierMap = new Map((await prisma.commissionTier.findMany({ select: { id: true, public_id: true } })).map((t) => [t.public_id, t.id]));
    await prisma.sellerProfile.createMany({
        data: [
            ["SLR-001", true, 18, "TIER-003"],
            ["SLR-002", true, 25, "TIER-002"],
            ["SLR-003", true, 35, "TIER-002"],
            ["SLR-004", false, 48, "TIER-001"],
            ["SLR-005", false, 120, "TIER-001"],
        ].map((s) => ({
            user_id: getRequired(userMap, s[0], "User"),
            is_verified: s[1],
            average_response_minutes: s[2],
            commission_tier_id: getRequired(tierMap, s[3], "Tier"),
        })),
    });
    await prisma.catalogCategory.createMany({
        data: [
            ["CAT-001", "PRODUCT", "Электроника", "cpu", 1],
            ["CAT-002", "PRODUCT", "Бытовая техника", "home", 2],
            ["CAT-003", "PRODUCT", "Спорт", "dumbbell", 3],
            ["CAT-004", "SERVICE", "Ремонт", "wrench", 4],
            ["CAT-005", "SERVICE", "Установка", "tool", 5],
        ].map((c) => ({
            public_id: c[0],
            type: c[1],
            name: c[2],
            icon_key: c[3],
            order_index: c[4],
        })),
    });
    const categoryMap = new Map((await prisma.catalogCategory.findMany({ select: { id: true, public_id: true } })).map((c) => [c.public_id, c.id]));
    await prisma.catalogSubcategory.createMany({
        data: [
            ["SUB-001", "CAT-001", "Смартфоны", 1],
            ["SUB-002", "CAT-001", "Ноутбуки", 2],
            ["SUB-003", "CAT-002", "Кухня", 1],
            ["SUB-004", "CAT-002", "Уборка", 2],
            ["SUB-005", "CAT-003", "Велосипеды", 1],
            ["SUB-006", "CAT-003", "Обувь", 2],
            ["SUB-007", "CAT-004", "Ремонт телефонов", 1],
            ["SUB-008", "CAT-005", "Монтаж дома", 1],
        ].map((s) => ({
            public_id: s[0],
            category_id: getRequired(categoryMap, s[1], "Category"),
            name: s[2],
            order_index: s[3],
        })),
    });
    const subcategoryMap = new Map((await prisma.catalogSubcategory.findMany({ select: { id: true, public_id: true } })).map((s) => [s.public_id, s.id]));
    await prisma.catalogItem.createMany({
        data: [
            ["ITM-001", "SUB-001", "iPhone 15 Pro", 1],
            ["ITM-002", "SUB-001", "Samsung S24", 2],
            ["ITM-003", "SUB-002", "MacBook Air M3", 1],
            ["ITM-004", "SUB-002", "ThinkPad X1", 2],
            ["ITM-005", "SUB-003", "Coffee Machine", 1],
            ["ITM-006", "SUB-004", "Robot Vacuum", 1],
            ["ITM-007", "SUB-005", "City Bicycle", 1],
            ["ITM-008", "SUB-006", "Running Shoes", 1],
            ["ITM-009", "SUB-007", "Замена экрана", 1],
            ["ITM-010", "SUB-008", "Монтаж ТВ на стену", 1],
        ].map((i) => ({
            public_id: i[0],
            subcategory_id: getRequired(subcategoryMap, i[1], "Subcategory"),
            name: i[2],
            order_index: i[3],
        })),
    });
    const itemMap = new Map((await prisma.catalogItem.findMany({ select: { id: true, public_id: true } })).map((i) => [
        i.public_id,
        i.id,
    ]));
    const listings = [
        ["LST-001", "SLR-001", "ITM-001", "Москва", "PRODUCT", "iPhone 15 Pro 256GB", 119000, 113900, "NEW", "ACTIVE", "APPROVED", 740, true],
        ["LST-002", "SLR-001", "ITM-003", "Москва", "PRODUCT", "MacBook Air M3 16/512", 169900, 165000, "NEW", "ACTIVE", "APPROVED", 518, true],
        ["LST-003", "SLR-002", "ITM-002", "Казань", "PRODUCT", "Samsung S24 Ultra 512GB", 104000, 98000, "NEW", "ACTIVE", "APPROVED", 429, true],
        ["LST-004", "SLR-003", "ITM-006", "Екатеринбург", "PRODUCT", "Robot Vacuum R9", 25500, 24000, "NEW", "ACTIVE", "APPROVED", 275, true],
        ["LST-005", "SLR-004", "ITM-007", "Краснодар", "PRODUCT", "City Bicycle 28", 18000, null, "USED", "MODERATION", "PENDING", 109, false],
        ["LST-006", "SLR-002", "ITM-010", "Казань", "SERVICE", "Установка телевизора на стену", 3200, null, "NEW", "ACTIVE", "APPROVED", 333, false],
        ["LST-007", "SLR-005", "ITM-009", "Москва", "SERVICE", "Замена экрана за 30 минут", 3500, null, "NEW", "INACTIVE", "REJECTED", 94, false],
        ["LST-008", "SLR-004", "ITM-010", "Краснодар", "SERVICE", "Установка кондиционера", 8900, 8200, "NEW", "ACTIVE", "APPROVED", 262, false],
        ["LST-009", "SLR-003", "ITM-005", "Екатеринбург", "PRODUCT", "Coffee Machine CM-500", 23500, 22000, "NEW", "ACTIVE", "APPROVED", 382, true],
        ["LST-010", "SLR-002", "ITM-008", "Нижний Новгород", "PRODUCT", "Running Shoes RS-10", 6800, 6500, "NEW", "ACTIVE", "APPROVED", 214, true],
    ];
    const listingMap = new Map();
    const listingTitleMap = new Map();
    const listingImageMap = new Map();
    for (const l of listings) {
        const created = await prisma.marketplaceListing.create({
            data: {
                public_id: l[0],
                seller_id: getRequired(userMap, l[1], "User"),
                item_id: getRequired(itemMap, l[2], "Item"),
                city_id: getRequired(cityMap, l[3], "City"),
                type: l[4],
                title: l[5],
                description: `Подробное описание: ${l[5]}`,
                price: l[6],
                sale_price: l[7],
                condition: l[8],
                status: l[9],
                moderation_status: l[10],
                views: l[11],
                shipping_by_seller: l[12],
                rating: 4.5,
            },
        });
        listingMap.set(l[0], created.id);
        listingTitleMap.set(l[0], l[5]);
        listingImageMap.set(l[0], `https://placehold.co/800x600?text=${encodeURIComponent(l[0])}`);
        await prisma.listingImage.createMany({
            data: [
                {
                    listing_id: created.id,
                    url: `https://placehold.co/1200x800?text=${encodeURIComponent(l[0])}+1`,
                    sort_order: 0,
                },
            ],
        });
        await prisma.listingAttribute.createMany({
            data: [
                { listing_id: created.id, key: "характеристика_1", value: `Параметр для ${l[5]}`, sort_order: 0 },
            ],
        });
    }
    await prisma.listingReview.createMany({
        data: listings.map((l, idx) => ({
            listing_id: getRequired(listingMap, l[0], "Listing"),
            author_id: getRequired(userMap, `BUY-00${(idx % 4) + 1}`, "User"),
            rating: [5, 5, 4, 5, 4, 5, 2, 5, 4, 5][idx] ?? 4,
            comment: `Отзыв по объявлению ${l[0]}`,
            created_at: daysAgo(20 - idx),
        })),
    });
    await prisma.listingQuestion.createMany({
        data: [
            ["QST-001", "LST-001", "BUY-002", "Сможете отправить сегодня?", "Да, отправим до вечера", "ANSWERED", 11, 10],
            ["QST-002", "LST-002", "BUY-003", "Есть русская раскладка?", "Нет, стандартная раскладка", "ANSWERED", 10, 9],
            ["QST-003", "LST-003", "BUY-004", "Поддерживает две SIM-карты?", "Да, поддерживает", "ANSWERED", 8, 8],
            ["QST-004", "LST-004", "BUY-001", "Какой уровень шума при работе?", null, "PENDING", 6, null],
            ["QST-005", "LST-006", "BUY-004", "Инструменты привозите с собой?", "Да, весь инструмент с мастером", "ANSWERED", 4, 4],
            ["QST-006", "LST-008", "BUY-003", "Есть доплата за 10 этаж?", null, "PENDING", 3, null],
            ["QST-007", "LST-009", "BUY-002", "Контейнер можно мыть в посудомойке?", "Да, можно", "ANSWERED", 2, 2],
            ["QST-008", "LST-010", "BUY-004", "Сделаете скидку за две пары?", null, "PENDING", 1, null],
        ].map((q) => ({
            public_id: q[0],
            listing_id: getRequired(listingMap, q[1], "Listing"),
            buyer_id: getRequired(userMap, q[2], "User"),
            question: q[3],
            answer: q[4],
            status: q[5],
            created_at: daysAgo(q[6]),
            answered_at: q[7] === null ? null : daysAgo(q[7]),
        })),
    });
    await prisma.wishlistItem.createMany({
        data: [
            ["BUY-001", "LST-003"],
            ["BUY-001", "LST-009"],
            ["BUY-002", "LST-001"],
            ["BUY-002", "LST-010"],
            ["BUY-003", "LST-002"],
            ["BUY-003", "LST-006"],
            ["BUY-004", "LST-004"],
            ["BUY-004", "LST-008"],
            ["BUY-001", "LST-005"],
            ["BUY-002", "LST-007"],
        ].map((w) => ({
            user_id: getRequired(userMap, w[0], "User"),
            listing_id: getRequired(listingMap, w[1], "Listing"),
        })),
    });
    const orders = [
        ["ORD-1001", "BUY-001", "SLR-001", "COMPLETED", "DELIVERY", "Москва, Тверская 12", 500, 0, 14, [["LST-001", 113900, 1]]],
        ["ORD-1002", "BUY-002", "SLR-002", "PROCESSING", "PICKUP", null, 0, 0, 9, [["LST-003", 98000, 1]]],
        ["ORD-1003", "BUY-003", "SLR-003", "CREATED", "DELIVERY", "Казань, Баумана 9", 700, 0, 7, [["LST-004", 24000, 1]]],
        ["ORD-1004", "BUY-004", "SLR-004", "SHIPPED", "DELIVERY", "Сочи, Навагинская 15", 600, 0, 6, [["LST-005", 18000, 1]]],
        ["ORD-1005", "BUY-001", "SLR-005", "CANCELLED", "PICKUP", null, 0, 0, 5, [["LST-007", 3500, 1]]],
        ["ORD-1006", "BUY-004", "SLR-002", "PAID", "DELIVERY", "Сочи, Навагинская 15", 400, 0, 4, [["LST-006", 3200, 1]]],
        ["ORD-1007", "BUY-002", "SLR-003", "DELIVERED", "PICKUP", null, 0, 0, 3, [["LST-009", 22000, 1]]],
        ["ORD-1008", "BUY-003", "SLR-001", "PREPARED", "DELIVERY", "Казань, Пушкина 18", 800, 5000, 2, [["LST-002", 165000, 1]]],
    ];
    const orderMap = new Map();
    for (const o of orders) {
        const itemsTotal = o[9].reduce((acc, item) => acc + item[1] * item[2], 0);
        const total = itemsTotal + o[6] - o[7];
        const created = await prisma.marketOrder.create({
            data: {
                public_id: o[0],
                buyer_id: getRequired(userMap, o[1], "User"),
                seller_id: getRequired(userMap, o[2], "User"),
                status: o[3],
                delivery_type: o[4],
                delivery_address: o[5],
                total_price: total,
                delivery_cost: o[6],
                discount: o[7],
                created_at: daysAgo(o[8]),
                items: {
                    create: o[9].map((i) => ({
                        listing_id: getRequired(listingMap, i[0], "Listing"),
                        name: getRequired(listingTitleMap, i[0], "ListingTitle"),
                        image: getRequired(listingImageMap, i[0], "ListingImage"),
                        price: i[1],
                        quantity: i[2],
                    })),
                },
            },
        });
        orderMap.set(o[0], created.id);
    }
    await prisma.orderStatusHistory.createMany({
        data: [
            ["ORD-1001", "CREATED", "PAID", "BUY-001", "Покупатель оплатил заказ", 14],
            ["ORD-1001", "PAID", "COMPLETED", "SLR-001", "Заказ доставлен и подтвержден", 13],
            ["ORD-1002", "CREATED", "PAID", "BUY-002", "Оплата прошла успешно", 9],
            ["ORD-1002", "PAID", "PROCESSING", "SLR-002", "Продавец начал обработку", 8],
            ["ORD-1004", "PAID", "SHIPPED", "SLR-004", "Посылка передана в доставку", 5],
            ["ORD-1005", "CREATED", "CANCELLED", "BUY-001", "Покупатель отменил заказ", 5],
            ["ORD-1006", "CREATED", "PAID", "BUY-004", "Оплата завершена", 4],
            ["ORD-1007", "PROCESSING", "DELIVERED", "SLR-003", "Покупатель получил заказ", 2],
            ["ORD-1008", "PAID", "PREPARED", "SLR-001", "Заказ собран и готов к отправке", 1],
            ["ORD-1003", null, "CREATED", "BUY-003", "Заказ создан", 7],
        ].map((h) => ({
            order_id: getRequired(orderMap, h[0], "Order"),
            from_status: h[1],
            to_status: h[2],
            changed_by_id: getRequired(userMap, h[3], "User"),
            reason: h[4],
            created_at: daysAgo(h[5]),
        })),
    });
    await prisma.platformTransaction.createMany({
        data: [
            ["TXN-1001", "ORD-1001", "BUY-001", "SLR-001", 114400, "SUCCESS", 3.5, 4004, "YOOMONEY", "pi_1001", 14],
            ["TXN-1002", "ORD-1002", "BUY-002", "SLR-002", 98000, "HELD", 4.5, 4410, "STRIPE", "pi_1002", 9],
            ["TXN-1003", "ORD-1003", "BUY-003", "SLR-003", 24700, "PENDING", 4.5, 1112, "OTHER", "pi_1003", 7],
            ["TXN-1004", "ORD-1004", "BUY-004", "SLR-004", 18600, "SUCCESS", 6, 1116, "CASH", "pi_1004", 6],
            ["TXN-1005", "ORD-1005", "BUY-001", "SLR-005", 3500, "CANCELLED", 6, 210, "YOOMONEY", "pi_1005", 5],
            ["TXN-1006", "ORD-1006", "BUY-004", "SLR-002", 3600, "FAILED", 4.5, 162, "STRIPE", "pi_1006", 4],
            ["TXN-1007", "ORD-1007", "BUY-002", "SLR-003", 22000, "REFUNDED", 4.5, 990, "OTHER", "pi_1007", 3],
            ["TXN-1008", "ORD-1008", "BUY-003", "SLR-001", 160800, "SUCCESS", 3.5, 5628, "YOOMONEY", "pi_1008", 2],
        ].map((t) => ({
            public_id: t[0],
            order_id: getRequired(orderMap, t[1], "Order"),
            buyer_id: getRequired(userMap, t[2], "User"),
            seller_id: getRequired(userMap, t[3], "User"),
            amount: t[4],
            status: t[5],
            commission_rate: t[6],
            commission: t[7],
            payment_provider: t[8],
            payment_intent_id: t[9],
            created_at: daysAgo(t[10]),
        })),
    });
    await prisma.complaint.createMany({
        data: [
            ["CMP-001", "APPROVED", "внеплатформенная_оплата", "LST-007", "SLR-005", "BUY-002", "Продавец попросил перевод напрямую на карту", "chat.png", 4, "ADM-001", "Объявление отклонено, продавец заблокирован"],
            ["CMP-002", "PENDING", "несоответствие_описанию", "LST-002", "SLR-001", "BUY-003", "Характеристики RAM не совпадают с описанием", null, null, null, null],
            ["CMP-003", "NEW", "задержка_доставки", "LST-005", "SLR-004", "BUY-001", "Отправка задержана более чем на 5 дней", null, null, null, null],
            ["CMP-004", "REJECTED", "нарушение_не_подтверждено", "LST-001", "SLR-001", "BUY-004", "Проверка не выявила нарушения", "report.pdf", 8, "ADM-001", "Жалоба отклонена после проверки"],
            ["CMP-005", "APPROVED", "низкое_качество_услуги", "LST-008", "SLR-004", "BUY-004", "Работа выполнена не полностью", "photos.zip", 2, "ADM-001", "Продавцу вынесено предупреждение"],
            ["CMP-006", "PENDING", "повреждение_товара", "LST-009", "SLR-003", "BUY-002", "На панели обнаружены повреждения", "damage.png", null, null, null],
        ].map((c) => ({
            public_id: c[0],
            status: c[1],
            complaint_type: c[2],
            listing_id: getRequired(listingMap, c[3], "Listing"),
            seller_id: getRequired(userMap, c[4], "User"),
            reporter_id: getRequired(userMap, c[5], "User"),
            description: c[6],
            evidence: c[7],
            checked_at: c[8] === null ? null : daysAgo(c[8]),
            checked_by_id: c[9] === null ? null : getRequired(userMap, c[9], "User"),
            action_taken: c[10],
        })),
    });
    await prisma.kycRequest.createMany({
        data: [
            ["KYC-001", "APPROVED", "SLR-001", "seller1@ecomm.local", "+79002000101", "ООО Тех Поинт", "7701000001", "Москва, Профсоюзная 45", "doc1.zip", "Проверка пройдена", "ADM-001", 60, null],
            ["KYC-002", "APPROVED", "SLR-002", "seller2@ecomm.local", "+79002000102", "ООО Мобайл Эксперт", "1651000002", "Казань, Пушкина 22", "doc2.zip", "Проверка пройдена", "ADM-001", 52, null],
            ["KYC-003", "PENDING", "SLR-003", "seller3@ecomm.local", "+79002000103", "ООО Домашний Комфорт", "6601000003", "Екатеринбург, Малышева 36", "doc3.zip", "Ожидает проверки", null, null, null],
            ["KYC-004", "REJECTED", "SLR-004", "seller4@ecomm.local", "+79002000104", "ООО Сервис Хаб", "2301000004", "Краснодар, Красная 120", "doc4.zip", "Пакет документов неполный", "ADM-001", 11, "Не хватает подтверждения адреса"],
            ["KYC-005", "PENDING", "SLR-005", "seller5@ecomm.local", "+79002000105", "ИП КвикФикс Про", "7701000005", "Москва, Ленинградский проспект 80", "doc5.zip", null, null, null, null],
        ].map((k) => ({
            public_id: k[0],
            status: k[1],
            seller_id: getRequired(userMap, k[2], "User"),
            email: k[3],
            phone: k[4],
            company_name: k[5],
            inn: k[6],
            address: k[7],
            documents: k[8],
            notes: k[9],
            reviewed_by_id: k[10] === null ? null : getRequired(userMap, k[10], "User"),
            reviewed_at: k[11] === null ? null : daysAgo(k[11]),
            rejection_reason: k[12],
        })),
    });
    await prisma.partnershipRequest.createMany({
        data: [
            ["PRQ-001", "BUY-001", "COMPANY", "ООО Север Трейд", "north.trade@example.com", "+79003000101", "https://north.example.com", "Электроника", "7702000001", "Москва", "@north", "Работают с 2018 года", "Нужны безопасные сделки и стабильный трафик"],
            ["PRQ-002", "BUY-002", "INDIVIDUAL", "Павел Соколов", "pavel@example.com", "+79003000102", "https://pavel.example.com", "Ремонт", "5403000002", "Санкт-Петербург", "@pavel", "Опыт работы 5 лет", "Нужен стабильный поток заказов"],
            ["PRQ-003", "BUY-003", "PRIVATE", "Ирина Петрова", "irina@example.com", "+79003000103", "https://irina.example.com", "Спорт", null, "Казань", "@irina", "Локальный топ-продавец", "Планирую масштабировать продажи"],
            ["PRQ-004", "BUY-004", "COMPANY", "ООО Морской Бриз", "hello@seabreeze.example.com", "+79003000104", "https://seabreeze.example.com", "Установка", "2302000004", "Сочи", "@seabreeze", "Сертифицированные мастера", "Нужна защита в спорных ситуациях"],
            ["PRQ-005", "BUY-004", "INDIVIDUAL", "Дмитрий Федоров", "dmitry@example.com", "+79003000105", "https://dmitry.example.com", "Электроника", "5403000005", "Новосибирск", "@dmitry", "Более 2000 отзывов на внешних площадках", "Нужна аналитика и рост продаж"],
            ["PRQ-006", "SLR-004", "COMPANY", "Филиал Сервис Хаб", "branch@servicehub.example.com", "+79003000106", "https://servicehub.example.com/branch", "Установка", "2302000006", "Краснодар", "@servicehub", "Выход в новые регионы", "Хочу развивать продажи в нескольких городах"],
        ].map((p) => ({
            public_id: p[0],
            user_id: getRequired(userMap, p[1], "User"),
            seller_type: p[2],
            name: p[3],
            email: p[4],
            contact: p[5],
            link: p[6],
            category: p[7],
            inn: p[8],
            geography: p[9],
            social_profile: p[10],
            credibility: p[11],
            why_us: p[12],
        })),
    });
    await prisma.auditLog.createMany({
        data: [
            ["AUD-001", "complaint.status_changed", "complaint", "CMP-001", { доСтатуса: "PENDING", послеСтатуса: "APPROVED" }, 4],
            ["AUD-002", "kyc.status_changed", "kyc_request", "KYC-004", { доСтатуса: "PENDING", послеСтатуса: "REJECTED" }, 11],
            ["AUD-003", "listing.moderation_changed", "listing", "LST-007", { доМодерации: "PENDING", послеМодерации: "REJECTED" }, 12],
            ["AUD-004", "user.status_changed", "user", "SLR-005", { доСтатуса: "ACTIVE", послеСтатуса: "BLOCKED" }, 10],
            ["AUD-005", "commission_tier.rate_changed", "commission_tier", "TIER-002", { доСтавки: 5, послеСтавки: 4.5 }, 3],
            ["AUD-006", "listing.moderation_changed", "listing", "LST-005", { доМодерации: "APPROVED", послеМодерации: "PENDING" }, 1],
        ].map((a) => ({
            public_id: a[0],
            actor_user_id: getRequired(userMap, "ADM-001", "User"),
            action: a[1],
            entity_type: a[2],
            entity_public_id: a[3],
            details: a[4],
            ip_address: "127.0.0.1",
            created_at: daysAgo(a[5]),
        })),
    });
    const allListings = await prisma.marketplaceListing.findMany({ select: { id: true } });
    for (const listing of allListings) {
        const avg = await prisma.listingReview.aggregate({
            _avg: { rating: true },
            where: { listing_id: listing.id },
        });
        await prisma.marketplaceListing.update({
            where: { id: listing.id },
            data: { rating: Math.round((avg._avg.rating ?? 0) * 10) / 10 },
        });
    }
    const [citiesCount, usersCount, notificationsCount, addressesCount, tiersCount, sellerProfilesCount, categoriesCount, subcategoriesCount, itemsCount, listingsCount, imagesCount, attributesCount, reviewsCount, questionsCount, wishlistCount, ordersCount, orderItemsCount, orderHistoryCount, transactionsCount, complaintsCount, kycCount, partnershipCount, auditCount,] = await Promise.all([
        prisma.city.count(),
        prisma.appUser.count(),
        prisma.notification.count(),
        prisma.userAddress.count(),
        prisma.commissionTier.count(),
        prisma.sellerProfile.count(),
        prisma.catalogCategory.count(),
        prisma.catalogSubcategory.count(),
        prisma.catalogItem.count(),
        prisma.marketplaceListing.count(),
        prisma.listingImage.count(),
        prisma.listingAttribute.count(),
        prisma.listingReview.count(),
        prisma.listingQuestion.count(),
        prisma.wishlistItem.count(),
        prisma.marketOrder.count(),
        prisma.marketOrderItem.count(),
        prisma.orderStatusHistory.count(),
        prisma.platformTransaction.count(),
        prisma.complaint.count(),
        prisma.kycRequest.count(),
        prisma.partnershipRequest.count(),
        prisma.auditLog.count(),
    ]);
    console.log("Сидирование завершено:");
    console.log(`Города=${citiesCount}, Пользователи=${usersCount}, Уведомления=${notificationsCount}`);
    console.log(`Адреса=${addressesCount}, УровниКомиссий=${tiersCount}, ПрофилиПродавцов=${sellerProfilesCount}`);
    console.log(`Категории=${categoriesCount}, Подкатегории=${subcategoriesCount}, ПозицииКаталога=${itemsCount}`);
    console.log(`Объявления=${listingsCount}, Изображения=${imagesCount}, Атрибуты=${attributesCount}`);
    console.log(`Отзывы=${reviewsCount}, Вопросы=${questionsCount}, Избранное=${wishlistCount}`);
    console.log(`Заказы=${ordersCount}, ПозицииЗаказов=${orderItemsCount}, ИсторияСтатусовЗаказов=${orderHistoryCount}`);
    console.log(`Транзакции=${transactionsCount}, Жалобы=${complaintsCount}, ЗаявкиKYC=${kycCount}`);
    console.log(`ПартнерскиеЗаявки=${partnershipCount}, ЖурналАудита=${auditCount}`);
    console.log("Данные для входа:");
    console.log("admin -> admin@ecomm.local / admin123");
    console.log("buyer -> buyer1@ecomm.local / buyer123");
    console.log("seller -> seller1@ecomm.local / seller123");
}
main()
    .catch((error) => {
    console.error(error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map