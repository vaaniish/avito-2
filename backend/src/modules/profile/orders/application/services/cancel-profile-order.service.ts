import {
  conflict,
  externalServiceError,
  notFound,
} from "../../../../../common/application-error";
import {
  canBuyerCancelOrder,
  mapBuyerOrder,
  uniqueNumbers,
} from "../profile-orders.helpers";
import type {
  BuyerProfileOrderDto,
  ProfileOrdersPaymentGatewayPort,
  ProfileOrdersRepositoryPort,
  ProfileOrdersServiceHelpers,
} from "../profile-orders.types";

export class CancelProfileOrderService {
  constructor(
    private readonly repository: ProfileOrdersRepositoryPort,
    private readonly paymentGateway: ProfileOrdersPaymentGatewayPort,
    private readonly helpers: ProfileOrdersServiceHelpers,
  ) {}

  async execute(input: {
    buyerId: number;
    orderPublicId: string;
    requestIp: string | null;
  }): Promise<{
    success: true;
    order: BuyerProfileOrderDto;
    message: string;
  }> {
    const order = await this.repository.findBuyerOrderForCancellation({
      buyerId: input.buyerId,
      orderPublicId: input.orderPublicId,
    });

    if (!order) {
      throw notFound("Заказ не найден");
    }

    if (!canBuyerCancelOrder(order.status)) {
      throw conflict("Отменить заказ можно только до статуса PREPARED");
    }

    const latestTransaction = order.transactions[0] ?? null;
    const successfulPayment =
      latestTransaction &&
      latestTransaction.payment_provider === "YOOMONEY" &&
      latestTransaction.status === "SUCCESS"
        ? latestTransaction
        : null;

    if (
      (order.status === "PAID" || order.status === "PROCESSING") &&
      !successfulPayment
    ) {
      throw conflict(
        "Не удалось оформить отмену: по заказу не найден успешный платеж для возврата",
      );
    }

    if (successfulPayment) {
      const basePaymentId = this.paymentGateway.extractBasePaymentId(
        successfulPayment.payment_intent_id,
      );
      if (!basePaymentId) {
        throw externalServiceError(
          "Не удалось определить платеж YooKassa для возврата",
        );
      }

      let refund;
      try {
        refund = await this.paymentGateway.refundPayment({
          paymentId: basePaymentId,
          amountRub: successfulPayment.amount,
          description: `Возврат по заказу ${order.public_id}`,
          idempotenceKey: `order-cancel-${successfulPayment.public_id}`,
        });
      } catch (error) {
        throw externalServiceError(
          error instanceof Error
            ? `Не удалось оформить возврат через YooKassa: ${error.message}`
            : "Не удалось оформить возврат через YooKassa",
        );
      }

      if (refund.status !== "succeeded") {
        throw externalServiceError(
          "YooKassa не подтвердила возврат. Заказ не был отменен",
          { refundStatus: refund.status },
        );
      }
    }

    await this.repository.cancelBuyerOrder({
      buyerId: input.buyerId,
      orderId: order.id,
      currentStatus: order.status,
      transactionId: latestTransaction?.id ?? null,
      markRefunded: successfulPayment !== null,
      requestIp: input.requestIp,
      reason: successfulPayment
        ? "buyer.order_cancelled.refunded"
        : "buyer.order_cancelled",
    });

    const updatedOrder = await this.repository.findBuyerOrderDetailedByPublicId({
      buyerId: input.buyerId,
      orderPublicId: input.orderPublicId,
    });

    if (!updatedOrder) {
      throw notFound("Отмененный заказ не найден");
    }

    const listingIds = updatedOrder.items
      .map((item) => item.listing_id)
      .filter((listingId): listingId is number => typeof listingId === "number");
    const reviewedListingIds = await this.repository.findReviewedListingIds({
      authorId: input.buyerId,
      listingIds: uniqueNumbers(listingIds),
    });

    return {
      success: true,
      order: mapBuyerOrder(updatedOrder, reviewedListingIds, this.helpers),
      message: successfulPayment
        ? "Заказ отменен, возврат денег оформлен"
        : "Заказ отменен",
    };
  }
}
