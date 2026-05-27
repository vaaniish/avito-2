import {
  conflict,
  externalServiceError,
  forbidden,
  preconditionFailed,
  validationError,
} from "../../../../../common/application-error";
import { makeOpaquePublicId } from "../../../../../common/domain/public-id";
import {
  buildCheckoutPolicyDto,
  LISTING_RESERVATION_CONFLICT,
  makeCheckoutIdempotencyHash,
  uniqueStrings,
} from "../profile-orders.helpers";
import type {
  CheckoutRequestInput,
  CreateOrderCheckoutDto,
  ProfileOrdersNotificationPort,
  ProfileOrdersPaymentGatewayPort,
  ProfileOrdersPolicyPort,
  ProfileOrdersRepositoryPort,
  ProfileOrdersServiceHelpers,
} from "../profile-orders.types";
import { PromoEngineService } from "./promo-engine.service";

export class CreateOrderService {
  private readonly promoEngine: PromoEngineService;

  constructor(
    private readonly repository: ProfileOrdersRepositoryPort,
    private readonly paymentGateway: ProfileOrdersPaymentGatewayPort,
    private readonly notificationWriter: ProfileOrdersNotificationPort,
    private readonly policyReader: ProfileOrdersPolicyPort,
    private readonly helpers: ProfileOrdersServiceHelpers,
  ) {
    this.promoEngine = new PromoEngineService(repository);
  }

  async execute(input: CheckoutRequestInput): Promise<CreateOrderCheckoutDto> {
    if (input.actorRole === this.helpers.roleAdmin) {
      throw forbidden(
        "Администратор не может оформлять покупки со своего аккаунта.",
      );
    }

    const checkoutPolicyStatus =
      await this.policyReader.getCheckoutPolicyStatus(input.actorUserId);
    if (!checkoutPolicyStatus.accepted) {
      throw preconditionFailed(
        "Before checkout, accept the current marketplace checkout policy.",
        {
          policy: buildCheckoutPolicyDto(checkoutPolicyStatus.policy),
        },
      );
    }

    if (!input.idempotencyKey) {
      throw validationError("Idempotency-Key header is required");
    }
    if (input.idempotencyKey.length > 180) {
      throw validationError("Idempotency-Key is too long");
    }

    const parsedItems = input.items.filter(
      (item) =>
        item.listingId &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0,
    );
    const idempotencyHash = makeCheckoutIdempotencyHash({
      deliveryType: input.deliveryType,
      paymentMethod: input.paymentMethod || "card",
      pickupPointAddress: input.pickupPointAddress,
      pickupPointId: input.pickupPointId,
      pickupPointProvider: input.pickupPointProvider,
      promoCode: input.promoCode,
      items: parsedItems
        .map((item) => ({
          listingId: item.listingId,
          quantity: item.quantity,
        }))
        .sort((left, right) => left.listingId.localeCompare(right.listingId)),
    });
    const idempotencyStart = await this.repository.beginCheckoutIdempotency({
      actorUserId: input.actorUserId,
      key: input.idempotencyKey,
      requestHash: idempotencyHash,
    });

    if (idempotencyStart.kind === "cached") {
      return idempotencyStart.body as CreateOrderCheckoutDto;
    }

    if (idempotencyStart.kind === "conflict") {
      throw conflict(idempotencyStart.message);
    }

    let idempotencyRecordId: number | null = idempotencyStart.recordId;
    const complete = async (statusCode: number, body: CreateOrderCheckoutDto) => {
      if (idempotencyRecordId !== null) {
        await this.repository.completeCheckoutIdempotency({
          recordId: idempotencyRecordId,
          statusCode,
          body,
        });
        idempotencyRecordId = null;
      }
      return body;
    };

    try {
      if (parsedItems.length === 0) {
        throw validationError("Корзина пуста или содержит некорректные позиции");
      }

      const hasDuplicateListings =
        new Set(parsedItems.map((item) => item.listingId)).size !==
        parsedItems.length;
      if (hasDuplicateListings) {
        throw validationError(
          "Нельзя оформить один и тот же товар в заказе несколько раз",
        );
      }

      const listingPublicIds = uniqueStrings(
        parsedItems.map((item) => item.listingId),
      );
      const listings =
        await this.repository.findApprovedActiveListingsByPublicIds(
          listingPublicIds,
        );

      if (listings.length !== listingPublicIds.length) {
        throw validationError("Некоторые товары недоступны для заказа");
      }

      const listingByPublicId = new Map(
        listings.map((listing) => [listing.public_id, listing]),
      );
      const listingPublicIdById = new Map(
        listings.map((listing) => [listing.id, listing.public_id]),
      );
      const subtotal = parsedItems.reduce((sum, item) => {
        const listing = listingByPublicId.get(item.listingId);
        if (!listing) return sum;
        return sum + listing.price * item.quantity;
      }, 0);
      const groupedBySeller = new Map<
        number,
        Array<{
          listing_id: number;
          name: string;
          image: string | null;
          price: number;
          quantity: number;
        }>
      >();

      for (const item of parsedItems) {
        const listing = listingByPublicId.get(item.listingId);
        if (!listing) {
          throw validationError(`Товар ${item.listingId} не найден`);
        }

        if (listing.seller_id === input.actorUserId) {
          throw validationError(
            "Нельзя оформить покупку собственного объявления.",
          );
        }

        if (!listing.has_multiple_stock && item.quantity > 1) {
          throw validationError(
            `Товар ${listing.title} доступен только в количестве 1`,
          );
        }

        if (item.quantity > listing.available_quantity) {
          throw validationError(
            `Для товара ${listing.title} доступно только ${listing.available_quantity} шт.`,
          );
        }

        const current = groupedBySeller.get(listing.seller_id) ?? [];
        current.push({
          listing_id: listing.id,
          name: listing.title,
          image: listing.images[0]?.url ?? this.helpers.fallbackListingImage,
          price: listing.price,
          quantity: item.quantity,
        });
        groupedBySeller.set(listing.seller_id, current);
      }

      let globalDiscount = 0;
      let appliedPromoCode: string | null = null;
      let reservedPromoId: number | null = null;
      let eligibleListingPublicIds = new Set<string>();

      if (input.promoCode.trim()) {
        const promoEvaluation = await this.promoEngine.evaluate({
          actorUserId: input.actorUserId,
          promoCode: input.promoCode,
          items: parsedItems,
        });
        globalDiscount = promoEvaluation.discountAmount;
        appliedPromoCode = promoEvaluation.promo.code;
        reservedPromoId = promoEvaluation.promo.id;
        eligibleListingPublicIds = promoEvaluation.eligibleListingPublicIds;
      }

      if (input.paymentMethod !== "card" && input.paymentMethod !== "sbp") {
        throw validationError("Unsupported payment method");
      }

      const pickupPointAddress = input.pickupPointAddress.trim();
      if (input.deliveryType === "DELIVERY" && !pickupPointAddress) {
        throw validationError("Укажите ПВЗ для доставки");
      }

      if (input.deliveryType === "DELIVERY" && !input.pickupPointId) {
        throw validationError("Pickup point id is required for pickup-point delivery");
      }

      const hasCheckoutDelivery = input.deliveryType === "DELIVERY";
      const checkoutDeliveryCost = hasCheckoutDelivery ? 500 : 0;
      const sellerOrderDrafts = Array.from(groupedBySeller.entries()).map(
        ([sellerId, items], index) => {
          const sellerSubtotal = items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          );
          const publicId = makeOpaquePublicId("ORD", 20);
          return {
            sellerId,
            items,
            publicId,
            subtotal: sellerSubtotal,
          };
        },
      );

      const totalEligibleSubtotal = sellerOrderDrafts.reduce((sum, draft) => {
        const eligibleSubtotal = draft.items.reduce((subtotalBySeller, item) => {
          const listingPublicId = listingPublicIdById.get(item.listing_id);
          if (!listingPublicId || !eligibleListingPublicIds.has(listingPublicId)) {
            return subtotalBySeller;
          }
          return subtotalBySeller + item.price * item.quantity;
        }, 0);
        return sum + eligibleSubtotal;
      }, 0);

      let remainingDiscount = globalDiscount;
      const preparedOrders = sellerOrderDrafts.map((draft, index) => {
        const deliveryCost = hasCheckoutDelivery && index === 0 ? checkoutDeliveryCost : 0;
        const eligibleSellerSubtotal = draft.items.reduce((subtotalBySeller, item) => {
          const listingPublicId = listingPublicIdById.get(item.listing_id);
          if (!listingPublicId || !eligibleListingPublicIds.has(listingPublicId)) {
            return subtotalBySeller;
          }
          return subtotalBySeller + item.price * item.quantity;
        }, 0);

        const proportionalDiscount =
          index === sellerOrderDrafts.length - 1
            ? remainingDiscount
            : Math.min(
                eligibleSellerSubtotal,
                Math.floor(
                  (globalDiscount * eligibleSellerSubtotal) /
                    Math.max(1, totalEligibleSubtotal || subtotal),
                ),
              );
        remainingDiscount = Math.max(0, remainingDiscount - proportionalDiscount);
        return {
          sellerId: draft.sellerId,
          items: draft.items,
          deliveryCost,
          discount: proportionalDiscount,
          totalPrice: draft.subtotal - proportionalDiscount + deliveryCost,
          publicId: draft.publicId,
        };
      });

      const totalAmount = preparedOrders.reduce(
        (sum, order) => sum + order.totalPrice,
        0,
      );
      const commissionRateBySellerId = new Map<number, number>();
      for (const preparedOrder of preparedOrders) {
        const commissionRate = await this.repository.getCommissionRateForSeller(
          preparedOrder.sellerId,
        );
        commissionRateBySellerId.set(preparedOrder.sellerId, commissionRate);
      }

      const yookassaPayment = await this.paymentGateway.createPayment({
        amountRub: totalAmount,
        description: `Оплата заказа в Ecomm (${preparedOrders.length} шт.)`,
        metadata: {
          source: "avito-2",
          buyer_id: String(input.actorUserId),
          orders_count: String(preparedOrders.length),
        },
        paymentMethod: input.paymentMethod,
        idempotenceKey: `${input.idempotencyKey}:payment`,
      });

      if (!yookassaPayment?.confirmation?.confirmation_url) {
        throw externalServiceError(
          "YooKassa did not return confirmation URL for redirect payment",
        );
      }
      const paymentIntentIdBase = yookassaPayment.id ?? `pay_${Date.now()}`;
      const checkoutGroupKey = paymentIntentIdBase;

      const createdOrders = await this.repository.createCheckoutOrders({
        buyerId: input.actorUserId,
        deliveryType: input.deliveryType,
        pickupPointAddress,
        pickupPointId: input.pickupPointId,
        pickupPointProvider: input.pickupPointProvider,
        checkoutGroupKey,
        preparedOrders,
        requestIp: input.requestIp,
        paymentIntentIdBase,
        commissionRateBySellerId,
        promoReservation:
          reservedPromoId !== null
            ? {
                promoId: reservedPromoId,
                buyerId: input.actorUserId,
                checkoutGroupKey,
              }
            : null,
        appendPickupPointMetaToAddress:
          this.helpers.appendPickupPointMetaToAddress,
      });

      await this.notificationWriter.notifySellersAboutNewOrders(createdOrders);

      return complete(201, {
        success: true,
        orders: createdOrders.map((order) => ({
          order_id: order.order_id,
          total_price: order.total_price,
        })),
        total: createdOrders.reduce((sum, order) => sum + order.total_price, 0),
        discount: globalDiscount,
        promoCode: appliedPromoCode,
        payment: {
          provider: "yoomoney",
          paymentId: yookassaPayment?.id ?? null,
          status: yookassaPayment?.status ?? null,
          confirmationUrl:
            yookassaPayment?.confirmation?.confirmation_url ?? null,
        },
      });
    } catch (error) {
      if (idempotencyRecordId !== null) {
        try {
          await this.repository.abortCheckoutIdempotency(idempotencyRecordId);
        } catch (abortError) {
          console.warn(
            "Unable to cleanup checkout idempotency record:",
            abortError,
          );
        }
      }

      if (error instanceof Error) {
        if (error.message.includes(LISTING_RESERVATION_CONFLICT)) {
          throw conflict("Товар уже зарезервирован другим покупателем");
        }
        if (
          error.message.includes("YooKassa") ||
          error.message.includes("YooMoney")
        ) {
          throw externalServiceError(error.message);
        }
      }

      throw error;
    }
  }
}
