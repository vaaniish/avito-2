import type {
  ProfileOrdersPaymentGatewayPort,
  ProfileOrdersRepositoryPort,
  YooKassaWebhookPayload,
} from "../profile-orders.types";

export class HandleYooKassaWebhookService {
  constructor(
    private readonly repository: ProfileOrdersRepositoryPort,
    private readonly paymentGateway: ProfileOrdersPaymentGatewayPort,
  ) {}

  async execute(input: {
    payload: YooKassaWebhookPayload;
    requestIp: string | null;
  }): Promise<{ success: boolean; ignored?: boolean }> {
    const event = typeof input.payload.event === "string"
      ? input.payload.event.trim()
      : "";
    const paymentId =
      input.payload.object && typeof input.payload.object.id === "string"
        ? input.payload.object.id.trim()
        : "";
    const webhookStatus =
      input.payload.object && typeof input.payload.object.status === "string"
        ? input.payload.object.status.trim()
        : "";

    if (!paymentId) {
      return { success: true, ignored: true };
    }

    let effectiveStatus = webhookStatus;
    try {
      const remotePayment = await this.paymentGateway.fetchPaymentById(paymentId);
      if (remotePayment?.status) {
        effectiveStatus = remotePayment.status;
      }
    } catch (error) {
      console.warn("Unable to validate YooKassa payment in webhook:", error);
    }

    const isSucceeded =
      event === "payment.succeeded" || effectiveStatus === "succeeded";
    const isCanceled =
      event === "payment.canceled" || effectiveStatus === "canceled";

    if (!isSucceeded && !isCanceled) {
      return { success: true, ignored: true };
    }

    const matchedRefs =
      await this.repository.findPaymentTransactionRefsByPaymentId(paymentId);

    if (matchedRefs.length === 0) {
      return { success: true };
    }

    if (isSucceeded) {
      await this.repository.applySuccessfulPayment({
        transactionIds: matchedRefs.map((row) => row.txId),
        orderIds: matchedRefs.map((row) => row.orderId),
        requestIp: input.requestIp,
        reason: "payment.webhook.succeeded",
      });
    } else {
      await this.repository.applyFailedPayment({
        transactionIds: matchedRefs.map((row) => row.txId),
        orderIds: matchedRefs.map((row) => row.orderId),
        requestIp: input.requestIp,
        reason: "payment.webhook.canceled",
      });
    }

    return { success: true };
  }
}
