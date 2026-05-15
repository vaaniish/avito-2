import type { YooKassaPayment } from "../../domain/profile-orders.types";

export class ProfileOrdersPaymentGateway {
  constructor(
    private readonly createYooKassaPayment: (params: {
      amountRub: number;
      description: string;
      metadata: Record<string, string>;
      paymentMethod: "card" | "sbp";
      idempotenceKey?: string;
    }) => Promise<YooKassaPayment>,
    private readonly fetchYooKassaPaymentById: (
      paymentId: string,
    ) => Promise<YooKassaPayment | null>,
    private readonly extractYooKassaPaymentBaseId: (
      paymentIntentId: string,
    ) => string,
  ) {}

  createPayment(params: {
    amountRub: number;
    description: string;
    metadata: Record<string, string>;
    paymentMethod: "card" | "sbp";
    idempotenceKey?: string;
  }): Promise<YooKassaPayment> {
    return this.createYooKassaPayment(params);
  }

  fetchPaymentById(paymentId: string): Promise<YooKassaPayment | null> {
    return this.fetchYooKassaPaymentById(paymentId);
  }

  extractBasePaymentId(paymentIntentId: string): string {
    return this.extractYooKassaPaymentBaseId(paymentIntentId);
  }
}
