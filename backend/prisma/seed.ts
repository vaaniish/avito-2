import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import fs from "node:fs";
import path from "node:path";
import { dnsProductCatalogSeed } from "./dns-product-catalog.seed";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Переменная DATABASE_URL не задана");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const daysAgo = (days: number): Date =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const getRequired = <K, V>(map: Map<K, V>, key: K, name: string): V => {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${name} не найден: ${String(key)}`);
  return value;
};

const slugifyCatalogId = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

const CATALOG_REFERENCE_PATH = path.resolve(
  process.cwd(),
  "data/catalog-reference/generated/catalog-reference.json",
);

type CatalogReferenceCharacteristicSeed = {
  key: string;
  label: string;
  value: string;
  rawValue?: string;
  sourceGroupIndex?: number;
  source?: "bracketGroups" | "titleFallback";
};

type CatalogReferenceVariantSeed = {
  productId?: string;
  title: string;
  characteristics?: CatalogReferenceCharacteristicSeed[];
};

type CatalogReferenceModelSeed = {
  model: string;
  variants?: CatalogReferenceVariantSeed[];
};

type CatalogReferenceBrandSeed = {
  brand: string;
  models?: CatalogReferenceModelSeed[];
};

type CatalogReferenceItemSeed = {
  categoryName: string;
  subcategoryName: string;
  itemName: string;
  brands?: CatalogReferenceBrandSeed[];
};

type CatalogReferenceSeed = {
  items?: CatalogReferenceItemSeed[];
};

type SeedCatalogItemRow = {
  id: number;
  public_id: string;
  name: string;
  subcategory: {
    name: string;
    category: {
      name: string;
    };
  };
};

async function createManyInChunks<T>(
  modelName: string,
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
  chunkSize = 5_000,
): Promise<void> {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await insert(chunk);
  }
  if (rows.length > 0) {
    console.log(`${modelName}: импортировано ${rows.length}`);
  }
}

const referenceScopeKey = (
  categoryName: string,
  subcategoryName: string,
  itemName: string,
): string =>
  [categoryName, subcategoryName, itemName]
    .map((value) => value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е"))
    .join("::");

async function seedCatalogReferenceData(items: SeedCatalogItemRow[]): Promise<void> {
  if (!fs.existsSync(CATALOG_REFERENCE_PATH)) {
    console.warn(
      `Справочник DNS не найден, пропускаю импорт reference-данных: ${CATALOG_REFERENCE_PATH}`,
    );
    return;
  }

  const reference = JSON.parse(
    fs.readFileSync(CATALOG_REFERENCE_PATH, "utf8"),
  ) as CatalogReferenceSeed;

  const itemByScope = new Map<string, SeedCatalogItemRow>();
  const itemsByName = new Map<string, SeedCatalogItemRow[]>();
  for (const item of items) {
    itemByScope.set(
      referenceScopeKey(
        item.subcategory.category.name,
        item.subcategory.name,
        item.name,
      ),
      item,
    );
    const nameKey = item.name.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
    const namedItems = itemsByName.get(nameKey) ?? [];
    namedItems.push(item);
    itemsByName.set(nameKey, namedItems);
  }

  const brandRows: Array<{
    public_id: string;
    item_id: number;
    name: string;
    order_index: number;
  }> = [];
  const modelDrafts: Array<{
    publicId: string;
    itemId: number;
    brandName: string;
    name: string;
    orderIndex: number;
    variants: CatalogReferenceVariantSeed[];
  }> = [];

  let skippedItems = 0;
  for (const [itemIndex, referenceItem] of (reference.items ?? []).entries()) {
    const scopedItem =
      itemByScope.get(
        referenceScopeKey(
          referenceItem.categoryName,
          referenceItem.subcategoryName,
          referenceItem.itemName,
        ),
      ) ??
      (() => {
        const byName =
          itemsByName.get(
            referenceItem.itemName.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е"),
          ) ?? [];
        return byName.length === 1 ? byName[0] : null;
      })();

    if (!scopedItem) {
      skippedItems += 1;
      continue;
    }

    for (const [brandIndex, brand] of (referenceItem.brands ?? []).entries()) {
      const brandName = brand.brand.trim();
      if (!brandName) continue;
      const brandPublicId = `CRB-${scopedItem.public_id}-${String(brandIndex + 1).padStart(4, "0")}`;
      brandRows.push({
        public_id: brandPublicId,
        item_id: scopedItem.id,
        name: brandName,
        order_index: brandIndex + 1,
      });

      for (const [modelIndex, model] of (brand.models ?? []).entries()) {
        const modelName = model.model.trim();
        if (!modelName) continue;
        modelDrafts.push({
          publicId: `CRM-${scopedItem.public_id}-${String(brandIndex + 1).padStart(4, "0")}-${String(modelIndex + 1).padStart(5, "0")}`,
          itemId: scopedItem.id,
          brandName,
          name: modelName,
          orderIndex: modelIndex + 1,
          variants: model.variants ?? [],
        });
      }
    }

    if ((itemIndex + 1) % 50 === 0) {
      console.log(`Подготовка DNS reference: ${itemIndex + 1} видов обработано`);
    }
  }

  if (skippedItems > 0) {
    console.warn(`DNS reference: пропущено видов вне текущего каталога: ${skippedItems}`);
  }

  await createManyInChunks(
    "CatalogReferenceBrand",
    brandRows,
    (chunk) =>
      prisma.catalogReferenceBrand.createMany({
        data: chunk,
        skipDuplicates: true,
      }),
  );

  const brandIdByItemAndName = new Map(
    (
      await prisma.catalogReferenceBrand.findMany({
        select: { id: true, item_id: true, name: true },
      })
    ).map((brand) => [`${brand.item_id}::${brand.name}`, brand.id]),
  );

  const modelRows = modelDrafts
    .map((model) => {
      const brandId = brandIdByItemAndName.get(`${model.itemId}::${model.brandName}`);
      if (!brandId) return null;
      return {
        public_id: model.publicId,
        brand_id: brandId,
        name: model.name,
        order_index: model.orderIndex,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await createManyInChunks(
    "CatalogReferenceModel",
    modelRows,
    (chunk) =>
      prisma.catalogReferenceModel.createMany({
        data: chunk,
        skipDuplicates: true,
      }),
  );

  const modelIdByPublicId = new Map(
    (
      await prisma.catalogReferenceModel.findMany({
        select: { id: true, public_id: true },
      })
    ).map((model) => [model.public_id, model.id]),
  );

  const variantDrafts: Array<{
    publicId: string;
    modelPublicId: string;
    productId: string | null;
    title: string;
    orderIndex: number;
    characteristics: CatalogReferenceCharacteristicSeed[];
  }> = [];
  for (const model of modelDrafts) {
    for (const [variantIndex, variant] of model.variants.entries()) {
      const title = variant.title.trim();
      if (!title) continue;
      variantDrafts.push({
        publicId: `CRV-${model.publicId.replace(/^CRM-/, "")}-${String(variantIndex + 1).padStart(4, "0")}`,
        modelPublicId: model.publicId,
        productId: variant.productId?.trim() || null,
        title,
        orderIndex: variantIndex + 1,
        characteristics: variant.characteristics ?? [],
      });
    }
  }

  const variantRows = variantDrafts
    .map((variant) => {
      const modelId = modelIdByPublicId.get(variant.modelPublicId);
      if (!modelId) return null;
      return {
        public_id: variant.publicId,
        model_id: modelId,
        external_product_id: variant.productId,
        title: variant.title,
        order_index: variant.orderIndex,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  await createManyInChunks(
    "CatalogReferenceVariant",
    variantRows,
    (chunk) =>
      prisma.catalogReferenceVariant.createMany({
        data: chunk,
        skipDuplicates: true,
      }),
  );

  const variantIdByPublicId = new Map(
    (
      await prisma.catalogReferenceVariant.findMany({
        select: { id: true, public_id: true },
      })
    ).map((variant) => [variant.public_id, variant.id]),
  );

  const characteristicRows = variantDrafts.flatMap((variant) => {
    const variantId = variantIdByPublicId.get(variant.publicId);
    if (!variantId) return [];
    return variant.characteristics
      .map((characteristic, index) => ({
        variant_id: variantId,
        key: characteristic.key.trim(),
        label: characteristic.label.trim(),
        value: characteristic.value.trim(),
        raw_value: (characteristic.rawValue ?? characteristic.value).trim(),
        source_group_index: characteristic.sourceGroupIndex ?? 0,
        source: characteristic.source ?? "bracketGroups",
        order_index: index + 1,
      }))
      .filter(
        (characteristic) =>
          characteristic.key &&
          characteristic.label &&
          characteristic.value &&
          characteristic.raw_value,
      );
  });

  await createManyInChunks(
    "CatalogReferenceCharacteristic",
    characteristicRows,
    (chunk) =>
      prisma.catalogReferenceCharacteristic.createMany({
        data: chunk,
      }),
  );
}

async function main(): Promise<void> {
  console.log("Очистка таблиц...");
  await prisma.auditLog.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.kycRequest.deleteMany();
  await prisma.policyAcceptance.deleteMany();
  await prisma.platformPolicy.deleteMany();
  await prisma.platformTransaction.deleteMany();
  await prisma.marketOrderItem.deleteMany();
  await prisma.marketOrder.deleteMany();
  await prisma.listingQuestion.deleteMany();
  await prisma.listingReview.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.listingAttribute.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.marketplaceListing.deleteMany();
  await prisma.catalogSuggestion.deleteMany();
  await prisma.catalogAttributeDefinition.deleteMany();
  await prisma.catalogReferenceCharacteristic.deleteMany();
  await prisma.catalogReferenceVariant.deleteMany();
  await prisma.catalogReferenceModel.deleteMany();
  await prisma.catalogReferenceBrand.deleteMany();
  await prisma.catalogItem.deleteMany();
  await prisma.catalogSubcategory.deleteMany();
  await prisma.catalogCategory.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.partnershipRequest.deleteMany();
  await prisma.sellerPayoutProfile.deleteMany();
  await prisma.sellerProfile.deleteMany();
  await prisma.commissionTier.deleteMany();
  await prisma.userAddress.deleteMany();
  await prisma.appUser.deleteMany();

  const cities = [
    ["Москва", "Москва"],
    ["Санкт-Петербург", "Ленинградская область"],
    ["Казань", "Республика Татарстан"],
    ["Екатеринбург", "Свердловская область"],
    ["Новосибирск", "Новосибирская область"],
    ["Краснодар", "Краснодарский край"],
    ["Сочи", "Краснодарский край"],
    ["Нижний Новгород", "Нижегородская область"],
  ].filter((listing) => listing[4] === "PRODUCT") as Array<
    [
      string,
      string,
      string,
      string,
      "PRODUCT",
      string,
      number,
      number | null,
      "NEW" | "USED",
      "ACTIVE" | "INACTIVE" | "MODERATION",
      "APPROVED" | "PENDING" | "REJECTED",
      number,
      boolean,
    ]
  >;

  const cityRegionMap = new Map(cities.map(([name, region]) => [name, region]));

  const users = [
    [
      "ADM-001",
      "ADMIN",
      "ACTIVE",
      "admin@ecomm.local",
      "admin123",
      "Главный администратор",
      "admin_main",
      "Москва",
      800,
      "+79001000100",
      null,
    ],
    [
      "BUY-001",
      "BUYER",
      "ACTIVE",
      "buyer1@ecomm.local",
      "buyer123",
      "Анна Орлова",
      "anna_orlova",
      "Москва",
      260,
      "+79001000101",
      null,
    ],
    [
      "BUY-002",
      "BUYER",
      "ACTIVE",
      "buyer2@ecomm.local",
      "buyer123",
      "Иван Петров",
      "ivan_petrov",
      "Санкт-Петербург",
      210,
      "+79001000102",
      null,
    ],
    [
      "BUY-003",
      "BUYER",
      "ACTIVE",
      "buyer3@ecomm.local",
      "buyer123",
      "Никита Смирнов",
      "nikita_smirnov",
      "Казань",
      180,
      "+79001000103",
      null,
    ],
    [
      "BUY-004",
      "BUYER",
      "ACTIVE",
      "buyer4@ecomm.local",
      "buyer123",
      "Ольга Волкова",
      "olga_volkova",
      "Сочи",
      140,
      "+79001000104",
      null,
    ],
    [
      "SLR-001",
      "SELLER",
      "ACTIVE",
      "seller1@ecomm.local",
      "seller123",
      "Тех Поинт",
      "tech_point",
      "Москва",
      420,
      "+79002000101",
      null,
    ],
    [
      "SLR-002",
      "SELLER",
      "ACTIVE",
      "seller2@ecomm.local",
      "seller123",
      "Мобайл Эксперт",
      "mobile_expert",
      "Казань",
      350,
      "+79002000102",
      null,
    ],
    [
      "SLR-003",
      "SELLER",
      "ACTIVE",
      "seller3@ecomm.local",
      "seller123",
      "Домашний Комфорт",
      "home_comfort",
      "Екатеринбург",
      220,
      "+79002000103",
      null,
    ],
    [
      "SLR-004",
      "SELLER",
      "ACTIVE",
      "seller4@ecomm.local",
      "seller123",
      "Сервис Хаб",
      "service_hub",
      "Краснодар",
      170,
      "+79002000104",
      null,
    ],
    [
      "SLR-005",
      "SELLER",
      "BLOCKED",
      "seller5@ecomm.local",
      "seller123",
      "КвикФикс Про",
      "quickfix_pro",
      "Москва",
      70,
      "+79002000105",
      "Просьбы об оплате вне платформы",
    ],
  ] as const;

  await prisma.appUser.createMany({
    data: await Promise.all(
      users.map(async (u) => ({
        public_id: u[0],
        role: u[1],
        status: u[2],
        email: u[3],
        password: await bcrypt.hash(u[4], 10),
        name: u[5],
        username: u[6],
        joined_at: daysAgo(u[8]),
        phone: u[9],
        block_reason: u[10],
      })),
    ),
  });

  const userMap = new Map(
    (
      await prisma.appUser.findMany({ select: { id: true, public_id: true } })
    ).map((u) => [u.public_id, u.id]),
  );

  await prisma.platformPolicy.createMany({
    data: [
      {
        public_id: "POL-CHECKOUT-v1",
        scope: "CHECKOUT",
        version: "1.0",
        title: "Правила оформления и безопасной сделки",
        content_url: "/terms",
        is_active: true,
      },
      {
        public_id: "POL-PARTNERSHIP-v1",
        scope: "PARTNERSHIP",
        version: "1.0",
        title: "Правила партнерства и безопасности",
        content_url: "/terms",
        is_active: true,
      },
    ],
  });

  const policyMap = new Map(
    (
      await prisma.platformPolicy.findMany({
        select: { id: true, public_id: true },
      })
    ).map((policy) => [policy.public_id, policy.id]),
  );

  await prisma.policyAcceptance.createMany({
    data: [
      ["POL-CHECKOUT-v1", "BUY-001"],
      ["POL-CHECKOUT-v1", "BUY-002"],
      ["POL-CHECKOUT-v1", "BUY-003"],
      ["POL-CHECKOUT-v1", "BUY-004"],
      ["POL-CHECKOUT-v1", "SLR-001"],
      ["POL-CHECKOUT-v1", "SLR-002"],
      ["POL-CHECKOUT-v1", "SLR-003"],
      ["POL-CHECKOUT-v1", "SLR-004"],
      ["POL-PARTNERSHIP-v1", "BUY-001"],
      ["POL-PARTNERSHIP-v1", "BUY-002"],
      ["POL-PARTNERSHIP-v1", "BUY-003"],
      ["POL-PARTNERSHIP-v1", "BUY-004"],
    ].map((row: any) => ({
      policy_id: getRequired(policyMap, row[0], "Policy"),
      user_id: getRequired(userMap, row[1], "User"),
    })),
  });

  await prisma.notification.createMany({
    data: [
      [
        "BUY-001",
        "ORDER_STATUS",
        "Заказ ORD-1001 завершен",
        "/orders/ORD-1001",
        false,
      ],
      [
        "BUY-002",
        "NEW_QUESTION",
        "Продавец ответил на ваш вопрос",
        "/listing/LST-003/questions",
        true,
      ],
      ["SLR-001", "SYSTEM", "Верификация KYC одобрена", "/seller/kyc", true],
      [
        "SLR-002",
        "INFO",
        "Обновлен уровень комиссии",
        "/seller/commission",
        false,
      ],
      [
        "BUY-003",
        "ORDER_STATUS",
        "Заказ ORD-1008 подготовлен",
        "/orders/ORD-1008",
        false,
      ],
      [
        "BUY-004",
        "ORDER_STATUS",
        "Заказ ORD-1004 отправлен",
        "/orders/ORD-1004",
        false,
      ],
      [
        "SLR-004",
        "SYSTEM",
        "Получена новая жалоба",
        "/seller/complaints",
        false,
      ],
      [
        "ADM-001",
        "SYSTEM",
        "Готов ежедневный отчет модерации",
        "/admin/listings",
        true,
      ],
    ].map((n: any) => ({
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
      [
        "BUY-002",
        "дом",
        "Санкт-Петербург",
        "Невский проспект",
        "101",
        "191025",
        true,
      ],
      ["BUY-003", "дом", "Казань", "Баумана", "9", "420111", true],
      ["BUY-004", "дом", "Сочи", "Навагинская", "15", "354000", true],
      ["SLR-001", "склад", "Москва", "Профсоюзная", "45", "117335", true],
      ["SLR-002", "склад", "Казань", "Пушкина", "22", "420015", true],
      ["SLR-003", "склад", "Екатеринбург", "Малышева", "36", "620014", true],
      ["SLR-004", "склад", "Краснодар", "Красная", "120", "350000", true],
    ].map((a: any) => ({
      ...(() => {
        const cityName = a[2];
        const regionName = getRequired(cityRegionMap, cityName, "City region");
        const house = a[4];
        return {
          full_address: `${regionName}, ${cityName}, ${a[3]}, д. ${house}`,
          region: regionName,
          city: cityName,
          house,
        };
      })(),
      user_id: getRequired(userMap, a[0], "User"),
      label: a[1],
      street: a[3],
      apartment: "",
      entrance: "",
      postal_code: a[5],
      is_default: a[6],
    })),
  });

  await prisma.commissionTier.createMany({
    data: [
      [
        "TIER-001",
        "Старт",
        0,
        100000,
        6,
        "Базовый уровень для новых продавцов",
      ],
      [
        "TIER-002",
        "База",
        100001,
        500000,
        4.5,
        "Уровень для активных продавцов",
      ],
      [
        "TIER-003",
        "Продвинутый",
        500001,
        1500000,
        3.5,
        "Уровень для продавцов с высоким оборотом",
      ],
      ["TIER-004", "Профи", 1500001, 4000000, 2.8, "Уровень для топ-продавцов"],
      [
        "TIER-005",
        "Корпоративный",
        4000001,
        null,
        2.2,
        "Уровень для крупных партнеров",
      ],
    ].map((t: any) => ({
      public_id: t[0],
      name: t[1],
      min_sales: t[2],
      max_sales: t[3],
      commission_rate: t[4],
      description: t[5],
    })),
  });

  const tierMap = new Map(
    (
      await prisma.commissionTier.findMany({
        select: { id: true, public_id: true },
      })
    ).map((t) => [t.public_id, t.id]),
  );

  await prisma.sellerProfile.createMany({
    data: [
      ["SLR-001", true, 18, "TIER-003"],
      ["SLR-002", true, 25, "TIER-002"],
      ["SLR-003", true, 35, "TIER-002"],
      ["SLR-004", false, 48, "TIER-001"],
      ["SLR-005", false, 120, "TIER-001"],
    ].map((s: any) => ({
      user_id: getRequired(userMap, s[0], "User"),
      is_verified: s[1],
      average_response_minutes: s[2],
      commission_tier_id: getRequired(tierMap, s[3], "Tier"),
    })),
  });

  await prisma.sellerPayoutProfile.createMany({
    data: [
      [
        "PAY-001",
        "SLR-001",
        "COMPANY",
        "ООО Тех Поинт",
        "7701234567",
        "40702810900000000001",
        "044525225",
        "30101810400000000225",
        "ПАО Сбербанк",
        "ООО Тех Поинт",
        "VERIFIED",
      ],
      [
        "PAY-002",
        "SLR-002",
        "IP",
        "ИП Мобайл Эксперт",
        "165012345678",
        "40702810900000000002",
        "044525225",
        "30101810400000000225",
        "ПАО Сбербанк",
        "ИП Мобайл Эксперт",
        "VERIFIED",
      ],
      [
        "PAY-003",
        "SLR-003",
        "COMPANY",
        "ООО Домашний Комфорт",
        "6678123456",
        "40702810900000000003",
        "044525225",
        "30101810400000000225",
        "ПАО Сбербанк",
        "ООО Домашний Комфорт",
        "PENDING",
      ],
      [
        "PAY-004",
        "SLR-004",
        "COMPANY",
        "ООО Сервис Хаб",
        "2310123456",
        "40702810900000000004",
        "044525225",
        "30101810400000000225",
        "ПАО Сбербанк",
        "ООО Сервис Хаб",
        "PENDING",
      ],
      [
        "PAY-005",
        "SLR-005",
        "IP",
        "ИП КвикФикс Про",
        "770512345678",
        "40702810900000000005",
        "044525225",
        "30101810400000000225",
        "ПАО Сбербанк",
        "ИП КвикФикс Про",
        "REJECTED",
      ],
    ].map((p: any) => ({
      public_id: p[0],
      seller_id: getRequired(userMap, p[1], "User"),
      legal_type: p[2],
      legal_name: p[3],
      tax_id: p[4],
      bank_account: p[5],
      bank_bic: p[6],
      correspondent_account: p[7],
      bank_name: p[8],
      recipient_name: p[9],
      status: p[10],
      verified_at: p[10] === "VERIFIED" ? daysAgo(2) : null,
      rejection_reason:
        p[10] === "REJECTED" ? "Не прошла проверка реквизитов" : null,
    })),
  });

  await prisma.catalogCategory.createMany({
    data: [
      ...dnsProductCatalogSeed.map((category, index) => [
        category.publicId,
        "PRODUCT",
        category.name,
        category.iconKey,
        index + 1,
      ]),
    ].map((c: any) => ({
      public_id: c[0],
      type: c[1],
      name: c[2],
      icon_key: c[3],
      order_index: c[4],
    })),
  });

  const categoryMap = new Map(
    (
      await prisma.catalogCategory.findMany({
        select: { id: true, public_id: true },
      })
    ).map((c) => [c.public_id, c.id]),
  );

  await prisma.catalogSubcategory.createMany({
    data: [
      ...dnsProductCatalogSeed.flatMap((category) =>
        category.subcategories.map((subcategory, index) => [
          subcategory.publicId,
          category.publicId,
          subcategory.name,
          index + 1,
        ]),
      ),
      ["SUB-010", "CAT-004", "Ремонт смартфонов", 1],
      ["SUB-011", "CAT-004", "Ремонт компьютеров", 2],
      ["SUB-012", "CAT-004", "Ремонт бытовой техники", 3],
      ["SUB-013", "CAT-005", "Установка техники", 1],
      ["SUB-014", "CAT-005", "Настройка электроники", 2],
      ["SUB-015", "CAT-006", "Диагностика электроники и бытовой техники", 1],
    ].map((s: any) => ({
      public_id: s[0],
      category_id: getRequired(categoryMap, s[1], "Category"),
      name: s[2],
      order_index: s[3],
    })),
  });

  const subcategoryMap = new Map(
    (
      await prisma.catalogSubcategory.findMany({
        select: { id: true, public_id: true },
      })
    ).map((s) => [s.public_id, s.id]),
  );

  const productItemPublicIdOverrides = new Map<string, string>([
    ["sub-smartphones-gadgets::Смартфоны", "ITM-001"],
    ["sub-smartphones-gadgets::Сотовые телефоны", "ITM-002"],
    ["sub-pc-laptops-accessories::Ноутбуки", "ITM-003"],
    ["sub-pc-laptops-accessories::Комплектующие и запчасти для ноутбуков", "ITM-004"],
    ["sub-appliances-built-in::Встраиваемые кофемашины", "ITM-005"],
    ["sub-appliances-home::Уборка", "ITM-006"],
    ["sub-tv-televisions-accessories::Телевизоры", "ITM-007"],
    ["sub-smartphones-gadgets::Наушники и гарнитуры", "ITM-008"],
    ["sub-smartphones-tablets-books::Планшеты", "ITM-011"],
    ["sub-pc-parts-main::Мониторы", "ITM-012"],
    ["sub-appliances-home::Стирка и сушка", "ITM-013"],
    ["sub-appliances-home::Летний климат", "ITM-014"],
    ["sub-pc-laptops-peripherals::Веб-камеры", "ITM-018"],
    ["sub-smartphones-gadgets::Прочие аксессуары для смартфонов", "ITM-019"],
    ["sub-smartphones-gadgets::Защита и поддержка для смартфонов", "ITM-020"],
    ["sub-smartphones-gadgets::Умные кольца", "ITM-021"],
    ["sub-smartphones-gadgets::Зарядка и подключение для смартфонов", "ITM-022"],
    ["sub-pc-laptops-accessories::Зарядные устройства для ноутбуков", "ITM-023"],
    ["sub-pc-laptops-accessories::Блоки питания для ноутбуков", "ITM-024"],
    ["sub-pc-laptops-computers-software::Программное обеспечение", "ITM-025"],
    ["sub-pc-laptops-computers-software::Аксессуары для микрокомпьютеров", "ITM-026"],
    ["sub-smartphones-tablets-books::Аксессуары для планшетов и электронных книг", "ITM-027"],
    ["sub-smartphones-tablets-books::Цифровые блокноты", "ITM-028"],
    ["sub-pc-laptops-peripherals::Графические планшеты", "ITM-029"],
    ["sub-tv-televisions-accessories::Проекторы", "ITM-030"],
    ["sub-tv-televisions-accessories::Медиаплееры и DVD", "ITM-031"],
    ["sub-smartphones-gadgets::Портативные колонки", "ITM-032"],
    ["sub-tv-televisions-accessories::Саундбары", "ITM-033"],
    ["sub-pc-laptops-peripherals::Микрофоны", "ITM-034"],
    ["sub-pc-laptops-computers-software::Персональные компьютеры", "ITM-035"],
    ["sub-pc-laptops-computers-software::Моноблоки", "ITM-036"],
    ["sub-pc-parts-main::Видеокарты", "ITM-037"],
    ["sub-pc-parts-main::Процессоры", "ITM-038"],
    ["sub-pc-parts-main::Оперативная память", "ITM-039"],
    ["sub-pc-parts-main::Твердотельные накопители SSD", "ITM-040"],
    ["sub-pc-parts-main::Материнские платы", "ITM-041"],
    ["sub-pc-parts-main::Блоки питания", "ITM-042"],
    ["sub-tv-consoles-games::PlayStation", "ITM-043"],
    ["sub-tv-consoles-games::Microsoft Xbox", "ITM-044"],
    ["sub-tv-consoles-games::Nintendo", "ITM-045"],
    ["sub-tv-consoles-games::Контроллеры и геймпады", "ITM-046"],
    ["sub-smartphones-gadgets::Смарт-часы и браслеты", "ITM-047"],
    ["sub-smartphones-gadgets::Детские часы", "ITM-048"],
    ["sub-smartphones-gadgets::Аксессуары для смарт-часов и браслетов", "ITM-049"],
    ["sub-smartphones-tablets-books::Электронные книги", "ITM-050"],
    ["sub-network-small-wifi::Wi-Fi роутеры", "ITM-051"],
    ["sub-network-small-wifi::MESH-комплекты", "ITM-052"],
    ["sub-network-professional::Коммутаторы", "ITM-053"],
    ["sub-network-small-wifi::Модемы 3G/4G/5G", "ITM-054"],
    ["sub-smartphones-photo::Фотоаппараты", "ITM-055"],
    ["sub-smartphones-photo::Объективы", "ITM-056"],
    ["sub-smartphones-photo::Видеокамеры", "ITM-057"],
    ["sub-smartphones-photo::Экшн-камеры", "ITM-058"],
    ["sub-tv-audio::Умные колонки", "ITM-059"],
    ["sub-network-video::IP камеры", "ITM-060"],
    ["sub-network-power::Умная электрика и выключатели", "ITM-061"],
    ["sub-pc-parts-modding::Системы подсветки", "ITM-062"],
    ["sub-appliances-built-in::Встраиваемые микроволновые печи", "ITM-063"],
    ["sub-appliances-kitchen::Посудомоечные машины", "ITM-064"],
    ["sub-appliances-kitchen::Холодильное оборудование", "ITM-065"],
    ["sub-appliances-built-in::Духовые шкафы", "ITM-066"],
    ["sub-appliances-built-in::Варочные панели", "ITM-067"],
    ["sub-appliances-kitchen::Мультиварки и техника для варки", "ITM-068"],
    ["sub-appliances-kitchen::Нарезка и смешивание", "ITM-069"],
    ["sub-appliances-built-in::Встраиваемые стиральные машины", "ITM-070"],
    ["sub-appliances-home::Глаженье", "ITM-071"],
    ["sub-appliances-home::Шитье, вышивание и уход за одеждой", "ITM-072"],
    ["sub-appliances-home::Зимний климат", "ITM-073"],
    ["sub-appliances-home::Управление климатом и обработка воздуха", "ITM-074"],
    ["sub-appliances-home::Умная техника", "ITM-075"],
    ["sub-pc-parts-modding::Вентиляторы для корпуса", "ITM-076"],
    ["sub-appliances-kitchen::Сушка овощей и фруктов", "ITM-077"],
    ["sub-appliances-kitchen::Посуда и кухонные предметы", "ITM-078"],
    ["sub-appliances-kitchen::Чистящие средства для кухни", "ITM-079"],
    ["sub-smartphones-photo::Осветительное оборудование", "ITM-080"],
    ["sub-tv-audio::Портативные плееры и диктофоны", "ITM-081"],
    ["sub-smartphones-gadgets::Радиостанции", "ITM-082"],
    ["sub-appliances-home::Часы", "ITM-083"],
    ["sub-appliances-home::Водонагреватели и котлы отопления", "ITM-084"],
    ["sub-appliances-kitchen::Фильтрация воды", "ITM-085"],
  ]);

  const usedDnsProductItemIds = new Set(productItemPublicIdOverrides.values());
  const fallbackDnsProductItemPublicId = (subcategoryPublicId: string, name: string) => {
    const base = `item-${slugifyCatalogId(`${subcategoryPublicId}-${name}`)}`;
    let candidate = base;
    let suffix = 2;
    while (usedDnsProductItemIds.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    usedDnsProductItemIds.add(candidate);
    return candidate;
  };

  const dnsProductItems = dnsProductCatalogSeed.flatMap((category) =>
    category.subcategories.flatMap((subcategory) =>
      subcategory.products.map((productName, index) => {
        const overrideKey = `${subcategory.publicId}::${productName}`;
        const publicId =
          productItemPublicIdOverrides.get(overrideKey) ??
          fallbackDnsProductItemPublicId(subcategory.publicId, productName);
        return [publicId, subcategory.publicId, productName, index + 1] as const;
      }),
    ),
  );

  await prisma.catalogItem.createMany({
    data: [
      ...dnsProductItems,
      ["ITM-009", "SUB-010", "Замена экрана смартфона", 1],
      ["ITM-010", "SUB-013", "Монтаж ТВ на стену", 1],
      ["ITM-015", "SUB-011", "Ремонт ноутбука", 1],
      ["ITM-016", "SUB-012", "Ремонт стиральной машины", 1],
      ["ITM-017", "SUB-014", "Настройка смартфона", 1],
      ["ITM-086", "SUB-015", "Диагностика перед продажей", 1],
    ].map((i: any) => ({
      public_id: i[0],
      subcategory_id: getRequired(subcategoryMap, i[1], "Subcategory"),
      name: i[2],
      order_index: i[3],
    })),
  });

  const itemMap = new Map(
    (
      await prisma.catalogItem.findMany({
        select: { id: true, public_id: true },
      })
    ).map((i) => [i.public_id, i.id]),
  );

  const catalogReferenceItemRows = await prisma.catalogItem.findMany({
    select: {
      id: true,
      public_id: true,
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
  });
  await seedCatalogReferenceData(catalogReferenceItemRows);

  type AttributeSeed = {
    id: string;
    type: "PRODUCT";
    category?: string;
    subcategory?: string;
    item?: string;
    key: string;
    label: string;
    inputType?: string;
    required?: boolean;
    options?: string[];
    unit?: string;
    min?: number;
    max?: number;
    defaultValue?: string;
    order: number;
  };
  type AttributeDraft = Omit<
    AttributeSeed,
    "id" | "type" | "category" | "subcategory" | "item" | "order"
  >;
  const productAttributes: AttributeSeed[] = [];

  const field = (
    key: string,
    label: string,
    overrides: Partial<AttributeDraft> = {},
  ): AttributeDraft => ({
    key,
    label,
    inputType: overrides.inputType ?? "text",
    required: overrides.required ?? true,
    options: overrides.options,
    unit: overrides.unit,
    min: overrides.min,
    max: overrides.max,
    defaultValue: overrides.defaultValue,
  });
  const text = (
    key: string,
    label: string,
    overrides: Partial<AttributeDraft> = {},
  ) => field(key, label, overrides);
  const number = (
    key: string,
    label: string,
    overrides: Partial<AttributeDraft> = {},
  ) => field(key, label, { ...overrides, inputType: "number" });
  const select = (
    key: string,
    label: string,
    options: string[],
    overrides: Partial<AttributeDraft> = {},
  ) => field(key, label, { ...overrides, inputType: "select", options });
  const textarea = (
    key: string,
    label: string,
    overrides: Partial<AttributeDraft> = {},
  ) => field(key, label, { ...overrides, inputType: "textarea" });

  const colorField = text("color", "Цвет");
  const batteryField = number("battery_health", "Аккумулятор", {
    unit: "%",
    min: 1,
    max: 100,
  });
  const screenStateField = select("screen_state", "Состояние экрана", [
    "Без дефектов",
    "Есть царапины",
    "Есть трещины",
    "После замены",
    "Не проверялось",
  ]);
  const phoneSimField = select("sim", "SIM / eSIM", [
    "1 SIM",
    "2 SIM",
    "eSIM",
    "SIM + eSIM",
    "Не знаю",
  ]);
  const laptopFields = [
    text("cpu", "Процессор"),
    text("ram", "RAM"),
    text("storage", "Накопитель"),
    number("screen_size", "Диагональ", { unit: "дюйм" }),
    text("gpu", "Видеокарта"),
    batteryField,
  ];
  const consoleFields = [
    text("generation", "Поколение / версия"),
    text("storage", "Память"),
    text("revision", "Ревизия"),
    number("gamepads_count", "Количество геймпадов", { min: 0 }),
  ];

  const itemSchemaMatrix: Record<string, { fields: AttributeDraft[] }> = {
    "ITM-001": {
      fields: [
        text("storage", "Память"),
        colorField,
        phoneSimField,
        batteryField,
        select("biometric_state", "Face ID / Touch ID", [
          "Работает",
          "Не работает",
          "Не применимо",
          "Не проверялось",
        ]),
      ],
    },
    "ITM-002": {
      fields: [
        text("storage", "Память"),
        colorField,
        phoneSimField,
        batteryField,
        screenStateField,
      ],
    },
    "ITM-019": {
      fields: [
        text("storage", "Память"),
        colorField,
        phoneSimField,
        batteryField,
        screenStateField,
      ],
    },
    "ITM-020": {
      fields: [
        text("storage", "Память"),
        colorField,
        phoneSimField,
        batteryField,
        screenStateField,
      ],
    },
    "ITM-021": {
      fields: [
        text("storage", "Память"),
        colorField,
        phoneSimField,
        batteryField,
        select("hinge_state", "Состояние шарнира", [
          "Без люфта",
          "Есть люфт",
          "После ремонта",
          "Не проверялось",
        ]),
        select("folding_screen_state", "Состояние складного экрана", [
          "Без дефектов",
          "Есть заломы",
          "Есть дефекты",
          "Не проверялось",
        ]),
      ],
    },
    "ITM-022": {
      fields: [
        text("storage", "Память"),
        colorField,
        phoneSimField,
        batteryField,
        text("protection_class", "Класс защиты / IP"),
      ],
    },

    "ITM-003": {
      fields: [
        text("cpu", "Процессор / чип"),
        text("ram", "RAM"),
        text("storage", "Накопитель"),
        number("screen_size", "Диагональ", { unit: "дюйм" }),
        batteryField,
        select("keyboard_layout", "Клавиатура", ["RU", "US", "EU", "Другая"]),
      ],
    },
    "ITM-004": { fields: laptopFields },
    "ITM-023": { fields: laptopFields },
    "ITM-024": { fields: laptopFields },
    "ITM-025": { fields: laptopFields },
    "ITM-026": { fields: laptopFields },

    "ITM-011": {
      fields: [
        text("storage", "Память"),
        number("screen_size", "Диагональ", { unit: "дюйм" }),
        select("connectivity", "Связь", [
          "Wi-Fi",
          "Wi-Fi + Cellular",
          "Не знаю",
        ]),
        batteryField,
        select("pencil_support", "Apple Pencil", [
          "Поддерживается",
          "Не поддерживается",
          "Не знаю",
        ]),
      ],
    },
    "ITM-027": {
      fields: [
        text("storage", "Память"),
        number("screen_size", "Диагональ", { unit: "дюйм" }),
        select("connectivity", "Связь", [
          "Wi-Fi",
          "LTE/5G",
          "Wi-Fi + LTE/5G",
          "Не знаю",
        ]),
        batteryField,
      ],
    },
    "ITM-028": {
      fields: [
        text("storage", "Память"),
        number("screen_size", "Диагональ", { unit: "дюйм" }),
        select("connectivity", "Связь", [
          "Wi-Fi",
          "LTE/5G",
          "Wi-Fi + LTE/5G",
          "Не знаю",
        ]),
        batteryField,
      ],
    },
    "ITM-029": {
      fields: [
        text("active_area", "Рабочая область"),
        select("connection", "Подключение", [
          "USB",
          "Bluetooth",
          "USB + Bluetooth",
          "Не знаю",
        ]),
        select("pen_included", "Перо в комплекте", ["Да", "Нет", "Не знаю"]),
      ],
    },

    "ITM-007": {
      fields: [
        number("diagonal", "Диагональ", { unit: "дюйм" }),
        text("resolution", "Разрешение"),
        select("smart_tv", "Smart TV", ["Да", "Нет", "Не знаю"]),
        text("matrix_type", "Тип матрицы"),
        select("remote_included", "Пульт", ["Есть", "Нет", "Не знаю"]),
      ],
    },
    "ITM-012": {
      fields: [
        number("diagonal", "Диагональ", { unit: "дюйм" }),
        text("resolution", "Разрешение"),
        text("refresh_rate", "Частота"),
        text("matrix_type", "Тип матрицы"),
        select("dead_pixels", "Битые пиксели", [
          "Нет",
          "Есть",
          "Не проверялось",
        ]),
      ],
    },
    "ITM-030": {
      fields: [
        text("resolution", "Разрешение"),
        text("brightness", "Яркость"),
        text("lamp_type", "Тип лампы / источника"),
        text("lamp_hours", "Наработка"),
      ],
    },
    "ITM-031": {
      fields: [
        text("storage", "Память"),
        text("resolution", "Разрешение"),
        text("platform", "ОС / платформа"),
        select("remote_included", "Пульт", ["Есть", "Нет", "Не знаю"]),
      ],
    },

    "ITM-008": {
      fields: [
        text("headphone_type", "Тип"),
        select("connection", "Подключение", [
          "Bluetooth",
          "Проводное",
          "Комбинированное",
          "Не знаю",
        ]),
        select("noise_canceling", "Шумоподавление", ["Есть", "Нет", "Не знаю"]),
        batteryField,
      ],
    },
    "ITM-018": {
      fields: [
        text("airpods_generation", "Поколение / модель"),
        select("case_type", "Кейс", [
          "Lightning",
          "USB-C",
          "MagSafe",
          "Беспроводной",
          "Не знаю",
        ]),
        batteryField,
        select("noise_canceling", "Шумоподавление", ["Есть", "Нет", "Не знаю"]),
      ],
    },
    "ITM-032": {
      fields: [
        text("power", "Мощность"),
        select("connection", "Подключение", [
          "Bluetooth",
          "Wi-Fi",
          "AUX",
          "Комбинированное",
          "Не знаю",
        ]),
        batteryField,
        text("waterproof", "Влагозащита"),
      ],
    },
    "ITM-033": {
      fields: [
        text("channels", "Каналы"),
        text("power", "Мощность"),
        text("connection", "Подключение"),
        select("subwoofer", "Сабвуфер", ["Есть", "Нет", "Не знаю"]),
      ],
    },
    "ITM-034": {
      fields: [
        text("microphone_type", "Тип"),
        text("connection", "Подключение"),
        text("purpose", "Назначение"),
        select("mount_included", "Стойка / крепление", [
          "Есть",
          "Нет",
          "Не знаю",
        ]),
      ],
    },

    "ITM-035": {
      fields: [
        text("cpu", "Процессор"),
        text("ram", "RAM"),
        text("storage", "Накопитель"),
        text("gpu", "Видеокарта"),
        text("psu", "Блок питания"),
      ],
    },
    "ITM-036": {
      fields: [
        text("cpu", "Процессор"),
        text("ram", "RAM"),
        text("storage", "Накопитель"),
        number("screen_size", "Диагональ", { unit: "дюйм" }),
        text("gpu", "Видеокарта"),
      ],
    },
    "ITM-037": {
      fields: [
        select("manufacturer", "Производитель / бренд", [
          "ASUS",
          "MSI",
          "Gigabyte",
          "Palit",
          "Zotac",
          "Sapphire",
          "PowerColor",
          "XFX",
          "Inno3D",
          "PNY",
          "EVGA",
          "KFA2 / GALAX",
          "Gainward",
          "ASRock",
          "Colorful",
          "Manli",
          "NVIDIA",
          "AMD",
          "Intel",
          "Другое / предложить значение",
          "Не знаю",
        ]),
        select("gpu_chip", "Графический чип / линейка", [
          "NVIDIA GeForce RTX 50",
          "NVIDIA GeForce RTX 40",
          "NVIDIA GeForce RTX 30",
          "NVIDIA GeForce RTX 20 / GTX 16",
          "NVIDIA GeForce GTX 10",
          "AMD Radeon RX 9000",
          "AMD Radeon RX 7000",
          "AMD Radeon RX 6000",
          "AMD Radeon RX 5000",
          "Intel Arc B-Series",
          "Intel Arc A-Series",
          "NVIDIA RTX / Quadro",
          "AMD Radeon Pro",
          "Другое / предложить значение",
          "Не знаю",
        ]),
        number("memory_size", "Объём видеопамяти", {
          unit: "ГБ",
          min: 1,
          max: 128,
        }),
        select("memory_type", "Тип памяти", [
          "GDDR5",
          "GDDR5X",
          "GDDR6",
          "GDDR6X",
          "GDDR7",
          "HBM2 / HBM2e",
          "HBM3 / HBM3e",
          "Другое / предложить значение",
          "Не знаю",
        ]),
        select("interface", "Интерфейс", [
          "PCIe 3.0 x16",
          "PCIe 4.0 x16",
          "PCIe 5.0 x16",
          "PCIe x8",
          "MXM",
          "Внешняя / eGPU",
          "Не знаю",
        ]),
        select("power_connector", "Дополнительное питание", [
          "Без доп. питания",
          "1x 6-pin",
          "1x 8-pin (6+2)",
          "2x 8-pin (6+2)",
          "3x 8-pin (6+2)",
          "12VHPWR / 12V-2x6",
          "8-pin + 12VHPWR / 12V-2x6",
          "Не знаю",
        ]),
        select(
          "cooling_size",
          "Толщина / охлаждение",
          [
            "Low profile / 1 слот",
            "2 слота",
            "2.5 слота",
            "3 слота",
            "3.5+ слота",
            "Водоблок",
            "Не знаю",
          ],
          { required: false },
        ),
        number("length_mm", "Длина", {
          unit: "мм",
          min: 100,
          max: 450,
          required: false,
        }),
        select(
          "mining_usage",
          "Майнинг / длительная нагрузка",
          ["Не использовалась", "Использовалась", "Не знаю"],
          { required: false },
        ),
        number("warranty_months_left", "Остаток гарантии", {
          unit: "мес.",
          min: 0,
          max: 120,
          required: false,
        }),
      ],
    },
    "ITM-038": {
      fields: [
        text("socket", "Сокет"),
        number("cores", "Количество ядер", { min: 1 }),
        text("generation", "Поколение / серия"),
      ],
    },
    "ITM-039": {
      fields: [
        text("capacity", "Объём"),
        text("memory_type", "Тип памяти"),
        text("frequency", "Частота"),
        number("modules_count", "Количество модулей", { min: 1 }),
      ],
    },
    "ITM-040": {
      fields: [
        select("drive_type", "Тип накопителя", [
          "SSD",
          "HDD",
          "SSHD",
          "Не знаю",
        ]),
        text("capacity", "Объём"),
        text("interface", "Интерфейс"),
        text("smart_health", "SMART / ресурс"),
      ],
    },
    "ITM-041": {
      fields: [
        text("socket", "Сокет"),
        text("chipset", "Чипсет"),
        text("form_factor", "Форм-фактор"),
        text("memory_type", "Тип памяти"),
      ],
    },
    "ITM-042": {
      fields: [
        select("manufacturer", "Производитель / бренд", [
          "AeroCool",
          "ASUS ROG",
          "be quiet!",
          "Chieftec",
          "Cooler Master",
          "Corsair",
          "Cougar",
          "DeepCool",
          "EVGA",
          "FSP",
          "Fractal Design",
          "Gigabyte",
          "MSI",
          "Seasonic",
          "SilverStone",
          "Super Flower",
          "Thermaltake",
          "XPG",
          "Zalman",
          "1STPLAYER",
          "GameMax",
          "HIPER",
          "Другое / предложить значение",
          "Не знаю",
        ]),
        number("power", "Мощность", { unit: "Вт", min: 150, max: 2000 }),
        select("form_factor", "Форм-фактор", [
          "ATX",
          "SFX",
          "SFX-L",
          "TFX",
          "Flex ATX",
          "Внешний адаптер",
          "Не знаю",
        ]),
        select("efficiency_certificate", "Сертификат эффективности", [
          "Нет сертификата",
          "80 PLUS",
          "80 PLUS Bronze",
          "80 PLUS Silver",
          "80 PLUS Gold",
          "80 PLUS Platinum",
          "80 PLUS Titanium",
          "Cybenetics Bronze",
          "Cybenetics Silver",
          "Cybenetics Gold",
          "Cybenetics Platinum",
          "Cybenetics Titanium",
          "Не знаю",
        ]),
        select("modularity", "Модульность", [
          "Модульный",
          "Полумодульный",
          "Немодульный",
          "Не знаю",
        ]),
        select("gpu_power_connector", "Питание видеокарты", [
          "Нет PCIe",
          "1x 6-pin",
          "1x 8-pin (6+2)",
          "2x 8-pin (6+2)",
          "3x 8-pin (6+2)",
          "12VHPWR / 12V-2x6",
          "8-pin + 12VHPWR / 12V-2x6",
          "Не знаю",
        ]),
        select(
          "cpu_power_connector",
          "Питание процессора",
          [
            "4-pin ATX12V",
            "8-pin EPS",
            "4+4-pin EPS",
            "8-pin + 4-pin EPS",
            "2x 8-pin EPS",
            "Не знаю",
          ],
          { required: false },
        ),
        select(
          "atx_version",
          "Стандарт ATX",
          [
            "ATX 2.x",
            "ATX 3.0",
            "ATX 3.1",
            "Не знаю",
          ],
          { required: false },
        ),
        select(
          "cable_set",
          "Комплект кабелей",
          [
            "Полный комплект",
            "Нет части модульных кабелей",
            "Только основные кабели",
            "Не знаю",
          ],
          { required: false },
        ),
        number("warranty_months_left", "Остаток гарантии", {
          unit: "мес.",
          min: 0,
          max: 120,
          required: false,
        }),
      ],
    },

    "ITM-043": { fields: consoleFields },
    "ITM-044": { fields: consoleFields },
    "ITM-045": { fields: consoleFields },
    "ITM-046": {
      fields: [
        text("platform", "Платформа"),
        select("connection", "Подключение", [
          "Bluetooth",
          "Проводное",
          "2.4 ГГц",
          "Комбинированное",
          "Не знаю",
        ]),
        select("stick_state", "Состояние стиков", [
          "Без дрифта",
          "Есть дрифт",
          "После ремонта",
          "Не проверялось",
        ]),
        text("power_source", "Аккумулятор / питание"),
      ],
    },

    "ITM-047": {
      fields: [
        text("case_size", "Размер"),
        select("connectivity", "GPS / Cellular", [
          "GPS",
          "GPS + Cellular",
          "Не знаю",
        ]),
        text("case_material_color", "Материал / цвет корпуса"),
        batteryField,
      ],
    },
    "ITM-048": {
      fields: [
        text("os_compatibility", "ОС / совместимость"),
        text("case_size", "Размер"),
        text("connectivity", "Связь"),
        batteryField,
        text("sensors", "Датчики"),
      ],
    },
    "ITM-049": {
      fields: [
        text("compatibility", "Совместимость"),
        text("sensors", "Датчики"),
        batteryField,
        text("waterproof", "Влагозащита"),
      ],
    },
    "ITM-050": {
      fields: [
        number("screen_size", "Диагональ", { unit: "дюйм" }),
        text("storage", "Память"),
        select("backlight", "Подсветка", ["Есть", "Нет", "Не знаю"]),
        text("format_os", "Формат / ОС"),
      ],
    },

    "ITM-051": {
      fields: [
        text("wifi_standard", "Стандарт Wi-Fi"),
        text("bands", "Диапазоны"),
        text("ports", "Порты"),
        text("speed", "Скорость"),
      ],
    },
    "ITM-052": {
      fields: [
        number("modules_count", "Количество модулей", { min: 1 }),
        text("wifi_standard", "Стандарт Wi-Fi"),
        text("coverage_area", "Площадь покрытия"),
      ],
    },
    "ITM-053": {
      fields: [
        number("ports_count", "Количество портов", { min: 1 }),
        text("port_speed", "Скорость портов"),
        select("poe", "PoE", ["Есть", "Нет", "Не знаю"]),
      ],
    },
    "ITM-054": {
      fields: [
        text("network_type", "Тип сети"),
        select("sim_support", "SIM / eSIM", [
          "SIM",
          "eSIM",
          "SIM + eSIM",
          "Нет",
          "Не знаю",
        ]),
        text("standards", "Поддерживаемые стандарты"),
      ],
    },

    "ITM-055": {
      fields: [
        text("camera_type", "Тип"),
        text("mount", "Байонет"),
        text("shutter_count", "Пробег / счётчик"),
        select("lens_included", "Объектив в комплекте", [
          "Есть",
          "Нет",
          "Не знаю",
        ]),
      ],
    },
    "ITM-056": {
      fields: [
        text("mount", "Байонет"),
        text("focal_length", "Фокусное расстояние"),
        text("aperture", "Светосила"),
        select("stabilization", "Стабилизация", ["Есть", "Нет", "Не знаю"]),
      ],
    },
    "ITM-057": {
      fields: [
        text("resolution", "Разрешение"),
        select("stabilization", "Стабилизация", ["Есть", "Нет", "Не знаю"]),
        text("storage_media", "Носитель"),
        batteryField,
      ],
    },
    "ITM-058": {
      fields: [
        text("resolution", "Разрешение"),
        select("stabilization", "Стабилизация", ["Есть", "Нет", "Не знаю"]),
        text("waterproof", "Влагозащита"),
        textarea("mounts_included", "Комплект креплений"),
      ],
    },

    "ITM-059": {
      fields: [
        text("ecosystem", "Экосистема"),
        text("assistant", "Ассистент"),
        text("connection", "Подключение"),
        text("power_source", "Питание"),
      ],
    },
    "ITM-060": {
      fields: [
        text("resolution", "Разрешение"),
        text("connection", "Подключение"),
        select("placement", "Помещение / улица", [
          "Помещение",
          "Улица",
          "Универсальная",
          "Не знаю",
        ]),
        text("power_source", "Питание"),
      ],
    },
    "ITM-061": {
      fields: [
        text("sensor_type", "Тип датчика"),
        text("ecosystem", "Экосистема"),
        text("power_source", "Питание"),
      ],
    },
    "ITM-062": {
      fields: [
        text("base_type", "Цоколь"),
        text("power", "Мощность"),
        text("ecosystem", "Экосистема"),
        text("color_mode", "Цветность"),
      ],
    },

    "ITM-005": {
      fields: [
        text("coffee_machine_type", "Тип"),
        text("power_pressure", "Мощность / давление"),
        text("usage_counter", "Пробег / чашки", { required: false }),
        text("water_tank", "Резервуар"),
      ],
    },
    "ITM-063": {
      fields: [
        text("volume", "Объём"),
        text("power", "Мощность"),
        text("control_type", "Тип управления"),
        select("grill", "Гриль", ["Есть", "Нет", "Не знаю"]),
      ],
    },
    "ITM-064": {
      fields: [
        text("install_type", "Тип установки"),
        text("width", "Ширина"),
        text("capacity", "Вместимость"),
        text("class_modes", "Класс / режимы"),
      ],
    },
    "ITM-065": {
      fields: [
        text("fridge_type", "Тип"),
        text("height", "Высота"),
        text("volume", "Объём"),
        select("no_frost", "No Frost", ["Да", "Нет", "Не знаю"]),
      ],
    },
    "ITM-066": {
      fields: [
        text("oven_type", "Тип"),
        text("volume", "Объём"),
        text("width", "Ширина"),
        text("connection_type", "Подключение"),
      ],
    },
    "ITM-067": {
      fields: [
        text("panel_type", "Тип"),
        number("burners_count", "Количество конфорок", { min: 1 }),
        text("width", "Ширина"),
        text("connection_type", "Подключение"),
      ],
    },
    "ITM-068": {
      fields: [
        text("volume", "Объём"),
        text("power", "Мощность"),
        textarea("programs", "Программы"),
      ],
    },
    "ITM-069": {
      fields: [
        text("device_type", "Тип"),
        text("power", "Мощность"),
        textarea("attachments", "Насадки"),
      ],
    },

    "ITM-013": {
      fields: [
        number("load_kg", "Загрузка", { unit: "кг", min: 1 }),
        text("load_type", "Тип загрузки"),
        text("depth", "Глубина"),
        text("inverter_dryer", "Инвертор / сушка"),
      ],
    },
    "ITM-070": {
      fields: [
        number("load_kg", "Загрузка", { unit: "кг", min: 1 }),
        text("drying_type", "Тип сушки"),
        text("depth", "Глубина"),
      ],
    },
    "ITM-071": {
      fields: [
        text("iron_type", "Тип"),
        text("power", "Мощность"),
        text("soleplate", "Подошва"),
        text("steam", "Пар"),
      ],
    },
    "ITM-072": {
      fields: [
        text("steamer_type", "Тип"),
        text("power", "Мощность"),
        text("tank_volume", "Объём бака"),
      ],
    },

    "ITM-014": {
      fields: [
        text("ac_type", "Тип"),
        text("room_area", "Площадь помещения"),
        text("install_state", "Монтаж / демонтаж"),
        text("power", "Мощность"),
      ],
    },
    "ITM-073": {
      fields: [
        text("heater_type", "Тип"),
        text("power", "Мощность"),
        text("room_area", "Площадь помещения"),
      ],
    },
    "ITM-074": {
      fields: [
        text("room_area", "Площадь помещения"),
        text("filter_condition", "Состояние фильтра"),
        text("filter_type", "Тип фильтра"),
      ],
    },
    "ITM-075": {
      fields: [
        text("tank_volume", "Объём бака"),
        text("room_area", "Площадь помещения"),
        text("humidifier_type", "Тип"),
      ],
    },
    "ITM-076": {
      fields: [
        text("fan_type", "Тип"),
        text("power", "Мощность"),
        text("size", "Диаметр / размер"),
      ],
    },

    "ITM-006": {
      fields: [
        text("navigation", "Навигация"),
        select("wet_cleaning", "Влажная уборка", ["Есть", "Нет", "Не знаю"]),
        batteryField,
        text("base", "База"),
      ],
    },
    "ITM-077": {
      fields: [
        text("power", "Мощность"),
        batteryField,
        text("container_volume", "Объём контейнера"),
      ],
    },
    "ITM-078": {
      fields: [
        text("power", "Мощность"),
        text("tank_volume", "Объём бака"),
        textarea("cleaning_modes", "Режимы уборки"),
      ],
    },
    "ITM-079": {
      fields: [
        text("power", "Мощность"),
        text("tank_volume", "Объём бака"),
        textarea("attachments", "Насадки"),
      ],
    },

    "ITM-080": {
      fields: [
        text("power", "Мощность"),
        textarea("attachments", "Насадки"),
        textarea("modes", "Режимы"),
      ],
    },
    "ITM-081": {
      fields: [
        text("shaving_type", "Тип бритья"),
        batteryField,
        select("wet_shave", "Влажное бритьё", ["Есть", "Нет", "Не знаю"]),
      ],
    },
    "ITM-082": {
      fields: [
        text("technology", "Технология"),
        textarea("modes", "Режимы"),
        batteryField,
        textarea("attachments", "Насадки"),
      ],
    },
    "ITM-083": {
      fields: [
        text("scale_type", "Тип"),
        text("max_weight", "Максимальный вес"),
        select("smart_features", "Smart-функции", ["Есть", "Нет", "Не знаю"]),
      ],
    },

    "ITM-084": {
      fields: [
        text("heater_type", "Тип"),
        text("volume", "Объём"),
        text("power", "Мощность"),
        text("install_type", "Установка"),
      ],
    },
    "ITM-085": {
      fields: [
        text("filter_type", "Тип фильтра"),
        textarea("compatible_cartridges", "Совместимые картриджи"),
        text("resource", "Ресурс"),
      ],
    },
  };

  const suggestOption = "Другое / предложить значение";
  const yesNoUnknown = ["Да", "Нет", "Не знаю"];
  const brandOption = (brands: string[]) => [...brands, suggestOption, "Не знаю"];
  const laptopStorageOptions = ["128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ", "2 ТБ", "4 ТБ", suggestOption, "Не знаю"];
  const mvpItemIds = new Set([
    "ITM-001",
    "ITM-003",
    "ITM-037",
    "ITM-042",
    "ITM-047",
    "ITM-065",
    "ITM-013",
    "ITM-066",
    "ITM-005",
    "ITM-006",
  ]);
  const mvpItemSchemaMatrix: Record<string, { fields: AttributeDraft[] }> = {
    "ITM-001": {
      fields: [
        select("model", "Модель", [
          "iPhone 11",
          "iPhone 12",
          "iPhone 13",
          "iPhone 14",
          "iPhone 15",
          "iPhone 16",
          "iPhone SE",
          suggestOption,
        ]),
        select("storage", "Память", ["64 ГБ", "128 ГБ", "256 ГБ", "512 ГБ", "1 ТБ", "Не знаю"]),
        select("sim", "SIM / eSIM", ["1 SIM", "2 SIM", "eSIM", "SIM + eSIM", "Не знаю"]),
        batteryField,
        select("face_id_state", "Face ID", ["Работает", "Не работает", "Не проверялось"]),
        select("screen_state", "Состояние экрана", [
          "Без дефектов",
          "Есть царапины",
          "Есть трещины",
          "После замены",
          "Не проверялось",
        ]),
        colorField,
      ],
    },
    "ITM-003": {
      fields: [
        select("manufacturer", "Производитель / бренд", brandOption([
          "Apple",
          "ASUS",
          "Acer",
          "Dell",
          "HP",
          "Lenovo",
          "MSI",
          "Huawei",
          "Honor",
          "Xiaomi",
          "Samsung",
        ])),
        text("model", "Модель"),
        select("cpu_family", "Процессор / чип", [
          "Apple M1/M2/M3/M4",
          "Intel Core i3/i5/i7/i9",
          "Intel Core Ultra",
          "AMD Ryzen 3/5/7/9",
          suggestOption,
          "Не знаю",
        ]),
        select("ram", "Оперативная память", ["8 ГБ", "16 ГБ", "24 ГБ", "32 ГБ", "64 ГБ", "128 ГБ", "Не знаю"]),
        select("storage", "Накопитель", laptopStorageOptions),
        number("screen_size", "Диагональ", { unit: "дюйм", min: 10, max: 18 }),
        select("gpu_type", "Графика", [
          "Встроенная",
          "NVIDIA GeForce RTX",
          "NVIDIA GeForce GTX",
          "AMD Radeon",
          "Apple GPU",
          suggestOption,
          "Не знаю",
        ]),
        batteryField,
        select("keyboard_layout", "Клавиатура", ["RU", "US", "EU", "Не знаю"]),
      ],
    },
    "ITM-037": itemSchemaMatrix["ITM-037"],
    "ITM-042": itemSchemaMatrix["ITM-042"],
    "ITM-047": {
      fields: [
        select("series", "Серия", [
          "Series 6",
          "Series 7",
          "Series 8",
          "Series 9",
          "Series 10",
          "SE",
          "Ultra",
          "Ultra 2",
          suggestOption,
          "Не знаю",
        ]),
        select("case_size", "Размер корпуса", ["40 мм", "41 мм", "44 мм", "45 мм", "46 мм", "49 мм", "Не знаю"]),
        select("connectivity", "GPS / Cellular", ["GPS", "GPS + Cellular", "Не знаю"]),
        select("case_material", "Материал корпуса", ["Алюминий", "Нержавеющая сталь", "Титан", "Не знаю"]),
        batteryField,
        select("screen_state", "Состояние экрана", [
          "Без дефектов",
          "Есть царапины",
          "Есть трещины",
          "После замены",
          "Не проверялось",
        ]),
      ],
    },
    "ITM-065": {
      fields: [
        select("manufacturer", "Производитель / бренд", brandOption([
          "Atlant",
          "Beko",
          "Bosch",
          "Haier",
          "Hisense",
          "Indesit",
          "LG",
          "Liebherr",
          "Samsung",
          "Siemens",
          "Weissgauff",
        ])),
        text("model", "Модель"),
        select("fridge_type", "Тип", ["Однокамерный", "Двухкамерный", "Side-by-Side", "French Door", "Встраиваемый", "Морозильник", "Не знаю"]),
        number("height", "Высота", { unit: "см", min: 50, max: 230 }),
        number("total_volume", "Общий объём", { unit: "л", min: 40, max: 800 }),
        select("no_frost", "No Frost", yesNoUnknown),
        select("compressor_type", "Компрессор", ["Обычный", "Инверторный", "Не знаю"]),
      ],
    },
    "ITM-013": {
      fields: [
        select("manufacturer", "Производитель / бренд", brandOption([
          "Beko",
          "Bosch",
          "Candy",
          "Haier",
          "Indesit",
          "LG",
          "Samsung",
          "Siemens",
          "Weissgauff",
          "Whirlpool",
        ])),
        text("model", "Модель"),
        select("load_type", "Тип загрузки", ["Фронтальная", "Вертикальная", "Не знаю"]),
        number("load_kg", "Загрузка", { unit: "кг", min: 3, max: 14 }),
        number("depth", "Глубина", { unit: "см", min: 30, max: 75 }),
        select("dryer", "Сушка", yesNoUnknown),
        select("motor_type", "Инверторный мотор", yesNoUnknown),
      ],
    },
    "ITM-066": {
      fields: [
        select("manufacturer", "Производитель / бренд", brandOption([
          "Bosch",
          "Electrolux",
          "Gorenje",
          "Hansa",
          "Hotpoint",
          "Kuppersberg",
          "Samsung",
          "Siemens",
          "Weissgauff",
          "Zigmund & Shtain",
        ])),
        text("model", "Модель"),
        select("oven_type", "Тип", ["Электрический", "Газовый", "Комбинированный", "Не знаю"]),
        select("install_type", "Установка", ["Встраиваемый", "Отдельностоящий", "Не знаю"]),
        number("volume", "Объём", { unit: "л", min: 20, max: 120 }),
        number("width", "Ширина", { unit: "см", min: 45, max: 90 }),
        select("cleaning_type", "Очистка", ["Традиционная", "Каталитическая", "Пиролитическая", "Гидролизная", "Не знаю"]),
      ],
    },
    "ITM-005": {
      fields: [
        select("manufacturer", "Производитель / бренд", brandOption([
          "DeLonghi",
          "Jura",
          "Krups",
          "Nivona",
          "Philips",
          "Saeco",
          "Siemens",
          "Bosch",
          "Melitta",
          "Gaggia",
        ])),
        text("model", "Модель"),
        select("coffee_machine_type", "Тип", ["Автоматическая", "Рожковая", "Капсульная", "Капельная", "Гейзерная электрическая", "Не знаю"]),
        number("pressure_bar", "Давление", { unit: "бар", min: 2, max: 20, required: false }),
        number("cups_count", "Пробег", { unit: "чашек", min: 0, max: 100000, required: false }),
        select("milk_system", "Капучинатор", ["Автоматический", "Ручной", "Нет", "Не знаю"]),
        number("water_tank_l", "Резервуар воды", { unit: "л", min: 0.2, max: 5, required: false }),
      ],
    },
    "ITM-006": {
      fields: [
        select("manufacturer", "Производитель / бренд", brandOption([
          "iRobot",
          "Roborock",
          "Dreame",
          "Xiaomi",
          "Ecovacs",
          "Samsung",
          "LG",
          "Tefal",
          "Polaris",
          "Kitfort",
        ])),
        text("model", "Модель"),
        select("navigation", "Навигация", ["Лидар", "Камера", "Гироскоп", "Хаотичная", "Не знаю"]),
        select("wet_cleaning", "Влажная уборка", yesNoUnknown),
        select("base", "База", ["Без базы", "Зарядная база", "Самоочистка", "Самоочистка и мойка салфеток", "Не знаю"]),
        number("suction_power_pa", "Мощность всасывания", { unit: "Па", min: 500, max: 25000, required: false }),
        batteryField,
      ],
    },
  };
  const effectiveItemSchemaMatrix = {
    ...itemSchemaMatrix,
    ...mvpItemSchemaMatrix,
  };

  const comprehensiveItemAttributes: AttributeSeed[] = Object.entries(
    effectiveItemSchemaMatrix,
  ).filter(([item]) => mvpItemIds.has(item)).flatMap(([item, config]) => {
    const allFields: AttributeDraft[] = [
      ...config.fields,
      textarea("included", "Комплект"),
      textarea("defects_description", "Дефекты"),
      textarea("important_attributes", "Важные характеристики", {
        required: false,
      }),
    ];
    const byKey = new Map<string, AttributeDraft>();
    for (const attribute of allFields) byKey.set(attribute.key, attribute);
    return Array.from(byKey.values()).map((attribute, index) => ({
      ...attribute,
      id:
        "CAD-ITEM-" +
        item.replace("ITM-", "") +
        "-" +
        String(index + 1).padStart(2, "0"),
      type: "PRODUCT" as const,
      item,
      order: index + 1,
    }));
  });

  const expandedProductAttributes = [
    ...productAttributes,
    ...comprehensiveItemAttributes,
  ];

  function assertAttributeSeedQuality(attributes: AttributeSeed[]): void {
    const keysBySchema = new Map<string, Set<string>>();
    for (const attribute of attributes) {
      const schemaKey = [
        attribute.type,
        attribute.category ?? "",
        attribute.subcategory ?? "",
        attribute.item ?? "",
      ].join(":");
      const normalizedKey = attribute.key.trim().toLocaleLowerCase("ru-RU");
      const keys = keysBySchema.get(schemaKey) ?? new Set<string>();
      if (keys.has(normalizedKey)) {
        throw new Error(
          `Duplicate catalog attribute key "${attribute.key}" in schema ${schemaKey}`,
        );
      }
      keys.add(normalizedKey);
      keysBySchema.set(schemaKey, keys);

      if (
        attribute.inputType === "select" &&
        (!attribute.options || attribute.options.length === 0)
      ) {
        throw new Error(
          `Select catalog attribute "${attribute.key}" must define options`,
        );
      }
    }
  }

  assertAttributeSeedQuality(expandedProductAttributes);
  await prisma.catalogAttributeDefinition.createMany({
    data: expandedProductAttributes.map((attribute) => ({
      public_id: attribute.id,
      type: attribute.type,
      category_id: attribute.category
        ? getRequired(categoryMap, attribute.category, "Category")
        : null,
      subcategory_id: attribute.subcategory
        ? getRequired(subcategoryMap, attribute.subcategory, "Subcategory")
        : null,
      item_id: attribute.item
        ? getRequired(itemMap, attribute.item, "Item")
        : null,
      key: attribute.key,
      label: attribute.label,
      input_type: attribute.inputType ?? "text",
      required: attribute.required ?? false,
      options: attribute.options ?? undefined,
      unit: attribute.unit ?? null,
      min_value: attribute.min ?? null,
      max_value: attribute.max ?? null,
      default_value: attribute.defaultValue ?? null,
      order_index: attribute.order,
    })),
  });

  const listings = [
    [
      "LST-001",
      "SLR-001",
      "ITM-001",
      "Москва",
      "PRODUCT",
      "iPhone 15 Pro 256GB",
      119000,
      113900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      740,
      true,
    ],
    [
      "LST-002",
      "SLR-001",
      "ITM-003",
      "Москва",
      "PRODUCT",
      "MacBook Air M3 16/512",
      169900,
      165000,
      "NEW",
      "ACTIVE",
      "APPROVED",
      518,
      true,
    ],
    [
      "LST-003",
      "SLR-002",
      "ITM-002",
      "Казань",
      "PRODUCT",
      "Samsung S24 Ultra 512GB",
      104000,
      98000,
      "NEW",
      "ACTIVE",
      "APPROVED",
      429,
      true,
    ],
    [
      "LST-004",
      "SLR-003",
      "ITM-006",
      "Екатеринбург",
      "PRODUCT",
      "Robot Vacuum R9",
      25500,
      24000,
      "NEW",
      "ACTIVE",
      "APPROVED",
      275,
      true,
    ],
    [
      "LST-005",
      "SLR-004",
      "ITM-007",
      "Краснодар",
      "PRODUCT",
      "Samsung TV 55",
      38000,
      null,
      "USED",
      "MODERATION",
      "PENDING",
      109,
      false,
    ],
    [
      "LST-009",
      "SLR-003",
      "ITM-005",
      "Екатеринбург",
      "PRODUCT",
      "Coffee Machine CM-500",
      23500,
      22000,
      "NEW",
      "ACTIVE",
      "APPROVED",
      382,
      true,
    ],
    [
      "LST-010",
      "SLR-002",
      "ITM-008",
      "Нижний Новгород",
      "PRODUCT",
      "Sony WH-1000XM5",
      26800,
      24900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      214,
      true,
    ],
    [
      "LST-011",
      "SLR-001",
      "ITM-002",
      "Москва",
      "PRODUCT",
      "Samsung S24 256GB",
      89900,
      85900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      512,
      true,
    ],
    [
      "LST-012",
      "SLR-002",
      "ITM-001",
      "Казань",
      "PRODUCT",
      "iPhone 15 128GB",
      73900,
      70900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      468,
      true,
    ],
    [
      "LST-013",
      "SLR-003",
      "ITM-003",
      "Екатеринбург",
      "PRODUCT",
      "MacBook Air M2 8/256",
      119900,
      114900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      355,
      true,
    ],
    [
      "LST-014",
      "SLR-004",
      "ITM-004",
      "Краснодар",
      "PRODUCT",
      "ThinkPad X1 Carbon Gen 9",
      129000,
      null,
      "USED",
      "ACTIVE",
      "APPROVED",
      227,
      true,
    ],
    [
      "LST-015",
      "SLR-001",
      "ITM-006",
      "Москва",
      "PRODUCT",
      "Robot Vacuum R8",
      21900,
      19900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      301,
      true,
    ],
    [
      "LST-016",
      "SLR-002",
      "ITM-005",
      "Казань",
      "PRODUCT",
      "Coffee Machine CM-300",
      16500,
      14900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      286,
      true,
    ],
    [
      "LST-017",
      "SLR-003",
      "ITM-007",
      "Екатеринбург",
      "PRODUCT",
      "LG TV 43",
      28500,
      null,
      "USED",
      "ACTIVE",
      "APPROVED",
      192,
      false,
    ],
    [
      "LST-018",
      "SLR-004",
      "ITM-008",
      "Краснодар",
      "PRODUCT",
      "AirPods Pro 2",
      17400,
      16900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      178,
      true,
    ],
    [
      "LST-023",
      "SLR-001",
      "ITM-004",
      "Москва",
      "PRODUCT",
      "ThinkPad X1 16/512",
      146000,
      139900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      264,
      true,
    ],
    [
      "LST-024",
      "SLR-002",
      "ITM-003",
      "Казань",
      "PRODUCT",
      "MacBook Air M3 8/256",
      134900,
      129900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      245,
      true,
    ],
    [
      "LST-025",
      "SLR-003",
      "ITM-002",
      "Екатеринбург",
      "PRODUCT",
      "Samsung S24 512GB",
      99900,
      94900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      221,
      true,
    ],
    [
      "LST-026",
      "SLR-004",
      "ITM-001",
      "Краснодар",
      "PRODUCT",
      "iPhone 15 Pro Max 256GB",
      134900,
      129900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      338,
      true,
    ],
    [
      "LST-027",
      "SLR-001",
      "ITM-006",
      "Москва",
      "PRODUCT",
      "Robot Vacuum R10",
      32900,
      30900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      154,
      true,
    ],
    [
      "LST-028",
      "SLR-002",
      "ITM-005",
      "Казань",
      "PRODUCT",
      "Coffee Machine CM-700",
      28900,
      26900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      147,
      true,
    ],
    [
      "LST-029",
      "SLR-003",
      "ITM-007",
      "Екатеринбург",
      "PRODUCT",
      "Philips TV 50",
      47500,
      45900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      136,
      false,
    ],
    [
      "LST-030",
      "SLR-004",
      "ITM-008",
      "Краснодар",
      "PRODUCT",
      "JBL Charge 5",
      13200,
      12900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      121,
      true,
    ],
  ] as const;

  const listingMap = new Map<string, number>();
  const listingTitleMap = new Map<string, string>();
  const listingImageMap = new Map<string, string>();

  for (const l of listings) {
    const created = await prisma.marketplaceListing.create({
      data: {
        public_id: l[0],
        seller_id: getRequired(userMap, l[1], "User"),
        item_id: getRequired(itemMap, l[2], "Item"),
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
    listingImageMap.set(
      l[0],
      `https://placehold.co/800x600?text=${encodeURIComponent(l[0])}`,
    );

    await prisma.listingImage.createMany({
      data: [
        {
          listing_id: created.id,
          url: `https://placehold.co/1200x800?text=${encodeURIComponent(l[0])}+1`,
          sort_order: 0,
        },
      ],
    });

    const attributes = [
      {
        listing_id: created.id,
        key: "Состояние",
        value: l[8] === "NEW" ? "Новое" : "Б/У",
        sort_order: 0,
      },
      {
        listing_id: created.id,
        key: "Город",
        value: l[3],
        sort_order: 1,
      },
    ];

    await prisma.listingAttribute.createMany({ data: attributes });
  }

  await prisma.listingReview.createMany({
    data: listings.map((l: any, idx) => ({
      listing_id: getRequired(listingMap, l[0], "Listing"),
      author_id: getRequired(userMap, `BUY-00${(idx % 4) + 1}`, "User"),
      rating: [5, 5, 4, 5, 4, 5, 2, 5, 4, 5][idx % 10] ?? 4,
      comment: `Отзыв по объявлению ${l[0]}`,
      created_at: daysAgo(20 - idx),
    })),
  });

  const questionTemplates = [
    { text: "Актуально ли объявление?", answer: "Да, актуально." },
    {
      text: "Можно ли забрать сегодня?",
      answer: "Да, договоримся на сегодня вечером.",
    },
    { text: "Есть ли гарантия?", answer: "Да, гарантия от продавца 14 дней." },
    { text: "Возможен небольшой торг?", answer: null },
  ] as const;

  const listingQuestionsSeed = listings.flatMap((listing, listingIndex) =>
    questionTemplates.map((template, templateIndex) => {
      const id = `QST-${String(listingIndex * questionTemplates.length + templateIndex + 1).padStart(3, "0")}`;
      const buyerPublicId = `BUY-00${((listingIndex + templateIndex) % 4) + 1}`;
      const createdDaysAgo = 2 + listingIndex + templateIndex;
      const answeredDaysAgo = template.answer
        ? Math.max(1, createdDaysAgo - 1)
        : null;

      return {
        public_id: id,
        listing_id: getRequired(listingMap, listing[0], "Listing"),
        buyer_id: getRequired(userMap, buyerPublicId, "User"),
        question: template.text,
        answer: template.answer,
        status: template.answer ? ("ANSWERED" as const) : ("PENDING" as const),
        created_at: daysAgo(createdDaysAgo),
        answered_at: answeredDaysAgo === null ? null : daysAgo(answeredDaysAgo),
      };
    }),
  );

  await prisma.listingQuestion.createMany({
    data: listingQuestionsSeed,
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
    ].map((w: any) => ({
      user_id: getRequired(userMap, w[0], "User"),
      listing_id: getRequired(listingMap, w[1], "Listing"),
    })),
  });

  const orders = [
    [
      "ORD-1001",
      "BUY-001",
      "SLR-001",
      "COMPLETED",
      "DELIVERY",
      "Москва, Тверская 12",
      500,
      0,
      14,
      [["LST-001", 113900, 1]],
    ],
    [
      "ORD-1002",
      "BUY-002",
      "SLR-002",
      "PROCESSING",
      "PICKUP",
      null,
      0,
      0,
      9,
      [["LST-003", 98000, 1]],
    ],
    [
      "ORD-1003",
      "BUY-003",
      "SLR-003",
      "CREATED",
      "DELIVERY",
      "Казань, Баумана 9",
      700,
      0,
      7,
      [["LST-004", 24000, 1]],
    ],
    [
      "ORD-1004",
      "BUY-004",
      "SLR-004",
      "SHIPPED",
      "DELIVERY",
      "Сочи, Навагинская 15",
      600,
      0,
      6,
      [["LST-005", 18000, 1]],
    ],
    [
      "ORD-1005",
      "BUY-001",
      "SLR-005",
      "CANCELLED",
      "PICKUP",
      null,
      0,
      0,
      5,
      [["LST-007", 3500, 1]],
    ],
    [
      "ORD-1006",
      "BUY-004",
      "SLR-002",
      "PAID",
      "DELIVERY",
      "Сочи, Навагинская 15",
      400,
      0,
      4,
      [["LST-006", 3200, 1]],
    ],
    [
      "ORD-1007",
      "BUY-002",
      "SLR-003",
      "DELIVERED",
      "PICKUP",
      null,
      0,
      0,
      3,
      [["LST-009", 22000, 1]],
    ],
    [
      "ORD-1008",
      "BUY-003",
      "SLR-001",
      "PREPARED",
      "DELIVERY",
      "Казань, Пушкина 18",
      800,
      5000,
      2,
      [["LST-002", 165000, 1]],
    ],
    [
      "ORD-1009",
      "BUY-001",
      "SLR-002",
      "COMPLETED",
      "DELIVERY",
      "Москва, Тестовая 1",
      400,
      0,
      1,
      [["LST-010", 24900, 1]],
    ],
  ] as const;

  const orderMap = new Map<string, number>();
  for (const o of orders as unknown as any[]) {
    const itemsTotal = o[9].reduce(
      (acc: number, item: any) => acc + item[1] * item[2],
      0,
    );
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
          create: o[9].map((i: any) => ({
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
      [
        "ORD-1001",
        "CREATED",
        "PAID",
        "BUY-001",
        "Покупатель оплатил заказ",
        14,
      ],
      [
        "ORD-1001",
        "PAID",
        "COMPLETED",
        "SLR-001",
        "Заказ доставлен и подтвержден",
        13,
      ],
      ["ORD-1002", "CREATED", "PAID", "BUY-002", "Оплата прошла успешно", 9],
      [
        "ORD-1002",
        "PAID",
        "PROCESSING",
        "SLR-002",
        "Продавец начал обработку",
        8,
      ],
      [
        "ORD-1004",
        "PAID",
        "SHIPPED",
        "SLR-004",
        "Посылка передана в доставку",
        5,
      ],
      [
        "ORD-1005",
        "CREATED",
        "CANCELLED",
        "BUY-001",
        "Покупатель отменил заказ",
        5,
      ],
      ["ORD-1006", "CREATED", "PAID", "BUY-004", "Оплата завершена", 4],
      [
        "ORD-1007",
        "PROCESSING",
        "DELIVERED",
        "SLR-003",
        "Покупатель получил заказ",
        2,
      ],
      [
        "ORD-1008",
        "PAID",
        "PREPARED",
        "SLR-001",
        "Заказ собран и готов к отправке",
        1,
      ],
      ["ORD-1003", null, "CREATED", "BUY-003", "Заказ создан", 7],
      ["ORD-1009", "CREATED", "PAID", "BUY-001", "Покупатель оплатил заказ", 1],
      [
        "ORD-1009",
        "PAID",
        "COMPLETED",
        "SLR-002",
        "Тестовый заказ выдан покупателю",
        1,
      ],
    ].map((h: any) => ({
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
      [
        "TXN-1001",
        "ORD-1001",
        "BUY-001",
        "SLR-001",
        114400,
        "SUCCESS",
        3.5,
        4004,
        "YOOMONEY",
        "pi_1001",
        14,
      ],
      [
        "TXN-1002",
        "ORD-1002",
        "BUY-002",
        "SLR-002",
        98000,
        "HELD",
        4.5,
        4410,
        "STRIPE",
        "pi_1002",
        9,
      ],
      [
        "TXN-1003",
        "ORD-1003",
        "BUY-003",
        "SLR-003",
        24700,
        "PENDING",
        4.5,
        1112,
        "OTHER",
        "pi_1003",
        7,
      ],
      [
        "TXN-1004",
        "ORD-1004",
        "BUY-004",
        "SLR-004",
        18600,
        "SUCCESS",
        6,
        1116,
        "YOOMONEY",
        "pi_1004",
        6,
      ],
      [
        "TXN-1005",
        "ORD-1005",
        "BUY-001",
        "SLR-005",
        3500,
        "CANCELLED",
        6,
        210,
        "YOOMONEY",
        "pi_1005",
        5,
      ],
      [
        "TXN-1006",
        "ORD-1006",
        "BUY-004",
        "SLR-002",
        3600,
        "FAILED",
        4.5,
        162,
        "STRIPE",
        "pi_1006",
        4,
      ],
      [
        "TXN-1007",
        "ORD-1007",
        "BUY-002",
        "SLR-003",
        22000,
        "REFUNDED",
        4.5,
        990,
        "OTHER",
        "pi_1007",
        3,
      ],
      [
        "TXN-1008",
        "ORD-1008",
        "BUY-003",
        "SLR-001",
        160800,
        "SUCCESS",
        3.5,
        5628,
        "YOOMONEY",
        "pi_1008",
        2,
      ],
      [
        "TXN-1009",
        "ORD-1009",
        "BUY-001",
        "SLR-002",
        25300,
        "SUCCESS",
        4.5,
        1139,
        "YOOMONEY",
        "pi_1009",
        1,
      ],
    ].map((t: any) => ({
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
      [
        "CMP-001",
        "APPROVED",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-002",
        "Категория: Нарушение правил или обман\nПричина: Кажется, это мошенники\nКомментарий: Продавец уводит общение в сторонний канал и уклоняется от проверки товара.",
        null,
        4,
        "ADM-001",
        "Жалоба подтверждена, объявление ограничено",
      ],
      [
        "CMP-002",
        "PENDING",
        "suspicious_listing",
        "LST-002",
        "SLR-001",
        "BUY-003",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: Характеристики в карточке не совпадают с ответом продавца.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-003",
        "NEW",
        "other",
        "LST-005",
        "SLR-004",
        "BUY-001",
        "Категория: Общение с продавцом\nПричина: Невозможно связаться\nКомментарий: В разделе вопросов по объявлению нет ответа длительное время.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-004",
        "REJECTED",
        "suspicious_listing",
        "LST-001",
        "SLR-001",
        "BUY-004",
        "Категория: Информация в объявлении\nПричина: Неверная цена\nКомментарий: После проверки цена в карточке и характеристиках совпала.",
        null,
        8,
        "ADM-001",
        "Жалоба отклонена после проверки",
      ],
      [
        "CMP-005",
        "APPROVED",
        "other",
        "LST-008",
        "SLR-004",
        "BUY-004",
        "Категория: Общение с продавцом\nПричина: Хамство, грубость\nКомментарий: Есть некорректные ответы в разделе вопросов.",
        null,
        2,
        "ADM-001",
        "Подтверждено нарушение правил общения",
      ],
      [
        "CMP-006",
        "PENDING",
        "suspicious_listing",
        "LST-009",
        "SLR-003",
        "BUY-002",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: На фото и в описании указано иное состояние.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-007",
        "NEW",
        "suspicious_listing",
        "LST-011",
        "SLR-001",
        "BUY-001",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: Реальное состояние хуже, чем заявлено.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-008",
        "PENDING",
        "suspicious_listing",
        "LST-012",
        "SLR-002",
        "BUY-004",
        "Категория: Информация в объявлении\nПричина: Неверная цена\nКомментарий: Цена в заголовке и параметрах объявления отличается.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-009",
        "APPROVED",
        "fraud",
        "LST-014",
        "SLR-004",
        "BUY-002",
        "Категория: Нарушение правил или обман\nПричина: Чужие фото\nКомментарий: Фото совпадают с внешним источником, у продавца нет подтверждений.",
        null,
        6,
        "ADM-001",
        "Жалоба подтверждена, карточка снята с публикации",
      ],
      [
        "CMP-010",
        "NEW",
        "other",
        "LST-016",
        "SLR-002",
        "BUY-003",
        "Категория: Общение с продавцом\nПричина: Невозможно связаться\nКомментарий: На вопросы по объявлению ответы не поступают.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-011",
        "REJECTED",
        "other",
        "LST-003",
        "SLR-002",
        "BUY-001",
        "Категория: Общение с продавцом\nПричина: Невозможно связаться\nКомментарий: Жалоба продублирована, по первому обращению ответ уже дан.",
        null,
        10,
        "ADM-001",
        "Отклонено как дубликат",
      ],
      [
        "CMP-012",
        "PENDING",
        "suspicious_listing",
        "LST-013",
        "SLR-003",
        "BUY-004",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: Есть расхождения по комплектации.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-013",
        "APPROVED",
        "fraud",
        "LST-020",
        "SLR-002",
        "BUY-002",
        "Категория: Нарушение правил или обман\nПричина: Кажется, это мошенники\nКомментарий: Есть признаки фиктивного объявления и противоречия в описании.",
        null,
        3,
        "ADM-001",
        "Подтверждено подозрительное поведение",
      ],
      [
        "CMP-014",
        "NEW",
        "suspicious_listing",
        "LST-025",
        "SLR-003",
        "BUY-003",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: Обнаружены незаявленные дефекты.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-015",
        "PENDING",
        "other",
        "LST-022",
        "SLR-004",
        "BUY-001",
        "Категория: Общение с продавцом\nПричина: Хамство, грубость\nКомментарий: Продавец отвечает агрессивно и с оскорблениями.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-016",
        "NEW",
        "suspicious_listing",
        "LST-019",
        "SLR-001",
        "BUY-004",
        "Категория: Информация в объявлении\nПричина: Неверный адрес\nКомментарий: Адрес из объявления не подтверждается.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-017",
        "APPROVED",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-003",
        "Категория: Нарушение правил или обман\nПричина: Чужие фото\nКомментарий: Фото товара не принадлежат продавцу.",
        null,
        1,
        "ADM-001",
        "Жалоба подтверждена, объявление ограничено",
      ],
      [
        "CMP-018",
        "PENDING",
        "other",
        "LST-021",
        "SLR-003",
        "BUY-002",
        "Категория: Общение с продавцом\nПричина: Хамил в ответах на вопросы\nКомментарий: Есть жалобы на грубые ответы.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-019",
        "NEW",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-001",
        "Категория: Нарушение правил или обман\nПричина: Чужие фото\nКомментарий: Визуалы полностью совпадают с другим объявлением.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-020",
        "REJECTED",
        "suspicious_listing",
        "LST-010",
        "SLR-002",
        "BUY-004",
        "Категория: Информация в объявлении\nПричина: Неверная цена\nКомментарий: Ошибка не подтвердилась при проверке.",
        null,
        7,
        "ADM-001",
        "Нарушение не подтверждено",
      ],
      [
        "CMP-021",
        "NEW",
        "other",
        "LST-027",
        "SLR-001",
        "BUY-002",
        "Категория: Общение с продавцом\nПричина: Невозможно связаться\nКомментарий: Нет ответа более суток.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-022",
        "PENDING",
        "suspicious_listing",
        "LST-028",
        "SLR-002",
        "BUY-003",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: Есть расхождения по состоянию товара.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-023",
        "NEW",
        "suspicious_listing",
        "LST-029",
        "SLR-003",
        "BUY-004",
        "Категория: Информация в объявлении\nПричина: Объявление должно быть в другой категории\nКомментарий: Размещение в категории некорректно.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-024",
        "PENDING",
        "fraud",
        "LST-030",
        "SLR-004",
        "BUY-001",
        "Категория: Нарушение правил или обман\nПричина: Кажется, это мошенники\nКомментарий: Продавец уклоняется от проверки и меняет условия сделки.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-025",
        "NEW",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-001",
        "Категория: Нарушение правил или обман\nПричина: Кажется, это мошенники\nКомментарий: Настаивает на срочной сделке, избегая стандартных шагов.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-026",
        "PENDING",
        "other",
        "LST-026",
        "SLR-004",
        "BUY-004",
        "Категория: Общение с продавцом\nПричина: Невозможно связаться\nКомментарий: После публикации вопроса ответа в карточке нет длительное время.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-027",
        "NEW",
        "suspicious_listing",
        "LST-026",
        "SLR-004",
        "BUY-003",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: Фото не соответствуют текущему состоянию лота.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-028",
        "REJECTED",
        "other",
        "LST-026",
        "SLR-004",
        "BUY-002",
        "Категория: Общение с продавцом\nПричина: Невозможно связаться\nКомментарий: Повторное обращение без новых фактов.",
        null,
        9,
        "ADM-001",
        "Закрыто как дубликат",
      ],
      [
        "CMP-029",
        "PENDING",
        "suspicious_listing",
        "LST-026",
        "SLR-004",
        "BUY-001",
        "Категория: Информация в объявлении\nПричина: Неверная цена\nКомментарий: В заголовке и характеристиках объявления указаны разные цены.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-030",
        "NEW",
        "other",
        "LST-026",
        "SLR-004",
        "BUY-004",
        "Категория: Общение с продавцом\nПричина: Хамство, грубость\nКомментарий: Получены оскорбительные сообщения.",
        null,
        null,
        null,
        null,
      ],
      [
        "CMP-031",
        "APPROVED",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-003",
        "Категория: Нарушение правил или обман\nПричина: Чужие фото\nКомментарий: Подтверждено использование чужих материалов.",
        null,
        2,
        "ADM-001",
        "Жалоба подтверждена, приняты меры",
      ],
      [
        "CMP-032",
        "PENDING",
        "other",
        "LST-026",
        "SLR-004",
        "BUY-002",
        "Категория: Общение с продавцом\nПричина: Хамил в ответах на вопросы\nКомментарий: Некорректное поведение повторяется.",
        null,
        null,
        null,
        null,
      ],
    ].map((c: any) => ({
      public_id: c[0],
      status: "NEW",
      complaint_type: c[2],
      listing_id: getRequired(listingMap, c[3], "Listing"),
      seller_id: getRequired(userMap, c[4], "User"),
      reporter_id: getRequired(userMap, c[5], "User"),
      description: c[6],
      evidence: c[7],
      checked_at: null,
      checked_by_id: null,
      action_taken: null,
    })),
  });

  await prisma.kycRequest.createMany({
    data: [
      [
        "KYC-001",
        "APPROVED",
        "SLR-001",
        "seller1@ecomm.local",
        "+79002000101",
        "ООО Тех Поинт",
        "7701000001",
        "Москва, Профсоюзная 45",
        "doc1.zip",
        "Проверка пройдена",
        "ADM-001",
        60,
        null,
      ],
      [
        "KYC-002",
        "APPROVED",
        "SLR-002",
        "seller2@ecomm.local",
        "+79002000102",
        "ООО Мобайл Эксперт",
        "1651000002",
        "Казань, Пушкина 22",
        "doc2.zip",
        "Проверка пройдена",
        "ADM-001",
        52,
        null,
      ],
      [
        "KYC-003",
        "PENDING",
        "SLR-003",
        "seller3@ecomm.local",
        "+79002000103",
        "ООО Домашний Комфорт",
        "6601000003",
        "Екатеринбург, Малышева 36",
        "doc3.zip",
        "Ожидает проверки",
        null,
        null,
        null,
      ],
      [
        "KYC-004",
        "REJECTED",
        "SLR-004",
        "seller4@ecomm.local",
        "+79002000104",
        "ООО Сервис Хаб",
        "2301000004",
        "Краснодар, Красная 120",
        "doc4.zip",
        "Пакет документов неполный",
        "ADM-001",
        11,
        "Не хватает подтверждения адреса",
      ],
      [
        "KYC-005",
        "PENDING",
        "SLR-005",
        "seller5@ecomm.local",
        "+79002000105",
        "ИП КвикФикс Про",
        "7701000005",
        "Москва, Ленинградский проспект 80",
        "doc5.zip",
        null,
        null,
        null,
        null,
      ],
    ].map((k: any) => ({
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
      reviewed_by_id:
        k[10] === null ? null : getRequired(userMap, k[10], "User"),
      reviewed_at: k[11] === null ? null : daysAgo(k[11]),
      rejection_reason: k[12],
    })),
  });

  await prisma.partnershipRequest.createMany({
    data: [
      [
        "PRQ-001",
        "BUY-001",
        "COMPANY",
        "ООО Север Трейд",
        "north.trade@example.com",
        "+79003000101",
        "https://north.example.com",
        "Электроника",
        "7702000001",
        "Москва",
        "@north",
        "Работают с 2018 года",
        "Нужны безопасные сделки и стабильный трафик",
      ],
      [
        "PRQ-002",
        "BUY-002",
        "INDIVIDUAL",
        "Павел Соколов",
        "pavel@example.com",
        "+79003000102",
        "https://pavel.example.com",
        "Ремонт",
        "5403000002",
        "Санкт-Петербург",
        "@pavel",
        "Опыт работы 5 лет",
        "Нужен стабильный поток заказов",
      ],
      [
        "PRQ-003",
        "BUY-003",
        "PRIVATE",
        "Ирина Петрова",
        "irina@example.com",
        "+79003000103",
        "https://irina.example.com",
        "Бытовая техника",
        null,
        "Казань",
        "@irina",
        "Локальный топ-продавец",
        "Планирую масштабировать продажи",
      ],
      [
        "PRQ-004",
        "BUY-004",
        "COMPANY",
        "ООО Морской Бриз",
        "hello@seabreeze.example.com",
        "+79003000104",
        "https://seabreeze.example.com",
        "Установка",
        "2302000004",
        "Сочи",
        "@seabreeze",
        "Сертифицированные мастера",
        "Нужна защита в спорных ситуациях",
      ],
      [
        "PRQ-005",
        "BUY-004",
        "INDIVIDUAL",
        "Дмитрий Федоров",
        "dmitry@example.com",
        "+79003000105",
        "https://dmitry.example.com",
        "Электроника",
        "5403000005",
        "Новосибирск",
        "@dmitry",
        "Более 2000 отзывов на внешних площадках",
        "Нужна аналитика и рост продаж",
      ],
      [
        "PRQ-006",
        "SLR-004",
        "COMPANY",
        "Филиал Сервис Хаб",
        "branch@servicehub.example.com",
        "+79003000106",
        "https://servicehub.example.com/branch",
        "Установка",
        "2302000006",
        "Краснодар",
        "@servicehub",
        "Выход в новые регионы",
        "Хочу развивать продажи в нескольких городах",
      ],
    ].map((p: any) => ({
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
      [
        "AUD-001",
        "complaint.status_changed",
        "complaint",
        "CMP-001",
        { доСтатуса: "NEW", послеСтатуса: "APPROVED" },
        4,
      ],
      [
        "AUD-002",
        "kyc.status_changed",
        "kyc_request",
        "KYC-004",
        { доСтатуса: "PENDING", послеСтатуса: "REJECTED" },
        11,
      ],
      [
        "AUD-003",
        "listing.moderation_changed",
        "listing",
        "LST-007",
        { доМодерации: "PENDING", послеМодерации: "REJECTED" },
        12,
      ],
      [
        "AUD-004",
        "user.status_changed",
        "user",
        "SLR-005",
        { доСтатуса: "ACTIVE", послеСтатуса: "BLOCKED" },
        10,
      ],
      [
        "AUD-005",
        "commission_tier.rate_changed",
        "commission_tier",
        "TIER-002",
        { доСтавки: 5, послеСтавки: 4.5 },
        3,
      ],
      [
        "AUD-006",
        "listing.moderation_changed",
        "listing",
        "LST-005",
        { доМодерации: "APPROVED", послеМодерации: "PENDING" },
        1,
      ],
    ].map((a: any) => ({
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

  const allListings = await prisma.marketplaceListing.findMany({
    select: { id: true },
  });
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

  const [
    usersCount,
    notificationsCount,
    addressesCount,
    tiersCount,
    sellerProfilesCount,
    categoriesCount,
    subcategoriesCount,
    itemsCount,
    listingsCount,
    imagesCount,
    attributesCount,
    reviewsCount,
    questionsCount,
    wishlistCount,
    ordersCount,
    orderItemsCount,
    orderHistoryCount,
    transactionsCount,
    complaintsCount,
    kycCount,
    partnershipCount,
    auditCount,
  ] = await Promise.all([
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
  console.log(`Пользователи=${usersCount}, Уведомления=${notificationsCount}`);
  console.log(
    `Адреса=${addressesCount}, УровниКомиссий=${tiersCount}, ПрофилиПродавцов=${sellerProfilesCount}`,
  );
  console.log(
    `Категории=${categoriesCount}, Подкатегории=${subcategoriesCount}, ПозицииКаталога=${itemsCount}`,
  );
  console.log(
    `Объявления=${listingsCount}, Изображения=${imagesCount}, Атрибуты=${attributesCount}`,
  );
  console.log(
    `Отзывы=${reviewsCount}, Вопросы=${questionsCount}, Избранное=${wishlistCount}`,
  );
  console.log(
    `Заказы=${ordersCount}, ПозицииЗаказов=${orderItemsCount}, ИсторияСтатусовЗаказов=${orderHistoryCount}`,
  );
  console.log(
    `Транзакции=${transactionsCount}, Жалобы=${complaintsCount}, ЗаявкиKYC=${kycCount}`,
  );
  console.log(
    `ПартнерскиеЗаявки=${partnershipCount}, ЖурналАудита=${auditCount}`,
  );

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
