import type {
  YooKassaWebhookPayload,
} from "../profile-orders.types";
import type { ResolveYooKassaPaymentService } from "./resolve-yookassa-payment.service";

export class HandleYooKassaWebhookService {
  constructor(
    private readonly paymentResolver: ResolveYooKassaPaymentService,
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

    const resolution = await this.paymentResolver.resolveByPaymentId(paymentId);
    const effectiveStatus = resolution.remoteStatus || webhookStatus;
    const isSucceeded = event === "payment.succeeded" || effectiveStatus === "succeeded";
    const isCanceled = event === "payment.canceled" || effectiveStatus === "canceled";

    if (!isSucceeded && !isCanceled) {
      return { success: true, ignored: true };
    }
    await this.paymentResolver.applyResolution(
      {
        ...resolution,
        outcome: isSucceeded ? "succeeded" : "canceled",
      },
      {
        requestIp: input.requestIp,
        successReason: "payment.webhook.succeeded",
        canceledReason: "payment.webhook.canceled",
      },
    );

    return { success: true };
  }
}
