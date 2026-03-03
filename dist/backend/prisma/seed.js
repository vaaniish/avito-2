"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function asJson(value) {
    return JSON.stringify(value);
}
const productCategories = [
    {
        id: "smartphones-wearables",
        name: "Телефоны и носимая электроника",
        icon_key: "smartphone",
        subcategories: [
            {
                id: "smartphones",
                name: "Смартфоны",
                items: ["iPhone", "Samsung", "Xiaomi", "Другие бренды"],
            },
            {
                id: "wearables",
                name: "Умные часы и браслеты",
                items: ["Apple Watch", "Фитнес-браслеты", "Смарт-часы Android", "Аксессуары"],
            },
        ],
    },
    {
        id: "computers",
        name: "Компьютеры и ноутбуки",
        icon_key: "cpu",
        subcategories: [
            {
                id: "laptops",
                name: "Ноутбуки",
                items: ["MacBook", "Игровые ноутбуки", "Офисные ноутбуки"],
            },
            {
                id: "peripherals",
                name: "Периферия",
                items: ["Мониторы", "Клавиатуры", "Мыши", "Веб-камеры"],
            },
        ],
    },
    {
        id: "audio",
        name: "Аудиотехника",
        icon_key: "speaker",
        subcategories: [
            {
                id: "headphones",
                name: "Наушники",
                items: ["Беспроводные", "Накладные", "Игровые гарнитуры"],
            },
        ],
    },
    {
        id: "home-appliances",
        name: "Бытовая техника",
        icon_key: "washing-machine",
        subcategories: [
            {
                id: "kitchen",
                name: "Кухонная техника",
                items: ["Холодильники", "Кофемашины", "Микроволновые печи"],
            },
        ],
    },
];
const serviceCategories = [
    {
        id: "electronics-repair",
        name: "Ремонт электроники",
        icon_key: "wrench",
        subcategories: [
            {
                id: "phone-repair",
                name: "Ремонт телефонов",
                items: ["Замена экрана", "Замена аккумулятора", "Ремонт после воды"],
            },
            {
                id: "laptop-repair",
                name: "Ремонт ноутбуков",
                items: ["Диагностика", "Замена SSD", "Чистка от пыли"],
            },
        ],
    },
    {
        id: "installation",
        name: "Установка и настройка",
        icon_key: "home",
        subcategories: [
            {
                id: "tv-installation",
                name: "Установка телевизоров",
                items: ["Монтаж на стену", "Настройка Smart TV"],
            },
        ],
    },
];
async function seedCategories(type, categories) {
    const map = new Map();
    for (const [catIndex, category] of categories.entries()) {
        const createdCategory = await prisma.catalogCategory.create({
            data: {
                public_id: category.id,
                type,
                name: category.name,
                icon_key: category.icon_key,
                order_index: catIndex,
            },
        });
        map.set(category.name, createdCategory.id);
        for (const [subIndex, subcategory] of category.subcategories.entries()) {
            const createdSubcategory = await prisma.catalogSubcategory.create({
                data: {
                    category_id: createdCategory.id,
                    public_id: `${category.id}-${subcategory.id}`,
                    name: subcategory.name,
                    order_index: subIndex,
                },
            });
            for (const [itemIndex, item] of subcategory.items.entries()) {
                await prisma.catalogSubcategoryItem.create({
                    data: {
                        subcategory_id: createdSubcategory.id,
                        name: item,
                        order_index: itemIndex,
                    },
                });
            }
        }
    }
    return map;
}
async function main() {
    await prisma.partnerAchievement.deleteMany();
    await prisma.xpAccrual.deleteMany();
    await prisma.order.deleteMany();
    await prisma.achievement.deleteMany();
    await prisma.loyaltyLevel.deleteMany();
    await prisma.partner.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.kycRequest.deleteMany();
    await prisma.platformTransaction.deleteMany();
    await prisma.marketOrderItem.deleteMany();
    await prisma.marketOrder.deleteMany();
    await prisma.listingQuestion.deleteMany();
    await prisma.listingReview.deleteMany();
    await prisma.wishlistItem.deleteMany();
    await prisma.marketplaceListing.deleteMany();
    await prisma.catalogSubcategoryItem.deleteMany();
    await prisma.catalogSubcategory.deleteMany();
    await prisma.catalogCategory.deleteMany();
    await prisma.partnershipRequest.deleteMany();
    await prisma.commissionTier.deleteMany();
    await prisma.userAddress.deleteMany();
    await prisma.appUser.deleteMany();
    const usersSeed = [
        {
            public_id: "USR-001",
            role: "BUYER",
            status: "ACTIVE",
            email: "demo@ecomm.ru",
            password: "demo123",
            name: "Демо Покупатель",
            first_name: "Демо",
            last_name: "Покупатель",
            display_name: "Демо Покупатель",
            username: "demo",
            phone: "+7 (999) 000-00-01",
            city: "Москва",
            avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=774&auto=format&fit=crop",
        },
        {
            public_id: "SLR-001",
            role: "SELLER",
            status: "ACTIVE",
            email: "partner@ecomm.ru",
            password: "partner123",
            name: "Партнер Демо",
            first_name: "Партнер",
            last_name: "Демо",
            display_name: "Партнер Демо",
            username: "partner",
            phone: "+7 (999) 000-00-02",
            city: "Москва",
            avatar: "https://images.unsplash.com/photo-1544723795-3fb6469f5b39?q=80&w=774&auto=format&fit=crop",
        },
        {
            public_id: "ADM-001",
            role: "ADMIN",
            status: "ACTIVE",
            email: "admin@ecomm.ru",
            password: "admin123",
            name: "Администратор",
            first_name: "Админ",
            last_name: "Панель",
            display_name: "Администратор",
            username: "admin",
            phone: "+7 (999) 000-00-03",
            city: "Москва",
        },
        {
            public_id: "USR-123",
            role: "BUYER",
            status: "ACTIVE",
            email: "ivan.petrov@example.com",
            password: "buyer123",
            name: "Иван Петров",
            phone: "+7 (999) 111-22-33",
            city: "Москва",
        },
        {
            public_id: "USR-789",
            role: "BUYER",
            status: "ACTIVE",
            email: "maria.sidorova@example.com",
            password: "buyer123",
            name: "Мария Сидорова",
            phone: "+7 (999) 333-44-55",
            city: "Казань",
        },
        {
            public_id: "USR-234",
            role: "BUYER",
            status: "ACTIVE",
            email: "alexey.k@example.com",
            password: "buyer123",
            name: "Алексей Кузнецов",
            phone: "+7 (999) 234-23-23",
            city: "Москва",
        },
        {
            public_id: "USR-345",
            role: "BUYER",
            status: "ACTIVE",
            email: "olga.smirnova@example.com",
            password: "buyer123",
            name: "Ольга Смирнова",
            phone: "+7 (999) 345-34-34",
            city: "Москва",
        },
        {
            public_id: "USR-666",
            role: "BUYER",
            status: "BLOCKED",
            email: "suspicious@example.com",
            password: "buyer123",
            name: "Подозрительный Пользователь",
            phone: "+7 (999) 000-00-00",
            city: "Москва",
            block_reason: "Мошеннические действия, множественные споры",
        },
        {
            public_id: "SLR-456",
            role: "SELLER",
            status: "ACTIVE",
            email: "techmarket@example.com",
            password: "seller123",
            name: "ТехМаркет",
            phone: "+7 (999) 234-56-78",
            city: "Санкт-Петербург",
            avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=774&auto=format&fit=crop",
        },
        {
            public_id: "SLR-202",
            role: "SELLER",
            status: "ACTIVE",
            email: "gadgetpro@example.com",
            password: "seller123",
            name: "ГаджетПро",
            phone: "+7 (999) 202-20-20",
            city: "Казань",
            avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=774&auto=format&fit=crop",
        },
        {
            public_id: "SLR-999",
            role: "SELLER",
            status: "BLOCKED",
            email: "seller.suspicious@example.com",
            password: "seller123",
            name: "СомнительныйПродавец",
            phone: "+7 (999) 999-99-99",
            city: "Москва",
            block_reason: "Подозрение в мошенничестве",
        },
    ];
    await prisma.appUser.createMany({ data: usersSeed });
    const users = await prisma.appUser.findMany({ select: { id: true, public_id: true, name: true } });
    const userIdByPublic = new Map(users.map((user) => [user.public_id, user.id]));
    const getUserId = (publicId) => {
        const id = userIdByPublic.get(publicId);
        if (!id)
            throw new Error(`Missing user id for ${publicId}`);
        return id;
    };
    await prisma.userAddress.createMany({
        data: [
            {
                user_id: getUserId("USR-001"),
                label: "Дом",
                region: "Москва",
                city: "Москва",
                street: "Тверская улица",
                building: "д. 12, кв. 45",
                postal_code: "125009",
                is_default: true,
            },
            {
                user_id: getUserId("USR-001"),
                label: "Работа",
                region: "Москва",
                city: "Москва",
                street: "Красная площадь",
                building: "д. 1",
                postal_code: "101000",
                is_default: false,
            },
            {
                user_id: getUserId("SLR-001"),
                label: "Склад",
                region: "Москва",
                city: "Москва",
                street: "Ленинградское шоссе",
                building: "д. 32",
                postal_code: "125445",
                is_default: true,
            },
        ],
    });
    const productCategoryMap = await seedCategories("PRODUCT", productCategories);
    const serviceCategoryMap = await seedCategories("SERVICE", serviceCategories);
    const categoryMap = new Map([...productCategoryMap.entries(), ...serviceCategoryMap.entries()]);
    const listingsSeed = [
        {
            public_id: "LST-001",
            seller_public_id: "SLR-001",
            type: "PRODUCT",
            title: "iPhone 15 Pro Max 256GB Titanium",
            description: "Новый запечатанный iPhone 15 Pro Max в титановом цвете",
            category_name: "Телефоны и носимая электроника",
            price: 129000,
            sale_price: 119000,
            rating: 4.9,
            condition: "NEW",
            status: "ACTIVE",
            moderation_status: "APPROVED",
            views: 342,
            city: "Москва",
            image: "https://images.unsplash.com/photo-1679896949191-dc62950076ba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
            images: [
                "https://images.unsplash.com/photo-1679896949191-dc62950076ba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080",
            ],
            is_new: true,
            is_sale: true,
            is_verified: true,
            shipping_by_seller: true,
            sku: "IP15PM-256-TI",
            publish_date: "20 декабря в 14:30",
            seller_response_time: "около 30 минут",
            seller_listings: 6,
            breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Смартфоны", "iPhone"],
            specifications: {
                Состояние: "Отличное, как новый",
                Экран: "Без царапин",
                Аккумулятор: "99%",
                Память: "256 ГБ",
            },
            is_price_lower: true,
        },
        {
            public_id: "LST-002",
            seller_public_id: "SLR-456",
            type: "PRODUCT",
            title: "MacBook Air M2 16GB 512GB",
            description: "MacBook Air 2024, серебристый, запечатанный",
            category_name: "Компьютеры и ноутбуки",
            price: 145000,
            sale_price: null,
            rating: 4.8,
            condition: "NEW",
            status: "ACTIVE",
            moderation_status: "APPROVED",
            views: 521,
            city: "Санкт-Петербург",
            image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80",
            images: ["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80"],
            is_new: true,
            is_sale: false,
            is_verified: true,
            shipping_by_seller: true,
            sku: "MBA-M2-512",
            publish_date: "19 декабря в 10:15",
            seller_response_time: "около 15 минут",
            seller_listings: 12,
            breadcrumbs: ["Главная", "Компьютеры и ноутбуки", "Ноутбуки", "MacBook"],
            specifications: {
                Процессор: "Apple M2",
                ОЗУ: "16 ГБ",
                SSD: "512 ГБ",
            },
            is_price_lower: false,
        },
        {
            public_id: "LST-003",
            seller_public_id: "SLR-999",
            type: "PRODUCT",
            title: "ДЕШЕВО!!! АЙФОН 14 ПРО",
            description: "СУПЕР ЦЕНА!!! ЗВОНИТЕ СРОЧНО!!!",
            category_name: "Телефоны и носимая электроника",
            price: 5000,
            sale_price: null,
            rating: 2.8,
            condition: "NEW",
            status: "INACTIVE",
            moderation_status: "REJECTED",
            views: 15,
            city: "Москва",
            image: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1080&q=80",
            images: ["https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1080&q=80"],
            is_new: false,
            is_sale: false,
            is_verified: false,
            shipping_by_seller: true,
            sku: "SPAM-IP14",
            publish_date: "31 января в 11:30",
            seller_response_time: "более 1 дня",
            seller_listings: 5,
            breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Смартфоны"],
            specifications: { Состояние: "Сомнительно" },
            is_price_lower: true,
        },
        {
            public_id: "LST-004",
            seller_public_id: "SLR-001",
            type: "PRODUCT",
            title: "Samsung Galaxy S23 Ultra 256GB",
            description: "Новый телефон в упаковке",
            category_name: "Телефоны и носимая электроника",
            price: 89990,
            sale_price: null,
            rating: 4.8,
            condition: "NEW",
            status: "ACTIVE",
            moderation_status: "APPROVED",
            views: 412,
            city: "Москва",
            image: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=1080&q=80",
            images: ["https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=1080&q=80"],
            is_new: true,
            is_sale: false,
            is_verified: true,
            shipping_by_seller: true,
            sku: "SMSNG-S23U",
            publish_date: "15 января в 10:30",
            seller_response_time: "около 20 минут",
            seller_listings: 6,
            breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Смартфоны", "Samsung"],
            specifications: {
                Память: "256 ГБ",
                Экран: "6.8 AMOLED",
            },
            is_price_lower: false,
        },
        {
            public_id: "LST-005",
            seller_public_id: "SLR-001",
            type: "PRODUCT",
            title: "MacBook Pro 14 M3 512GB",
            description: "MacBook Pro последнего поколения",
            category_name: "Компьютеры и ноутбуки",
            price: 189990,
            sale_price: 179990,
            rating: 4.9,
            condition: "NEW",
            status: "ACTIVE",
            moderation_status: "APPROVED",
            views: 612,
            city: "Москва",
            image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80",
            images: ["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80"],
            is_new: true,
            is_sale: true,
            is_verified: true,
            shipping_by_seller: true,
            sku: "MBP14-M3-512",
            publish_date: "20 января в 11:00",
            seller_response_time: "около 15 минут",
            seller_listings: 6,
            breadcrumbs: ["Главная", "Компьютеры и ноутбуки", "Ноутбуки"],
            specifications: { Процессор: "M3", ОЗУ: "18 ГБ" },
            is_price_lower: false,
        },
        {
            public_id: "LST-006",
            seller_public_id: "SLR-001",
            type: "PRODUCT",
            title: "AirPods Pro 2 поколения",
            description: "Беспроводные наушники Apple",
            category_name: "Аудиотехника",
            price: 21990,
            sale_price: null,
            rating: 4.7,
            condition: "NEW",
            status: "INACTIVE",
            moderation_status: "APPROVED",
            views: 145,
            city: "Москва",
            image: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=1080&q=80",
            images: ["https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=1080&q=80"],
            is_new: false,
            is_sale: false,
            is_verified: true,
            shipping_by_seller: true,
            sku: "APP-AIRPODS2",
            publish_date: "28 января в 09:15",
            seller_response_time: "около 1 часа",
            seller_listings: 6,
            breadcrumbs: ["Главная", "Аудиотехника", "Наушники"],
            specifications: { Тип: "Вкладыши", Шумоподавление: "Активное" },
            is_price_lower: false,
        },
        {
            public_id: "LST-007",
            seller_public_id: "SLR-001",
            type: "PRODUCT",
            title: "iPad Air M2 128GB",
            description: "Планшет Apple с чипом M2",
            category_name: "Телефоны и носимая электроника",
            price: 69990,
            sale_price: null,
            rating: 4.8,
            condition: "NEW",
            status: "MODERATION",
            moderation_status: "PENDING",
            views: 0,
            city: "Москва",
            image: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=1080&q=80",
            images: ["https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=1080&q=80"],
            is_new: true,
            is_sale: false,
            is_verified: true,
            shipping_by_seller: true,
            sku: "IPAD-AIR-M2",
            publish_date: "2 февраля в 16:30",
            seller_response_time: "около 30 минут",
            seller_listings: 6,
            breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Планшеты"],
            specifications: { Память: "128 ГБ", Цвет: "Blue" },
            is_price_lower: false,
        },
        {
            public_id: "LST-008",
            seller_public_id: "SLR-456",
            type: "SERVICE",
            title: "Замена экрана iPhone",
            description: "Профессиональная замена экрана iPhone за 1 час",
            category_name: "Ремонт электроники",
            price: 7900,
            sale_price: null,
            rating: 4.7,
            condition: "NEW",
            status: "ACTIVE",
            moderation_status: "APPROVED",
            views: 212,
            city: "Санкт-Петербург",
            image: "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1080&q=80",
            images: ["https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1080&q=80"],
            is_new: false,
            is_sale: false,
            is_verified: true,
            shipping_by_seller: false,
            sku: "SERV-IP-SCREEN",
            publish_date: "12 января в 12:30",
            seller_response_time: "около 40 минут",
            seller_listings: 12,
            breadcrumbs: ["Главная", "Услуги", "Ремонт электроники"],
            specifications: {
                Срок: "1 час",
                Гарантия: "6 месяцев",
            },
            is_price_lower: false,
        },
    ];
    const listingIdByPublic = new Map();
    for (const listing of listingsSeed) {
        const created = await prisma.marketplaceListing.create({
            data: {
                public_id: listing.public_id,
                seller_id: getUserId(listing.seller_public_id),
                type: listing.type,
                title: listing.title,
                description: listing.description,
                category_id: categoryMap.get(listing.category_name) ?? null,
                category_name: listing.category_name,
                price: listing.price,
                sale_price: listing.sale_price,
                rating: listing.rating,
                condition: listing.condition,
                status: listing.status,
                moderation_status: listing.moderation_status,
                views: listing.views,
                city: listing.city,
                image: listing.image,
                images: asJson(listing.images),
                is_new: listing.is_new,
                is_sale: listing.is_sale,
                is_verified: listing.is_verified,
                shipping_by_seller: listing.shipping_by_seller,
                sku: listing.sku,
                publish_date: listing.publish_date,
                seller_response_time: listing.seller_response_time,
                seller_listings: listing.seller_listings,
                breadcrumbs: asJson(listing.breadcrumbs),
                specifications: asJson(listing.specifications),
                is_price_lower: listing.is_price_lower,
            },
        });
        listingIdByPublic.set(listing.public_id, created.id);
    }
    await prisma.listingReview.createMany({
        data: [
            {
                listing_id: listingIdByPublic.get("LST-004"),
                author_name: "Александр К.",
                rating: 5,
                date: "2026-02-15",
                comment: "Отличный продавец, товар как в описании",
            },
            {
                listing_id: listingIdByPublic.get("LST-004"),
                author_name: "Мария С.",
                rating: 4,
                date: "2026-02-12",
                comment: "Быстрая доставка, рекомендую",
            },
            {
                listing_id: listingIdByPublic.get("LST-005"),
                author_name: "Илья Н.",
                rating: 5,
                date: "2026-02-08",
                comment: "Супер состояние ноутбука",
            },
        ],
    });
    await prisma.listingQuestion.createMany({
        data: [
            {
                public_id: "Q001",
                listing_id: listingIdByPublic.get("LST-004"),
                buyer_id: getUserId("USR-123"),
                question: "Какое состояние экрана? Есть царапины?",
                status: "PENDING",
                created_at: new Date("2026-03-02T10:30:00"),
            },
            {
                public_id: "Q002",
                listing_id: listingIdByPublic.get("LST-005"),
                buyer_id: getUserId("USR-789"),
                question: "Сколько циклов перезарядки у батареи?",
                answer: "Батарея в отличном состоянии, 47 циклов перезарядки.",
                status: "ANSWERED",
                created_at: new Date("2026-03-01T15:20:00"),
                answered_at: new Date("2026-03-01T16:45:00"),
            },
            {
                public_id: "Q003",
                listing_id: listingIdByPublic.get("LST-007"),
                buyer_id: getUserId("USR-345"),
                question: "В комплекте идёт зарядное устройство?",
                status: "PENDING",
                created_at: new Date("2026-03-02T09:15:00"),
            },
        ],
    });
    await prisma.wishlistItem.createMany({
        data: [
            { user_id: getUserId("USR-001"), listing_id: listingIdByPublic.get("LST-005") },
            { user_id: getUserId("USR-001"), listing_id: listingIdByPublic.get("LST-004") },
            { user_id: getUserId("USR-001"), listing_id: listingIdByPublic.get("LST-008") },
        ],
    });
    const ordersSeed = [
        {
            public_id: "ORD-1001",
            buyer_public_id: "USR-001",
            seller_public_id: "SLR-456",
            status: "COMPLETED",
            delivery_type: "DELIVERY",
            delivery_address: "Москва, Пятницкая улица, 90",
            total_price: 154980,
            created_at: "2024-01-15T12:00:00",
            delivery_cost: 500,
            discount: 474,
            items: [{ listing_public_id: "LST-005", name: "MacBook Pro 14 M3", quantity: 1, price: 149990 }],
        },
        {
            public_id: "ORD-1002",
            buyer_public_id: "USR-001",
            seller_public_id: "SLR-202",
            status: "PAID",
            delivery_type: "DELIVERY",
            delivery_address: "Москва, Ленина 1",
            total_price: 89990,
            created_at: "2023-12-20T09:30:00",
            delivery_cost: 500,
            discount: 0,
            items: [{ listing_public_id: "LST-004", name: "Samsung Galaxy S23 Ultra", quantity: 1, price: 89990 }],
        },
        {
            public_id: "ORD-1003",
            buyer_public_id: "USR-001",
            seller_public_id: "SLR-001",
            status: "CANCELLED",
            delivery_type: "DELIVERY",
            delivery_address: "Москва, Ленина 1",
            total_price: 156480,
            created_at: "2023-11-05T14:15:00",
            delivery_cost: 500,
            discount: 0,
            items: [
                { listing_public_id: "LST-005", name: "MacBook Pro 14 M3", quantity: 1, price: 149990 },
                { listing_public_id: "LST-006", name: "AirPods Pro", quantity: 1, price: 6490 },
            ],
        },
        {
            public_id: "ORD-001",
            buyer_public_id: "USR-123",
            seller_public_id: "SLR-001",
            status: "PAID",
            delivery_type: "DELIVERY",
            delivery_address: "Москва, Тверская улица, 12",
            total_price: 45000,
            created_at: "2025-02-03T10:30:00",
            delivery_cost: 500,
            discount: 0,
            items: [{ listing_public_id: "LST-004", name: "Samsung Galaxy S23", quantity: 1, price: 45000 }],
        },
        {
            public_id: "ORD-002",
            buyer_public_id: "USR-789",
            seller_public_id: "SLR-001",
            status: "PREPARED",
            delivery_type: "PICKUP",
            delivery_address: "ПВЗ Москва, проспект Мира, 1",
            total_price: 89990,
            created_at: "2025-02-02T14:20:00",
            delivery_cost: 0,
            discount: 0,
            items: [{ listing_public_id: "LST-005", name: "MacBook Air M2", quantity: 1, price: 89990 }],
        },
        {
            public_id: "ORD-003",
            buyer_public_id: "USR-234",
            seller_public_id: "SLR-001",
            status: "SHIPPED",
            delivery_type: "DELIVERY",
            delivery_address: "Казань, улица Баумана, 15",
            total_price: 15500,
            created_at: "2025-02-01T09:15:00",
            delivery_cost: 500,
            discount: 0,
            items: [{ listing_public_id: "LST-006", name: "AirPods Pro", quantity: 2, price: 7750 }],
        },
    ];
    const orderIdByPublic = new Map();
    for (const order of ordersSeed) {
        const createdOrder = await prisma.marketOrder.create({
            data: {
                public_id: order.public_id,
                buyer_id: getUserId(order.buyer_public_id),
                seller_id: getUserId(order.seller_public_id),
                status: order.status,
                delivery_type: order.delivery_type,
                delivery_address: order.delivery_address,
                total_price: order.total_price,
                delivery_cost: order.delivery_cost,
                discount: order.discount,
                created_at: new Date(order.created_at),
                items: {
                    create: order.items.map((item) => ({
                        listing_id: listingIdByPublic.get(item.listing_public_id) ?? null,
                        name: item.name,
                        image: listingsSeed.find((listing) => listing.public_id === item.listing_public_id)?.image ?? null,
                        price: item.price,
                        quantity: item.quantity,
                    })),
                },
            },
        });
        orderIdByPublic.set(order.public_id, createdOrder.id);
    }
    await prisma.platformTransaction.createMany({
        data: [
            {
                public_id: "TXN-001",
                order_id: orderIdByPublic.get("ORD-001"),
                buyer_id: getUserId("USR-123"),
                seller_id: getUserId("SLR-001"),
                amount: 45000,
                status: "HELD",
                commission_rate: 3.5,
                commission: 1575,
                payment_provider: "Stripe",
                payment_intent_id: "pi_3abc123",
                created_at: new Date("2026-02-01T10:30:00"),
            },
            {
                public_id: "TXN-002",
                order_id: orderIdByPublic.get("ORD-002"),
                buyer_id: getUserId("USR-789"),
                seller_id: getUserId("SLR-001"),
                amount: 89990,
                status: "SUCCESS",
                commission_rate: 2.5,
                commission: 2225,
                payment_provider: "PayPal",
                payment_intent_id: "pi_3def456",
                created_at: new Date("2026-02-01T09:15:00"),
            },
            {
                public_id: "TXN-003",
                order_id: orderIdByPublic.get("ORD-003"),
                buyer_id: getUserId("USR-234"),
                seller_id: getUserId("SLR-001"),
                amount: 15500,
                status: "CANCELLED",
                commission_rate: 4,
                commission: 620,
                payment_provider: "Stripe",
                payment_intent_id: "pi_3ghi789",
                created_at: new Date("2026-02-01T08:45:00"),
            },
            {
                public_id: "TXN-004",
                order_id: orderIdByPublic.get("ORD-1001"),
                buyer_id: getUserId("USR-001"),
                seller_id: getUserId("SLR-456"),
                amount: 154980,
                status: "SUCCESS",
                commission_rate: 3.5,
                commission: 5424,
                payment_provider: "Stripe",
                payment_intent_id: "pi_3jkl012",
                created_at: new Date("2026-01-31T16:20:00"),
            },
        ],
    });
    await prisma.complaint.createMany({
        data: [
            {
                public_id: "CMP-001",
                created_at: new Date("2026-02-01T11:00:00"),
                status: "NEW",
                complaint_type: "Несоответствие описанию",
                listing_id: listingIdByPublic.get("LST-001"),
                seller_id: getUserId("SLR-001"),
                reporter_id: getUserId("USR-123"),
                seller_violations_count: 0,
                description: "Продавец указал, что телефон новый, но на фото видны царапины на экране",
                evidence: asJson(["photo1.jpg", "photo2.jpg"]),
            },
            {
                public_id: "CMP-002",
                created_at: new Date("2026-01-31T14:00:00"),
                status: "APPROVED",
                complaint_type: "Мошенничество",
                listing_id: listingIdByPublic.get("LST-003"),
                seller_id: getUserId("SLR-999"),
                reporter_id: getUserId("USR-234"),
                seller_violations_count: 3,
                description: "Продавец запрашивает оплату напрямую, минуя платформу",
                evidence: asJson(["chat_screenshot.jpg"]),
                checked_at: new Date("2026-01-31T16:00:00"),
                checked_by_id: getUserId("ADM-001"),
                action_taken: "Подтверждено нарушение → Временная блокировка на 7 дней",
            },
            {
                public_id: "CMP-003",
                created_at: new Date("2026-01-30T10:20:00"),
                status: "REJECTED",
                complaint_type: "Спам / дубликат",
                listing_id: listingIdByPublic.get("LST-005"),
                seller_id: getUserId("SLR-001"),
                reporter_id: getUserId("USR-789"),
                seller_violations_count: 1,
                description: "Продавец создал 5 одинаковых объявлений",
                evidence: null,
                checked_at: new Date("2026-01-30T14:00:00"),
                checked_by_id: getUserId("ADM-001"),
                action_taken: "Отклонена жалоба — дубликаты не обнаружены",
            },
        ],
    });
    await prisma.kycRequest.createMany({
        data: [
            {
                public_id: "KYC-001",
                created_at: new Date("2026-02-01T08:00:00"),
                status: "PENDING",
                seller_id: getUserId("SLR-001"),
                email: "partner@ecomm.ru",
                phone: "+7 (999) 000-00-02",
                company_name: "ООО Партнер Демо",
                inn: "7701234567",
                address: "Москва, ул. Ленина, д. 10",
                documents: asJson(["passport.pdf", "inn_certificate.pdf", "license.pdf"]),
                notes: "Новая заявка на верификацию",
            },
            {
                public_id: "KYC-002",
                created_at: new Date("2026-01-31T12:30:00"),
                status: "APPROVED",
                seller_id: getUserId("SLR-456"),
                email: "techmarket@example.com",
                phone: "+7 (999) 234-56-78",
                company_name: "ИП Иванов И.И.",
                inn: "7702345678",
                address: "Санкт-Петербург, Невский пр., д. 25",
                documents: asJson(["passport.pdf", "inn_certificate.pdf"]),
                notes: "Проверено и одобрено",
                reviewed_by_id: getUserId("ADM-001"),
                reviewed_at: new Date("2026-01-31T16:00:00"),
            },
            {
                public_id: "KYC-003",
                created_at: new Date("2026-01-30T14:15:00"),
                status: "REJECTED",
                seller_id: getUserId("SLR-999"),
                email: "seller.suspicious@example.com",
                phone: "+7 (999) 000-00-00",
                company_name: "ООО Рога и Копыта",
                inn: "0000000000",
                address: "Адрес не указан",
                documents: asJson(["invalid_doc.pdf"]),
                notes: "Недостаточно документов, подозрительная информация",
                reviewed_by_id: getUserId("ADM-001"),
                reviewed_at: new Date("2026-01-30T18:00:00"),
                rejection_reason: "Недостаточно документов для верификации",
            },
        ],
    });
    await prisma.commissionTier.createMany({
        data: [
            {
                public_id: "TIER-1",
                name: "Новичок",
                min_sales: 0,
                max_sales: 100000,
                commission_rate: 5.0,
                description: "Для новых продавцов",
                sellers_count: 45,
            },
            {
                public_id: "TIER-2",
                name: "Стандарт",
                min_sales: 100001,
                max_sales: 500000,
                commission_rate: 4.0,
                description: "Для активных продавцов",
                sellers_count: 78,
            },
            {
                public_id: "TIER-3",
                name: "Продвинутый",
                min_sales: 500001,
                max_sales: 2000000,
                commission_rate: 3.0,
                description: "Для опытных продавцов",
                sellers_count: 32,
            },
            {
                public_id: "TIER-4",
                name: "Премиум",
                min_sales: 2000001,
                max_sales: null,
                commission_rate: 2.5,
                description: "Для топ продавцов",
                sellers_count: 12,
            },
        ],
    });
    await prisma.auditLog.createMany({
        data: [
            {
                public_id: "LOG-001",
                timestamp: new Date("2026-02-01T11:30:00"),
                admin_id: getUserId("ADM-001"),
                action: "approve_kyc",
                target_id: "KYC-002",
                target_type: "kyc_request",
                details: "Одобрена заявка продавца ТехМаркет",
                ip_address: "192.168.1.1",
            },
            {
                public_id: "LOG-002",
                timestamp: new Date("2026-02-01T10:15:00"),
                admin_id: getUserId("ADM-001"),
                action: "block_user",
                target_id: "USR-666",
                target_type: "user",
                details: "Заблокирован пользователь за мошеннические действия",
                ip_address: "192.168.1.1",
            },
            {
                public_id: "LOG-003",
                timestamp: new Date("2026-02-01T09:45:00"),
                admin_id: getUserId("ADM-001"),
                action: "reject_listing",
                target_id: "LST-003",
                target_type: "listing",
                details: "Отклонено объявление из-за подозрительной цены",
                ip_address: "192.168.1.1",
            },
        ],
    });
    await prisma.partnershipRequest.create({
        data: {
            public_id: "PRQ-001",
            user_id: getUserId("USR-001"),
            seller_type: "COMPANY",
            name: "ООО Демо Компания",
            email: "demo@ecomm.ru",
            contact: "+7 (999) 000-00-01",
            link: "https://example.com",
            category: "Электроника",
            inn: "7701234567",
            geography: "Москва и область",
            social_profile: null,
            credibility: null,
            why_us: "Хотим продавать на качественной платформе с живой аудиторией.",
        },
    });
    await prisma.loyaltyLevel.createMany({
        data: [
            { id: 1, level_name: "Новичок", xp_threshold: 0, xp_coefficient: 1.0 },
            { id: 2, level_name: "Бронза", xp_threshold: 500, xp_coefficient: 1.1 },
            { id: 3, level_name: "Серебро", xp_threshold: 1500, xp_coefficient: 1.25 },
            { id: 4, level_name: "Золото", xp_threshold: 3500, xp_coefficient: 1.5 },
            { id: 5, level_name: "Платина", xp_threshold: 7000, xp_coefficient: 1.75 },
            { id: 6, level_name: "Бриллиант", xp_threshold: 15000, xp_coefficient: 2.0 },
        ],
    });
    await prisma.partner.create({
        data: {
            id: 1,
            name: "Test Partner",
            current_xp: 0,
            rating: 5.0,
        },
    });
    await prisma.achievement.createMany({
        data: [
            {
                id: 1,
                name: "Первая продажа",
                description: "Совершите первую успешную продажу",
                icon: "star",
                xp_reward: 50,
            },
            {
                id: 2,
                name: "Три сделки",
                description: "Завершите 3 сделки",
                icon: "zap",
                xp_reward: 80,
            },
            {
                id: 3,
                name: "Десять сделок",
                description: "Завершите 10 успешных сделок",
                icon: "trophy",
                xp_reward: 150,
            },
            {
                id: 4,
                name: "50 сделок",
                description: "Завершите 50 успешных сделок",
                icon: "target",
                xp_reward: 500,
            },
            {
                id: 5,
                name: "Мастер оборота",
                description: "Достигните оборота 500 000 ₽",
                icon: "award",
                xp_reward: 250,
            },
            {
                id: 6,
                name: "Миллионер",
                description: "Продайте товаров на сумму 1 000 000 ₽",
                icon: "star",
                xp_reward: 750,
            },
            {
                id: 7,
                name: "Легенда лиги",
                description: "Наберите 10 000 XP",
                icon: "trophy",
                xp_reward: 600,
            },
            {
                id: 8,
                name: "Секрет: Теневая сделка",
                description: "Проведите одну сделку на 250 000 ₽",
                icon: "star",
                xp_reward: 1200,
            },
        ],
    });
    console.log("Database seeded successfully!");
    console.log(`Users: ${users.length}, listings: ${listingsSeed.length}, orders: ${ordersSeed.length}`);
    console.log("Login credentials:");
    console.log("regular -> demo@ecomm.ru / demo123");
    console.log("partner -> partner@ecomm.ru / partner123");
    console.log("admin -> admin@ecomm.ru / admin123");
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