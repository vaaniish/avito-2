import {
  PromoDiscountType,
  PromoScopeTargetType,
  type PrismaClient,
} from "@prisma/client";
import {
  conflict,
  notFound,
  validationError,
} from "../../../../../common/application-error";

type PromoStatus =
  | "scheduled"
  | "active"
  | "paused"
  | "exhausted"
  | "expired";

type ResolvedScope = {
  allCatalog: boolean;
  categoryIds: number[];
  subcategoryIds: number[];
  itemIds: number[];
};

const MAX_PROMO_PERCENT = 25;
const MAX_PROMO_FIXED_AMOUNT = 2500;

function makePromoPublicId(): string {
  return `PRM-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function readTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => readTrimmedString(value)).filter(Boolean))];
}

function readBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readDate(value: unknown, fieldLabel: string): Date {
  const raw = readTrimmedString(value);
  if (!raw) {
    throw validationError(`Укажите ${fieldLabel}`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError(`Некорректная дата: ${fieldLabel}`);
  }
  return parsed;
}

function readInteger(
  value: unknown,
  options: { fieldLabel: string; min?: number; max?: number },
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw validationError(`Некорректное значение: ${options.fieldLabel}`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw validationError(`${options.fieldLabel} должно быть не меньше ${options.min}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw validationError(`${options.fieldLabel} должно быть не больше ${options.max}`);
  }
  return parsed;
}

function parseDiscountType(value: unknown): PromoDiscountType {
  if (value === "percent") return "PERCENT";
  if (value === "fixed_amount") return "FIXED_AMOUNT";
  throw validationError("Выберите тип скидки");
}

function readDiscountValue(value: unknown, discountType: PromoDiscountType): number {
  return readInteger(value, {
    fieldLabel:
      discountType === "PERCENT"
        ? "Размер скидки в процентах"
        : "Размер скидки в рублях",
    min: 1,
    max: discountType === "PERCENT" ? MAX_PROMO_PERCENT : MAX_PROMO_FIXED_AMOUNT,
  });
}

function normalizePromoCode(value: unknown): string {
  const raw = readTrimmedString(value).toUpperCase();
  if (!raw) {
    throw validationError("Укажите код промокода");
  }
  if (!/^[A-Z0-9_-]{3,64}$/.test(raw)) {
    throw validationError(
      "Код промокода должен содержать 3-64 символа: латиница, цифры, дефис или подчеркивание",
    );
  }
  return raw;
}

function computePromoStatus(params: {
  startsAt: Date;
  endsAt: Date;
  isEnabled: boolean;
  activeActivations: number;
  maxActivations: number;
  now?: Date;
}): PromoStatus {
  const now = params.now ?? new Date();
  if (params.endsAt.getTime() < now.getTime()) return "expired";
  if (!params.isEnabled) return "paused";
  if (params.startsAt.getTime() > now.getTime()) return "scheduled";
  if (params.activeActivations >= params.maxActivations) return "exhausted";
  return "active";
}

function buildScopeSummary(input: {
  allCatalog: boolean;
  categoryCount: number;
  subcategoryCount: number;
  itemCount: number;
  listingCount: number;
}): {
  label: string;
  categoryCount: number;
  subcategoryCount: number;
  itemCount: number;
  listingCount: number;
} {
  if (input.allCatalog) {
    return {
      label: "Весь каталог",
      categoryCount: 0,
      subcategoryCount: 0,
      itemCount: 0,
      listingCount: 0,
    };
  }

  const parts: string[] = [];
  if (input.categoryCount > 0) parts.push(`${input.categoryCount} кат.`);
  if (input.subcategoryCount > 0) parts.push(`${input.subcategoryCount} подкат.`);
  if (input.itemCount > 0) parts.push(`${input.itemCount} видов`);
  if (input.listingCount > 0) parts.push(`${input.listingCount} товаров`);

  return {
    label: parts.length > 0 ? parts.join(" • ") : "Таргетинг не задан",
    categoryCount: input.categoryCount,
    subcategoryCount: input.subcategoryCount,
    itemCount: input.itemCount,
    listingCount: input.listingCount,
  };
}

export class AdminPromosService {
  constructor(private readonly prisma: PrismaClient) {}

  private async resolveScope(body: Record<string, unknown>): Promise<ResolvedScope> {
    const allCatalog = readBoolean(body.allCatalog);
    const categoryPublicIds = uniqueStrings(body.categoryIds);
    const subcategoryPublicIds = uniqueStrings(body.subcategoryIds);
    const itemPublicIds = uniqueStrings(body.itemIds);

    if (allCatalog) {
      return {
        allCatalog: true,
        categoryIds: [],
        subcategoryIds: [],
        itemIds: [],
      };
    }

    if (
      categoryPublicIds.length === 0 &&
      subcategoryPublicIds.length === 0 &&
      itemPublicIds.length === 0
    ) {
      throw validationError("Выберите весь каталог или хотя бы одну область применения");
    }

    const [categories, subcategories, items] = await Promise.all([
      categoryPublicIds.length > 0
        ? this.prisma.catalogCategory.findMany({
            where: { public_id: { in: categoryPublicIds } },
            select: { id: true, public_id: true },
          })
        : Promise.resolve([]),
      subcategoryPublicIds.length > 0
        ? this.prisma.catalogSubcategory.findMany({
            where: { public_id: { in: subcategoryPublicIds } },
            select: { id: true, public_id: true },
          })
        : Promise.resolve([]),
      itemPublicIds.length > 0
        ? this.prisma.catalogItem.findMany({
            where: { public_id: { in: itemPublicIds } },
            select: { id: true, public_id: true },
          })
        : Promise.resolve([]),
    ]);

    if (categories.length !== categoryPublicIds.length) {
      throw validationError("Одна или несколько выбранных категорий не найдены");
    }
    if (subcategories.length !== subcategoryPublicIds.length) {
      throw validationError("Одна или несколько выбранных подкатегорий не найдены");
    }
    if (items.length !== itemPublicIds.length) {
      throw validationError("Один или несколько выбранных видов товара не найдены");
    }

    return {
      allCatalog: false,
      categoryIds: categories.map((row) => row.id),
      subcategoryIds: subcategories.map((row) => row.id),
      itemIds: items.map((row) => row.id),
    };
  }

  private async countActiveActivationsByPromoIds(
    promoIds: number[],
  ): Promise<Map<number, number>> {
    if (promoIds.length === 0) return new Map();
    const grouped = await this.prisma.promoActivation.groupBy({
      by: ["promo_code_id"],
      where: {
        promo_code_id: { in: promoIds },
        status: { in: ["RESERVED", "CONSUMED"] },
      },
      _count: { _all: true },
    });

    return new Map(grouped.map((row) => [row.promo_code_id, row._count._all]));
  }

  private serializePromo(input: {
    promo: {
      id: number;
      public_id: string;
      code: string;
      discount_type: PromoDiscountType;
      discount_value: number;
      min_subtotal: number;
      max_activations: number;
      per_user_limit: number;
      starts_at: Date;
      ends_at: Date;
      is_enabled: boolean;
      all_catalog: boolean;
      is_system: boolean;
      legacy_rule: string | null;
      created_at: Date;
      updated_at: Date;
      scope_targets: Array<{ target_type: PromoScopeTargetType }>;
    };
    activeActivations: number;
  }) {
    const scopeSummary = buildScopeSummary({
      allCatalog: input.promo.all_catalog,
      categoryCount: input.promo.scope_targets.filter(
        (target: { target_type: PromoScopeTargetType }) =>
          target.target_type === "CATEGORY",
      ).length,
      subcategoryCount: input.promo.scope_targets.filter(
        (target: { target_type: PromoScopeTargetType }) =>
          target.target_type === "SUBCATEGORY",
      ).length,
      itemCount: input.promo.scope_targets.filter(
        (target: { target_type: PromoScopeTargetType }) =>
          target.target_type === "ITEM",
      ).length,
      listingCount: input.promo.scope_targets.filter(
        (target: { target_type: PromoScopeTargetType }) =>
          target.target_type === "LISTING",
      ).length,
    });
    const hasLegacyListingScope = scopeSummary.listingCount > 0;
    const status = computePromoStatus({
      startsAt: input.promo.starts_at,
      endsAt: input.promo.ends_at,
      isEnabled: input.promo.is_enabled,
      activeActivations: input.activeActivations,
      maxActivations: input.promo.max_activations,
    });

    return {
      id: input.promo.public_id,
      code: input.promo.code,
      discountType:
        input.promo.discount_type === "PERCENT" ? "percent" : "fixed_amount",
      discountValue: input.promo.discount_value,
      minSubtotal: input.promo.min_subtotal,
      maxActivations: input.promo.max_activations,
      perUserLimit: input.promo.per_user_limit,
      usedActivations: input.activeActivations,
      remainingActivations: Math.max(
        0,
        input.promo.max_activations - input.activeActivations,
      ),
      startsAt: input.promo.starts_at.toISOString(),
      endsAt: input.promo.ends_at.toISOString(),
      isEnabled: input.promo.is_enabled,
      isSystem: input.promo.is_system,
      legacyRule: input.promo.legacy_rule,
      allCatalog: input.promo.all_catalog,
      status,
      scopeSummary,
      hasLegacyListingScope,
      canEditCode:
        input.activeActivations === 0 &&
        !input.promo.is_system &&
        status !== "expired" &&
        !hasLegacyListingScope,
      readOnly:
        input.promo.is_system || status === "expired" || hasLegacyListingScope,
      createdAt: input.promo.created_at.toISOString(),
      updatedAt: input.promo.updated_at.toISOString(),
    };
  }

  async listPromos(query: Record<string, unknown>) {
    const tab = query.tab === "expired" ? "expired" : "current";
    const promos = await this.prisma.promoCode.findMany({
      include: {
        scope_targets: {
          select: {
            target_type: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    const activationCounts = await this.countActiveActivationsByPromoIds(
      promos.map((promo) => promo.id),
    );

    const items = promos
      .map((promo) =>
        this.serializePromo({
          promo,
          activeActivations: activationCounts.get(promo.id) ?? 0,
        }),
      )
      .filter((promo) =>
        tab === "expired" ? promo.status === "expired" : promo.status !== "expired",
      );

    return { tab, items };
  }

  async getPromo(publicId: string) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { public_id: publicId },
      include: {
        scope_targets: {
          include: {
            category: { select: { public_id: true, name: true } },
            subcategory: {
              select: {
                public_id: true,
                name: true,
                category: { select: { public_id: true, name: true } },
              },
            },
            item: {
              select: {
                public_id: true,
                name: true,
                subcategory: {
                  select: {
                    public_id: true,
                    name: true,
                    category: { select: { public_id: true, name: true } },
                  },
                },
              },
            },
          },
          orderBy: [{ id: "asc" }],
        },
      },
    });

    if (!promo) {
      throw notFound("Промокод не найден");
    }

    const activeActivations = await this.prisma.promoActivation.count({
      where: {
        promo_code_id: promo.id,
        status: { in: ["RESERVED", "CONSUMED"] },
      },
    });

    const base = this.serializePromo({ promo, activeActivations });
    return {
      ...base,
      scope: {
        allCatalog: promo.all_catalog,
        categoryIds: promo.scope_targets
          .filter((target) => target.target_type === "CATEGORY" && target.category)
          .map((target) => target.category!.public_id),
        subcategoryIds: promo.scope_targets
          .filter(
            (target) => target.target_type === "SUBCATEGORY" && target.subcategory,
          )
          .map((target) => target.subcategory!.public_id),
        itemIds: promo.scope_targets
          .filter((target) => target.target_type === "ITEM" && target.item)
          .map((target) => target.item!.public_id),
      },
      scopeDetails: {
        categories: promo.scope_targets
          .filter((target) => target.target_type === "CATEGORY" && target.category)
          .map((target) => ({
            id: target.category!.public_id,
            name: target.category!.name,
          })),
        subcategories: promo.scope_targets
          .filter(
            (target) => target.target_type === "SUBCATEGORY" && target.subcategory,
          )
          .map((target) => ({
            id: target.subcategory!.public_id,
            name: target.subcategory!.name,
            categoryId: target.subcategory!.category?.public_id,
            categoryName: target.subcategory!.category?.name,
          })),
        items: promo.scope_targets
          .filter((target) => target.target_type === "ITEM" && target.item)
          .map((target) => ({
            id: target.item!.public_id,
            name: target.item!.name,
            subcategoryId: target.item!.subcategory?.public_id,
            subcategoryName: target.item!.subcategory?.name,
            categoryId: target.item!.subcategory?.category?.public_id,
            categoryName: target.item!.subcategory?.category?.name,
          })),
      },
    };
  }

  async createPromo(body: Record<string, unknown>, actorUserId: number) {
    const code = normalizePromoCode(body.code);
    const discountType = parseDiscountType(body.discountType);
    const discountValue = readDiscountValue(body.discountValue, discountType);
    const minSubtotal = readInteger(body.minSubtotal ?? 0, {
      fieldLabel: "Минимальная сумма корзины",
      min: 0,
    });
    const maxActivations = readInteger(body.maxActivations, {
      fieldLabel: "Лимит активаций",
      min: 1,
    });
    const startsAt = readDate(body.startsAt, "дату начала");
    const endsAt = readDate(body.endsAt, "дату окончания");
    if (endsAt.getTime() < startsAt.getTime()) {
      throw validationError("Дата окончания не может быть раньше даты начала");
    }
    const isEnabled = readBoolean(body.isEnabled, true);
    const scope = await this.resolveScope(body);

    const existingPromo = await this.prisma.promoCode.findUnique({
      where: { code },
      select: { id: true },
    });
    if (existingPromo) {
      throw conflict("Промокод с таким кодом уже существует");
    }

    const created = await this.prisma.promoCode.create({
      data: {
        public_id: makePromoPublicId(),
        code,
        discount_type: discountType,
        discount_value: discountValue,
        min_subtotal: minSubtotal,
        max_activations: maxActivations,
        per_user_limit: 1,
        starts_at: startsAt,
        ends_at: endsAt,
        is_enabled: isEnabled,
        all_catalog: scope.allCatalog,
        is_system: false,
        created_by_id: actorUserId,
        updated_by_id: actorUserId,
        scope_targets: {
          create: [
            ...scope.categoryIds.map((id) => ({
              target_type: PromoScopeTargetType.CATEGORY,
              category_id: id,
            })),
            ...scope.subcategoryIds.map((id) => ({
              target_type: PromoScopeTargetType.SUBCATEGORY,
              subcategory_id: id,
            })),
            ...scope.itemIds.map((id) => ({
              target_type: PromoScopeTargetType.ITEM,
              item_id: id,
            })),
          ],
        },
      },
      select: { public_id: true },
    });

    return this.getPromo(created.public_id);
  }

  async updatePromo(
    publicId: string,
    body: Record<string, unknown>,
    actorUserId: number,
  ) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { public_id: publicId },
      include: {
        scope_targets: { select: { id: true, target_type: true } },
      },
    });

    if (!promo) {
      throw notFound("Промокод не найден");
    }

    const activeActivations = await this.prisma.promoActivation.count({
      where: {
        promo_code_id: promo.id,
        status: { in: ["RESERVED", "CONSUMED"] },
      },
    });

    const status = computePromoStatus({
      startsAt: promo.starts_at,
      endsAt: promo.ends_at,
      isEnabled: promo.is_enabled,
      activeActivations,
      maxActivations: promo.max_activations,
    });

    if (promo.is_system || status === "expired") {
      throw validationError(
        "Системный или истекший промокод нельзя редактировать напрямую. Создайте новый на его основе.",
      );
    }
    if (
      promo.scope_targets.some((target) => target.target_type === "LISTING")
    ) {
      throw validationError(
        "Промокоды с legacy-таргетингом по конкретным товарам нельзя редактировать напрямую. Создайте новый на их основе.",
      );
    }

    const nextCode = normalizePromoCode(body.code ?? promo.code);
    if (activeActivations > 0 && nextCode !== promo.code) {
      throw validationError(
        "После первых активаций код промокода менять нельзя",
      );
    }

    const duplicateCode = await this.prisma.promoCode.findFirst({
      where: {
        code: nextCode,
        id: { not: promo.id },
      },
      select: { id: true },
    });
    if (duplicateCode) {
      throw conflict("Промокод с таким кодом уже существует");
    }

    const discountType = parseDiscountType(body.discountType);
    const discountValue = readDiscountValue(body.discountValue, discountType);
    const minSubtotal = readInteger(body.minSubtotal ?? 0, {
      fieldLabel: "Минимальная сумма корзины",
      min: 0,
    });
    const maxActivations = readInteger(body.maxActivations, {
      fieldLabel: "Лимит активаций",
      min: 1,
    });
    const startsAt = readDate(body.startsAt, "дату начала");
    const endsAt = readDate(body.endsAt, "дату окончания");
    if (endsAt.getTime() < startsAt.getTime()) {
      throw validationError("Дата окончания не может быть раньше даты начала");
    }
    const isEnabled = readBoolean(body.isEnabled, true);
    const scope = await this.resolveScope(body);

    await this.prisma.$transaction(async (tx) => {
      await tx.promoScopeTarget.deleteMany({
        where: { promo_code_id: promo.id },
      });

      await tx.promoCode.update({
        where: { id: promo.id },
        data: {
          code: nextCode,
          discount_type: discountType,
          discount_value: discountValue,
          min_subtotal: minSubtotal,
          max_activations: maxActivations,
          per_user_limit: 1,
          starts_at: startsAt,
          ends_at: endsAt,
          is_enabled: isEnabled,
          all_catalog: scope.allCatalog,
          updated_by_id: actorUserId,
          scope_targets: {
            create: [
              ...scope.categoryIds.map((id) => ({
                target_type: PromoScopeTargetType.CATEGORY,
                category_id: id,
              })),
              ...scope.subcategoryIds.map((id) => ({
                target_type: PromoScopeTargetType.SUBCATEGORY,
                subcategory_id: id,
              })),
              ...scope.itemIds.map((id) => ({
                target_type: PromoScopeTargetType.ITEM,
                item_id: id,
              })),
            ],
          },
        },
      });
    });

    return this.getPromo(publicId);
  }
}
