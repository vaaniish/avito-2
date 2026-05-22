import { validationError } from "../../../../../common/application-error";
import {
  calculateLaunchPromoDiscount,
  LAUNCH_PROMO_MAX_BUYERS,
} from "../../domain/profile-orders.helpers";
import type {
  CheckoutRequestItem,
  ProfileOrdersRepositoryPort,
  PromoEligibilityResult,
} from "../../domain/profile-orders.types";

type PromoListingMatchContext = {
  listingId: number;
  itemId: number | null;
  subcategoryId: number | null;
  categoryId: number | null;
};

function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

function matchListingAgainstPromoScope(
  promo: NonNullable<Awaited<ReturnType<ProfileOrdersRepositoryPort["findPromoByCode"]>>>,
  context: PromoListingMatchContext,
): boolean {
  if (promo.all_catalog) return true;

  return promo.scope_targets.some((target) => {
    if (target.target_type === "CATEGORY") {
      return target.category_id !== null && target.category_id === context.categoryId;
    }
    if (target.target_type === "SUBCATEGORY") {
      return target.subcategory_id !== null && target.subcategory_id === context.subcategoryId;
    }
    if (target.target_type === "ITEM") {
      return target.item_id !== null && target.item_id === context.itemId;
    }
    return target.listing_id !== null && target.listing_id === context.listingId;
  });
}

export class PromoEngineService {
  constructor(private readonly repository: ProfileOrdersRepositoryPort) {}

  async evaluate(input: {
    actorUserId: number;
    promoCode: string;
    items: CheckoutRequestItem[];
  }): Promise<PromoEligibilityResult> {
    const promoCode = normalizePromoCode(input.promoCode);
    if (!promoCode) {
      throw validationError("Введите промокод");
    }

    const promo = await this.repository.findPromoByCode(promoCode);
    if (!promo) {
      throw validationError("Промокод не найден или больше не действует");
    }

    const now = new Date();
    if (!promo.is_enabled) {
      throw validationError("Промокод временно выключен");
    }
    if (promo.starts_at.getTime() > now.getTime()) {
      throw validationError("Промокод ещё не начал действовать");
    }
    if (promo.ends_at.getTime() < now.getTime()) {
      throw validationError("Срок действия промокода истёк");
    }

    const parsedItems = input.items.filter(
      (item) => item.listingId && Number.isInteger(item.quantity) && item.quantity > 0,
    );
    if (parsedItems.length === 0) {
      throw validationError("Добавьте товары в корзину, чтобы применить промокод");
    }

    const listingPublicIds = [...new Set(parsedItems.map((item) => item.listingId))];
    const listings = await this.repository.findApprovedActiveListingsByPublicIds(listingPublicIds);
    if (listings.length !== listingPublicIds.length) {
      throw validationError("Некоторые товары недоступны. Обновите корзину и попробуйте снова");
    }

    const listingByPublicId = new Map(listings.map((listing) => [listing.public_id, listing]));
    const subtotal = parsedItems.reduce((sum, item) => {
      const listing = listingByPublicId.get(item.listingId);
      if (!listing) return sum;
      return sum + listing.price * item.quantity;
    }, 0);

    const eligibleListingPublicIds = new Set<string>();
    const eligibleSubtotal = parsedItems.reduce((sum, item) => {
      const listing = listingByPublicId.get(item.listingId);
      if (!listing) return sum;

      const matches = matchListingAgainstPromoScope(promo, {
        listingId: listing.id,
        itemId: listing.item_id,
        subcategoryId: listing.item?.subcategory_id ?? null,
        categoryId: listing.item?.subcategory.category_id ?? null,
      });
      if (!matches) return sum;

      eligibleListingPublicIds.add(listing.public_id);
      return sum + listing.price * item.quantity;
    }, 0);

    if (eligibleListingPublicIds.size === 0 || eligibleSubtotal <= 0) {
      throw validationError("В корзине нет товаров, подходящих под условия промокода");
    }

    if (eligibleSubtotal < promo.min_subtotal) {
      throw validationError("Минимальная сумма подходящих товаров для промокода не достигнута");
    }

    if (promo.legacy_rule === "FIRST_PAID_ORDER_100_BUYERS") {
      const snapshot = await this.repository.getLaunchPromoSnapshot(input.actorUserId);
      if (snapshot.hasActiveDiscountedOrder) {
        throw validationError("Промокод уже используется в вашем активном заказе");
      }
      if (snapshot.hasSuccessfulOrders) {
        throw validationError("Промокод START15 действует только на первый оплачиваемый заказ");
      }
      if (snapshot.activeDiscountedBuyerCount >= LAUNCH_PROMO_MAX_BUYERS) {
        throw validationError("Лимит промокода для первых 100 покупателей уже исчерпан");
      }
    } else {
      const activeUserActivations = await this.repository.countActivePromoActivationsForUser({
        promoId: promo.id,
        userId: input.actorUserId,
      });
      if (activeUserActivations >= promo.per_user_limit) {
        throw validationError("Вы уже использовали этот промокод");
      }
    }

    const activeActivations = await this.repository.countActivePromoActivations(promo.id);
    if (activeActivations >= promo.max_activations) {
      throw validationError("Лимит активаций этого промокода уже исчерпан");
    }

    const discountAmount =
      promo.legacy_rule === "FIRST_PAID_ORDER_100_BUYERS"
        ? calculateLaunchPromoDiscount(eligibleSubtotal)
        : promo.discount_type === "PERCENT"
          ? Math.max(0, Math.floor((eligibleSubtotal * promo.discount_value) / 100))
          : Math.max(0, Math.min(promo.discount_value, eligibleSubtotal));

    if (discountAmount <= 0) {
      throw validationError("Для этой корзины скидка не применяется");
    }

    const remainingActivations = Math.max(0, promo.max_activations - activeActivations);
    const discountPercent =
      promo.legacy_rule === "FIRST_PAID_ORDER_100_BUYERS"
        ? 15
        : promo.discount_type === "PERCENT"
          ? promo.discount_value
          : null;

    return {
      promo: {
        id: promo.id,
        public_id: promo.public_id,
        code: promo.code,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        min_subtotal: promo.min_subtotal,
        max_activations: promo.max_activations,
        per_user_limit: promo.per_user_limit,
        starts_at: promo.starts_at,
        ends_at: promo.ends_at,
        is_enabled: promo.is_enabled,
        all_catalog: promo.all_catalog,
        is_system: promo.is_system,
        legacy_rule: promo.legacy_rule,
      },
      subtotal,
      eligibleSubtotal,
      discountAmount,
      discountPercent,
      remainingActivations,
      eligibleListingPublicIds,
      message:
        promo.legacy_rule === "FIRST_PAID_ORDER_100_BUYERS"
          ? "Промокод START15 применён к вашему первому заказу"
          : `Промокод ${promo.code} применён`,
    };
  }
}
