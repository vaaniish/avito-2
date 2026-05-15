import { validationError } from "../../../../../common/application-error";
import { uniqueStrings } from "../profile-orders.helpers";
import type {
  BuyerOrderPaymentStatusRow,
  OrderPaymentStatusDto,
  ProfileOrdersPaymentGatewayPort,
  ProfileOrdersRepositoryPort,
} from "../profile-orders.types";

export class GetOrderPaymentStatusService {
  constructor(
    private readonly repository: ProfileOrdersRepositoryPort,
    private readonly paymentGateway: ProfileOrdersPaymentGatewayPort,
  ) {}

  async execute(input: {
    buyerId: number;
    orderPublicIds: string[];
    requestIp: string | null;
  }): Promise<OrderPaymentStatusDto> {
    const normalizedOrderIds = uniqueStrings(
      input.orderPublicIds.map((value) => value.trim()).filter(Boolean),
    );

    if (normalizedOrderIds.length === 0) {
      throw validationError("orderIds query is required");
    }

    let orders = await this.repository.findOrdersByBuyerAndPublicIds({
      buyerId: input.buyerId,
      orderPublicIds: normalizedOrderIds,
    });

    const latestTransactions = orders
      .map((order) => order.transactions[0] ?? null)
      .filter(
        (
          tx,
        ): tx is NonNullable<BuyerOrderPaymentStatusRow["transactions"][number]> =>
          tx !== null &&
          tx.payment_provider === "YOOMONEY" &&
          (tx.status === "HELD" || tx.status === "PENDING"),
      );

    if (latestTransactions.length > 0) {
      const groupedByBasePaymentId = new Map<
        string,
        Array<{ txId: number; orderId: number }>
      >();

      for (const tx of latestTransactions) {
        const basePaymentId = this.paymentGateway.extractBasePaymentId(
          tx.payment_intent_id,
        );
        if (!basePaymentId) {
          continue;
        }
        const current = groupedByBasePaymentId.get(basePaymentId) ?? [];
        current.push({ txId: tx.id, orderId: tx.order_id });
        groupedByBasePaymentId.set(basePaymentId, current);
      }

      const succeededTxIds: number[] = [];
      const succeededOrderIds: number[] = [];
      const failedTxIds: number[] = [];
      const failedOrderIds: number[] = [];

      const lookupResults = await Promise.all(
        Array.from(groupedByBasePaymentId.entries()).map(
          async ([basePaymentId, refs]) => {
            try {
              const payment = await this.paymentGateway.fetchPaymentById(
                basePaymentId,
              );
              return {
                refs,
                status: payment?.status ?? "",
              };
            } catch {
              return {
                refs,
                status: "",
              };
            }
          },
        ),
      );

      for (const result of lookupResults) {
        if (result.status === "succeeded") {
          for (const ref of result.refs) {
            succeededTxIds.push(ref.txId);
            succeededOrderIds.push(ref.orderId);
          }
          continue;
        }
        if (result.status === "canceled") {
          for (const ref of result.refs) {
            failedTxIds.push(ref.txId);
            failedOrderIds.push(ref.orderId);
          }
        }
      }

      if (succeededTxIds.length > 0) {
        await this.repository.applySuccessfulPayment({
          transactionIds: succeededTxIds,
          orderIds: succeededOrderIds,
          requestIp: input.requestIp,
          reason: "payment.poll.succeeded",
        });
      }

      if (failedTxIds.length > 0) {
        await this.repository.applyFailedPayment({
          transactionIds: failedTxIds,
          orderIds: failedOrderIds,
          requestIp: input.requestIp,
          reason: "payment.poll.canceled",
        });
      }

      if (succeededTxIds.length > 0 || failedTxIds.length > 0) {
        orders = await this.repository.findOrdersByBuyerAndPublicIds({
          buyerId: input.buyerId,
          orderPublicIds: normalizedOrderIds,
        });
      }
    }

    const paymentOrders = orders.map((order) => ({
      orderId: order.public_id,
      orderStatus: order.status,
      paymentStatus: order.transactions[0]?.status ?? null,
      paymentProvider: order.transactions[0]?.payment_provider ?? null,
      paymentIntentId: order.transactions[0]?.payment_intent_id ?? null,
    }));

    const hasFailed = paymentOrders.some(
      (order) =>
        order.orderStatus === "CANCELLED" ||
        order.paymentStatus === "FAILED" ||
        order.paymentStatus === "CANCELLED",
    );
    const isPaid =
      paymentOrders.length > 0 &&
      paymentOrders.every(
        (order) =>
          order.orderStatus === "PAID" || order.paymentStatus === "SUCCESS",
      );

    return {
      summary: hasFailed ? "failed" : isPaid ? "paid" : "pending",
      orders: paymentOrders,
    };
  }
}
