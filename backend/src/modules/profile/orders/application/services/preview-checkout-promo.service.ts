import { validationError } from "../../../../../common/application-error";
import {
  calculateLaunchPromoDiscount,
  LAUNCH_PROMO_CODE,
  LAUNCH_PROMO_MAX_BUYERS,
} from "../../domain/profile-orders.helpers";
import type {
  CheckoutPromoPreviewDto,
  CheckoutPromoPreviewInput,
  ProfileOrdersRepositoryPort,
} from "../../domain/profile-orders.types";

export class PreviewCheckoutPromoService {
  constructor(private readonly repository: ProfileOrdersRepositoryPort) {}

  async execute(input: CheckoutPromoPreviewInput): Promise<CheckoutPromoPreviewDto> {
    const promoCode = input.promoCode.trim().toUpperCase();
    if (!promoCode) {
      throw validationError("Введите промокод");
    }
    if (promoCode !== LAUNCH_PROMO_CODE) {
      throw validationError("Промокод не найден или больше не действует");
    }

    const parsedItems = input.items.filter(
      (item) =>
        item.listingId &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0,
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

    const discountAmount = calculateLaunchPromoDiscount(subtotal);
    if (discountAmount <= 0) {
      throw validationError("Для этой корзины скидка не применяется");
    }

    return {
      success: true,
      code: LAUNCH_PROMO_CODE,
      discountPercent: 15,
      discountAmount,
      subtotal,
      remainingActivations: Math.max(
        0,
        LAUNCH_PROMO_MAX_BUYERS - snapshot.activeDiscountedBuyerCount,
      ),
      message: "Промокод START15 применён к вашему первому заказу",
    };
  }
}
