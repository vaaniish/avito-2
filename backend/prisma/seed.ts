import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import fs from "node:fs";
import path from "node:path";
import { getPasswordHashSaltRounds } from "../src/common/config/password-hash";
import { syncListingSearchKeywords } from "../src/modules/catalog/catalog-search.shared";
import { generateCartCrossSellRuleSeeds } from "../src/modules/recommendations/domain/cart-cross-sell.helpers";
import { dnsProductCatalogSeed } from "./dns-product-catalog.seed";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Переменная DATABASE_URL не задана");

function assertDemoSeedTarget(rawUrl: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo seed запрещён при NODE_ENV=production");
  }
  if (process.env.DEMO_SEED_CONFIRM !== "DELETE_LOCAL_DEMO_DATA") {
    throw new Error("Для destructive demo-seed задайте DEMO_SEED_CONFIRM=DELETE_LOCAL_DEMO_DATA");
  }
  const target = new URL(rawUrl);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(target.hostname)) {
    throw new Error("Demo seed разрешён только для локального PostgreSQL");
  }
  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, "")).trim();
  if (!databaseName || ["postgres", "template0", "template1"].includes(databaseName)) {
    throw new Error("Укажите отдельную development/test БД для demo-seed");
  }
}

assertDemoSeedTarget(databaseUrl);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const PASSWORD_HASH_SALT_ROUNDS = getPasswordHashSaltRounds();

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

async function seedCartCrossSellRules(items: Array<{
  id: number;
  public_id: string;
  name: string;
  subcategory: {
    id: number;
    public_id: string;
    name: string;
    category: {
      id: number;
      public_id: string;
      name: string;
    };
  };
}>): Promise<void> {
  const rules = generateCartCrossSellRuleSeeds(items);
  const coveredSourceItemIds = new Set(
    rules
      .map((rule) => rule.source_item_id)
      .filter((value): value is number => value !== null && Number.isInteger(value) && value > 0),
  );
  const uncovered = items.filter((item) => !coveredSourceItemIds.has(item.id));
  if (uncovered.length > 0) {
    throw new Error(
      `Cross-sell seed не покрывает ${uncovered.length} кластеров каталога: ${uncovered
        .slice(0, 10)
        .map((item) => item.name)
        .join(", ")}`,
    );
  }

  await createManyInChunks(
    "CartCrossSellRule",
    rules,
    (chunk) =>
      prisma.cartCrossSellRule.createMany({
        data: chunk,
      }),
  );
}

async function main(): Promise<void> {
  console.log("Очистка таблиц...");
  await prisma.adminIdempotencyKey.deleteMany();
  await prisma.checkoutIdempotencyKey.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.complaintSanction.deleteMany();
  await prisma.complaintEvent.deleteMany();
  await prisma.orderStatusHistory.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.kycRequest.deleteMany();
  await prisma.sellerCommissionPeriodStat.deleteMany();
  await prisma.policyAcceptance.deleteMany();
  await prisma.platformPolicy.deleteMany();
  await prisma.platformTransaction.deleteMany();
  await prisma.promoActivation.deleteMany();
  await prisma.promoScopeTarget.deleteMany();
  await prisma.promoCode.deleteMany();
  await prisma.marketOrderItem.deleteMany();
  await prisma.marketOrder.deleteMany();
  await prisma.listingQuestion.deleteMany();
  await prisma.listingReview.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.cartCrossSellRule.deleteMany();
  await prisma.listingModerationEvent.deleteMany();
  await prisma.listingSearchKeyword.deleteMany();
  await prisma.listingAttribute.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.listingDraft.deleteMany();
  await prisma.marketplaceListing.deleteMany();
  await prisma.partnerOnboardingProfile.deleteMany();
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
  ] as const;

  const cityRegionMap = new Map(cities.map(([name, region]) => [name, region]));

  const users = [
    [
      "ADM-001",
      "ADMIN",
      "ACTIVE",
      "admin@ecomm.local",
      "DemoAdmin2026!",
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
      "DemoBuyer2026!",
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
      "DemoBuyer2026!",
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
      "DemoBuyer2026!",
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
      "DemoBuyer2026!",
      "Ольга Волкова",
      "olga_volkova",
      "Сочи",
      140,
      "+79001000104",
      null,
    ],
    [
      "BUY-005",
      "BUYER",
      "BLOCKED",
      "buyer5@ecomm.local",
      "DemoBuyer2026!",
      "Алексей Левин",
      "alex_levin",
      "Нижний Новгород",
      90,
      "+79001000105",
      "Агрессивное общение с продавцами и спам-жалобы",
    ],
    [
      "BUY-006",
      "BUYER",
      "ACTIVE",
      "buyer6@ecomm.local",
      "DemoBuyer2026!",
      "Мария Крылова",
      "maria_krylova",
      "Новосибирск",
      75,
      "+79001000106",
      null,
    ],
    [
      "BUY-007",
      "BUYER",
      "ACTIVE",
      "buyer7@ecomm.local",
      "DemoBuyer2026!",
      "Дмитрий Захаров",
      "dmitry_zakharov",
      "Москва",
      55,
      "+79001000107",
      null,
    ],
    [
      "SLR-001",
      "SELLER",
      "ACTIVE",
      "seller1@ecomm.local",
      "DemoSeller2026!",
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
      "DemoSeller2026!",
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
      "DemoSeller2026!",
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
      "DemoSeller2026!",
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
      "DemoSeller2026!",
      "КвикФикс Про",
      "quickfix_pro",
      "Москва",
      70,
      "+79002000105",
      "Просьбы об оплате вне платформы",
    ],
    [
      "SLR-006",
      "SELLER",
      "ACTIVE",
      "seller6@ecomm.local",
      "DemoSeller2026!",
      "Сетевой Контур",
      "network_contour",
      "Новосибирск",
      95,
      "+79002000106",
      null,
    ],
  ] as const;

  await prisma.appUser.createMany({
    data: await Promise.all(
      users.map(async (u) => ({
        public_id: u[0],
        role: u[1],
        status: u[2],
        email: u[3],
        work_email: u[1] === "SELLER" ? u[3] : null,
        password: await bcrypt.hash(u[4], PASSWORD_HASH_SALT_ROUNDS),
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

  await prisma.promoCode.create({
    data: {
      public_id: "PRM-START15",
      code: "START15",
      discount_type: "PERCENT",
      discount_value: 15,
      min_subtotal: 0,
      max_activations: 100,
      per_user_limit: 1,
      starts_at: daysAgo(90),
      ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      is_enabled: true,
      all_catalog: true,
      is_system: true,
      legacy_rule: "FIRST_PAID_ORDER_100_BUYERS",
      created_by_id: getRequired(userMap, "ADM-001", "Admin user"),
      updated_by_id: getRequired(userMap, "ADM-001", "Admin user"),
    },
  });

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
      ["POL-CHECKOUT-v1", "BUY-005"],
      ["POL-CHECKOUT-v1", "BUY-006"],
      ["POL-CHECKOUT-v1", "BUY-007"],
      ["POL-CHECKOUT-v1", "SLR-001"],
      ["POL-CHECKOUT-v1", "SLR-002"],
      ["POL-CHECKOUT-v1", "SLR-003"],
      ["POL-CHECKOUT-v1", "SLR-004"],
      ["POL-CHECKOUT-v1", "SLR-006"],
      ["POL-PARTNERSHIP-v1", "BUY-001"],
      ["POL-PARTNERSHIP-v1", "BUY-002"],
      ["POL-PARTNERSHIP-v1", "BUY-003"],
      ["POL-PARTNERSHIP-v1", "BUY-004"],
      ["POL-PARTNERSHIP-v1", "BUY-006"],
      ["POL-PARTNERSHIP-v1", "BUY-007"],
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
      [
        "BUY-005",
        "дом",
        "Нижний Новгород",
        "Большая Покровская",
        "17",
        "603005",
        true,
      ],
      [
        "BUY-006",
        "дом",
        "Новосибирск",
        "Красный проспект",
        "49",
        "630091",
        true,
      ],
      ["BUY-007", "дом", "Москва", "Щепкина", "31", "129090", true],
      ["SLR-001", "склад", "Москва", "Профсоюзная", "45", "117335", true],
      ["SLR-002", "склад", "Казань", "Пушкина", "22", "420015", true],
      ["SLR-003", "склад", "Екатеринбург", "Малышева", "36", "620014", true],
      ["SLR-004", "склад", "Краснодар", "Красная", "120", "350000", true],
      ["SLR-006", "склад", "Новосибирск", "Фрунзе", "86", "630005", true],
    ].map((a: any) => ({
      ...(() => {
        const cityName = a[2];
        const regionName = getRequired(cityRegionMap, cityName, "City region");
        const house = a[4];
        return {
          region: regionName,
          city: cityName,
          house,
        };
      })(),
      user_id: getRequired(userMap, a[0], "User"),
      label: a[1],
      street: a[3],
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
      ["SLR-006", true, 29, "TIER-003"],
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
      [
        "PAY-006",
        "SLR-006",
        "COMPANY",
        "ООО Сетевой Контур",
        "5408123456",
        "40702810900000000006",
        "044525225",
        "30101810400000000225",
        "ПАО Сбербанк",
        "ООО Сетевой Контур",
        "VERIFIED",
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
      verified_by_id:
        p[10] === "VERIFIED" ? getRequired(userMap, "ADM-001", "User") : null,
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
          id: true,
          public_id: true,
          name: true,
          category: {
            select: {
              id: true,
              public_id: true,
              name: true,
            },
          },
        },
      },
    },
  });
  await seedCatalogReferenceData(catalogReferenceItemRows);
  await seedCartCrossSellRules(catalogReferenceItemRows);

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
  )
    .filter(([item]) => itemMap.has(item))
    .flatMap(([item, config]) => {
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

  await prisma.catalogSuggestion.createMany({
    data: [
      [
        "CSG-001",
        "ITEM",
        "PENDING",
        "PRODUCT",
        null,
        "sub-smartphones-gadgets",
        null,
        "Смарт-часы и браслеты",
        "Покупатели часто ищут умные часы отдельным типом товара, а продавцы вынуждены выбирать неподходящие категории",
        null,
        null,
        null,
        4,
      ],
      [
        "CSG-002",
        "MANUFACTURER",
        "AUTO_APPROVED",
        "PRODUCT",
        null,
        null,
        "ITM-001",
        "Nothing",
        "Бренд часто встречается в пользовательских карточках",
        null,
        "ADM-001",
        2,
        9,
      ],
      [
        "CSG-003",
        "MODEL",
        "APPROVED",
        "PRODUCT",
        null,
        null,
        "ITM-003",
        "Zenbook S 14",
        "Модель подтверждена через справочник продавца",
        null,
        "ADM-001",
        3,
        6,
      ],
      [
        "CSG-004",
        "ATTRIBUTE_VALUE",
        "REJECTED",
        "PRODUCT",
        null,
        null,
        "ITM-042",
        "Сверхтихий",
        "Пользователь предложил маркетинговое, а не справочное значение",
        "Отклонено как нерелевантное каталожное значение.",
        "ADM-001",
        4,
        2,
      ],
      [
        "CSG-005",
        "ATTRIBUTE_SCHEMA",
        "PENDING",
        "PRODUCT",
        null,
        null,
        "ITM-006",
        "Нужна характеристика уровня шума",
        "Продавцы роботов-пылесосов часто просят этот атрибут",
        null,
        null,
        null,
        5,
      ],
      [
        "CSG-006",
        "CATEGORY",
        "MERGED",
        "PRODUCT",
        null,
        null,
        null,
        "Умный дом",
        "Заявка объединена с существующей категорией сети и автоматизации",
        "Слито с существующей структурой каталога.",
        "ADM-001",
        6,
        7,
      ],
      [
        "CSG-007",
        "SUBCATEGORY",
        "APPROVED",
        "PRODUCT",
        "cat-smartphones",
        null,
        null,
        "Восстановленные смартфоны",
        "Подкатегория нужна для демо витрины trade-in",
        "Одобрено для дальнейшей настройки атрибутов.",
        "ADM-001",
        2,
        5,
      ],
      [
        "CSG-008",
        "ATTRIBUTE_VALUE",
        "PENDING",
        "PRODUCT",
        null,
        null,
        "ITM-047",
        "Titanium Graphite",
        "Цвет Apple Watch встречается в поступающих объявлениях",
        null,
        null,
        null,
        3,
      ],
    ].map((suggestion: any) => {
      const createdDaysAgo = Number(suggestion[suggestion.length - 1] ?? 1);
      const payloadByPublicId: Record<string, Record<string, string>> = {
        "CSG-001": {
          categoryName: "Электроника",
          subcategoryName: "Носимая электроника",
          proposedItem: "Смарт-часы и браслеты",
          brand: "Amazfit",
          model: "GTR 4",
          importantAttributes:
            "Экран: AMOLED 1.43\"; Навигация: GPS; Защита: 5 ATM; Автономность: до 14 дней; Датчики: пульс, SpO2, сон",
          link: "https://amazfit.example.com/gtr-4",
          email: "catalog@techpoint.example.com",
          photoName: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
          photoLabel: "Фото товара и упаковки",
          comment:
            "Покупатели часто ищут умные часы отдельным типом товара, сейчас продавцы выбирают неподходящие категории. Нужны поля для автономности, влагозащиты и датчиков здоровья.",
        },
        "CSG-005": {
          categoryName: "Техника для дома",
          subcategoryName: "Роботы-пылесосы",
          proposedItem: "Роботы-пылесосы с самоочисткой",
          brand: "Roborock",
          model: "S8 MaxV Ultra",
          importantAttributes:
            "Уровень шума: до 67 дБ; Станция: самоочистка и сушка; Навигация: лидар; Влажная уборка: есть",
          email: "assortment@homecomfort.example.com",
          comment:
            "В карточках роботов-пылесосов покупатели регулярно спрашивают уровень шума и тип станции, сейчас эти признаки не выделены в справочнике.",
        },
        "CSG-008": {
          categoryName: "Электроника",
          subcategoryName: "Носимая электроника",
          proposedItem: "Смарт-часы",
          brand: "Apple",
          model: "Watch Series 9 45mm",
          importantAttributes:
            "Цвет корпуса: Titanium Graphite; Размер: 45 мм; Связь: GPS; Ремешок: sport band",
          email: "catalog@mobileexpert.example.com",
          comment:
            "Цвет Titanium Graphite часто встречается в поставках, но отсутствует среди нормализованных значений.",
        },
      };
      return {
        public_id: suggestion[0],
        entity_type: suggestion[1],
        status: suggestion[2],
        type: suggestion[3],
        category_id:
          suggestion[4] === null ? null : getRequired(categoryMap, suggestion[4], "Category"),
        subcategory_id:
          suggestion[5] === null
            ? null
            : getRequired(subcategoryMap, suggestion[5], "Subcategory"),
        item_id:
          suggestion[6] === null ? null : getRequired(itemMap, suggestion[6], "Item"),
        proposed_by_id: getRequired(userMap, "SLR-006", "User"),
        raw_value: suggestion[7],
        normalized_value: suggestion[7].toLocaleLowerCase("ru-RU"),
        reason: suggestion[8],
        admin_note: suggestion[9],
        payload: payloadByPublicId[suggestion[0]] ?? undefined,
        reviewed_by_id:
          suggestion[10] === null ? null : getRequired(userMap, suggestion[10], "User"),
        reviewed_at:
          suggestion[11] === null ? null : daysAgo(suggestion[11]),
        usage_count: suggestion[12] ?? 1,
        merged_target_public_id:
          suggestion[2] === "MERGED" ? "cat-network" : null,
        created_at: daysAgo(createdDaysAgo),
        updated_at: daysAgo(Math.max(0, createdDaysAgo - 1)),
      };
    }),
  });

  const catalogItemSeedMap = new Map(
    (
      await prisma.catalogItem.findMany({
        select: {
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
      })
    ).map((item) => [item.public_id, item]),
  );

  const backendPort = Number(process.env.PORT ?? 3001);
  const seedMediaBaseUrl = (
    process.env.SEED_MEDIA_BASE_URL ?? `http://127.0.0.1:${backendPort}/media/seed`
  ).replace(/\/$/, "");

  const listingSeedImageMap: Record<string, string[]> = {
    "LST-001": [`${seedMediaBaseUrl}/iphone-15-pro.png`],
    "LST-002": [`${seedMediaBaseUrl}/macbook-air.png`],
    "LST-003": [`${seedMediaBaseUrl}/galaxy-s24.jpg`],
    "LST-004": [`${seedMediaBaseUrl}/dreame-d10-plus.jpg`],
    "LST-005": [`${seedMediaBaseUrl}/samsung-ru7100.jpg`],
    "LST-006": [`${seedMediaBaseUrl}/apple-finewoven-case.jpeg`],
    "LST-007": [`${seedMediaBaseUrl}/samsung-45w-charger.jpg`],
    "LST-008": [`${seedMediaBaseUrl}/logitech-c920.jpg`],
    "LST-009": [`${seedMediaBaseUrl}/delonghi-magnifica.webp`],
    "LST-010": [`${seedMediaBaseUrl}/sony-wh-1000xm5.jpg`],
    "LST-011": [`${seedMediaBaseUrl}/galaxy-s24.jpg`],
    "LST-012": [`${seedMediaBaseUrl}/iphone-15.png`],
    "LST-013": [`${seedMediaBaseUrl}/macbook-air.png`],
    "LST-014": [`${seedMediaBaseUrl}/thinkpad-x1-carbon.jpg`],
    "LST-015": [`${seedMediaBaseUrl}/dreame-d10s-plus.jpg`],
    "LST-016": [`${seedMediaBaseUrl}/delonghi-dinamica-plus.jpg`],
    "LST-017": [`${seedMediaBaseUrl}/lg-uk6300.jpg`],
    "LST-018": [`${seedMediaBaseUrl}/airpods-pro-2.png`],
    "LST-019": [`${seedMediaBaseUrl}/spigen-tough-armor.jpg`],
    "LST-020": [`${seedMediaBaseUrl}/galaxy-ring.jpg`],
    "LST-021": [`${seedMediaBaseUrl}/ugreen-65w.jpg`],
    "LST-022": [`${seedMediaBaseUrl}/lenovo-90w-adapter.jpg`],
    "LST-023": [`${seedMediaBaseUrl}/thinkpad-x1-carbon.jpg`],
    "LST-024": [`${seedMediaBaseUrl}/macbook-air.png`],
    "LST-025": [`${seedMediaBaseUrl}/galaxy-s24.jpg`],
    "LST-026": [`${seedMediaBaseUrl}/iphone-15-pro.png`],
    "LST-027": [`${seedMediaBaseUrl}/roborock-s8-maxv.jpg`],
    "LST-028": [`${seedMediaBaseUrl}/delonghi-dinamica-plus.jpg`],
    "LST-029": [`${seedMediaBaseUrl}/philips-50pus8518.png`],
    "LST-030": [`${seedMediaBaseUrl}/jbl-charge-5.jpg`],
    "LST-031": [`${seedMediaBaseUrl}/apple-watch-series-9.png`],
    "LST-032": [`${seedMediaBaseUrl}/huawei-watch-kids-4-pro.jpg`],
  };

  const itemIdsWithBattery = new Set(
    Object.entries(effectiveItemSchemaMatrix)
      .filter(([, config]) => config.fields.some((field) => field.key === "battery_health"))
      .map(([itemId]) => itemId),
  );

  const numericSeedByKey: Record<string, number> = {
    battery_health: 88,
    screen_size: 15.6,
    diagonal: 55,
    gamepads_count: 2,
    memory_size: 12,
    length_mm: 320,
    warranty_months_left: 10,
    modules_count: 2,
    ports_count: 8,
    load_kg: 7,
    burnes_count: 4,
    burners_count: 4,
    cups_count: 4200,
    pressure_bar: 15,
    water_tank_l: 1.8,
    total_volume: 320,
    height: 186,
    width: 60,
    volume: 72,
    room_area: 24,
    power: 1800,
    load: 7,
    suction_power_pa: 7000,
  };

  const textSeedByKey: Record<string, string> = {
    storage: "256 ГБ",
    cpu: "Intel Core i5",
    ram: "16 ГБ",
    gpu: "Встроенная графика",
    color: "Черный",
    resolution: "4K UHD",
    matrix_type: "IPS",
    refresh_rate: "144 Гц",
    power: "1800 Вт",
    channels: "2.1",
    headphone_type: "Полноразмерные",
    microphone_type: "Конденсаторный",
    platform: "Универсальная",
    power_source: "Аккумулятор",
    sensors: "Пульс, шаги, сон",
    wifi_standard: "Wi-Fi 6",
    bands: "2.4 / 5 ГГц",
    ports: "1x WAN, 4x LAN",
    speed: "до 3000 Мбит/с",
    network_type: "4G/5G",
    standards: "LTE / NR",
    camera_type: "Беззеркальная",
    mount: "Sony E",
    shutter_count: "12000 кадров",
    focal_length: "24-70 мм",
    aperture: "f/2.8",
    storage_media: "SDXC",
    technology: "Звуковая",
    ac_type: "Сплит-система",
    install_state: "Демонтаж не требуется",
    heater_type: "Конвектор",
    filter_condition: "Новый фильтр",
    filter_type: "HEPA",
    humidifier_type: "Ультразвуковой",
    navigation: "Лидар",
    base: "Самоочистка",
    fridge_type: "Двухкамерный",
    oven_type: "Электрический",
    connection_type: "220 В",
    panel_type: "Индукционная",
    install_type: "Встраиваемая",
    coffee_machine_type: "Автоматическая",
    power_pressure: "1450 Вт / 15 бар",
    water_tank: "1.8 л",
    device_type: "Погружной блендер",
    attachments: "Насадка-венчик, измельчитель",
    programs: "Экспресс, крупы, тушение, выпечка",
    waterproof: "IP67",
    os_compatibility: "iOS / Android",
    active_area: "10 x 6 дюймов",
    compatibility: "Apple Watch / Wear OS",
    format_os: "EPUB / MOBI",
    coverage_area: "до 160 м2",
    port_speed: "1 Гбит/с",
    room_area: "до 24 м2",
  };

  const titleStoragePresets = [
    { pattern: /1\s?TB/i, value: "1 ТБ" },
    { pattern: /512/i, value: "512 ГБ" },
    { pattern: /256/i, value: "256 ГБ" },
    { pattern: /128/i, value: "128 ГБ" },
    { pattern: /64/i, value: "64 ГБ" },
  ];

  function listingImageUrls(listingPublicId: string): string[] {
    return listingSeedImageMap[listingPublicId] ?? [`${seedMediaBaseUrl}/iphone-15.png`];
  }

  function normalizeNumericSeed(value: number): string {
    return Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, "");
  }

  function pickSeedNumber(field: AttributeDraft, condition: "NEW" | "USED"): string {
    const min = field.min ?? 1;
    const max = field.max ?? Math.max(min + 10, min);
    const preset = numericSeedByKey[field.key];
    const rawValue =
      field.key === "battery_health"
        ? condition === "NEW"
          ? 100
          : 86
        : preset ?? (min + max) / 2;
    const bounded = Math.min(max, Math.max(min, rawValue));
    return normalizeNumericSeed(bounded);
  }

  function pickSeedText(
    field: AttributeDraft,
    title: string,
    itemName: string,
    condition: "NEW" | "USED",
  ): string {
    if (field.key === "model") return title;
    if (field.key === "storage") {
      return (
        titleStoragePresets.find((preset) => preset.pattern.test(title))?.value ??
        textSeedByKey[field.key] ??
        "256 ГБ"
      );
    }
    if (field.key === "ram") {
      const match = title.match(/(\d{1,3})\s*\/\s*(\d{2,4})/);
      return match ? `${match[1]} ГБ` : "16 ГБ";
    }
    if (field.key === "cpu" && /M[1-4]/i.test(title)) {
      return title.match(/M[1-4]/i)?.[0] ?? "Apple M3";
    }
    if (field.key === "included") {
      return condition === "NEW"
        ? "Коробка, документы, кабель питания"
        : "Зарядка, кабель, базовый комплект";
    }
    if (field.key === "defects_description") {
      return condition === "NEW"
        ? "Визуальных дефектов не обнаружено"
        : "Есть следы аккуратной эксплуатации, на работу не влияют";
    }
    if (field.key === "important_attributes") {
      return `Подходит для сценария: ${itemName.toLowerCase()}, безопасная сделка через платформу.`;
    }
    return textSeedByKey[field.key] ?? `${itemName} в хорошем состоянии`;
  }

  function pickSeedSelect(field: AttributeDraft, condition: "NEW" | "USED"): string {
    const options = field.options ?? [];
    if (field.key === "battery_health") {
      return condition === "NEW" ? "100" : "86";
    }
    if (field.key === "screen_state") {
      return condition === "NEW" ? "Без дефектов" : "Есть царапины";
    }
    if (field.key === "noise_canceling" && options.includes("Есть")) {
      return "Есть";
    }
    return (
      options.find(
        (option) =>
          option !== "Не знаю" && option !== "Другое / предложить значение",
      ) ??
      options[0] ??
      ""
    );
  }

  function buildListingAttributes(params: {
    itemPublicId: string;
    city: string;
    condition: "NEW" | "USED";
    title: string;
  }): Array<{ key: string; value: string }> {
    const item = getRequired(catalogItemSeedMap, params.itemPublicId, "Catalog item");
    const schema = effectiveItemSchemaMatrix[params.itemPublicId];
    const attributes: Array<{ key: string; value: string }> = [
      {
        key: "Состояние",
        value: params.condition === "NEW" ? "Новое" : "Б/У",
      },
      {
        key: "Город",
        value: params.city,
      },
    ];
    if (!schema) return attributes;

    for (const field of schema.fields) {
      let value = "";
      if (field.inputType === "number") {
        value = pickSeedNumber(field, params.condition);
      } else if (field.inputType === "select") {
        value = pickSeedSelect(field, params.condition);
      } else {
        value = pickSeedText(field, params.title, item.name, params.condition);
      }
      if (!value) continue;
      attributes.push({ key: field.label, value });
    }

    return Array.from(
      new Map(
        attributes.map((attribute) => [
          attribute.key.toLocaleLowerCase("ru-RU"),
          attribute,
        ]),
      ).values(),
    );
  }

  function buildListingDescription(params: {
    title: string;
    itemPublicId: string;
    condition: "NEW" | "USED";
    city: string;
  }): string {
    const item = getRequired(catalogItemSeedMap, params.itemPublicId, "Catalog item");
    const conditionText =
      params.condition === "NEW"
        ? "новый товар в полной комплектации"
        : "аккуратно использовался, полностью исправен и проверен перед публикацией";
    return [
      `${params.title} из категории «${item.name}».`,
      `Продавец находится в городе ${params.city}, формат сделки проходит через платформу.`,
      `Состояние: ${conditionText}.`,
      "Фото актуальные, характеристики заполнены по утвержденной схеме каталога, возможна доставка или самовывоз по договоренности.",
    ].join(" ");
  }

  function buildTechState(itemPublicId: string, condition: "NEW" | "USED") {
    if (!itemIdsWithBattery.has(itemPublicId)) return null;
    return {
      tech_grade: condition === "NEW" ? "A_PLUS" : "B",
      tech_battery_health: condition === "NEW" ? 100 : 86,
      tech_defects:
        condition === "NEW"
          ? "Дефекты не обнаружены"
          : "Легкие следы эксплуатации на корпусе",
      tech_included:
        condition === "NEW"
          ? "Коробка, документы, кабель питания"
          : "Кабель питания, защитный чехол, чек",
    };
  }

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
      "DreameBot D10 Plus",
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
      "Samsung RU7100 55\"",
      38000,
      null,
      "USED",
      "MODERATION",
      "PENDING",
      109,
      false,
    ],
    [
      "LST-006",
      "SLR-002",
      "ITM-019",
      "Казань",
      "PRODUCT",
      "Apple FineWoven Case with MagSafe for iPhone 15",
      3200,
      null,
      "NEW",
      "ACTIVE",
      "APPROVED",
      86,
      true,
    ],
    [
      "LST-007",
      "SLR-005",
      "ITM-022",
      "Москва",
      "PRODUCT",
      "Samsung 45W Super Fast Charger USB-C",
      3500,
      null,
      "NEW",
      "INACTIVE",
      "REJECTED",
      41,
      false,
    ],
    [
      "LST-008",
      "SLR-004",
      "ITM-018",
      "Краснодар",
      "PRODUCT",
      "Logitech C920 HD Pro",
      6900,
      6400,
      "NEW",
      "ACTIVE",
      "APPROVED",
      133,
      true,
    ],
    [
      "LST-009",
      "SLR-003",
      "ITM-005",
      "Екатеринбург",
      "PRODUCT",
      "DeLonghi Magnifica S ECAM22.110.B",
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
      "DreameBot D10s Plus",
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
      "DeLonghi Dinamica Plus ECAM370.95.T",
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
      "LG 43UK6300 43\"",
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
      "LST-019",
      "SLR-001",
      "ITM-020",
      "Москва",
      "PRODUCT",
      "Spigen Tough Armor for Galaxy S24",
      1900,
      null,
      "NEW",
      "ACTIVE",
      "APPROVED",
      97,
      true,
    ],
    [
      "LST-020",
      "SLR-002",
      "ITM-021",
      "Казань",
      "PRODUCT",
      "Samsung Galaxy Ring",
      12900,
      11900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      143,
      true,
    ],
    [
      "LST-021",
      "SLR-003",
      "ITM-022",
      "Екатеринбург",
      "PRODUCT",
      "UGREEN Nexode 65W USB-C Charger",
      4200,
      null,
      "NEW",
      "ACTIVE",
      "APPROVED",
      88,
      true,
    ],
    [
      "LST-022",
      "SLR-004",
      "ITM-023",
      "Краснодар",
      "PRODUCT",
      "Lenovo 90W Slim Tip Adapter",
      5600,
      5100,
      "NEW",
      "ACTIVE",
      "APPROVED",
      92,
      true,
    ],
    [
      "LST-023",
      "SLR-001",
      "ITM-004",
      "Москва",
      "PRODUCT",
      "ThinkPad X1 Carbon Gen 11 16/512",
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
      "INACTIVE",
      "REJECTED",
      338,
      true,
    ],
    [
      "LST-027",
      "SLR-001",
      "ITM-006",
      "Москва",
      "PRODUCT",
      "Roborock S8 MaxV Ultra",
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
      "DeLonghi Dinamica Plus Titanium",
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
      "Philips The One 50PUS8518/60",
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
    [
      "LST-031",
      "SLR-001",
      "ITM-047",
      "Москва",
      "PRODUCT",
      "Apple Watch Series 9 45mm",
      38900,
      36900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      164,
      true,
    ],
    [
      "LST-032",
      "SLR-002",
      "ITM-048",
      "Казань",
      "PRODUCT",
      "Детские часы Huawei Watch Kids 4 Pro",
      14900,
      13900,
      "NEW",
      "ACTIVE",
      "APPROVED",
      118,
      true,
    ],
  ] as const;

  const listingMap = new Map<string, number>();
  const listingTitleMap = new Map<string, string>();
  const listingImageMap = new Map<string, string>();

  for (const l of listings) {
    const imageUrls = listingImageUrls(l[0]);
    const seededAttributes = buildListingAttributes({
      itemPublicId: l[2],
      city: l[3],
      condition: l[8],
      title: l[5],
    });
    const techState = buildTechState(l[2], l[8]);
    const created = await prisma.marketplaceListing.create({
      data: {
        public_id: l[0],
        seller_id: getRequired(userMap, l[1], "User"),
        item_id: getRequired(itemMap, l[2], "Item"),
        type: l[4],
        title: l[5],
        description: buildListingDescription({
          title: l[5],
          itemPublicId: l[2],
          condition: l[8],
          city: l[3],
        }),
        price: l[6],
        sale_price: l[7],
        condition: l[8],
        status: l[9],
        moderation_status: l[10],
        views: l[11],
        shipping_by_seller: l[12],
        rating: 4.5,
        ...techState,
      },
    });
    listingMap.set(l[0], created.id);
    listingTitleMap.set(l[0], l[5]);
    listingImageMap.set(l[0], imageUrls[0] ?? "");

    await prisma.listingImage.createMany({
      data: imageUrls.map((url, index) => ({
        listing_id: created.id,
        url,
        sort_order: index,
      })),
    });

    await prisma.listingAttribute.createMany({
      data: seededAttributes.map((attribute, index) => ({
        listing_id: created.id,
        key: attribute.key,
        value: attribute.value,
        sort_order: index,
      })),
    });
  }

  await prisma.listingModerationEvent.createMany({
    data: listings.map((listing, index) => {
      const decision =
        listing[10] === "REJECTED"
          ? "REJECTED"
          : listing[10] === "PENDING"
            ? "AUTO_REVIEW"
            : index % 4 === 0
              ? "APPROVED"
              : "AUTO_APPROVED";
      const signals =
        listing[10] === "REJECTED"
          ? [
              "contact_details_detected",
              "offplatform_payment_detected",
              "seller_many_complaints",
            ]
          : listing[10] === "PENDING"
            ? ["price_outlier", "seller_not_verified", "too_short_description"]
            : index % 6 === 0
              ? ["trusted_seller_discount"]
              : ["image_low_resolution"];
      return {
        public_id: `LME-${String(index + 1).padStart(4, "0")}`,
        listing_id: getRequired(listingMap, listing[0], "Listing"),
        actor_user_id:
          decision === "APPROVED" || decision === "REJECTED"
            ? getRequired(userMap, "ADM-001", "User")
            : null,
        actor_type:
          decision === "APPROVED" || decision === "REJECTED" ? "ADMIN" : "SYSTEM",
        decision,
        reason_code:
          decision === "REJECTED"
            ? "offplatform_payment_detected"
            : decision === "AUTO_REVIEW"
              ? "seller_not_verified"
              : "auto_checks_passed",
        reason_note:
          decision === "REJECTED"
            ? "Объявление отклонено из-за попытки обойти безопасную сделку."
            : decision === "AUTO_REVIEW"
              ? "Объявление отправлено на ручную проверку по совокупности сигналов."
              : "Карточка прошла автоматические проверки и соответствует требованиям.",
        risk_score:
          decision === "REJECTED" ? 86 : decision === "AUTO_REVIEW" ? 47 : 12,
        signals,
        metadata: {
          city: listing[3],
          listingStatus: listing[9],
          moderationStatus: listing[10],
        },
        created_at: daysAgo(Math.max(0, 18 - index)),
      };
    }),
  });

  for (const listingId of listingMap.values()) {
    await syncListingSearchKeywords({
      prismaClient: prisma,
      listingId,
    });
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
    {
      text: "Товар в наличии именно в той комплектации, что на фото?",
      answer: "Да, комплект соответствует фото и описанию в карточке.",
    },
    {
      text: "Можно оформить доставку через безопасную сделку?",
      answer: "Да, доставка и оплата проходят через платформу.",
    },
    {
      text: "Есть ли гарантия продавца и документы после покупки?",
      answer: "Да, гарантия продавца 14 дней, документы передадим вместе с товаром.",
    },
    {
      text: "Можно уточнить состояние перед оплатой и попросить дополнительные фото?",
      answer: null,
    },
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
      "Москва, Ленинградский проспект 37",
      400,
      0,
      1,
      [["LST-010", 24900, 1]],
    ],
    [
      "ORD-1010",
      "BUY-004",
      "SLR-001",
      "COMPLETED",
      "DELIVERY",
      "Москва, Мясницкая 24",
      500,
      0,
      0,
      [["LST-002", 165000, 1]],
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
        "Заказ передан покупателю после проверки комплекта",
        1,
      ],
      ["ORD-1010", "CREATED", "PAID", "BUY-004", "Покупатель оплатил заказ", 0],
      [
        "ORD-1010",
        "PAID",
        "COMPLETED",
        "SLR-001",
        "Покупатель подтвердил получение, спорных обращений нет",
        0,
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
      [
        "TXN-1010",
        "ORD-1010",
        "BUY-004",
        "SLR-001",
        165500,
        "SUCCESS",
        3.5,
        5793,
        "YOOMONEY",
        "pi_1010",
        0,
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
        "REJECTED",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-003",
        "Категория: Нарушение правил или обман\nПричина: Чужие фото\nКомментарий: Фото товара не принадлежат продавцу.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
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
        "REJECTED",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-001",
        "Категория: Нарушение правил или обман\nПричина: Чужие фото\nКомментарий: Визуалы полностью совпадают с другим объявлением.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
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
        "REJECTED",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-001",
        "Категория: Нарушение правил или обман\nПричина: Кажется, это мошенники\nКомментарий: Настаивает на срочной сделке, избегая стандартных шагов.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
      ],
      [
        "CMP-026",
        "REJECTED",
        "other",
        "LST-026",
        "SLR-004",
        "BUY-004",
        "Категория: Общение с продавцом\nПричина: Невозможно связаться\nКомментарий: После публикации вопроса ответа в карточке нет длительное время.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
      ],
      [
        "CMP-027",
        "REJECTED",
        "suspicious_listing",
        "LST-026",
        "SLR-004",
        "BUY-003",
        "Категория: Информация в объявлении\nПричина: Неправдивые фото или описание\nКомментарий: Фото не соответствуют текущему состоянию лота.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
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
        "REJECTED",
        "suspicious_listing",
        "LST-026",
        "SLR-004",
        "BUY-001",
        "Категория: Информация в объявлении\nПричина: Неверная цена\nКомментарий: В заголовке и характеристиках объявления указаны разные цены.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
      ],
      [
        "CMP-030",
        "REJECTED",
        "other",
        "LST-026",
        "SLR-004",
        "BUY-004",
        "Категория: Общение с продавцом\nПричина: Хамство, грубость\nКомментарий: Получены оскорбительные сообщения.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
      ],
      [
        "CMP-031",
        "REJECTED",
        "fraud",
        "LST-026",
        "SLR-004",
        "BUY-003",
        "Категория: Нарушение правил или обман\nПричина: Чужие фото\nКомментарий: Подтверждено использование чужих материалов.",
        null,
        2,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
      ],
      [
        "CMP-032",
        "REJECTED",
        "other",
        "LST-026",
        "SLR-004",
        "BUY-002",
        "Категория: Общение с продавцом\nПричина: Хамил в ответах на вопросы\nКомментарий: Некорректное поведение повторяется.",
        null,
        1,
        "ADM-001",
        "Объявление снято с продажи после рассмотрения связанной жалобы",
      ],
    ].map((c: any) => ({
      public_id: c[0],
      status: c[1],
      complaint_type: c[2],
      listing_id: getRequired(listingMap, c[3], "Listing"),
      seller_id: getRequired(userMap, c[4], "User"),
      reporter_id: getRequired(userMap, c[5], "User"),
      description: c[6],
      checked_at: c[8] === null ? null : daysAgo(c[8]),
      checked_by_id:
        c[9] === null ? null : getRequired(userMap, c[9], "User"),
      action_taken: c[10],
    })),
  });

  const complaintMap = new Map(
    (
      await prisma.complaint.findMany({
        select: {
          id: true,
          public_id: true,
          status: true,
          seller_id: true,
          action_taken: true,
        },
      })
    ).map((complaint) => [complaint.public_id, complaint]),
  );

  await prisma.complaintEvent.createMany({
    data: Array.from(complaintMap.values()).flatMap((complaint, index) => {
      const isListingRemovedResolution =
        complaint.action_taken ===
        "Объявление снято с продажи после рассмотрения связанной жалобы";
      const baseEvent = {
        public_id: `CME-${String(index * 2 + 1).padStart(4, "0")}`,
        complaint_id: complaint.id,
        actor_user_id: null,
        event_type: "created",
        from_status: null,
        to_status: "NEW" as const,
        note: "Жалоба создана пользователем через карточку объявления.",
        metadata: { source: "catalog_listing" },
        created_at: daysAgo(12 + (index % 8)),
      };
      if (complaint.status === "NEW") return [baseEvent];
      return [
        baseEvent,
        {
          public_id: `CME-${String(index * 2 + 2).padStart(4, "0")}`,
          complaint_id: complaint.id,
          actor_user_id: getRequired(userMap, "ADM-001", "User"),
          event_type:
            complaint.status === "APPROVED"
              ? "approved"
              : complaint.status === "REJECTED"
                ? "rejected"
                : "triaged",
          from_status: "NEW",
          to_status: complaint.status,
          note:
            complaint.status === "APPROVED"
              ? "Нарушение подтверждено после ручной проверки."
              : complaint.status === "REJECTED"
                ? isListingRemovedResolution
                  ? "Объявление уже снято после подтверждения связанной жалобы."
                  : "Жалоба закрыта без подтверждения нарушения."
                : "Жалоба переведена в очередь повторной проверки.",
          metadata: isListingRemovedResolution
            ? {
                actorRole: "admin",
                resolutionKind: "related_listing_removed_after_approval",
              }
            : { actorRole: "admin" },
          created_at: daysAgo(4 + (index % 6)),
        },
      ];
    }),
  });

  await prisma.complaintSanction.createMany({
    data: [
      ["CSN-001", "CMP-001", "SLR-004", "WARNING", "ACTIVE", "Первое подтвержденное нарушение: обход безопасной сделки", 4, null],
      ["CSN-002", "CMP-005", "SLR-004", "TEMP_3_DAYS", "COMPLETED", "Грубое общение с покупателем", 2, 0],
      ["CSN-003", "CMP-013", "SLR-002", "WARNING", "ACTIVE", "Подозрительная карточка с противоречивым описанием", 3, null],
      ["CSN-004", "CMP-009", "SLR-004", "TEMP_30_DAYS", "ACTIVE", "Повторное использование чужих фото и признаки мошенничества", 2, 28],
    ].map((sanction: any) => ({
      public_id: sanction[0],
      complaint_id: getRequired(complaintMap, sanction[1], "Complaint").id,
      seller_id: getRequired(userMap, sanction[2], "User"),
      level: sanction[3],
      status: sanction[4],
      reason: sanction[5],
      starts_at: daysAgo(sanction[6]),
      ends_at: sanction[7] === null ? null : daysAgo(-sanction[7]),
      created_by_id: getRequired(userMap, "ADM-001", "User"),
      created_at: daysAgo(sanction[6]),
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
      [
        "KYC-006",
        "APPROVED",
        "SLR-006",
        "seller6@ecomm.local",
        "+79002000106",
        "ООО Сетевой Контур",
        "5408123456",
        "Новосибирск, Фрунзе 86",
        "network-docs.zip",
        "Проверка пройдена, профиль готов к расширению лимита объявлений",
        "ADM-001",
        6,
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

  const partnershipRequests = [
    {
      publicId: "PRQ-001",
      userPublicId: "BUY-006",
      sellerType: "COMPANY",
      status: "DRAFT",
      name: "ООО Атлас Трейд",
      email: "atlas.trade@example.com",
      contact: "+79003000101",
      link: "https://atlas.example.com",
      category: "ПК, ноутбуки, периферия",
      inn: "5402000001",
      geography: "Новосибирск",
      socialProfile: "@atlas_trade",
      credibility: "Собирают публичные профили и описание ассортимента для старта",
      whyUs: "Хотят протестировать безопасную сделку на продаже восстановленной офисной техники",
      reviewedBy: null,
      reviewedDaysAgo: null,
      rejectionReason: null,
      adminNote: null,
    },
    {
      publicId: "PRQ-002",
      userPublicId: "BUY-001",
      sellerType: "COMPANY",
      status: "SUBMITTED",
      name: "ООО Север Трейд",
      email: "north.trade@example.com",
      contact: "+79003000102",
      link: "https://north.example.com",
      category: "Смартфоны и фототехника",
      inn: "7702000001",
      geography: "Москва",
      socialProfile: "@north",
      credibility: "Работают с 2019 года, есть сайт, сервисный номер и витрина на внешних площадках",
      whyUs: "Нужен канал продаж с безопасной сделкой и понятными правилами гарантии",
      reviewedBy: null,
      reviewedDaysAgo: null,
      rejectionReason: null,
      adminNote: null,
    },
    {
      publicId: "PRQ-003",
      userPublicId: "BUY-002",
      sellerType: "IP",
      status: "LEGAL_REVIEW",
      name: "ИП Павел Соколов",
      email: "pavel@example.com",
      contact: "+79003000103",
      link: "https://pavel.example.com",
      category: "Комплектующие для ПК",
      inn: "165300000002",
      geography: "Санкт-Петербург",
      socialProfile: "@pavel_service",
      credibility: "Есть сервисный центр и внешние отзывы",
      whyUs: "Нужны новые каналы продаж и безопасная сделка на восстановленных комплектующих",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 7,
      rejectionReason: null,
      adminNote: "Проверяем ИНН, публичные профили и полномочия представителя.",
    },
    {
      publicId: "PRQ-004",
      userPublicId: "BUY-003",
      sellerType: "COMPANY",
      status: "REPRESENTATIVE_REVIEW",
      name: "ООО Ирина Хоум Сервис",
      email: "irina@example.com",
      contact: "+79003000104",
      link: "https://irina.example.com",
      category: "Бытовая техника",
      inn: "166400000003",
      geography: "Казань",
      socialProfile: "@irina_home_lab",
      credibility: "Локальный сервис и продажа уценённой техники с собственным приёмом",
      whyUs: "Планируют масштабировать продажи и усилить доверие покупателей к восстановленной технике",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 6,
      rejectionReason: null,
      adminNote: "Нужно подтвердить полномочия сотрудника, подающего заявку от компании.",
    },
    {
      publicId: "PRQ-005",
      userPublicId: "BUY-004",
      sellerType: "COMPANY",
      status: "PENDING",
      name: "ООО Морской Бриз",
      email: "hello@seabreeze.example.com",
      contact: "+79003000105",
      link: "https://seabreeze.example.com",
      category: "Бытовая техника",
      inn: "2302000004",
      geography: "Сочи",
      socialProfile: "@seabreeze",
      credibility: "Сертифицированные мастера и собственный склад",
      whyUs: "Нужен предсказуемый канал продаж с безопасной сделкой и возвратами по правилам платформы",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 5,
      rejectionReason: null,
      adminNote: "Финальная модерация после проверки модели продаж и рабочих каналов.",
    },
    {
      publicId: "PRQ-006",
      userPublicId: "BUY-007",
      sellerType: "COMPANY",
      status: "PENDING",
      name: "ООО Точка Гарантии",
      email: "quality@example.com",
      contact: "+79003000106",
      link: "https://quality.example.com",
      category: "Смартфоны и фототехника",
      inn: "7703000006",
      geography: "Москва",
      socialProfile: "@quality_lab",
      credibility: "Сильный сервис и восстановление устройств, идёт финальная внутренняя риск-проверка",
      whyUs: "Хотят продавать устройства с понятной гарантией и прозрачным описанием состояния",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 4,
      rejectionReason: null,
      adminNote: "Финальная внутренняя проверка risk-категории перед решением.",
    },
    {
      publicId: "PRQ-007",
      userPublicId: "SLR-004",
      sellerType: "COMPANY",
      status: "APPROVED_LIMITED",
      name: "Филиал Сервис Хаб",
      email: "branch@servicehub.example.com",
      contact: "+79003000107",
      link: "https://servicehub.example.com/branch",
      category: "ТВ, консоли и аудио",
      inn: "2302000006",
      geography: "Краснодар",
      socialProfile: "@servicehub",
      credibility: "Есть подтвержденная операционка, но масштабирование идёт поэтапно",
      whyUs: "Хотят развивать продажи в нескольких городах с лимитом на старте",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 3,
      rejectionReason: null,
      adminNote: "Ограниченное одобрение до стабилизации SLA по ответам.",
    },
    {
      publicId: "PRQ-008",
      userPublicId: "BUY-005",
      sellerType: "IP",
      status: "NEEDS_MORE_INFO",
      name: "ИП Алексей Левин",
      email: "alexey@example.com",
      contact: "+79003000108",
      link: "https://levin.example.com",
      category: "Комплектующие для ПК",
      inn: "525700000008",
      geography: "Нижний Новгород",
      socialProfile: "@levin_trade",
      credibility: "Недостаточно данных о модели бизнеса и рабочих каналах связи",
      whyUs: "Нужны продажи на площадке, но описание бизнеса пока слишком общее",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 2,
      rejectionReason: "Нужно точнее описать происхождение товара и подтвердить рабочие каналы компании/ИП.",
      adminNote: "Запросили более точное описание бизнеса и публичный профиль.",
    },
    {
      publicId: "PRQ-009",
      userPublicId: "SLR-006",
      sellerType: "COMPANY",
      status: "APPROVED",
      name: "ООО Сетевой Контур",
      email: "network@example.com",
      contact: "+79003000109",
      link: "https://network.example.com",
      category: "Сетевое оборудование",
      inn: "5408123456",
      geography: "Новосибирск",
      socialProfile: "@network_contour",
      credibility: "Есть подтвержденный домен, офис, склад и стабильная сервисная поддержка",
      whyUs: "Нужна зрелая партнерская витрина и расширение ассортимента сетевого оборудования",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 1,
      rejectionReason: null,
      adminNote: "Полное одобрение после подтверждения юридических данных, рабочих каналов и модели продаж.",
    },
    {
      publicId: "PRQ-010",
      userPublicId: "BUY-004",
      sellerType: "IP",
      status: "REJECTED",
      name: "ИП Дмитрий Федоров",
      email: "dmitry@example.com",
      contact: "+79003000110",
      link: "https://dmitry.example.com",
      category: "Смартфоны и фототехника",
      inn: "5403000005",
      geography: "Новосибирск",
      socialProfile: "@dmitry",
      credibility: "Есть сайт-визитка, но не подтверждены представитель и рабочие каналы",
      whyUs: "Нужны аналитика и рост продаж через безопасную сделку",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 1,
      rejectionReason: "Не подтверждены полномочия заявителя и рабочие каналы компании/ИП.",
      adminNote: "Повторная подача возможна после обновления контактных данных и подтверждения представителя.",
    },
    {
      publicId: "PRQ-011",
      userPublicId: "BUY-006",
      sellerType: "COMPANY",
      status: "PENDING",
      name: "ООО Сибирь Device Care",
      email: "devicecare@example.com",
      contact: "+79003000111",
      link: "https://devicecare.example.com",
      category: "Смартфоны и фототехника",
      inn: "5409000011",
      geography: "Новосибирск",
      socialProfile: "@devicecare",
      credibility: "Готовы логистика, сервисный процесс и рабочая поддержка, идёт финальная очередь проверки",
      whyUs: "Нужен понятный канал продаж с безопасной сделкой и возвратами по единым правилам",
      reviewedBy: "ADM-001",
      reviewedDaysAgo: 1,
      rejectionReason: null,
      adminNote: "Финальная очередь модерации перед решением.",
    },
  ] as const;

  await prisma.partnershipRequest.createMany({
    data: partnershipRequests.map((request) => ({
      public_id: request.publicId,
      user_id: getRequired(userMap, request.userPublicId, "User"),
      seller_type: request.sellerType,
      status: request.status,
      name: request.name,
      email: request.email,
      contact: request.contact,
      link: request.link,
      category: request.category,
      inn: request.inn,
      geography: request.geography,
      social_profile: request.socialProfile,
      credibility: request.credibility,
      why_us: request.whyUs,
      reviewed_by_id:
        request.reviewedBy === null
          ? null
          : getRequired(userMap, request.reviewedBy, "User"),
      reviewed_at:
        request.reviewedDaysAgo === null ? null : daysAgo(request.reviewedDaysAgo),
      rejection_reason: request.rejectionReason,
      admin_note: request.adminNote,
      created_at: daysAgo(9),
    })),
  });

  const partnershipRequestMap = new Map(
    (
      await prisma.partnershipRequest.findMany({
        select: { id: true, public_id: true },
      })
    ).map((request) => [request.public_id, request.id]),
  );

  function onboardingProfileDraft(params: {
    publicId: string;
    requestPublicId: string;
    legalType: "COMPANY" | "IP";
    inn: string;
    ogrn: string;
    kpp?: string | null;
    legalName: string;
    city: string;
    region: string;
    categories: string[];
    listingLimit: number;
    payoutVerified: boolean;
    recommendationMode: "strong" | "limited" | "needs_docs";
    businessSummary?: string;
  }) {
    const domain = params.legalName
      .toLocaleLowerCase("ru-RU")
      .replace(/[^a-zа-я0-9]+/gu, "")
      .slice(0, 12);
    const trusted = params.recommendationMode === "strong";
    return {
      public_id: params.publicId,
      request_id: getRequired(partnershipRequestMap, params.requestPublicId, "Partnership request"),
      legal_type: params.legalType,
      inn: params.inn,
      ogrn: params.ogrn,
      kpp: params.kpp ?? null,
      legal_name: params.legalName,
      registration_status: "active",
      registered_address: `${params.region}, ${params.city}, ул. Тестовая, д. 14`,
      tax_region: params.region,
      representative_full_name: "Екатерина Морозова",
      representative_role: "Коммерческий директор",
      representative_phone: "+7 900 300-00-99",
      representative_email: `biz@${domain}.example.com`,
      authority_type: "director",
      authority_document: null,
      website_url: `https://${domain}.example.com`,
      business_email: `hello@${domain}.example.com`,
      domain_ownership_method: trusted ? "dns_txt" : "email_domain",
      public_profile_urls: [
        `https://${domain}.example.com`,
        `https://t.me/${domain}`,
      ],
      business_role:
        params.businessSummary ??
        "Продажа техники и электроники с понятным описанием состояния и происхождения товара",
      categories: params.categories,
      fulfillment_model: "fbs",
      country: "Россия",
      region: params.region,
      city: params.city,
      warehouse_address: `${params.region}, ${params.city}, склад 4, ул. Индустриальная, д. 8`,
      service_center_address: `${params.region}, ${params.city}, ул. Сервисная, д. 3`,
      delivery_coverage_regions: [params.region, "Москва", "Санкт-Петербург"],
      pickup_available: true,
      return_address: `${params.region}, ${params.city}, ул. Возвратная, д. 5`,
      support_phone: "+7 900 300-00-55",
      support_email: `support@${domain}.example.com`,
      service_hours: "Пн-Пт 10:00-19:00; Сб-Вс выходной",
      monthly_capacity:
        params.recommendationMode === "strong"
          ? 450
          : params.recommendationMode === "limited"
            ? 120
            : 80,
      product_source_type:
        params.businessSummary ??
        "Товар поступает через выкуп, trade-in, уценку поставщиков и внутренний сервисный цикл",
      supplier_documents: "not_required_for_initial_onboarding",
      diagnostic_process: "Фотофиксация, чек-лист диагностики, серийная сверка",
      grading_standard: trusted ? "A/B/C с фотофиксацией" : "Черновой внутренний регламент",
      warranty_days: 90,
      return_days: 14,
      serial_check_policy: trusted
        ? "IMEI / серийный номер проверяется перед публикацией и перед отправкой"
        : "Серийный номер проверяется выборочно",
      quality_charter_accepted: true,
      legal_lookup_verified: trusted,
      email_verified: true,
      domain_verified: trusted,
      representative_verified: params.recommendationMode !== "needs_docs",
      payout_verified: params.payoutVerified,
      allowed_categories: params.categories,
      listing_limit: params.listingLimit,
    };
  }

  await prisma.partnerOnboardingProfile.createMany({
    data: [
      onboardingProfileDraft({
        publicId: "ONB-002",
        requestPublicId: "PRQ-002",
        legalType: "COMPANY",
        inn: "7702000001",
        ogrn: "1027700132195",
        kpp: "770201001",
        legalName: "ООО Север Трейд",
        city: "Москва",
        region: "Москва",
        categories: ["Смартфоны и фототехника", "ТВ, консоли и аудио"],
        listingLimit: 60,
        payoutVerified: false,
        recommendationMode: "limited",
        businessSummary:
          "Продают восстановленные смартфоны и фотоустройства, часть товара поступает через trade-in и корпоративный выкуп.",
      }),
      onboardingProfileDraft({
        publicId: "ONB-003",
        requestPublicId: "PRQ-003",
        legalType: "IP",
        inn: "165300000002",
        ogrn: "304165300000211",
        legalName: "ИП Павел Соколов",
        city: "Санкт-Петербург",
        region: "Ленинградская область",
        categories: ["Комплектующие для ПК", "ПК, ноутбуки, периферия"],
        listingLimit: 35,
        payoutVerified: false,
        recommendationMode: "needs_docs",
        businessSummary:
          "Продаёт восстановленные комплектующие и ноутбуки после сервисной диагностики и выкупа у корпоративных клиентов.",
      }),
      onboardingProfileDraft({
        publicId: "ONB-004",
        requestPublicId: "PRQ-004",
        legalType: "COMPANY",
        inn: "166400000003",
        ogrn: "1181690003210",
        legalName: "ООО Ирина Хоум Сервис",
        city: "Казань",
        region: "Республика Татарстан",
        categories: ["Бытовая техника"],
        listingLimit: 40,
        payoutVerified: false,
        recommendationMode: "limited",
        businessSummary:
          "Продают уценённую и восстановленную бытовую технику после собственной приёмки и ремонта.",
      }),
      onboardingProfileDraft({
        publicId: "ONB-005",
        requestPublicId: "PRQ-005",
        legalType: "COMPANY",
        inn: "2302000004",
        ogrn: "1102302000418",
        kpp: "230201001",
        legalName: "ООО Морской Бриз",
        city: "Сочи",
        region: "Краснодарский край",
        categories: ["Бытовая техника", "ТВ, консоли и аудио"],
        listingLimit: 45,
        payoutVerified: false,
        recommendationMode: "limited",
        businessSummary:
          "Продают бытовую технику и ТВ после сервисной диагностики, часть ассортимента поступает как уценка поставщиков.",
      }),
      onboardingProfileDraft({
        publicId: "ONB-006",
        requestPublicId: "PRQ-006",
        legalType: "COMPANY",
        inn: "7703000006",
        ogrn: "1197703000601",
        kpp: "770301001",
        legalName: "ООО Точка Гарантии",
        city: "Москва",
        region: "Москва",
        categories: ["Смартфоны и фототехника", "ТВ, консоли и аудио"],
        listingLimit: 50,
        payoutVerified: false,
        recommendationMode: "needs_docs",
        businessSummary:
          "Продают восстановленные смартфоны, наушники и фотоустройства, поступающие через trade-in и сервисный возврат.",
      }),
      onboardingProfileDraft({
        publicId: "ONB-007",
        requestPublicId: "PRQ-007",
        legalType: "COMPANY",
        inn: "2302000006",
        ogrn: "1112302000671",
        kpp: "230201002",
        legalName: "Филиал Сервис Хаб",
        city: "Краснодар",
        region: "Краснодарский край",
        categories: ["ТВ, консоли и аудио"],
        listingLimit: 20,
        payoutVerified: false,
        recommendationMode: "limited",
        businessSummary:
          "Продают игровые приставки, аудиотехнику и телевизоры после сервисного восстановления и внутренней проверки.",
      }),
      onboardingProfileDraft({
        publicId: "ONB-009",
        requestPublicId: "PRQ-009",
        legalType: "COMPANY",
        inn: "5408123456",
        ogrn: "1185476004121",
        kpp: "540801001",
        legalName: "ООО Сетевой Контур",
        city: "Новосибирск",
        region: "Новосибирская область",
        categories: ["Сетевое оборудование", "Комплектующие для ПК"],
        listingLimit: 120,
        payoutVerified: false,
        recommendationMode: "strong",
        businessSummary:
          "Продают сетевое оборудование и комплектующие, часть товаров поступает от дистрибьюторов, часть — как уценка корпоративного обновления парка.",
      }),
      onboardingProfileDraft({
        publicId: "ONB-011",
        requestPublicId: "PRQ-011",
        legalType: "COMPANY",
        inn: "5409000011",
        ogrn: "1205409000012",
        kpp: "540901001",
        legalName: "ООО Сибирь Device Care",
        city: "Новосибирск",
        region: "Новосибирская область",
        categories: ["Смартфоны и фототехника", "ТВ, консоли и аудио"],
        listingLimit: 45,
        payoutVerified: false,
        recommendationMode: "limited",
        businessSummary:
          "Продают восстановленные смартфоны и смежную электронику, товар поступает через trade-in, сервисный обмен и корпоративный выкуп.",
      }),
    ],
  });

  await prisma.listingDraft.createMany({
    data: [
      [
        "DRF-001",
        "SLR-001",
        "Ноутбук для офиса 16/512",
        "ITM-003",
        "review",
        {
          title: "Ноутбук для офиса 16/512",
          condition: "used",
          price: 68900,
          autosave: true,
        },
      ],
      [
        "DRF-002",
        "SLR-002",
        "Смартфон после trade-in",
        "ITM-001",
        "photos",
        {
          title: "Смартфон после trade-in",
          condition: "used",
          price: 47900,
          uploadProgress: 75,
        },
      ],
      [
        "DRF-003",
        "SLR-003",
        "Робот-пылесос премиум",
        "ITM-006",
        "details",
        {
          title: "Робот-пылесос премиум",
          condition: "new",
          price: 39900,
          warranty: 12,
        },
      ],
      [
        "DRF-004",
        "SLR-004",
        "Монтажный комплект для сервиса",
        "ITM-023",
        "catalog",
        {
          title: "Монтажный комплект для сервиса",
          catalogRequestPending: true,
        },
      ],
      [
        "DRF-005",
        "SLR-006",
        "Коммутатор для малого офиса",
        "ITM-053",
        "publish",
        {
          title: "Коммутатор для малого офиса",
          condition: "new",
          price: 12800,
          readyToSubmit: true,
        },
      ],
    ].map((draft: any) => ({
      public_id: draft[0],
      seller_id: getRequired(userMap, draft[1], "User"),
      type: "PRODUCT",
      title: draft[2],
      item_id: getRequired(itemMap, draft[3], "Item"),
      payload: draft[5],
      current_screen: draft[4],
      created_at: daysAgo(3),
      updated_at: daysAgo(1),
    })),
  });

  await prisma.sellerCommissionPeriodStat.createMany({
    data: [
      [
        "SCS-001",
        "SLR-001",
        "2026-Q1",
        1350000,
        47250,
        1302750,
        1240000,
        18,
        3.5,
        "TIER-003",
        "TIER-004",
        151000,
        89,
      ],
      [
        "SCS-002",
        "SLR-002",
        "2026-Q1",
        468000,
        21060,
        446940,
        432000,
        11,
        4.5,
        "TIER-002",
        "TIER-003",
        33001,
        93,
      ],
      [
        "SCS-003",
        "SLR-003",
        "2026-Q1",
        382000,
        17190,
        364810,
        355000,
        9,
        4.5,
        "TIER-002",
        "TIER-003",
        119001,
        76,
      ],
      [
        "SCS-004",
        "SLR-004",
        "2026-Q1",
        128000,
        7680,
        120320,
        105000,
        4,
        6,
        "TIER-001",
        "TIER-002",
        0,
        100,
      ],
      [
        "SCS-005",
        "SLR-006",
        "2026-Q1",
        1820000,
        50960,
        1769040,
        1685000,
        24,
        2.8,
        "TIER-004",
        "TIER-005",
        2180001,
        46,
      ],
    ].map((stat: any) => ({
      public_id: stat[0],
      seller_id: getRequired(userMap, stat[1], "User"),
      period_key: stat[2],
      period_start: new Date("2026-01-01T00:00:00.000Z"),
      period_end: new Date("2026-03-31T23:59:59.000Z"),
      gross: stat[3],
      commission_total: stat[4],
      seller_profit: stat[5],
      payable: stat[6],
      held: Math.round(stat[6] * 0.06),
      refunded_cancelled: Math.round(stat[3] * 0.02),
      qualified_gmv: stat[3],
      completed_orders: stat[7],
      successful_transactions: stat[7],
      total_transactions: stat[7] + 2,
      current_tier_id: getRequired(tierMap, stat[9], "Tier"),
      next_tier_id: getRequired(tierMap, stat[10], "Tier"),
      sales_to_next_tier: stat[11],
      percent_to_next_tier: stat[12],
      commission_rate_at_period_end: stat[8],
      snapshot_finalized_at: daysAgo(2),
      created_at: daysAgo(40),
      updated_at: daysAgo(2),
    })),
  });

  await prisma.adminIdempotencyKey.createMany({
    data: [
      [
        "AID-001",
        "ADM-001",
        "complaints.updateStatus",
        "adm-cmpr-001",
        "hash-complaint-001",
        200,
        { success: true, complaintId: "CMP-001" },
      ],
      [
        "AID-002",
        "ADM-001",
        "partnership.updateStatus",
        "adm-partner-002",
        "hash-partner-002",
        200,
        { success: true, requestId: "PRQ-007" },
      ],
    ].map((row: any) => ({
      public_id: row[0],
      actor_user_id: getRequired(userMap, row[1], "User"),
      action: row[2],
      idempotency_key: row[3],
      request_hash: row[4],
      response_status: row[5],
      response_body: row[6],
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
    })),
  });

  await prisma.checkoutIdempotencyKey.createMany({
    data: [
      [
        "CID-001",
        "BUY-001",
        "checkout.createOrder",
        "chk-ord-001",
        "hash-checkout-001",
        200,
        { success: true, orderId: "ORD-1001" },
      ],
      [
        "CID-002",
        "BUY-004",
        "checkout.createOrder",
        "chk-ord-002",
        "hash-checkout-002",
        200,
        { success: true, orderId: "ORD-1010" },
      ],
    ].map((row: any) => ({
      public_id: row[0],
      actor_user_id: getRequired(userMap, row[1], "User"),
      action: row[2],
      idempotency_key: row[3],
      request_hash: row[4],
      response_status: row[5],
      response_body: row[6],
      created_at: daysAgo(1),
      updated_at: daysAgo(1),
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
      [
        "AUD-007",
        "partnership.status_changed",
        "partnership_request",
        "PRQ-007",
        { доСтатуса: "QUALITY_REVIEW", послеСтатуса: "APPROVED_LIMITED" },
        3,
      ],
      [
        "AUD-008",
        "partnership.status_changed",
        "partnership_request",
        "PRQ-010",
        { доСтатуса: "PENDING", послеСтатуса: "REJECTED" },
        1,
      ],
      [
        "AUD-009",
        "payout.status_changed",
        "payout_profile",
        "PAY-006",
        { доСтатуса: "PENDING", послеСтатуса: "VERIFIED" },
        2,
      ],
      [
        "AUD-010",
        "complaint.sanction_created",
        "complaint_sanction",
        "CSN-004",
        { жалоба: "CMP-031", уровень: "TEMP_30_DAYS", продавец: "SLR-004" },
        2,
      ],
      [
        "AUD-011",
        "user.role_changed",
        "user",
        "SLR-006",
        { доРоли: "BUYER", послеРоли: "SELLER" },
        1,
      ],
      [
        "AUD-012",
        "catalog.suggestion_reviewed",
        "catalog_suggestion",
        "pending-demo",
        { результат: "APPROVED", тип: "ITEM" },
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
    payoutProfilesCount,
    commissionStatsCount,
    categoriesCount,
    subcategoriesCount,
    itemsCount,
    catalogSuggestionsCount,
    listingsCount,
    draftsCount,
    moderationEventsCount,
    searchKeywordsCount,
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
    complaintEventsCount,
    sanctionsCount,
    kycCount,
    partnershipCount,
    onboardingProfilesCount,
    adminIdempotencyCount,
    checkoutIdempotencyCount,
    auditCount,
  ] = await Promise.all([
    prisma.appUser.count(),
    prisma.notification.count(),
    prisma.userAddress.count(),
    prisma.commissionTier.count(),
    prisma.sellerProfile.count(),
    prisma.sellerPayoutProfile.count(),
    prisma.sellerCommissionPeriodStat.count(),
    prisma.catalogCategory.count(),
    prisma.catalogSubcategory.count(),
    prisma.catalogItem.count(),
    prisma.catalogSuggestion.count(),
    prisma.marketplaceListing.count(),
    prisma.listingDraft.count(),
    prisma.listingModerationEvent.count(),
    prisma.listingSearchKeyword.count(),
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
    prisma.complaintEvent.count(),
    prisma.complaintSanction.count(),
    prisma.kycRequest.count(),
    prisma.partnershipRequest.count(),
    prisma.partnerOnboardingProfile.count(),
    prisma.adminIdempotencyKey.count(),
    prisma.checkoutIdempotencyKey.count(),
    prisma.auditLog.count(),
  ]);

  console.log("Сидирование завершено:");
  console.log(`Пользователи=${usersCount}, Уведомления=${notificationsCount}`);
  console.log(
    `Адреса=${addressesCount}, УровниКомиссий=${tiersCount}, ПрофилиПродавцов=${sellerProfilesCount}, ПрофилиВыплат=${payoutProfilesCount}`,
  );
  console.log(
    `Категории=${categoriesCount}, Подкатегории=${subcategoriesCount}, ПозицииКаталога=${itemsCount}, ЗаявкиКаталога=${catalogSuggestionsCount}, КвартальныеСтаты=${commissionStatsCount}`,
  );
  console.log(
    `Объявления=${listingsCount}, Черновики=${draftsCount}, Модерации=${moderationEventsCount}, SearchKeywords=${searchKeywordsCount}`,
  );
  console.log(
    `Изображения=${imagesCount}, Атрибуты=${attributesCount}, Отзывы=${reviewsCount}, Вопросы=${questionsCount}, Избранное=${wishlistCount}`,
  );
  console.log(
    `Заказы=${ordersCount}, ПозицииЗаказов=${orderItemsCount}, ИсторияСтатусовЗаказов=${orderHistoryCount}`,
  );
  console.log(
    `Транзакции=${transactionsCount}, Жалобы=${complaintsCount}, СобытияЖалоб=${complaintEventsCount}, Санкции=${sanctionsCount}, ЗаявкиKYC=${kycCount}`,
  );
  console.log(
    `ПартнерскиеЗаявки=${partnershipCount}, ПрофилиОнбординга=${onboardingProfilesCount}, AdminIdempotency=${adminIdempotencyCount}, CheckoutIdempotency=${checkoutIdempotencyCount}, ЖурналАудита=${auditCount}`,
  );

  console.log("Данные для входа:");
  console.log("admin -> admin@ecomm.local / DemoAdmin2026!");
  console.log("buyer -> buyer1@ecomm.local / DemoBuyer2026!");
  console.log("seller -> seller1@ecomm.local / DemoSeller2026!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
