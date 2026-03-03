import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function asJson(value: unknown): string {
  return JSON.stringify(value);
}

function daysAgo(days: number, hours = 0): Date {
  return new Date(Date.now() - (days * 24 + hours) * 60 * 60 * 1000);
}

type CategorySeed = {
  id: string;
  name: string;
  icon_key: string;
  subcategories: Array<{
    id: string;
    name: string;
    items: string[];
  }>;
};

type ListingType = "PRODUCT" | "SERVICE";
type ListingCondition = "NEW" | "USED";
type ListingStatus = "ACTIVE" | "INACTIVE" | "MODERATION";
type ModerationStatus = "APPROVED" | "REJECTED" | "PENDING";

type ListingSeed = {
  public_id: string;
  seller_public_id: string;
  type: ListingType;
  title: string;
  description: string;
  category_name: string;
  price: number;
  sale_price: number | null;
  rating: number;
  condition: ListingCondition;
  status: ListingStatus;
  moderation_status: ModerationStatus;
  views: number;
  city: string;
  image: string;
  images: string[];
  is_new: boolean;
  is_sale: boolean;
  is_verified: boolean;
  shipping_by_seller: boolean;
  sku: string | null;
  publish_date: string;
  seller_response_time: string;
  seller_listings: number;
  breadcrumbs: string[];
  specifications: Record<string, string>;
  is_price_lower: boolean;
  created_at?: Date;
};

type MarketOrderStatus =
  | "CREATED"
  | "PAID"
  | "PREPARED"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED";

type MarketOrderSeed = {
  public_id: string;
  buyer_public_id: string;
  seller_public_id: string;
  status: MarketOrderStatus;
  delivery_type: "DELIVERY" | "PICKUP";
  delivery_address: string;
  delivery_cost: number;
  discount: number;
  created_at: Date;
  items: Array<{
    listing_public_id: string;
    name: string;
    quantity: number;
    price: number;
  }>;
};

type TransactionSeed = {
  public_id: string;
  order_public_id: string;
  buyer_public_id: string;
  seller_public_id: string;
  status: string;
  commission_rate: number;
  payment_provider: string;
  payment_intent_id: string;
  created_at: Date;
};

type AchievementMetric = "orders" | "sales_amount" | "xp" | "max_deal";

type AchievementRule = {
  metric: AchievementMetric;
  target: number;
};

const productCategories: CategorySeed[] = [
  {
    id: "smartphones-wearables",
    name: "Телефоны и носимая электроника",
    icon_key: "smartphone",
    subcategories: [
      {
        id: "smartphones",
        name: "Смартфоны",
        items: ["iPhone", "Samsung", "Xiaomi", "Google Pixel", "Другие бренды"],
      },
      {
        id: "wearables",
        name: "Умные часы и браслеты",
        items: ["Apple Watch", "Galaxy Watch", "Фитнес-браслеты", "Аксессуары"],
      },
      {
        id: "tablets",
        name: "Планшеты",
        items: ["iPad", "Android-планшеты", "Планшеты для рисования"],
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
        items: ["MacBook", "Игровые ноутбуки", "Офисные ноутбуки", "Ультрабуки"],
      },
      {
        id: "desktops",
        name: "Системные блоки",
        items: ["Игровые ПК", "Рабочие станции", "Мини-ПК"],
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
        items: ["TWS", "Накладные", "Студийные", "Игровые гарнитуры"],
      },
      {
        id: "speakers",
        name: "Колонки",
        items: ["Портативные", "Умные колонки", "Саундбары"],
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
        items: ["Кофемашины", "Микроволновые печи", "Мультиварки", "Блендеры"],
      },
      {
        id: "cleaning",
        name: "Уборка",
        items: ["Роботы-пылесосы", "Вертикальные пылесосы", "Парогенераторы"],
      },
    ],
  },
  {
    id: "gaming",
    name: "Игры и консоли",
    icon_key: "gamepad-2",
    subcategories: [
      {
        id: "consoles",
        name: "Консоли",
        items: ["PlayStation", "Xbox", "Nintendo"],
      },
      {
        id: "gaming-accessories",
        name: "Игровые аксессуары",
        items: ["Геймпады", "Гарнитуры", "Игровые кресла"],
      },
    ],
  },
  {
    id: "tv-photo",
    name: "ТВ и фото",
    icon_key: "tv",
    subcategories: [
      {
        id: "tv",
        name: "Телевизоры",
        items: ["OLED", "QLED", "4K Smart TV"],
      },
      {
        id: "photo",
        name: "Фото и видео",
        items: ["Беззеркальные камеры", "Объективы", "Экшн-камеры"],
      },
    ],
  },
  {
    id: "smart-home",
    name: "Умный дом",
    icon_key: "home",
    subcategories: [
      {
        id: "security",
        name: "Безопасность",
        items: ["Камеры", "Датчики", "Умные замки"],
      },
      {
        id: "automation",
        name: "Автоматизация",
        items: ["Умные розетки", "Хабы", "Освещение"],
      },
    ],
  },
];

const serviceCategories: CategorySeed[] = [
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
        items: ["Диагностика", "Чистка", "Замена SSD/ОЗУ"],
      },
    ],
  },
  {
    id: "installation",
    name: "Установка и настройка",
    icon_key: "settings",
    subcategories: [
      {
        id: "tv-installation",
        name: "Установка телевизоров",
        items: ["Монтаж на стену", "Настройка Smart TV", "Прокладка кабелей"],
      },
      {
        id: "smart-home-setup",
        name: "Настройка умного дома",
        items: ["Подключение датчиков", "Сценарии автоматизации", "Интеграция в приложение"],
      },
    ],
  },
  {
    id: "courier",
    name: "Курьерские услуги",
    icon_key: "truck",
    subcategories: [
      {
        id: "express-delivery",
        name: "Экспресс доставка",
        items: ["День-в-день", "Вечерняя доставка", "Срочная доставка"],
      },
    ],
  },
  {
    id: "climate-home",
    name: "Климат и дом",
    icon_key: "fan",
    subcategories: [
      {
        id: "air-conditioners",
        name: "Обслуживание кондиционеров",
        items: ["Заправка", "Чистка", "Диагностика"],
      },
    ],
  },
];

async function seedCategories(type: "PRODUCT" | "SERVICE", categories: CategorySeed[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();

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

async function main(): Promise<void> {
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
      joined_at: daysAgo(900),
    },
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
      joined_at: daysAgo(800),
    },
    {
      public_id: "USR-101",
      role: "BUYER",
      status: "ACTIVE",
      email: "ivan.petrov@example.com",
      password: "buyer123",
      name: "Иван Петров",
      first_name: "Иван",
      last_name: "Петров",
      display_name: "Иван Петров",
      username: "ivanpetrov",
      phone: "+7 (999) 111-22-33",
      city: "Москва",
      joined_at: daysAgo(540),
    },
    {
      public_id: "USR-102",
      role: "BUYER",
      status: "ACTIVE",
      email: "maria.sidorova@example.com",
      password: "buyer123",
      name: "Мария Сидорова",
      first_name: "Мария",
      last_name: "Сидорова",
      display_name: "Мария Сидорова",
      username: "marias",
      phone: "+7 (999) 333-44-55",
      city: "Казань",
      joined_at: daysAgo(430),
    },
    {
      public_id: "USR-103",
      role: "BUYER",
      status: "ACTIVE",
      email: "alexey.k@example.com",
      password: "buyer123",
      name: "Алексей Кузнецов",
      first_name: "Алексей",
      last_name: "Кузнецов",
      display_name: "Алексей Кузнецов",
      username: "alexk",
      phone: "+7 (999) 234-23-23",
      city: "Москва",
      joined_at: daysAgo(380),
    },
    {
      public_id: "USR-104",
      role: "BUYER",
      status: "ACTIVE",
      email: "olga.smirnova@example.com",
      password: "buyer123",
      name: "Ольга Смирнова",
      first_name: "Ольга",
      last_name: "Смирнова",
      display_name: "Ольга Смирнова",
      username: "olgas",
      phone: "+7 (999) 345-34-34",
      city: "Москва",
      joined_at: daysAgo(300),
    },
    {
      public_id: "USR-105",
      role: "BUYER",
      status: "ACTIVE",
      email: "elena.vorobyeva@example.com",
      password: "buyer123",
      name: "Елена Воробьёва",
      first_name: "Елена",
      last_name: "Воробьёва",
      display_name: "Елена Воробьёва",
      username: "elena_v",
      phone: "+7 (999) 555-10-10",
      city: "Санкт-Петербург",
      joined_at: daysAgo(260),
    },
    {
      public_id: "USR-106",
      role: "BUYER",
      status: "ACTIVE",
      email: "dmitry.novikov@example.com",
      password: "buyer123",
      name: "Дмитрий Новиков",
      first_name: "Дмитрий",
      last_name: "Новиков",
      display_name: "Дмитрий Новиков",
      username: "dnovikov",
      phone: "+7 (999) 120-98-76",
      city: "Екатеринбург",
      joined_at: daysAgo(220),
    },
    {
      public_id: "USR-107",
      role: "BUYER",
      status: "ACTIVE",
      email: "nikita.romanov@example.com",
      password: "buyer123",
      name: "Никита Романов",
      first_name: "Никита",
      last_name: "Романов",
      display_name: "Никита Романов",
      username: "nikitar",
      phone: "+7 (999) 776-66-11",
      city: "Нижний Новгород",
      joined_at: daysAgo(180),
    },
    {
      public_id: "USR-108",
      role: "BUYER",
      status: "ACTIVE",
      email: "polina.ivanova@example.com",
      password: "buyer123",
      name: "Полина Иванова",
      first_name: "Полина",
      last_name: "Иванова",
      display_name: "Полина Иванова",
      username: "polina_i",
      phone: "+7 (999) 345-22-98",
      city: "Новосибирск",
      joined_at: daysAgo(140),
    },
    {
      public_id: "USR-109",
      role: "BUYER",
      status: "ACTIVE",
      email: "artem.lebedev@example.com",
      password: "buyer123",
      name: "Артём Лебедев",
      first_name: "Артём",
      last_name: "Лебедев",
      display_name: "Артём Лебедев",
      username: "arteml",
      phone: "+7 (999) 889-77-66",
      city: "Самара",
      joined_at: daysAgo(120),
    },
    {
      public_id: "USR-110",
      role: "BUYER",
      status: "ACTIVE",
      email: "kirill.egorov@example.com",
      password: "buyer123",
      name: "Кирилл Егоров",
      first_name: "Кирилл",
      last_name: "Егоров",
      display_name: "Кирилл Егоров",
      username: "kirille",
      phone: "+7 (999) 543-76-12",
      city: "Краснодар",
      joined_at: daysAgo(95),
    },
    {
      public_id: "USR-666",
      role: "BUYER",
      status: "BLOCKED",
      email: "suspicious@example.com",
      password: "buyer123",
      name: "Подозрительный Пользователь",
      display_name: "Подозрительный Пользователь",
      phone: "+7 (999) 000-00-00",
      city: "Москва",
      block_reason: "Мошеннические действия, множественные споры",
      joined_at: daysAgo(70),
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
      joined_at: daysAgo(760),
    },
    {
      public_id: "SLR-201",
      role: "SELLER",
      status: "ACTIVE",
      email: "techpoint@example.com",
      password: "seller123",
      name: "TechPoint Store",
      display_name: "TechPoint Store",
      phone: "+7 (999) 201-20-20",
      city: "Санкт-Петербург",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=774&auto=format&fit=crop",
      joined_at: daysAgo(620),
    },
    {
      public_id: "SLR-202",
      role: "SELLER",
      status: "ACTIVE",
      email: "gadgetpro@example.com",
      password: "seller123",
      name: "ГаджетПро",
      display_name: "ГаджетПро",
      phone: "+7 (999) 202-20-20",
      city: "Казань",
      avatar: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=774&auto=format&fit=crop",
      joined_at: daysAgo(520),
    },
    {
      public_id: "SLR-203",
      role: "SELLER",
      status: "ACTIVE",
      email: "hometech@example.com",
      password: "seller123",
      name: "HomeTech Market",
      display_name: "HomeTech Market",
      phone: "+7 (999) 203-30-30",
      city: "Екатеринбург",
      avatar: "https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=774&auto=format&fit=crop",
      joined_at: daysAgo(420),
    },
    {
      public_id: "SLR-204",
      role: "SELLER",
      status: "ACTIVE",
      email: "install.pro@example.com",
      password: "seller123",
      name: "Install Pro",
      display_name: "Install Pro",
      phone: "+7 (999) 204-40-40",
      city: "Москва",
      avatar: "https://images.unsplash.com/photo-1557862921-37829c790f19?q=80&w=774&auto=format&fit=crop",
      joined_at: daysAgo(190),
    },
    {
      public_id: "SLR-205",
      role: "SELLER",
      status: "ACTIVE",
      email: "servicelab@example.com",
      password: "seller123",
      name: "ServiceLab",
      display_name: "ServiceLab",
      phone: "+7 (999) 205-50-50",
      city: "Новосибирск",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=774&auto=format&fit=crop",
      joined_at: daysAgo(140),
    },
    {
      public_id: "SLR-999",
      role: "SELLER",
      status: "BLOCKED",
      email: "seller.suspicious@example.com",
      password: "seller123",
      name: "СомнительныйПродавец",
      display_name: "СомнительныйПродавец",
      phone: "+7 (999) 999-99-99",
      city: "Москва",
      block_reason: "Подозрение в мошенничестве",
      joined_at: daysAgo(12),
    },
  ];

  await prisma.appUser.createMany({ data: usersSeed });

  const users = await prisma.appUser.findMany({
    select: {
      id: true,
      public_id: true,
    },
  });

  const userIdByPublic = new Map(users.map((user) => [user.public_id, user.id]));
  const getUserId = (publicId: string): number => {
    const id = userIdByPublic.get(publicId);
    if (!id) {
      throw new Error(`Missing user id for ${publicId}`);
    }
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
        street: "Ленинский проспект",
        building: "д. 32",
        postal_code: "119334",
        is_default: false,
      },
      {
        user_id: getUserId("USR-101"),
        label: "Квартира",
        region: "Москва",
        city: "Москва",
        street: "Пятницкая улица",
        building: "д. 18",
        postal_code: "115184",
        is_default: true,
      },
      {
        user_id: getUserId("USR-102"),
        label: "Дом",
        region: "Татарстан",
        city: "Казань",
        street: "ул. Баумана",
        building: "д. 9",
        postal_code: "420111",
        is_default: true,
      },
      {
        user_id: getUserId("USR-103"),
        label: "Дом",
        region: "Москва",
        city: "Москва",
        street: "пр-т Мира",
        building: "д. 22",
        postal_code: "129090",
        is_default: true,
      },
      {
        user_id: getUserId("USR-104"),
        label: "Дом",
        region: "Москва",
        city: "Москва",
        street: "улица Новослободская",
        building: "д. 31",
        postal_code: "127055",
        is_default: true,
      },
      {
        user_id: getUserId("USR-105"),
        label: "Дом",
        region: "Санкт-Петербург",
        city: "Санкт-Петербург",
        street: "Невский проспект",
        building: "д. 73",
        postal_code: "191025",
        is_default: true,
      },
      {
        user_id: getUserId("USR-106"),
        label: "Дом",
        region: "Свердловская область",
        city: "Екатеринбург",
        street: "улица Малышева",
        building: "д. 44",
        postal_code: "620014",
        is_default: true,
      },
      {
        user_id: getUserId("USR-107"),
        label: "Дом",
        region: "Нижегородская область",
        city: "Нижний Новгород",
        street: "ул. Большая Покровская",
        building: "д. 11",
        postal_code: "603005",
        is_default: true,
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
      {
        user_id: getUserId("SLR-201"),
        label: "Магазин",
        region: "Санкт-Петербург",
        city: "Санкт-Петербург",
        street: "Невский проспект",
        building: "д. 25",
        postal_code: "191025",
        is_default: true,
      },
      {
        user_id: getUserId("SLR-202"),
        label: "Склад",
        region: "Татарстан",
        city: "Казань",
        street: "ул. Петербургская",
        building: "д. 40",
        postal_code: "420107",
        is_default: true,
      },
      {
        user_id: getUserId("SLR-203"),
        label: "Шоурум",
        region: "Свердловская область",
        city: "Екатеринбург",
        street: "ул. Белинского",
        building: "д. 83",
        postal_code: "620026",
        is_default: true,
      },
      {
        user_id: getUserId("SLR-204"),
        label: "Офис",
        region: "Москва",
        city: "Москва",
        street: "ул. Сущевский Вал",
        building: "д. 18",
        postal_code: "127018",
        is_default: true,
      },
      {
        user_id: getUserId("SLR-205"),
        label: "Сервис-центр",
        region: "Новосибирская область",
        city: "Новосибирск",
        street: "Красный проспект",
        building: "д. 86",
        postal_code: "630091",
        is_default: true,
      },
    ],
  });

  const productCategoryMap = await seedCategories("PRODUCT", productCategories);
  const serviceCategoryMap = await seedCategories("SERVICE", serviceCategories);
  const categoryMap = new Map([...productCategoryMap.entries(), ...serviceCategoryMap.entries()]);

  const listingsSeed: ListingSeed[] = [
    {
      public_id: "LST-001",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "iPhone 15 Pro Max 256GB Titanium",
      description: "Новый запечатанный iPhone 15 Pro Max, оригинальная гарантия 1 год.",
      category_name: "Телефоны и носимая электроника",
      price: 129000,
      sale_price: 119000,
      rating: 4.9,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 742,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1695048133142-1a20484bf5f2?w=1080&q=80",
      images: [
        "https://images.unsplash.com/photo-1695048133142-1a20484bf5f2?w=1080&q=80",
        "https://images.unsplash.com/photo-1592286927505-1def25115558?w=1080&q=80",
      ],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "IP15PM-256-TI",
      publish_date: "25 февраля в 14:30",
      seller_response_time: "около 20 минут",
      seller_listings: 6,
      breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Смартфоны", "iPhone"],
      specifications: {
        Состояние: "Запечатан",
        Память: "256 ГБ",
        Цвет: "Natural Titanium",
        Гарантия: "12 месяцев",
      },
      is_price_lower: true,
      created_at: daysAgo(6),
    },
    {
      public_id: "LST-002",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "Samsung Galaxy S24 Ultra 512GB",
      description: "Флагман Samsung, европейская версия, в наличии в Москве.",
      category_name: "Телефоны и носимая электроника",
      price: 119990,
      sale_price: 109990,
      rating: 4.8,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 604,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=1080&q=80"],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "SMSNG-S24U-512",
      publish_date: "24 февраля в 10:15",
      seller_response_time: "около 30 минут",
      seller_listings: 6,
      breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Смартфоны", "Samsung"],
      specifications: {
        Память: "512 ГБ",
        Экран: "6.8 Dynamic AMOLED",
        Процессор: "Snapdragon 8 Gen 3",
      },
      is_price_lower: true,
      created_at: daysAgo(7),
    },
    {
      public_id: "LST-003",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "Apple Watch Series 9 GPS 45mm",
      description: "Оригинальные часы Apple, полная комплектация.",
      category_name: "Телефоны и носимая электроника",
      price: 42990,
      sale_price: null,
      rating: 4.8,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 381,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=1080&q=80"],
      is_new: true,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: true,
      sku: "AW9-45-GPS",
      publish_date: "23 февраля в 18:40",
      seller_response_time: "около 25 минут",
      seller_listings: 6,
      breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Умные часы и браслеты"],
      specifications: {
        Размер: "45 мм",
        Связь: "GPS",
        Ремешок: "Sport Band",
      },
      is_price_lower: false,
      created_at: daysAgo(9),
    },
    {
      public_id: "LST-004",
      seller_public_id: "SLR-201",
      type: "PRODUCT",
      title: "MacBook Air M3 16GB 512GB",
      description: "MacBook Air 2025, серебристый, в заводской упаковке.",
      category_name: "Компьютеры и ноутбуки",
      price: 149900,
      sale_price: 134900,
      rating: 4.9,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 889,
      city: "Санкт-Петербург",
      image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80",
      images: [
        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1080&q=80",
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1080&q=80",
      ],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "MBA-M3-16-512",
      publish_date: "22 февраля в 09:10",
      seller_response_time: "около 15 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Компьютеры и ноутбуки", "Ноутбуки", "MacBook"],
      specifications: {
        Процессор: "Apple M3",
        ОЗУ: "16 ГБ",
        SSD: "512 ГБ",
      },
      is_price_lower: true,
      created_at: daysAgo(11),
    },
    {
      public_id: "LST-005",
      seller_public_id: "SLR-201",
      type: "PRODUCT",
      title: "Lenovo Legion 5 Pro 16",
      description: "Игровой ноутбук в отличном состоянии, минимальный износ.",
      category_name: "Компьютеры и ноутбуки",
      price: 119000,
      sale_price: null,
      rating: 4.7,
      condition: "USED",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 444,
      city: "Санкт-Петербург",
      image: "https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1603302576837-37561b2e2302?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: true,
      sku: "LEGION5PRO-16",
      publish_date: "20 февраля в 12:00",
      seller_response_time: "около 40 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Компьютеры и ноутбуки", "Ноутбуки", "Игровые"],
      specifications: {
        Процессор: "Ryzen 7",
        ОЗУ: "32 ГБ",
        Видеокарта: "RTX 4070",
      },
      is_price_lower: false,
      created_at: daysAgo(13),
    },
    {
      public_id: "LST-006",
      seller_public_id: "SLR-202",
      type: "PRODUCT",
      title: "Sony WH-1000XM5",
      description: "Топовые наушники с шумоподавлением, гарантия 1 год.",
      category_name: "Аудиотехника",
      price: 28990,
      sale_price: 26990,
      rating: 4.8,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 532,
      city: "Казань",
      image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80"],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "SONY-XM5",
      publish_date: "19 февраля в 17:35",
      seller_response_time: "около 25 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Аудиотехника", "Наушники"],
      specifications: {
        Тип: "Накладные",
        Шумоподавление: "Активное",
        "Время работы": "до 30 часов",
      },
      is_price_lower: true,
      created_at: daysAgo(14),
    },
    {
      public_id: "LST-007",
      seller_public_id: "SLR-203",
      type: "PRODUCT",
      title: "Dyson V15 Detect Absolute",
      description: "Новый вертикальный пылесос Dyson с лазерной подсветкой.",
      category_name: "Бытовая техника",
      price: 67990,
      sale_price: 63990,
      rating: 4.9,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 318,
      city: "Екатеринбург",
      image: "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1558317374-067fb5f30001?w=1080&q=80"],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "DYSON-V15",
      publish_date: "18 февраля в 11:45",
      seller_response_time: "около 35 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Бытовая техника", "Уборка"],
      specifications: {
        Мощность: "660 Вт",
        Вес: "3.1 кг",
        Насадки: "8 шт",
      },
      is_price_lower: true,
      created_at: daysAgo(16),
    },
    {
      public_id: "LST-008",
      seller_public_id: "SLR-202",
      type: "PRODUCT",
      title: "PlayStation 5 Slim Digital",
      description: "Новая PS5 Slim Digital, официальная гарантия.",
      category_name: "Игры и консоли",
      price: 53990,
      sale_price: null,
      rating: 4.9,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 702,
      city: "Казань",
      image: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=1080&q=80"],
      is_new: true,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: true,
      sku: "PS5-SLIM-D",
      publish_date: "17 февраля в 13:20",
      seller_response_time: "около 20 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Игры и консоли", "Консоли", "PlayStation"],
      specifications: {
        Комплектация: "Digital Edition",
        Память: "1 ТБ",
        Гарантия: "12 месяцев",
      },
      is_price_lower: false,
      created_at: daysAgo(17),
    },
    {
      public_id: "LST-009",
      seller_public_id: "SLR-202",
      type: "PRODUCT",
      title: "Xbox Series X 1TB",
      description: "Новая Xbox Series X, в наличии, быстрая отправка.",
      category_name: "Игры и консоли",
      price: 48990,
      sale_price: 46990,
      rating: 4.7,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 287,
      city: "Казань",
      image: "https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1621259182978-fbf93132d53d?w=1080&q=80"],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "XBOX-SX-1TB",
      publish_date: "16 февраля в 10:10",
      seller_response_time: "около 45 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Игры и консоли", "Консоли", "Xbox"],
      specifications: {
        Память: "1 ТБ",
        Поддержка: "4K 120fps",
      },
      is_price_lower: true,
      created_at: daysAgo(18),
    },
    {
      public_id: "LST-010",
      seller_public_id: "SLR-203",
      type: "PRODUCT",
      title: "LG OLED C3 55\"",
      description: "Телевизор LG OLED C3, европейская версия, 4K 120Гц.",
      category_name: "ТВ и фото",
      price: 124990,
      sale_price: null,
      rating: 4.8,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 264,
      city: "Екатеринбург",
      image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1080&q=80"],
      is_new: true,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: true,
      sku: "LG-OLED-C3-55",
      publish_date: "15 февраля в 15:50",
      seller_response_time: "около 1 часа",
      seller_listings: 4,
      breadcrumbs: ["Главная", "ТВ и фото", "Телевизоры", "OLED"],
      specifications: {
        Диагональ: "55\"",
        Разрешение: "4K",
        Частота: "120 Гц",
      },
      is_price_lower: false,
      created_at: daysAgo(19),
    },
    {
      public_id: "LST-011",
      seller_public_id: "SLR-201",
      type: "PRODUCT",
      title: "Sony Alpha A7 IV Body",
      description: "Полнокадровая беззеркальная камера Sony A7 IV.",
      category_name: "ТВ и фото",
      price: 204900,
      sale_price: 194900,
      rating: 4.9,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 191,
      city: "Санкт-Петербург",
      image: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=1080&q=80"],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "SONY-A7IV-BODY",
      publish_date: "14 февраля в 09:30",
      seller_response_time: "около 50 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "ТВ и фото", "Фото и видео", "Беззеркальные камеры"],
      specifications: {
        Сенсор: "33 Мп",
        Видео: "4K 60fps",
        Стабилизация: "5-осевая",
      },
      is_price_lower: true,
      created_at: daysAgo(20),
    },
    {
      public_id: "LST-012",
      seller_public_id: "SLR-203",
      type: "PRODUCT",
      title: "Робот-пылесос Dreame L10s Pro",
      description: "Почти новый робот-пылесос, полный комплект и коробка.",
      category_name: "Умный дом",
      price: 52990,
      sale_price: null,
      rating: 4.6,
      condition: "USED",
      status: "INACTIVE",
      moderation_status: "APPROVED",
      views: 120,
      city: "Екатеринбург",
      image: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: true,
      sku: "DREAME-L10SPRO",
      publish_date: "13 февраля в 16:40",
      seller_response_time: "около 2 часов",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Умный дом", "Автоматизация", "Роботы-пылесосы"],
      specifications: {
        Состояние: "Как новый",
        "Время работы": "до 180 минут",
      },
      is_price_lower: false,
      created_at: daysAgo(22),
    },
    {
      public_id: "LST-013",
      seller_public_id: "SLR-203",
      type: "PRODUCT",
      title: "Комплект умного дома Aqara Starter Kit",
      description: "Хаб + датчики + умные реле. Полная настройка в приложении.",
      category_name: "Умный дом",
      price: 24990,
      sale_price: null,
      rating: 4.4,
      condition: "NEW",
      status: "MODERATION",
      moderation_status: "PENDING",
      views: 0,
      city: "Екатеринбург",
      image: "https://images.unsplash.com/photo-1558002038-1055907df827?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1558002038-1055907df827?w=1080&q=80"],
      is_new: true,
      is_sale: false,
      is_verified: false,
      shipping_by_seller: true,
      sku: "AQARA-STARTER",
      publish_date: "2 марта в 11:05",
      seller_response_time: "около 1 часа",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Умный дом", "Автоматизация", "Хабы"],
      specifications: {
        Хаб: "Aqara Hub M2",
        Поддержка: "Apple Home / Mi Home",
      },
      is_price_lower: false,
      created_at: daysAgo(1),
    },
    {
      public_id: "LST-014",
      seller_public_id: "SLR-999",
      type: "PRODUCT",
      title: "ДЕШЕВО!!! iPhone 16 Ultra за 9 999",
      description: "СУПЕР ЦЕНА!!! Оплата только переводом на карту, пишите в Telegram @mega_sale.",
      category_name: "Телефоны и носимая электроника",
      price: 9999,
      sale_price: null,
      rating: 2.1,
      condition: "NEW",
      status: "INACTIVE",
      moderation_status: "REJECTED",
      views: 48,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: false,
      shipping_by_seller: true,
      sku: "SPAM-IP16",
      publish_date: "1 марта в 10:30",
      seller_response_time: "более 1 дня",
      seller_listings: 2,
      breadcrumbs: ["Главная", "Телефоны и носимая электроника", "Смартфоны"],
      specifications: {
        Примечание: "Подозрительное объявление",
      },
      is_price_lower: true,
      created_at: daysAgo(2),
    },
    {
      public_id: "LST-015",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "MacBook Pro 14 M3 Max 36GB",
      description: "Профессиональный ноутбук Apple для монтажа и разработки.",
      category_name: "Компьютеры и ноутбуки",
      price: 309990,
      sale_price: 289990,
      rating: 4.9,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 454,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1080&q=80"],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "MBP14-M3MAX-36",
      publish_date: "12 февраля в 09:50",
      seller_response_time: "около 15 минут",
      seller_listings: 6,
      breadcrumbs: ["Главная", "Компьютеры и ноутбуки", "Ноутбуки", "MacBook"],
      specifications: {
        Процессор: "Apple M3 Max",
        ОЗУ: "36 ГБ",
        SSD: "1 ТБ",
      },
      is_price_lower: true,
      created_at: daysAgo(24),
    },
    {
      public_id: "LST-016",
      seller_public_id: "SLR-001",
      type: "PRODUCT",
      title: "AirPods Pro 2 USB-C",
      description: "Новые оригинальные AirPods Pro 2 с USB-C.",
      category_name: "Аудиотехника",
      price: 21990,
      sale_price: 19990,
      rating: 4.8,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 502,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=1080&q=80"],
      is_new: true,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: true,
      sku: "AIRPODS-PRO2-USBC",
      publish_date: "10 февраля в 18:20",
      seller_response_time: "около 20 минут",
      seller_listings: 6,
      breadcrumbs: ["Главная", "Аудиотехника", "Наушники"],
      specifications: {
        Шумоподавление: "Активное",
        Порт: "USB-C",
      },
      is_price_lower: true,
      created_at: daysAgo(25),
    },
    {
      public_id: "LST-017",
      seller_public_id: "SLR-204",
      type: "SERVICE",
      title: "Монтаж телевизора до 75\"",
      description: "Аккуратный монтаж на стену, выезд мастера в день обращения.",
      category_name: "Установка и настройка",
      price: 4500,
      sale_price: null,
      rating: 4.7,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 267,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: false,
      sku: "SERV-TV-WALL",
      publish_date: "9 февраля в 11:00",
      seller_response_time: "около 35 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Услуги", "Установка и настройка"],
      specifications: {
        Время: "60-90 минут",
        Гарантия: "3 месяца",
      },
      is_price_lower: false,
      created_at: daysAgo(26),
    },
    {
      public_id: "LST-018",
      seller_public_id: "SLR-205",
      type: "SERVICE",
      title: "Замена экрана iPhone за 60 минут",
      description: "Сервис с оригинальными комплектующими и гарантией 6 месяцев.",
      category_name: "Ремонт электроники",
      price: 7900,
      sale_price: null,
      rating: 4.8,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 529,
      city: "Новосибирск",
      image: "https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1580910051074-3eb694886505?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: false,
      sku: "SERV-IP-SCREEN",
      publish_date: "8 февраля в 13:20",
      seller_response_time: "около 20 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Услуги", "Ремонт электроники", "Ремонт телефонов"],
      specifications: {
        Срок: "до 1 часа",
        Гарантия: "6 месяцев",
      },
      is_price_lower: false,
      created_at: daysAgo(27),
    },
    {
      public_id: "LST-019",
      seller_public_id: "SLR-205",
      type: "SERVICE",
      title: "Чистка ноутбука + замена термопасты",
      description: "Профилактика ноутбука, тест температур и отчёт по диагностике.",
      category_name: "Ремонт электроники",
      price: 3900,
      sale_price: 3500,
      rating: 4.9,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 183,
      city: "Новосибирск",
      image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&q=80"],
      is_new: false,
      is_sale: true,
      is_verified: true,
      shipping_by_seller: false,
      sku: "SERV-LAPTOP-CLEAN",
      publish_date: "7 февраля в 09:45",
      seller_response_time: "около 50 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Услуги", "Ремонт электроники", "Ремонт ноутбуков"],
      specifications: {
        Срок: "2-3 часа",
        Отчёт: "Фото до/после",
      },
      is_price_lower: true,
      created_at: daysAgo(28),
    },
    {
      public_id: "LST-020",
      seller_public_id: "SLR-204",
      type: "SERVICE",
      title: "Курьерская доставка день-в-день",
      description: "Экспресс-доставка техники и документов по Москве.",
      category_name: "Курьерские услуги",
      price: 2500,
      sale_price: null,
      rating: 4.6,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 221,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1616400619175-5beda3a17896?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1616400619175-5beda3a17896?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: false,
      sku: "SERV-COURIER-SAME",
      publish_date: "6 февраля в 14:30",
      seller_response_time: "около 15 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Услуги", "Курьерские услуги"],
      specifications: {
        Радиус: "до 30 км",
        "Окно доставки": "2-4 часа",
      },
      is_price_lower: false,
      created_at: daysAgo(29),
    },
    {
      public_id: "LST-021",
      seller_public_id: "SLR-204",
      type: "SERVICE",
      title: "Настройка умного дома под ключ",
      description: "Подключение хаба, сценарии автоматизации, удалённый доступ.",
      category_name: "Установка и настройка",
      price: 12000,
      sale_price: null,
      rating: 4.5,
      condition: "NEW",
      status: "MODERATION",
      moderation_status: "PENDING",
      views: 0,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1558002038-1055907df827?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1558002038-1055907df827?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: false,
      shipping_by_seller: false,
      sku: "SERV-SMART-HOME",
      publish_date: "2 марта в 12:20",
      seller_response_time: "около 1 часа",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Услуги", "Установка и настройка", "Умный дом"],
      specifications: {
        Время: "3-5 часов",
        "Гарантия работ": "30 дней",
      },
      is_price_lower: false,
      created_at: daysAgo(1),
    },
    {
      public_id: "LST-022",
      seller_public_id: "SLR-204",
      type: "SERVICE",
      title: "Заправка и чистка кондиционеров",
      description: "Проверка давления, заправка фреоном, антисептическая обработка.",
      category_name: "Климат и дом",
      price: 5200,
      sale_price: null,
      rating: 4.7,
      condition: "NEW",
      status: "ACTIVE",
      moderation_status: "APPROVED",
      views: 176,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1581093448799-6f0e7e9f3ab2?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1581093448799-6f0e7e9f3ab2?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: false,
      sku: "SERV-AC-CLEAN",
      publish_date: "5 февраля в 10:05",
      seller_response_time: "около 40 минут",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Услуги", "Климат и дом"],
      specifications: {
        Время: "1-2 часа",
        Фреон: "R410A",
      },
      is_price_lower: false,
      created_at: daysAgo(30),
    },
    {
      public_id: "LST-023",
      seller_public_id: "SLR-205",
      type: "SERVICE",
      title: "Диагностика MacBook после залития",
      description: "Бесплатная диагностика в день обращения, отчёт по ремонту.",
      category_name: "Ремонт электроники",
      price: 2500,
      sale_price: null,
      rating: 4.6,
      condition: "NEW",
      status: "INACTIVE",
      moderation_status: "APPROVED",
      views: 94,
      city: "Новосибирск",
      image: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: true,
      shipping_by_seller: false,
      sku: "SERV-MACBOOK-WATER",
      publish_date: "4 февраля в 16:00",
      seller_response_time: "около 1 часа",
      seller_listings: 4,
      breadcrumbs: ["Главная", "Услуги", "Ремонт электроники", "Ремонт ноутбуков"],
      specifications: {
        "Срок диагностики": "до 2 часов",
        Отчёт: "Письменный",
      },
      is_price_lower: false,
      created_at: daysAgo(31),
    },
    {
      public_id: "LST-024",
      seller_public_id: "SLR-999",
      type: "SERVICE",
      title: "Ремонт любой техники без документов и гарантии!!!",
      description: "СРОЧНО! Предоплата переводом, чеков не даём, пишите @repair_fast",
      category_name: "Ремонт электроники",
      price: 1500,
      sale_price: null,
      rating: 1.9,
      condition: "NEW",
      status: "INACTIVE",
      moderation_status: "REJECTED",
      views: 39,
      city: "Москва",
      image: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1080&q=80",
      images: ["https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1080&q=80"],
      is_new: false,
      is_sale: false,
      is_verified: false,
      shipping_by_seller: false,
      sku: "SPAM-SERV-001",
      publish_date: "3 февраля в 08:30",
      seller_response_time: "более 1 дня",
      seller_listings: 2,
      breadcrumbs: ["Главная", "Услуги", "Ремонт электроники"],
      specifications: {
        Примечание: "Подозрительное объявление",
      },
      is_price_lower: true,
      created_at: daysAgo(32),
    },
  ];

  const listingIdByPublic = new Map<string, number>();
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
        created_at: listing.created_at,
      },
    });

    listingIdByPublic.set(listing.public_id, created.id);
  }

  await prisma.listingReview.createMany({
    data: [
      {
        listing_id: listingIdByPublic.get("LST-001")!,
        author_name: "Александр К.",
        rating: 5,
        date: "2026-02-26",
        comment: "Быстрая отправка, телефон полностью новый.",
      },
      {
        listing_id: listingIdByPublic.get("LST-001")!,
        author_name: "Марина Т.",
        rating: 5,
        date: "2026-02-20",
        comment: "Всё как в описании, рекомендую продавца.",
      },
      {
        listing_id: listingIdByPublic.get("LST-002")!,
        author_name: "Илья Н.",
        rating: 4,
        date: "2026-02-18",
        comment: "Телефон отличный, была небольшая задержка доставки.",
      },
      {
        listing_id: listingIdByPublic.get("LST-004")!,
        author_name: "Сергей П.",
        rating: 5,
        date: "2026-02-19",
        comment: "MacBook новый, упаковка не вскрыта.",
      },
      {
        listing_id: listingIdByPublic.get("LST-004")!,
        author_name: "Анна В.",
        rating: 5,
        date: "2026-02-16",
        comment: "Очень доволен покупкой и коммуникацией.",
      },
      {
        listing_id: listingIdByPublic.get("LST-005")!,
        author_name: "Виктор Б.",
        rating: 4,
        date: "2026-02-12",
        comment: "Ноутбук в хорошем состоянии, всё честно.",
      },
      {
        listing_id: listingIdByPublic.get("LST-006")!,
        author_name: "Тимур Р.",
        rating: 5,
        date: "2026-02-21",
        comment: "Наушники оригинал, звук отличный.",
      },
      {
        listing_id: listingIdByPublic.get("LST-007")!,
        author_name: "Полина Ф.",
        rating: 5,
        date: "2026-02-17",
        comment: "Пылесос супер, мощность огонь.",
      },
      {
        listing_id: listingIdByPublic.get("LST-008")!,
        author_name: "Кирилл Л.",
        rating: 5,
        date: "2026-02-15",
        comment: "PS5 приехала быстро, всё запечатано.",
      },
      {
        listing_id: listingIdByPublic.get("LST-009")!,
        author_name: "Юрий К.",
        rating: 4,
        date: "2026-02-13",
        comment: "Покупкой доволен, коробка была с вмятиной.",
      },
      {
        listing_id: listingIdByPublic.get("LST-010")!,
        author_name: "Ирина М.",
        rating: 5,
        date: "2026-02-11",
        comment: "Картинка шикарная, отличный телевизор.",
      },
      {
        listing_id: listingIdByPublic.get("LST-011")!,
        author_name: "Максим О.",
        rating: 5,
        date: "2026-02-09",
        comment: "Камера топ, полный комплект.",
      },
      {
        listing_id: listingIdByPublic.get("LST-015")!,
        author_name: "Роман Г.",
        rating: 5,
        date: "2026-02-08",
        comment: "Монтаж видео летает, железо мощное.",
      },
      {
        listing_id: listingIdByPublic.get("LST-016")!,
        author_name: "Екатерина Ш.",
        rating: 5,
        date: "2026-02-22",
        comment: "Оригинал, проверили по серийному номеру.",
      },
      {
        listing_id: listingIdByPublic.get("LST-018")!,
        author_name: "Андрей Ц.",
        rating: 5,
        date: "2026-02-10",
        comment: "Экран заменили быстро, без вопросов.",
      },
      {
        listing_id: listingIdByPublic.get("LST-019")!,
        author_name: "Олег С.",
        rating: 5,
        date: "2026-02-14",
        comment: "Ноутбук стал тише и холоднее после сервиса.",
      },
      {
        listing_id: listingIdByPublic.get("LST-020")!,
        author_name: "Людмила А.",
        rating: 4,
        date: "2026-02-07",
        comment: "Курьер приехал вовремя, но упаковка была простая.",
      },
      {
        listing_id: listingIdByPublic.get("LST-022")!,
        author_name: "Владислав Н.",
        rating: 5,
        date: "2026-02-06",
        comment: "Почистили кондиционер качественно.",
      },
    ],
  });

  await prisma.listingQuestion.createMany({
    data: [
      {
        public_id: "Q001",
        listing_id: listingIdByPublic.get("LST-001")!,
        buyer_id: getUserId("USR-101"),
        question: "Есть ли eSIM и международная гарантия?",
        answer: "Да, eSIM поддерживается. Гарантия международная 12 месяцев.",
        status: "ANSWERED",
        created_at: daysAgo(5, 3),
        answered_at: daysAgo(5, 2),
      },
      {
        public_id: "Q002",
        listing_id: listingIdByPublic.get("LST-004")!,
        buyer_id: getUserId("USR-102"),
        question: "Можно ли оформить самовывоз сегодня вечером?",
        answer: "Да, самовывоз доступен после 19:00.",
        status: "ANSWERED",
        created_at: daysAgo(6, 6),
        answered_at: daysAgo(6, 5),
      },
      {
        public_id: "Q003",
        listing_id: listingIdByPublic.get("LST-005")!,
        buyer_id: getUserId("USR-103"),
        question: "Сколько циклов батареи у ноутбука?",
        answer: "112 циклов, износ около 8%.",
        status: "ANSWERED",
        created_at: daysAgo(7, 2),
        answered_at: daysAgo(7, 1),
      },
      {
        public_id: "Q004",
        listing_id: listingIdByPublic.get("LST-006")!,
        buyer_id: getUserId("USR-104"),
        question: "Это глобальная версия с приложением Sony Headphones?",
        status: "PENDING",
        created_at: daysAgo(4, 8),
      },
      {
        public_id: "Q005",
        listing_id: listingIdByPublic.get("LST-008")!,
        buyer_id: getUserId("USR-105"),
        question: "В комплекте есть второй геймпад?",
        answer: "По умолчанию один, второй можно добавить со скидкой.",
        status: "ANSWERED",
        created_at: daysAgo(9, 4),
        answered_at: daysAgo(9, 3),
      },
      {
        public_id: "Q006",
        listing_id: listingIdByPublic.get("LST-010")!,
        buyer_id: getUserId("USR-106"),
        question: "Есть ли русское меню и поддержка Dolby Vision?",
        answer: "Да, русское меню и Dolby Vision поддерживаются.",
        status: "ANSWERED",
        created_at: daysAgo(10, 5),
        answered_at: daysAgo(10, 4),
      },
      {
        public_id: "Q007",
        listing_id: listingIdByPublic.get("LST-015")!,
        buyer_id: getUserId("USR-107"),
        question: "Сколько дней гарантия магазина?",
        answer: "Гарантия магазина 12 месяцев.",
        status: "ANSWERED",
        created_at: daysAgo(12, 7),
        answered_at: daysAgo(12, 6),
      },
      {
        public_id: "Q008",
        listing_id: listingIdByPublic.get("LST-017")!,
        buyer_id: getUserId("USR-108"),
        question: "Сможете приехать в область за МКАД?",
        status: "PENDING",
        created_at: daysAgo(3, 9),
      },
      {
        public_id: "Q009",
        listing_id: listingIdByPublic.get("LST-018")!,
        buyer_id: getUserId("USR-109"),
        question: "Оригинальный ли OLED модуль ставите?",
        answer: "Да, используем оригинальные OLED-модули с гарантией.",
        status: "ANSWERED",
        created_at: daysAgo(8, 4),
        answered_at: daysAgo(8, 3),
      },
      {
        public_id: "Q010",
        listing_id: listingIdByPublic.get("LST-019")!,
        buyer_id: getUserId("USR-110"),
        question: "Есть ли услуга срочной чистки за 1 день?",
        answer: "Да, срочная услуга доступна по предварительной записи.",
        status: "ANSWERED",
        created_at: daysAgo(8, 1),
        answered_at: daysAgo(8),
      },
      {
        public_id: "Q011",
        listing_id: listingIdByPublic.get("LST-020")!,
        buyer_id: getUserId("USR-001"),
        question: "Курьер может забрать товар у продавца и сразу доставить мне?",
        answer: "Да, это основной сценарий услуги день-в-день.",
        status: "ANSWERED",
        created_at: daysAgo(6, 1),
        answered_at: daysAgo(6),
      },
      {
        public_id: "Q012",
        listing_id: listingIdByPublic.get("LST-021")!,
        buyer_id: getUserId("USR-102"),
        question: "Поддерживается ли интеграция с Яндекс Станцией?",
        status: "PENDING",
        created_at: daysAgo(1, 3),
      },
    ],
  });

  await prisma.wishlistItem.createMany({
    data: [
      { user_id: getUserId("USR-001"), listing_id: listingIdByPublic.get("LST-004")! },
      { user_id: getUserId("USR-001"), listing_id: listingIdByPublic.get("LST-006")! },
      { user_id: getUserId("USR-001"), listing_id: listingIdByPublic.get("LST-018")! },
      { user_id: getUserId("USR-101"), listing_id: listingIdByPublic.get("LST-001")! },
      { user_id: getUserId("USR-101"), listing_id: listingIdByPublic.get("LST-015")! },
      { user_id: getUserId("USR-101"), listing_id: listingIdByPublic.get("LST-022")! },
      { user_id: getUserId("USR-102"), listing_id: listingIdByPublic.get("LST-008")! },
      { user_id: getUserId("USR-102"), listing_id: listingIdByPublic.get("LST-010")! },
      { user_id: getUserId("USR-102"), listing_id: listingIdByPublic.get("LST-019")! },
      { user_id: getUserId("USR-103"), listing_id: listingIdByPublic.get("LST-002")! },
      { user_id: getUserId("USR-103"), listing_id: listingIdByPublic.get("LST-011")! },
      { user_id: getUserId("USR-103"), listing_id: listingIdByPublic.get("LST-020")! },
      { user_id: getUserId("USR-104"), listing_id: listingIdByPublic.get("LST-003")! },
      { user_id: getUserId("USR-104"), listing_id: listingIdByPublic.get("LST-007")! },
      { user_id: getUserId("USR-105"), listing_id: listingIdByPublic.get("LST-016")! },
      { user_id: getUserId("USR-105"), listing_id: listingIdByPublic.get("LST-018")! },
      { user_id: getUserId("USR-106"), listing_id: listingIdByPublic.get("LST-005")! },
      { user_id: getUserId("USR-107"), listing_id: listingIdByPublic.get("LST-004")! },
      { user_id: getUserId("USR-108"), listing_id: listingIdByPublic.get("LST-021")! },
      { user_id: getUserId("USR-109"), listing_id: listingIdByPublic.get("LST-022")! },
      { user_id: getUserId("USR-110"), listing_id: listingIdByPublic.get("LST-017")! },
    ],
  });

  const listingSeedByPublic = new Map(listingsSeed.map((listing) => [listing.public_id, listing]));

  const ordersSeed: MarketOrderSeed[] = [
    {
      public_id: "ORD-1001",
      buyer_public_id: "USR-001",
      seller_public_id: "SLR-001",
      status: "COMPLETED",
      delivery_type: "DELIVERY",
      delivery_address: "Москва, Тверская улица, 12",
      delivery_cost: 500,
      discount: 2000,
      created_at: daysAgo(5, 6),
      items: [
        { listing_public_id: "LST-001", name: "iPhone 15 Pro Max 256GB Titanium", quantity: 1, price: 119000 },
        { listing_public_id: "LST-016", name: "AirPods Pro 2 USB-C", quantity: 1, price: 19990 },
      ],
    },
    {
      public_id: "ORD-1002",
      buyer_public_id: "USR-101",
      seller_public_id: "SLR-201",
      status: "PAID",
      delivery_type: "DELIVERY",
      delivery_address: "Москва, Пятницкая улица, 18",
      delivery_cost: 500,
      discount: 1500,
      created_at: daysAgo(4, 8),
      items: [{ listing_public_id: "LST-004", name: "MacBook Air M3 16GB 512GB", quantity: 1, price: 134900 }],
    },
    {
      public_id: "ORD-1003",
      buyer_public_id: "USR-102",
      seller_public_id: "SLR-202",
      status: "SHIPPED",
      delivery_type: "DELIVERY",
      delivery_address: "Казань, ул. Баумана, 9",
      delivery_cost: 500,
      discount: 0,
      created_at: daysAgo(7, 2),
      items: [{ listing_public_id: "LST-008", name: "PlayStation 5 Slim Digital", quantity: 1, price: 53990 }],
    },
    {
      public_id: "ORD-1004",
      buyer_public_id: "USR-103",
      seller_public_id: "SLR-203",
      status: "DELIVERED",
      delivery_type: "DELIVERY",
      delivery_address: "Москва, пр-т Мира, 22",
      delivery_cost: 500,
      discount: 1000,
      created_at: daysAgo(6, 7),
      items: [{ listing_public_id: "LST-007", name: "Dyson V15 Detect Absolute", quantity: 1, price: 63990 }],
    },
    {
      public_id: "ORD-1005",
      buyer_public_id: "USR-104",
      seller_public_id: "SLR-205",
      status: "COMPLETED",
      delivery_type: "PICKUP",
      delivery_address: "Самовывоз: Новосибирск, Красный проспект, 86",
      delivery_cost: 0,
      discount: 0,
      created_at: daysAgo(12, 3),
      items: [
        { listing_public_id: "LST-018", name: "Замена экрана iPhone за 60 минут", quantity: 1, price: 7900 },
      ],
    },
    {
      public_id: "ORD-1006",
      buyer_public_id: "USR-105",
      seller_public_id: "SLR-204",
      status: "PREPARED",
      delivery_type: "PICKUP",
      delivery_address: "Самовывоз: Москва, ул. Сущевский Вал, 18",
      delivery_cost: 0,
      discount: 0,
      created_at: daysAgo(3, 4),
      items: [{ listing_public_id: "LST-017", name: "Монтаж телевизора до 75\"", quantity: 1, price: 4500 }],
    },
    {
      public_id: "ORD-1007",
      buyer_public_id: "USR-106",
      seller_public_id: "SLR-202",
      status: "PAID",
      delivery_type: "DELIVERY",
      delivery_address: "Екатеринбург, ул. Малышева, 44",
      delivery_cost: 500,
      discount: 1000,
      created_at: daysAgo(2, 14),
      items: [
        { listing_public_id: "LST-006", name: "Sony WH-1000XM5", quantity: 1, price: 26990 },
        { listing_public_id: "LST-009", name: "Xbox Series X 1TB", quantity: 1, price: 46990 },
      ],
    },
    {
      public_id: "ORD-1008",
      buyer_public_id: "USR-107",
      seller_public_id: "SLR-001",
      status: "CANCELLED",
      delivery_type: "DELIVERY",
      delivery_address: "Нижний Новгород, Большая Покровская, 11",
      delivery_cost: 500,
      discount: 5000,
      created_at: daysAgo(8, 11),
      items: [{ listing_public_id: "LST-015", name: "MacBook Pro 14 M3 Max 36GB", quantity: 1, price: 289990 }],
    },
    {
      public_id: "ORD-1009",
      buyer_public_id: "USR-108",
      seller_public_id: "SLR-201",
      status: "COMPLETED",
      delivery_type: "DELIVERY",
      delivery_address: "Новосибирск, ул. Ленина, 44",
      delivery_cost: 500,
      discount: 2000,
      created_at: daysAgo(9, 9),
      items: [{ listing_public_id: "LST-011", name: "Sony Alpha A7 IV Body", quantity: 1, price: 194900 }],
    },
    {
      public_id: "ORD-1010",
      buyer_public_id: "USR-109",
      seller_public_id: "SLR-203",
      status: "CREATED",
      delivery_type: "DELIVERY",
      delivery_address: "Самара, Московское шоссе, 14",
      delivery_cost: 500,
      discount: 0,
      created_at: daysAgo(1, 13),
      items: [{ listing_public_id: "LST-010", name: "LG OLED C3 55\"", quantity: 1, price: 124990 }],
    },
    {
      public_id: "ORD-1011",
      buyer_public_id: "USR-110",
      seller_public_id: "SLR-204",
      status: "SHIPPED",
      delivery_type: "DELIVERY",
      delivery_address: "Краснодар, ул. Красная, 21",
      delivery_cost: 400,
      discount: 0,
      created_at: daysAgo(4, 2),
      items: [{ listing_public_id: "LST-020", name: "Курьерская доставка день-в-день", quantity: 1, price: 2500 }],
    },
    {
      public_id: "ORD-1012",
      buyer_public_id: "USR-101",
      seller_public_id: "SLR-205",
      status: "COMPLETED",
      delivery_type: "PICKUP",
      delivery_address: "Самовывоз: Новосибирск, Красный проспект, 86",
      delivery_cost: 0,
      discount: 400,
      created_at: daysAgo(10, 4),
      items: [{ listing_public_id: "LST-019", name: "Чистка ноутбука + замена термопасты", quantity: 1, price: 3500 }],
    },
    {
      public_id: "ORD-1013",
      buyer_public_id: "USR-102",
      seller_public_id: "SLR-001",
      status: "DELIVERED",
      delivery_type: "DELIVERY",
      delivery_address: "Казань, ул. Баумана, 15",
      delivery_cost: 500,
      discount: 1000,
      created_at: daysAgo(11, 10),
      items: [{ listing_public_id: "LST-002", name: "Samsung Galaxy S24 Ultra 512GB", quantity: 1, price: 109990 }],
    },
    {
      public_id: "ORD-1014",
      buyer_public_id: "USR-103",
      seller_public_id: "SLR-203",
      status: "PAID",
      delivery_type: "DELIVERY",
      delivery_address: "Москва, ул. Новослободская, 31",
      delivery_cost: 500,
      discount: 2000,
      created_at: daysAgo(13, 7),
      items: [{ listing_public_id: "LST-012", name: "Робот-пылесос Dreame L10s Pro", quantity: 1, price: 52990 }],
    },
    {
      public_id: "ORD-1015",
      buyer_public_id: "USR-104",
      seller_public_id: "SLR-204",
      status: "COMPLETED",
      delivery_type: "PICKUP",
      delivery_address: "Самовывоз: Москва, ул. Сущевский Вал, 18",
      delivery_cost: 0,
      discount: 0,
      created_at: daysAgo(15, 5),
      items: [{ listing_public_id: "LST-022", name: "Заправка и чистка кондиционеров", quantity: 1, price: 5200 }],
    },
    {
      public_id: "ORD-1016",
      buyer_public_id: "USR-105",
      seller_public_id: "SLR-202",
      status: "PREPARED",
      delivery_type: "DELIVERY",
      delivery_address: "Санкт-Петербург, Невский проспект, 73",
      delivery_cost: 500,
      discount: 2000,
      created_at: daysAgo(2, 5),
      items: [{ listing_public_id: "LST-008", name: "PlayStation 5 Slim Digital", quantity: 2, price: 52990 }],
    },
  ];

  const orderIdByPublic = new Map<string, number>();
  const orderTotalByPublic = new Map<string, number>();

  for (const order of ordersSeed) {
    for (const item of order.items) {
      const listingSeed = listingSeedByPublic.get(item.listing_public_id);
      if (!listingSeed) {
        throw new Error(`Missing listing for order item ${item.listing_public_id}`);
      }
      if (listingSeed.seller_public_id !== order.seller_public_id) {
        throw new Error(
          `Order ${order.public_id} seller mismatch for listing ${item.listing_public_id}: expected ${listingSeed.seller_public_id}, got ${order.seller_public_id}`,
        );
      }
    }

    const subtotal = order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalPrice = subtotal + order.delivery_cost - order.discount;

    const createdOrder = await prisma.marketOrder.create({
      data: {
        public_id: order.public_id,
        buyer_id: getUserId(order.buyer_public_id),
        seller_id: getUserId(order.seller_public_id),
        status: order.status,
        delivery_type: order.delivery_type,
        delivery_address: order.delivery_address,
        total_price: totalPrice,
        delivery_cost: order.delivery_cost,
        discount: order.discount,
        created_at: order.created_at,
        items: {
          create: order.items.map((item) => ({
            listing_id: listingIdByPublic.get(item.listing_public_id) ?? null,
            name: item.name,
            image: listingSeedByPublic.get(item.listing_public_id)?.image ?? null,
            price: item.price,
            quantity: item.quantity,
          })),
        },
      },
    });

    orderIdByPublic.set(order.public_id, createdOrder.id);
    orderTotalByPublic.set(order.public_id, totalPrice);
  }

  const transactionsSeed: TransactionSeed[] = [
    {
      public_id: "TXN-001",
      order_public_id: "ORD-1001",
      buyer_public_id: "USR-001",
      seller_public_id: "SLR-001",
      status: "SUCCESS",
      commission_rate: 3.5,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1001",
      created_at: daysAgo(5, 5),
    },
    {
      public_id: "TXN-002",
      order_public_id: "ORD-1002",
      buyer_public_id: "USR-101",
      seller_public_id: "SLR-201",
      status: "HELD",
      commission_rate: 3.3,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1002",
      created_at: daysAgo(4, 7),
    },
    {
      public_id: "TXN-003",
      order_public_id: "ORD-1003",
      buyer_public_id: "USR-102",
      seller_public_id: "SLR-202",
      status: "HELD",
      commission_rate: 3.1,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1003",
      created_at: daysAgo(7, 1),
    },
    {
      public_id: "TXN-004",
      order_public_id: "ORD-1004",
      buyer_public_id: "USR-103",
      seller_public_id: "SLR-203",
      status: "SUCCESS",
      commission_rate: 3.2,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1004",
      created_at: daysAgo(6, 6),
    },
    {
      public_id: "TXN-005",
      order_public_id: "ORD-1005",
      buyer_public_id: "USR-104",
      seller_public_id: "SLR-205",
      status: "SUCCESS",
      commission_rate: 4.0,
      payment_provider: "Cash",
      payment_intent_id: "pi_ord1005",
      created_at: daysAgo(12, 2),
    },
    {
      public_id: "TXN-006",
      order_public_id: "ORD-1006",
      buyer_public_id: "USR-105",
      seller_public_id: "SLR-204",
      status: "HELD",
      commission_rate: 4.2,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1006",
      created_at: daysAgo(3, 3),
    },
    {
      public_id: "TXN-007",
      order_public_id: "ORD-1007",
      buyer_public_id: "USR-106",
      seller_public_id: "SLR-202",
      status: "HELD",
      commission_rate: 3.1,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1007",
      created_at: daysAgo(2, 13),
    },
    {
      public_id: "TXN-008",
      order_public_id: "ORD-1008",
      buyer_public_id: "USR-107",
      seller_public_id: "SLR-001",
      status: "CANCELLED",
      commission_rate: 3.0,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1008",
      created_at: daysAgo(8, 10),
    },
    {
      public_id: "TXN-009",
      order_public_id: "ORD-1009",
      buyer_public_id: "USR-108",
      seller_public_id: "SLR-201",
      status: "SUCCESS",
      commission_rate: 2.8,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1009",
      created_at: daysAgo(9, 8),
    },
    {
      public_id: "TXN-010",
      order_public_id: "ORD-1010",
      buyer_public_id: "USR-109",
      seller_public_id: "SLR-203",
      status: "HELD",
      commission_rate: 3.0,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1010",
      created_at: daysAgo(1, 12),
    },
    {
      public_id: "TXN-011",
      order_public_id: "ORD-1011",
      buyer_public_id: "USR-110",
      seller_public_id: "SLR-204",
      status: "HELD",
      commission_rate: 4.1,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1011",
      created_at: daysAgo(4, 1),
    },
    {
      public_id: "TXN-012",
      order_public_id: "ORD-1012",
      buyer_public_id: "USR-101",
      seller_public_id: "SLR-205",
      status: "SUCCESS",
      commission_rate: 4.0,
      payment_provider: "Cash",
      payment_intent_id: "pi_ord1012",
      created_at: daysAgo(10, 3),
    },
    {
      public_id: "TXN-013",
      order_public_id: "ORD-1013",
      buyer_public_id: "USR-102",
      seller_public_id: "SLR-001",
      status: "SUCCESS",
      commission_rate: 3.5,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1013",
      created_at: daysAgo(11, 9),
    },
    {
      public_id: "TXN-014",
      order_public_id: "ORD-1014",
      buyer_public_id: "USR-103",
      seller_public_id: "SLR-203",
      status: "HELD",
      commission_rate: 3.4,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1014",
      created_at: daysAgo(13, 6),
    },
    {
      public_id: "TXN-015",
      order_public_id: "ORD-1015",
      buyer_public_id: "USR-104",
      seller_public_id: "SLR-204",
      status: "SUCCESS",
      commission_rate: 4.2,
      payment_provider: "Cash",
      payment_intent_id: "pi_ord1015",
      created_at: daysAgo(15, 4),
    },
    {
      public_id: "TXN-016",
      order_public_id: "ORD-1016",
      buyer_public_id: "USR-105",
      seller_public_id: "SLR-202",
      status: "HELD",
      commission_rate: 3.0,
      payment_provider: "Card",
      payment_intent_id: "pi_ord1016",
      created_at: daysAgo(2, 4),
    },
  ];

  await prisma.platformTransaction.createMany({
    data: transactionsSeed.map((transaction) => {
      const amount = orderTotalByPublic.get(transaction.order_public_id);
      if (amount === undefined) {
        throw new Error(`Missing order total for ${transaction.order_public_id}`);
      }

      return {
        public_id: transaction.public_id,
        order_id: orderIdByPublic.get(transaction.order_public_id)!,
        buyer_id: getUserId(transaction.buyer_public_id),
        seller_id: getUserId(transaction.seller_public_id),
        amount,
        status: transaction.status,
        commission_rate: transaction.commission_rate,
        commission: Math.round((amount * transaction.commission_rate) / 100),
        payment_provider: transaction.payment_provider,
        payment_intent_id: transaction.payment_intent_id,
        created_at: transaction.created_at,
      };
    }),
  });

  await prisma.complaint.createMany({
    data: [
      {
        public_id: "CMP-001",
        created_at: daysAgo(4, 10),
        status: "NEW",
        complaint_type: "Несоответствие описанию",
        listing_id: listingIdByPublic.get("LST-001")!,
        seller_id: getUserId("SLR-001"),
        reporter_id: getUserId("USR-101"),
        seller_violations_count: 0,
        description: "В описании указано, что устройство неактивированное, но на коробке следы вскрытия.",
        evidence: asJson(["img_001.jpg", "img_002.jpg"]),
      },
      {
        public_id: "CMP-002",
        created_at: daysAgo(3, 12),
        status: "APPROVED",
        complaint_type: "Мошенничество",
        listing_id: listingIdByPublic.get("LST-014")!,
        seller_id: getUserId("SLR-999"),
        reporter_id: getUserId("USR-103"),
        seller_violations_count: 4,
        description: "Продавец просил перевести деньги напрямую через Telegram.",
        evidence: asJson(["chat_screen_1.png"]),
        checked_at: daysAgo(3, 6),
        checked_by_id: getUserId("ADM-001"),
        action_taken: "Подтверждено нарушение. Продавец заблокирован.",
      },
      {
        public_id: "CMP-003",
        created_at: daysAgo(9, 8),
        status: "REJECTED",
        complaint_type: "Задержка доставки",
        listing_id: listingIdByPublic.get("LST-008")!,
        seller_id: getUserId("SLR-202"),
        reporter_id: getUserId("USR-108"),
        seller_violations_count: 0,
        description: "Товар приехал на 1 день позже ожидаемого.",
        evidence: null,
        checked_at: daysAgo(8, 20),
        checked_by_id: getUserId("ADM-001"),
        action_taken: "Нарушений не выявлено, перенос доставки был согласован с покупателем.",
      },
      {
        public_id: "CMP-004",
        created_at: daysAgo(2, 16),
        status: "NEW",
        complaint_type: "Некачественная услуга",
        listing_id: listingIdByPublic.get("LST-020")!,
        seller_id: getUserId("SLR-204"),
        reporter_id: getUserId("USR-105"),
        seller_violations_count: 1,
        description: "Курьер опоздал больше чем на 2 часа.",
        evidence: asJson(["delivery_chat.png"]),
      },
      {
        public_id: "CMP-005",
        created_at: daysAgo(6, 11),
        status: "APPROVED",
        complaint_type: "Запрос предоплаты вне платформы",
        listing_id: listingIdByPublic.get("LST-024")!,
        seller_id: getUserId("SLR-999"),
        reporter_id: getUserId("USR-102"),
        seller_violations_count: 5,
        description: "Исполнитель просил перевести 100% суммы по номеру карты.",
        evidence: asJson(["voice_message.mp3", "payment_request.png"]),
        checked_at: daysAgo(6, 6),
        checked_by_id: getUserId("ADM-001"),
        action_taken: "Подтверждено нарушение. Объявление отклонено, аккаунт в блокировке.",
      },
      {
        public_id: "CMP-006",
        created_at: daysAgo(14, 5),
        status: "REJECTED",
        complaint_type: "Не подошла услуга",
        listing_id: listingIdByPublic.get("LST-017")!,
        seller_id: getUserId("SLR-204"),
        reporter_id: getUserId("USR-110"),
        seller_violations_count: 0,
        description: "Хотел монтаж в день обращения, но была очередь.",
        evidence: null,
        checked_at: daysAgo(13, 20),
        checked_by_id: getUserId("ADM-001"),
        action_taken: "Жалоба отклонена: нарушение условий оферты не подтверждено.",
      },
    ],
  });

  await prisma.kycRequest.createMany({
    data: [
      {
        public_id: "KYC-001",
        created_at: daysAgo(6),
        status: "PENDING",
        seller_id: getUserId("SLR-001"),
        email: "partner@ecomm.ru",
        phone: "+7 (999) 000-00-02",
        company_name: "ООО Партнер Демо",
        inn: "7701234567",
        address: "Москва, ул. Ленина, д. 10",
        documents: asJson(["passport.pdf", "inn.pdf", "ogrn.pdf"]),
        notes: "Повторная подача после обновления документов.",
      },
      {
        public_id: "KYC-002",
        created_at: daysAgo(20),
        status: "APPROVED",
        seller_id: getUserId("SLR-201"),
        email: "techpoint@example.com",
        phone: "+7 (999) 201-20-20",
        company_name: "ООО ТехПоинт",
        inn: "7812456789",
        address: "Санкт-Петербург, Невский пр., д. 25",
        documents: asJson(["passport.pdf", "inn.pdf"]),
        notes: "Проверено, документы действительны.",
        reviewed_by_id: getUserId("ADM-001"),
        reviewed_at: daysAgo(18),
      },
      {
        public_id: "KYC-003",
        created_at: daysAgo(18),
        status: "APPROVED",
        seller_id: getUserId("SLR-202"),
        email: "gadgetpro@example.com",
        phone: "+7 (999) 202-20-20",
        company_name: "ИП ГаджетПро",
        inn: "1654123456",
        address: "Казань, ул. Петербургская, 40",
        documents: asJson(["passport.pdf", "inn.pdf", "bank_details.pdf"]),
        notes: "Одобрено после ручной проверки.",
        reviewed_by_id: getUserId("ADM-001"),
        reviewed_at: daysAgo(16),
      },
      {
        public_id: "KYC-004",
        created_at: daysAgo(4),
        status: "PENDING",
        seller_id: getUserId("SLR-204"),
        email: "install.pro@example.com",
        phone: "+7 (999) 204-40-40",
        company_name: "ООО Инсталл Про",
        inn: "7709988776",
        address: "Москва, ул. Сущевский Вал, 18",
        documents: asJson(["passport.pdf", "inn.pdf"]),
        notes: "Ожидает дополнительный договор аренды.",
      },
      {
        public_id: "KYC-005",
        created_at: daysAgo(11),
        status: "APPROVED",
        seller_id: getUserId("SLR-205"),
        email: "servicelab@example.com",
        phone: "+7 (999) 205-50-50",
        company_name: "ООО СервисЛаб",
        inn: "5403123456",
        address: "Новосибирск, Красный пр., 86",
        documents: asJson(["passport.pdf", "inn.pdf", "service_license.pdf"]),
        notes: "Проверка пройдена.",
        reviewed_by_id: getUserId("ADM-001"),
        reviewed_at: daysAgo(9),
      },
      {
        public_id: "KYC-006",
        created_at: daysAgo(3),
        status: "REJECTED",
        seller_id: getUserId("SLR-999"),
        email: "seller.suspicious@example.com",
        phone: "+7 (999) 000-00-00",
        company_name: "ООО Рога и Копыта",
        inn: "0000000000",
        address: "Адрес не подтвержден",
        documents: asJson(["invalid_doc.pdf"]),
        notes: "Недостоверная информация в документах.",
        reviewed_by_id: getUserId("ADM-001"),
        reviewed_at: daysAgo(2),
        rejection_reason: "ИНН не найден в реестре, документы недействительны.",
      },
    ],
  });

  await prisma.commissionTier.createMany({
    data: [
      {
        public_id: "TIER-1",
        name: "Новичок",
        min_sales: 0,
        max_sales: 200000,
        commission_rate: 5.0,
        description: "Для новых продавцов платформы.",
        sellers_count: 64,
      },
      {
        public_id: "TIER-2",
        name: "Базовый",
        min_sales: 200001,
        max_sales: 700000,
        commission_rate: 4.4,
        description: "Для регулярных продавцов с базовой активностью.",
        sellers_count: 103,
      },
      {
        public_id: "TIER-3",
        name: "Стандарт",
        min_sales: 700001,
        max_sales: 1500000,
        commission_rate: 3.9,
        description: "Для продавцов с устойчивыми оборотами.",
        sellers_count: 58,
      },
      {
        public_id: "TIER-4",
        name: "Продвинутый",
        min_sales: 1500001,
        max_sales: 3500000,
        commission_rate: 3.2,
        description: "Для сильных партнёров с высоким SLA.",
        sellers_count: 29,
      },
      {
        public_id: "TIER-5",
        name: "Премиум",
        min_sales: 3500001,
        max_sales: null,
        commission_rate: 2.6,
        description: "Для топ-продавцов с крупным оборотом.",
        sellers_count: 11,
      },
    ],
  });

  await prisma.auditLog.createMany({
    data: [
      {
        public_id: "LOG-001",
        timestamp: daysAgo(6, 2),
        admin_id: getUserId("ADM-001"),
        action: "approve_kyc",
        target_id: "KYC-002",
        target_type: "kyc_request",
        details: "Одобрена заявка продавца TechPoint Store",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-002",
        timestamp: daysAgo(5, 8),
        admin_id: getUserId("ADM-001"),
        action: "approve_kyc",
        target_id: "KYC-003",
        target_type: "kyc_request",
        details: "Одобрена заявка продавца ГаджетПро",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-003",
        timestamp: daysAgo(3, 7),
        admin_id: getUserId("ADM-001"),
        action: "reject_kyc",
        target_id: "KYC-006",
        target_type: "kyc_request",
        details: "Отклонена заявка сомнительного продавца",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-004",
        timestamp: daysAgo(3, 5),
        admin_id: getUserId("ADM-001"),
        action: "reject_listing",
        target_id: "LST-014",
        target_type: "listing",
        details: "Отклонено объявление из-за признаков мошенничества",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-005",
        timestamp: daysAgo(2, 23),
        admin_id: getUserId("ADM-001"),
        action: "reject_listing",
        target_id: "LST-024",
        target_type: "listing",
        details: "Отклонена услуга из-за контактов и предоплаты вне платформы",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-006",
        timestamp: daysAgo(2, 21),
        admin_id: getUserId("ADM-001"),
        action: "approve_complaint",
        target_id: "CMP-002",
        target_type: "complaint",
        details: "Подтверждена жалоба на мошеннические действия",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-007",
        timestamp: daysAgo(2, 18),
        admin_id: getUserId("ADM-001"),
        action: "approve_complaint",
        target_id: "CMP-005",
        target_type: "complaint",
        details: "Подтверждено нарушение по запросу предоплаты",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-008",
        timestamp: daysAgo(2, 17),
        admin_id: getUserId("ADM-001"),
        action: "block_user",
        target_id: "SLR-999",
        target_type: "user",
        details: "Продавец переведен в статус BLOCKED",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-009",
        timestamp: daysAgo(2, 16),
        admin_id: getUserId("ADM-001"),
        action: "block_user",
        target_id: "USR-666",
        target_type: "user",
        details: "Покупатель заблокирован за злоупотребление жалобами",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-010",
        timestamp: daysAgo(2, 11),
        admin_id: getUserId("ADM-001"),
        action: "update_commission_tier",
        target_id: "TIER-4",
        target_type: "commission_tier",
        details: "Изменена ставка комиссии для уровня Продвинутый",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-011",
        timestamp: daysAgo(1, 20),
        admin_id: getUserId("ADM-001"),
        action: "approve_listing",
        target_id: "LST-013",
        target_type: "listing",
        details: "Взято в работу, отправлено на дополнительную модерацию",
        ip_address: "192.168.10.11",
      },
      {
        public_id: "LOG-012",
        timestamp: daysAgo(1, 12),
        admin_id: getUserId("ADM-001"),
        action: "reject_complaint",
        target_id: "CMP-006",
        target_type: "complaint",
        details: "Жалоба отклонена после проверки переписки",
        ip_address: "192.168.10.11",
      },
    ],
  });

  await prisma.partnershipRequest.createMany({
    data: [
      {
        public_id: "PRQ-001",
        user_id: getUserId("USR-001"),
        seller_type: "COMPANY",
        name: "ООО Демо Компания",
        email: "demo@ecomm.ru",
        contact: "+7 (999) 000-00-01",
        link: "https://example.com/demo-company",
        category: "Электроника",
        inn: "7701234567",
        geography: "Москва и область",
        social_profile: "https://t.me/demo_company",
        credibility: "Работаем 5 лет, 12 000 клиентов",
        why_us: "Ищем площадку с сильной аудиторией и понятной комиссией.",
        created_at: daysAgo(8),
      },
      {
        public_id: "PRQ-002",
        user_id: getUserId("USR-103"),
        seller_type: "SELF",
        name: "Алексей Кузнецов",
        email: "alexey.k@example.com",
        contact: "+7 (999) 234-23-23",
        link: "https://vk.com/alexey.tech",
        category: "Ремонт техники",
        inn: null,
        geography: "Москва",
        social_profile: "https://vk.com/alexey.tech",
        credibility: "Фриланс-мастер, опыт 7 лет",
        why_us: "Хочу продавать услуги ремонта и получать больше заказов.",
        created_at: daysAgo(6),
      },
      {
        public_id: "PRQ-003",
        user_id: getUserId("USR-108"),
        seller_type: "SELF",
        name: "Полина Иванова",
        email: "polina.ivanova@example.com",
        contact: "+7 (999) 345-22-98",
        link: "https://instagram.com/polina_gadgets",
        category: "Аксессуары",
        inn: null,
        geography: "Новосибирск",
        social_profile: "https://instagram.com/polina_gadgets",
        credibility: "Более 3 000 подписчиков и постоянных клиентов",
        why_us: "Планирую расширить продажи аксессуаров на маркетплейсе.",
        created_at: daysAgo(4),
      },
      {
        public_id: "PRQ-004",
        user_id: getUserId("USR-110"),
        seller_type: "COMPANY",
        name: "ООО Краснодар Сервис",
        email: "kirill.egorov@example.com",
        contact: "+7 (999) 543-76-12",
        link: "https://kras-service.example.com",
        category: "Установка и обслуживание",
        inn: "2311122233",
        geography: "Краснодарский край",
        social_profile: "https://t.me/kras_service",
        credibility: "Контракты с застройщиками, 4 бригады мастеров",
        why_us: "Нужен стабильный поток b2c заявок на установку техники.",
        created_at: daysAgo(2),
      },
    ],
  });

  const loyaltyLevels = [
    { level_name: "Новичок", xp_threshold: 0, xp_coefficient: 1.0 },
    { level_name: "Бронза", xp_threshold: 500, xp_coefficient: 1.1 },
    { level_name: "Серебро", xp_threshold: 1500, xp_coefficient: 1.25 },
    { level_name: "Золото", xp_threshold: 3500, xp_coefficient: 1.5 },
    { level_name: "Платина", xp_threshold: 7000, xp_coefficient: 1.75 },
    { level_name: "Бриллиант", xp_threshold: 15000, xp_coefficient: 2.0 },
  ];

  await prisma.loyaltyLevel.createMany({ data: loyaltyLevels });

  await prisma.partner.create({
    data: {
      id: 1,
      name: "Test Partner",
      current_xp: 0,
      rating: 4.8,
    },
  });

  await prisma.achievement.createMany({
    data: [
      {
        name: "Первая продажа",
        description: "Совершите первую успешную продажу",
        icon: "star",
        xp_reward: 50,
      },
      {
        name: "Три сделки",
        description: "Завершите 3 сделки",
        icon: "zap",
        xp_reward: 80,
      },
      {
        name: "Десять сделок",
        description: "Завершите 10 успешных сделок",
        icon: "trophy",
        xp_reward: 150,
      },
      {
        name: "50 сделок",
        description: "Завершите 50 успешных сделок",
        icon: "target",
        xp_reward: 500,
      },
      {
        name: "Мастер оборота",
        description: "Достигните оборота 500 000 ₽",
        icon: "award",
        xp_reward: 250,
      },
      {
        name: "Миллионер",
        description: "Продайте товаров на сумму 1 000 000 ₽",
        icon: "star",
        xp_reward: 750,
      },
      {
        name: "Легенда лиги",
        description: "Наберите 10 000 XP",
        icon: "trophy",
        xp_reward: 600,
      },
      {
        name: "Секрет: Теневая сделка",
        description: "Проведите одну сделку на 250 000 ₽",
        icon: "star",
        xp_reward: 1200,
      },
    ],
  });

  const levels = await prisma.loyaltyLevel.findMany({
    orderBy: {
      xp_threshold: "asc",
    },
  });

  if (levels.length === 0) {
    throw new Error("Loyalty levels were not seeded");
  }

  const achievements = await prisma.achievement.findMany({
    orderBy: {
      id: "asc",
    },
  });

  const achievementByName = new Map(achievements.map((achievement) => [achievement.name, achievement]));

  const achievementRules: Record<string, AchievementRule> = {
    "Первая продажа": { metric: "orders", target: 1 },
    "Три сделки": { metric: "orders", target: 3 },
    "Десять сделок": { metric: "orders", target: 10 },
    "50 сделок": { metric: "orders", target: 50 },
    "Мастер оборота": { metric: "sales_amount", target: 500_000 },
    Миллионер: { metric: "sales_amount", target: 1_000_000 },
    "Легенда лиги": { metric: "xp", target: 10_000 },
    "Секрет: Теневая сделка": { metric: "max_deal", target: 250_000 },
  };

  const sandboxSales = [
    { deal_amount: 12000, created_at: daysAgo(30) },
    { deal_amount: 34000, created_at: daysAgo(28) },
    { deal_amount: 78000, created_at: daysAgo(26) },
    { deal_amount: 55000, created_at: daysAgo(24) },
    { deal_amount: 96000, created_at: daysAgo(22) },
    { deal_amount: 128000, created_at: daysAgo(20) },
    { deal_amount: 205000, created_at: daysAgo(18) },
    { deal_amount: 87000, created_at: daysAgo(16) },
    { deal_amount: 152000, created_at: daysAgo(14) },
    { deal_amount: 67000, created_at: daysAgo(12) },
    { deal_amount: 300000, created_at: daysAgo(10) },
    { deal_amount: 45000, created_at: daysAgo(9) },
    { deal_amount: 98000, created_at: daysAgo(8) },
    { deal_amount: 112000, created_at: daysAgo(6) },
    { deal_amount: 76000, created_at: daysAgo(5) },
    { deal_amount: 189000, created_at: daysAgo(4) },
    { deal_amount: 43000, created_at: daysAgo(3) },
    { deal_amount: 57000, created_at: daysAgo(2) },
  ];

  const getCurrentLevel = (xp: number) => {
    let currentLevel = levels[0];
    for (const level of levels) {
      if (xp >= level.xp_threshold) {
        currentLevel = level;
      }
    }
    return currentLevel;
  };

  let partnerXp = 0;
  let ordersCount = 0;
  let salesAmount = 0;
  let maxDeal = 0;
  const unlockedAchievements = new Set<number>();
  const ratingMultiplier = 1.2;

  for (const sale of sandboxSales) {
    const level = getCurrentLevel(partnerXp);
    const rawXp = Math.round((sale.deal_amount / 100) * level.xp_coefficient * ratingMultiplier);
    const operationalFeeXp = Math.floor(rawXp * 0.1);
    const lowCheckPenaltyXp = sale.deal_amount <= 1000 ? 1 : 0;
    const totalPenaltyXp = operationalFeeXp + lowCheckPenaltyXp;
    const netXp = Math.max(rawXp - totalPenaltyXp, 1);

    const sandboxOrder = await prisma.order.create({
      data: {
        partner_id: 1,
        loyalty_level_id: level.id,
        deal_amount: sale.deal_amount,
        created_at: sale.created_at,
      },
    });

    await prisma.xpAccrual.create({
      data: {
        order_id: sandboxOrder.id,
        xp_amount: rawXp,
        accrual_date: new Date(sale.created_at.getTime() + 5 * 60 * 1000),
        description: `Базовый XP за сделку: ${sale.deal_amount.toLocaleString("ru-RU")} ₽`,
      },
    });

    if (totalPenaltyXp > 0) {
      await prisma.xpAccrual.create({
        data: {
          order_id: sandboxOrder.id,
          xp_amount: -totalPenaltyXp,
          accrual_date: new Date(sale.created_at.getTime() + 8 * 60 * 1000),
          description: `Штрафы: операционный сбор ${operationalFeeXp} XP${lowCheckPenaltyXp ? `, мелкая сделка ${lowCheckPenaltyXp} XP` : ""}`,
        },
      });
    }

    partnerXp += netXp;
    ordersCount += 1;
    salesAmount += sale.deal_amount;
    maxDeal = Math.max(maxDeal, sale.deal_amount);

    for (const [achievementName, rule] of Object.entries(achievementRules)) {
      const achievement = achievementByName.get(achievementName);
      if (!achievement || unlockedAchievements.has(achievement.id)) {
        continue;
      }

      const metricValue =
        rule.metric === "orders"
          ? ordersCount
          : rule.metric === "sales_amount"
            ? salesAmount
            : rule.metric === "xp"
              ? partnerXp
              : maxDeal;

      if (metricValue < rule.target) {
        continue;
      }

      await prisma.partnerAchievement.create({
        data: {
          partner_id: 1,
          achievement_id: achievement.id,
          achieved_date: new Date(sale.created_at.getTime() + 15 * 60 * 1000),
        },
      });

      await prisma.xpAccrual.create({
        data: {
          order_id: sandboxOrder.id,
          xp_amount: achievement.xp_reward,
          accrual_date: new Date(sale.created_at.getTime() + 20 * 60 * 1000),
          description: `Достижение: ${achievement.name}`,
        },
      });

      partnerXp += achievement.xp_reward;
      unlockedAchievements.add(achievement.id);
    }
  }

  await prisma.partner.update({
    where: { id: 1 },
    data: {
      current_xp: partnerXp,
    },
  });

  const [
    usersCount,
    addressesCount,
    categoriesCount,
    subcategoriesCount,
    itemsCount,
    listingsCount,
    reviewsCount,
    questionsCount,
    wishlistCount,
    marketOrdersCount,
    marketItemsCount,
    transactionsCount,
    complaintsCount,
    kycCount,
    tiersCount,
    logsCount,
    partnershipCount,
    partnersCount,
    levelsCount,
    achievementsCount,
    sandboxOrdersCount,
    xpCount,
    partnerAchievementsCount,
  ] = await Promise.all([
    prisma.appUser.count(),
    prisma.userAddress.count(),
    prisma.catalogCategory.count(),
    prisma.catalogSubcategory.count(),
    prisma.catalogSubcategoryItem.count(),
    prisma.marketplaceListing.count(),
    prisma.listingReview.count(),
    prisma.listingQuestion.count(),
    prisma.wishlistItem.count(),
    prisma.marketOrder.count(),
    prisma.marketOrderItem.count(),
    prisma.platformTransaction.count(),
    prisma.complaint.count(),
    prisma.kycRequest.count(),
    prisma.commissionTier.count(),
    prisma.auditLog.count(),
    prisma.partnershipRequest.count(),
    prisma.partner.count(),
    prisma.loyaltyLevel.count(),
    prisma.achievement.count(),
    prisma.order.count(),
    prisma.xpAccrual.count(),
    prisma.partnerAchievement.count(),
  ]);

  console.log("Database seeded successfully!");
  console.log(
    `Users: ${usersCount}, addresses: ${addressesCount}, categories: ${categoriesCount}/${subcategoriesCount}/${itemsCount}`,
  );
  console.log(
    `Listings: ${listingsCount}, reviews: ${reviewsCount}, questions: ${questionsCount}, wishlist: ${wishlistCount}`,
  );
  console.log(
    `Orders: ${marketOrdersCount} (${marketItemsCount} items), transactions: ${transactionsCount}, complaints: ${complaintsCount}`,
  );
  console.log(
    `KYC: ${kycCount}, tiers: ${tiersCount}, audit logs: ${logsCount}, partnership requests: ${partnershipCount}`,
  );
  console.log(
    `Gamification -> partners: ${partnersCount}, levels: ${levelsCount}, achievements: ${achievementsCount}, sandbox orders: ${sandboxOrdersCount}, xp accruals: ${xpCount}, unlocked achievements: ${partnerAchievementsCount}`,
  );
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
