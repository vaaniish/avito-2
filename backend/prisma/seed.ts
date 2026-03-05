import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

type CityData = {
  name: string;
  region: string;
};

type ListingSeed = {
  public_id: string;
  seller_public_id: string;
  type: "PRODUCT" | "SERVICE";
  title: string;
  description: string;
  item_name: string;
  price: number;
  sale_price: number | null;
  condition: "NEW" | "USED";
  status: "ACTIVE" | "INACTIVE" | "MODERATION";
  moderation_status: "APPROVED" | "REJECTED" | "PENDING";
  city_name: string; // Changed to city_name
  images: string[];
  attributes: Record<string, string>;
};

async function main(): Promise<void> {
  // Clear all data - order matters due to foreign key constraints
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

  await prisma.partnershipRequest.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.commissionTier.deleteMany();
  await prisma.userAddress.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.city.deleteMany(); // Delete City records
  await prisma.notification.deleteMany();

  // --- Seed Cities ---
  const initialCities: CityData[] = [
    { name: "Москва", region: "Москва" },
    { name: "Санкт-Петербург", region: "Ленинградская область" },
    { name: "Казань", region: "Республика Татарстан" },
    { name: "Екатеринбург", region: "Свердловская область" },
    { name: "Новосибирск", region: "Новосибирская область" },
    { name: "Краснодар", region: "Краснодарский край" },
    { name: "Сочи", region: "Краснодарский край" },
  ];

  await prisma.city.createMany({
    data: initialCities,
    skipDuplicates: true,
  });

  const allCities = await prisma.city.findMany();
  const cityIdByName = new Map(allCities.map((city) => [city.name, city.id]));
  const cityId = (name: string): number => {
    const id = cityIdByName.get(name);
    if (!id) throw new Error(`City ${name} not found`);
    return id;
  };

  // --- Seed AppUsers ---
  const saltRounds = 10;
  const usersData = [
    {
      public_id: "ADM-001",
      role: "ADMIN",
      status: "ACTIVE",
      email: "admin@ecomm.ru",
      password: "admin123",
      name: "Администратор",
      display_name: "Администратор",
      city_id: cityId("Москва"),
      joined_at: daysAgo(500),
    },
    {
      public_id: "USR-001",
      role: "BUYER",
      status: "ACTIVE",
      email: "demo@ecomm.ru",
      password: "demo123",
      name: "Демо Покупатель",
      display_name: "Демо Покупатель",
      city_id: cityId("Москва"),
      joined_at: daysAgo(300),
    },
    {
      public_id: "USR-101",
      role: "BUYER",
      status: "ACTIVE",
      email: "ivan.petrov@example.com",
      password: "buyer123",
      name: "Иван Петров",
      display_name: "Иван Петров",
      city_id: cityId("Санкт-Петербург"),
      joined_at: daysAgo(200),
    },
    {
      public_id: "SLR-001",
      role: "SELLER",
      status: "ACTIVE",
      email: "partner@ecomm.ru",
      password: "partner123",
      name: "Partner Demo",
      display_name: "Partner Demo",
      city_id: cityId("Москва"),
      joined_at: daysAgo(400),
    },
    {
      public_id: "SLR-201",
      role: "SELLER",
      status: "ACTIVE",
      email: "techpoint@example.com",
      password: "seller123",
      name: "TechPoint Store",
      display_name: "TechPoint Store",
      city_id: cityId("Казань"),
      joined_at: daysAgo(350),
    },
    {
      public_id: "SLR-202",
      role: "SELLER",
      status: "ACTIVE",
      email: "gadgethaven@example.com",
      password: "seller123",
      name: "Gadget Haven",
      display_name: "Gadget Haven",
      city_id: cityId("Екатеринбург"),
      joined_at: daysAgo(150),
    },
    {
      public_id: "SLR-999",
      role: "SELLER",
      status: "BLOCKED",
      email: "seller.suspicious@example.com",
      password: "seller123",
      name: "Suspicious Seller",
      display_name: "Suspicious Seller",
      city_id: cityId("Москва"),
      block_reason: "Мошеннические действия",
      joined_at: daysAgo(100),
    },
  ];

  const hashedUsersData = await Promise.all(
    usersData.map(async (user) => {
      const hashedPassword = await bcrypt.hash(user.password, saltRounds);
      return { ...user, password: hashedPassword };
    }),
  );

  await prisma.appUser.createMany({
    data: hashedUsersData,
  });

  const users = await prisma.appUser.findMany({
    select: { id: true, public_id: true, email: true, city_id: true },
  });
  const userIdByPublic = new Map(
    users.map((user) => [user.public_id, user.id]),
  );
  const userId = (publicId: string): number => {
    const id = userIdByPublic.get(publicId);
    if (!id) throw new Error(`User ${publicId} not found`);
    return id;
  };

  // --- Seed User Addresses ---
  await prisma.userAddress.createMany({
    data: [
      {
        user_id: userId("USR-001"),
        label: "Дом",
        city_id: cityId("Москва"),
        street: "Тверская",
        building: "12",
        postal_code: "125009",
        is_default: true,
      },
      {
        user_id: userId("USR-101"),
        label: "Рабочий",
        city_id: cityId("Санкт-Петербург"),
        street: "Невский проспект",
        building: "100",
        postal_code: "191025",
        is_default: true,
      },
    ],
  });

  // --- Seed Catalog Categories, Subcategories, Items ---
  await prisma.catalogCategory.createMany({
    data: [
      { public_id: "cat-prod", type: "PRODUCT", name: "Электроника", icon_key: "smartphone", order_index: 0 },
      { public_id: "cat-serv", type: "SERVICE", name: "Услуги", icon_key: "wrench", order_index: 0 },
      { public_id: "cat-home", type: "PRODUCT", name: "Для Дома", icon_key: "home", order_index: 1 },
    ],
  });

  const productCategory = await prisma.catalogCategory.findUnique({ where: { public_id: "cat-prod" } });
  const serviceCategory = await prisma.catalogCategory.findUnique({ where: { public_id: "cat-serv" } });
  const homeCategory = await prisma.catalogCategory.findUnique({ where: { public_id: "cat-home" } });

  if (!productCategory || !serviceCategory || !homeCategory) throw new Error("Categories not found");

  const productSubcategory = await prisma.catalogSubcategory.create({
    data: {
      category_id: productCategory.id,
      public_id: "sub-prod-main",
      name: "Телефоны и Ноутбуки",
      order_index: 0,
    },
  });
  const serviceSubcategory = await prisma.catalogSubcategory.create({
    data: {
      category_id: serviceCategory.id,
      public_id: "sub-serv-main",
      name: "Ремонт и Установка",
      order_index: 0,
    },
  });
  const kitchenSubcategory = await prisma.catalogSubcategory.create({
    data: {
      category_id: homeCategory.id,
      public_id: "sub-home-kitchen",
      name: "Кухонная техника",
      order_index: 0,
    },
  });

  await prisma.catalogItem.createMany({
    data: [
      { subcategory_id: productSubcategory.id, public_id: "itm-iphone", name: "iPhone", order_index: 0 },
      { subcategory_id: productSubcategory.id, public_id: "itm-macbook", name: "MacBook", order_index: 1 },
      { subcategory_id: productSubcategory.id, public_id: "itm-samsung", name: "Samsung Galaxy", order_index: 2 },
      { subcategory_id: serviceSubcategory.id, public_id: "itm-tv-install", name: "Монтаж ТВ на стену", order_index: 0 },
      { subcategory_id: serviceSubcategory.id, public_id: "itm-screen-repair", name: "Замена экрана", order_index: 1 },
      { subcategory_id: kitchenSubcategory.id, public_id: "itm-blender", name: "Блендер", order_index: 0 },
    ],
  });

  const items = await prisma.catalogItem.findMany({
    select: { id: true, name: true, subcategory: { select: { category: { select: { type: true } } } } },
  });
  const itemIdByTypeAndName = new Map<string, number>();
  for (const item of items) {
    itemIdByTypeAndName.set(`${item.subcategory.category.type}:${item.name}`, item.id);
  }

  // --- Seed Seller Profiles ---
  await prisma.sellerProfile.createMany({
    data: [
      {
        user_id: userId("SLR-001"),
        is_verified: true,
        average_response_minutes: 20,
      },
      {
        user_id: userId("SLR-201"),
        is_verified: true,
        average_response_minutes: 35,
      },
      {
        user_id: userId("SLR-202"),
        is_verified: true,
        average_response_minutes: 60,
      },
      {
        user_id: userId("SLR-999"),
        is_verified: false,
        average_response_minutes: 120,
      },
    ],
  });

  // --- Seed Listings ---
  const listingsSeed: ListingSeed[] = [
    {
      public_id: "LST-001",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "iPhone 15 Pro Max 256GB",
      description: "Новейший iPhone 15 Pro Max, нераспакованный, с полной гарантией.",
      item_name: "iPhone",
      price: 119000,
      sale_price: 112000,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      city_name: "Москва",
      images: [
        "https://images.unsplash.com/photo-1695048133142-1a20484bf5f2?w=1080&q=80",
        "https://images.unsplash.com/photo-1695048133142-1a20484bf5f2?w=1080&q=80", // Placeholder for multiple images
      ],
      attributes: { Память: "256 GB", Гарантия: "12 месяцев", Цвет: "Натуральный титан" },
    },
    {
      public_id: "LST-002",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "MacBook Air M3 16/512",
      description: "Мощный MacBook Air на чипе M3, идеально для работы и учебы. Состояние нового.",
      item_name: "MacBook",
      price: 134900,
      sale_price: null,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      city_name: "Москва",
      images: [
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80",
      ],
      attributes: { RAM: "16 GB", SSD: "512 GB", Процессор: "Apple M3" },
    },
    {
      public_id: "LST-101",
      seller_public_id: "SLR-201",
      type: "SERVICE",
      title: "Монтаж ТВ на стену",
      description: "Профессиональный монтаж телевизоров любой диагонали на стену. Быстро и аккуратно.",
      item_name: "Монтаж ТВ на стену",
      price: 3500,
      sale_price: null,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      city_name: "Казань",
      images: [
        "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1080&q=80",
      ],
      attributes: { Срок: "до 2 часов", Гарантия: "6 месяцев" },
    },
    {
      public_id: "LST-102",
      seller_public_id: "SLR-999",
      type: "SERVICE",
      title: "Замена экрана за 30 минут",
      description: "Быстрая и качественная замена экрана для большинства моделей смартфонов. Гарантия на работу.",
      item_name: "Замена экрана",
      price: 15000,
      sale_price: null,
      condition: "USED",
      status: "INACTIVE",
      moderation_status: "REJECTED",
      city_name: "Москва",
      images: [
        "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1080&q=80",
      ],
      attributes: { Гарантия: "Нет", Скорость: "30 минут" },
    },
    {
      public_id: "LST-201",
      seller_public_id: "SLR-202",
      type: "PRODUCT",
      title: "Samsung Galaxy S24 Ultra",
      description: "Флагманский смартфон Samsung, новый, запечатанный.",
      item_name: "Samsung Galaxy",
      price: 120000,
      sale_price: 115000,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      city_name: "Екатеринбург",
      images: [
        "https://images.unsplash.com/photo-1698612140411-e6e78b7c7e3f?q=80&w=1080",
      ],
      attributes: { Память: "512 GB", Цвет: "Черный" },
    },
    {
      public_id: "LST-202",
      seller_public_id: "SLR-202",
      type: "PRODUCT",
      title: "Блендер Bosch ErgoMixx",
      description: "Надежный ручной блендер для вашей кухни. Новый, в упаковке.",
      item_name: "Блендер",
      price: 7500,
      sale_price: 6999,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      city_name: "Екатеринбург",
      images: [
        "https://images.unsplash.com/photo-1620216664984-b3c9b7e7c5c2?q=80&w=1080",
      ],
      attributes: { Мощность: "1000 Вт", Комплектация: "Насадки, измельчитель" },
    },
    {
      public_id: "LST-301",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "MacBook Pro 14 M3 Pro",
      description: "Профессиональный ноутбук для самых требовательных задач.",
      item_name: "MacBook",
      price: 250000,
      sale_price: 240000,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      city_name: "Санкт-Петербург",
      images: [
        "https://images.unsplash.com/photo-1694939229235-86fefc464e1c?q=80&w=1080",
      ],
      attributes: { Процессор: "Apple M3 Pro", Память: "1 ТБ SSD" },
    },
    {
      public_id: "LST-401",
      seller_public_id: "SLR-201",
      type: "SERVICE",
      title: "Установка кондиционера",
      description: "Быстрая и качественная установка любых видов кондиционеров.",
      item_name: "Монтаж ТВ на стену", // Reusing item for service
      price: 8000,
      sale_price: null,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      city_name: "Краснодар",
      images: [
        "https://images.unsplash.com/photo-1571221191523-286377759de7?q=80&w=1080",
      ],
      attributes: { Гарантия: "1 год", Опыт: "Более 5 лет" },
    },
  ];

  const listingByPublic = new Map<string, { id: number; title: string; price: number; image: string | null }>();
  for (const listing of listingsSeed) {
    const itemId = itemIdByTypeAndName.get(`${listing.type}:${listing.item_name}`) ?? null;
    const created = await prisma.marketplaceListing.create({
      data: {
        public_id: listing.public_id,
        seller_id: userId(listing.seller_public_id),
        type: listing.type,
        title: listing.title,
        description: listing.description,
        item_id: itemId,
        price: listing.price,
        sale_price: listing.sale_price,
        rating: 4.7,
        condition: listing.condition,
        status: listing.status,
        moderation_status: listing.moderation_status,
        views: Math.floor(Math.random() * 500) + 50, // More varied views
        city_id: cityId(listing.city_name),
        shipping_by_seller: true,
      },
    });
    await prisma.listingImage.createMany({
      data: listing.images.map((url, index) => ({
        listing_id: created.id,
        url,
        sort_order: index,
      })),
    });
    await prisma.listingAttribute.createMany({
      data: Object.entries(listing.attributes).map(([key, value], index) => ({
        listing_id: created.id,
        key,
        value,
        sort_order: index,
      })),
    });
    listingByPublic.set(listing.public_id, {
      id: created.id,
      title: created.title,
      price: created.sale_price ?? created.price,
      image: listing.images[0] ?? null,
    });
  }

  const listingId = (publicId: string): number => {
    const listing = listingByPublic.get(publicId);
    if (!listing) throw new Error(`Listing ${publicId} not found`);
    return listing.id;
  };

  // --- Seed Reviews ---
  await prisma.listingReview.createMany({
    data: [
      {
        listing_id: listingId("LST-001"),
        author_id: userId("USR-101"), // Link to a real user
        rating: 5,
        comment: "Все отлично, рекомендую.",
        created_at: daysAgo(2),
      },
      {
        listing_id: listingId("LST-001"),
        author_id: userId("USR-001"), // Link to a real user
        rating: 4,
        comment: "Телефон отличный, но доставка заняла на день дольше.",
        created_at: daysAgo(7),
      },
      {
        listing_id: listingId("LST-201"),
        author_id: userId("USR-101"), // Link to a real user
        rating: 5,
        comment: "Прекрасный телефон, быстрая доставка!",
        created_at: daysAgo(3),
      },
      {
        listing_id: listingId("LST-002"), // MacBook Air M3
        author_id: userId("USR-001"),
        rating: 5,
        comment: "Отличный ноутбук для работы, очень быстрый и легкий.",
        created_at: daysAgo(5),
      },
    ],
  });

  // --- Seed Questions ---
  await prisma.listingQuestion.createMany({
    data: [
      {
        public_id: "Q-001",
        listing_id: listingId("LST-001"),
        buyer_id: userId("USR-101"),
        question: "Есть гарантия?",
        answer: "Да, гарантия 12 месяцев от производителя.",
        status: "ANSWERED",
        answered_at: daysAgo(1),
      },
      {
        public_id: "Q-002",
        listing_id: listingId("LST-002"),
        buyer_id: userId("USR-001"),
        question: "Возможен ли самовывоз?",
        answer: null, // Pending answer
        status: "PENDING",
        answered_at: null,
      },
      {
        public_id: "Q-003",
        listing_id: listingId("LST-201"),
        buyer_id: userId("USR-101"),
        question: "Насколько сильно греется при нагрузке?",
        answer: "В пределах нормы, система охлаждения справляется отлично.",
        status: "ANSWERED",
        answered_at: daysAgo(0.5),
      },
    ],
  });

  // --- Seed Wishlist Items ---
  await prisma.wishlistItem.createMany({
    data: [
      {
        user_id: userId("USR-001"),
        listing_id: listingId("LST-002"),
      },
      {
        user_id: userId("USR-101"),
        listing_id: listingId("LST-001"),
      },
    ],
  });

  // --- Seed Orders ---
  const order1 = await prisma.marketOrder.create({
    data: {
      public_id: "ORD-1001",
      buyer_id: userId("USR-001"),
      seller_id: userId("SLR-001"),
      status: "COMPLETED",
      delivery_type: "DELIVERY",
      delivery_address: "Москва, Тверская улица, 12",
      total_price: 112000 + 500,
      delivery_cost: 500,
      discount: 0,
      created_at: daysAgo(3),
      items: {
        create: [
          {
            listing_id: listingId("LST-001"),
            name: listingByPublic.get("LST-001")?.title ?? "iPhone 15 Pro Max",
            image: listingByPublic.get("LST-001")?.image,
            price: listingByPublic.get("LST-001")?.price ?? 112000,
            quantity: 1,
          },
        ],
      },
    },
  });

  const order2 = await prisma.marketOrder.create({
    data: {
      public_id: "ORD-1002",
      buyer_id: userId("USR-101"),
      seller_id: userId("SLR-202"),
      status: "PROCESSING",
      delivery_type: "PICKUP",
      delivery_address: "Екатеринбург, Ленина, 50",
      total_price: 6999,
      delivery_cost: 0,
      discount: 0,
      created_at: daysAgo(1),
      items: {
        create: [
          {
            listing_id: listingId("LST-202"),
            name: listingByPublic.get("LST-202")?.title ?? "Блендер Bosch",
            image: listingByPublic.get("LST-202")?.image,
            price: listingByPublic.get("LST-202")?.price ?? 6999,
            quantity: 1,
          },
        ],
      },
    },
  });

  // --- Seed Transactions ---
  await prisma.platformTransaction.createMany({
    data: [
      {
        public_id: "TXN-1001",
        order_id: order1.id,
        buyer_id: userId("USR-001"),
        seller_id: userId("SLR-001"),
        amount: order1.total_price,
        status: "SUCCESS",
        commission_rate: 3.5,
        commission: Math.round(order1.total_price * 0.035),
        payment_provider: "YooMoney",
        payment_intent_id: "pay_demo_1001",
        created_at: daysAgo(3),
      },
      {
        public_id: "TXN-1002",
        order_id: order2.id,
        buyer_id: userId("USR-101"),
        seller_id: userId("SLR-202"),
        amount: order2.total_price,
        status: "PENDING",
        commission_rate: 3.5,
        commission: Math.round(order2.total_price * 0.035),
        payment_provider: "Stripe",
        payment_intent_id: "pay_demo_1002",
        created_at: daysAgo(1),
      },
    ],
  });

  // --- Seed Complaints ---
  await prisma.complaint.createMany({
    data: [
      {
        public_id: "CMP-001",
        status: "APPROVED",
        complaint_type: "fraud_attempt",
        listing_id: listingId("LST-102"),
        seller_id: userId("SLR-999"),
        reporter_id: userId("USR-101"),
        description: "Продавец просил оплату вне платформы.",
        checked_at: daysAgo(1),
        checked_by_id: userId("ADM-001"),
        action_taken: "Объявление отклонено.",
      },
      {
        public_id: "CMP-002",
        status: "PENDING",
        complaint_type: "item_not_as_described",
        listing_id: listingId("LST-002"),
        seller_id: userId("SLR-001"),
        reporter_id: userId("USR-101"),
        description: "MacBook пришел с небольшими царапинами, хотя заявлен как новый.",
        checked_at: null,
        checked_by_id: null,
        action_taken: null,
      },
    ],
  });

  // --- Seed KYC Requests ---
  await prisma.kycRequest.createMany({
    data: [
      {
        public_id: "KYC-001",
        status: "PENDING",
        seller_id: userId("SLR-201"),
        email: "techpoint@example.com",
        phone: "+7 (999) 201-20-20",
        company_name: "TechPoint Store",
        inn: "1650987654",
        address: "Казань, Баумана, 9",
      },
      {
        public_id: "KYC-002",
        status: "APPROVED",
        seller_id: userId("SLR-202"),
        email: "gadgethaven@example.com",
        phone: "+7 (888) 123-45-67",
        company_name: "Gadget Haven LLC",
        inn: "6650987654",
        address: "Екатеринбург, Малышева, 36",
        reviewed_by_id: userId("ADM-001"),
        reviewed_at: daysAgo(10),
      },
    ],
  });

  // --- Seed Commission Tiers ---
  await prisma.commissionTier.createMany({
    data: [
      {
        public_id: "TIER-1",
        name: "Старт",
        min_sales: 0,
        max_sales: 100000,
        commission_rate: 6,
        description: "Начальный уровень для новых продавцов",
      },
      {
        public_id: "TIER-2",
        name: "Базовый",
        min_sales: 100001,
        max_sales: 500000,
        commission_rate: 4,
        description: "Для активных продавцов со средним объемом продаж",
      },
      {
        public_id: "TIER-3",
        name: "Премиум",
        min_sales: 500001,
        max_sales: null,
        commission_rate: 2.5,
        description: "Для крупных продавцов с высоким объемом продаж",
      },
    ],
  });

  // --- Seed Partnership Requests ---
  await prisma.partnershipRequest.createMany({
    data: [
      {
        public_id: "PRQ-001",
        user_id: userId("USR-001"),
        seller_type: "COMPANY",
        name: "ООО Демо",
        email: "demo@ecomm.ru",
        contact: "+7 (999) 000-00-01",
        link: "https://example.com/demo",
        category: "Электроника",
        why_us: "Хочу стать партнером.",
      },
      {
        public_id: "PRQ-002",
        user_id: userId("USR-101"),
        seller_type: "INDIVIDUAL",
        name: "ИП Смирнов",
        email: "smirnov@example.com",
        contact: "+7 (911) 555-44-33",
        link: "https://example.com/smirnov",
        category: "Услуги",
        geography: "Санкт-Петербург",
        why_us: "Многолетний опыт в сфере ремонта бытовой техники.",
      },
    ],
  });

  // --- Recalculate ratings based on reviews ---
  console.log("Recalculating ratings for all listings...");
  const allListings = await prisma.marketplaceListing.findMany({
    select: { id: true },
  });

  for (const listing of allListings) {
    const avgRatingResult = await prisma.listingReview.aggregate({
      _avg: {
        rating: true,
      },
      where: {
        listing_id: listing.id,
      },
    });
    const newRating = avgRatingResult._avg.rating ?? 0;
    const roundedRating = Math.round(newRating * 10) / 10;
    await prisma.marketplaceListing.update({
      where: { id: listing.id },
      data: { rating: roundedRating },
    });
  }
  console.log("Ratings recalculated.");

  const [usersCount, listingsCount, ordersCount, transactionsCount, citiesCount] = await Promise.all([
    prisma.appUser.count(),
    prisma.marketplaceListing.count(),
    prisma.marketOrder.count(),
    prisma.platformTransaction.count(),
    prisma.city.count(),
  ]);

  console.log("Database seeded successfully!");
  console.log(`Users: ${usersCount}, listings: ${listingsCount}, orders: ${ordersCount}, transactions: ${transactionsCount}, cities: ${citiesCount}`);
  console.log("Login credentials:");
  console.log("regular -> demo@ecomm.ru / demo123");
  console.log("partner -> partner@ecomm.ru / partner123");
  console.log("admin -> admin@ecomm.ru / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
