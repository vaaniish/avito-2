import {
  conflict,
  externalServiceError,
  forbidden,
  preconditionFailed,
  validationError,
} from "../../../../../common/application-error";
import {
  buildCheckoutPolicyDto,
  LISTING_RESERVATION_CONFLICT,
  makeCheckoutIdempotencyHash,
  normalizeDeliveryAddressFromRecord,
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

export class CreateOrderService {
  constructor(
    private readonly repository: ProfileOrdersRepositoryPort,
    private readonly paymentGateway: ProfileOrdersPaymentGatewayPort,
    private readonly notificationWriter: ProfileOrdersNotificationPort,
    private readonly policyReader: ProfileOrdersPolicyPort,
    private readonly helpers: ProfileOrdersServiceHelpers,
  ) {}

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
      addressId: Number.isInteger(input.addressId) ? input.addressId : 0,
      customAddress: input.customAddress,
      pickupPointId: input.pickupPointId,
      pickupPointProvider: input.pickupPointProvider,
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

      if (parsedItems.some((item) => item.quantity !== 1)) {
        throw validationError(
          "Каждое объявление можно добавить в заказ только в количестве 1",
        );
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

        const current = groupedBySeller.get(listing.seller_id) ?? [];
        current.push({
          listing_id: listing.id,
          name: listing.title,
          image: listing.images[0]?.url ?? this.helpers.fallbackListingImage,
          price: listing.price,
          quantity: 1,
        });
        groupedBySeller.set(listing.seller_id, current);
      }

      if (input.paymentMethod !== "card" && input.paymentMethod !== "sbp") {
        throw validationError("Unsupported payment method");
      }

      let deliveryAddress = input.customAddress;
      if (
        !deliveryAddress &&
        Number.isInteger(input.addressId) &&
        input.addressId > 0
      ) {
        const selectedAddress = await this.repository.findUserAddressByIdForUser({
          addressId: input.addressId,
          userId: input.actorUserId,
        });
        if (selectedAddress) {
          deliveryAddress = normalizeDeliveryAddressFromRecord({
            address: selectedAddress,
            helpers: this.helpers,
          });
        }
      }

      if (!deliveryAddress) {
        const defaultAddress = await this.repository.findDefaultAddressForUser(
          input.actorUserId,
        );
        if (defaultAddress) {
          deliveryAddress = normalizeDeliveryAddressFromRecord({
            address: defaultAddress,
            helpers: this.helpers,
          });
        }
      }

      if (input.deliveryType === "DELIVERY" && !deliveryAddress) {
        throw validationError("Укажите адрес доставки");
      }

      if (input.deliveryType === "DELIVERY" && !input.pickupPointId) {
        throw validationError("Pickup point id is required for delivery");
      }

      const hasCheckoutDelivery = input.deliveryType === "DELIVERY";
      const checkoutDeliveryCost = hasCheckoutDelivery ? 500 : 0;
      const preparedOrders = Array.from(groupedBySeller.entries()).map(
        ([sellerId, items], index) => {
          const subtotal = items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
          );
          const deliveryCost =
            hasCheckoutDelivery && index === 0 ? checkoutDeliveryCost : 0;
          const totalPrice = subtotal + deliveryCost;
          const publicId = `ORD-${Date.now()}-${index + 1}`;
          return {
            sellerId,
            items,
            deliveryCost,
            discount: 0,
            totalPrice,
            publicId,
          };
        },
      );

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
        description: `РћРїР»Р°С‚Р° Р·Р°РєР°Р·Р° РІ Ecomm (${preparedOrders.length} С€С‚.)`,
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

      const createdOrders = await this.repository.createCheckoutOrders({
        buyerId: input.actorUserId,
        deliveryType: input.deliveryType,
        deliveryAddress: deliveryAddress || "",
        pickupPointId: input.pickupPointId,
        pickupPointProvider: input.pickupPointProvider,
        preparedOrders,
        requestIp: input.requestIp,
        paymentIntentIdBase: yookassaPayment.id ?? `pay_${Date.now()}`,
        commissionRateBySellerId,
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
