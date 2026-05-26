import type {
  ProfileOrdersPaymentGatewayPort,
  ProfileOrdersRepositoryPort,
} from "../profile-orders.types";

type PaymentResolutionOutcome = "succeeded" | "canceled" | "pending";

export class ResolveYooKassaPaymentService {
  constructor(
    private readonly repository: ProfileOrdersRepositoryPort,
    private readonly paymentGateway: ProfileOrdersPaymentGatewayPort,
  ) {}

  async resolveByPaymentId(paymentId: string): Promise<{
    paymentId: string;
    outcome: PaymentResolutionOutcome;
    refs: Array<{ txId: number; orderId: number }>;
    remoteStatus: string;
  }> {
    const normalizedPaymentId = paymentId.trim();
    if (!normalizedPaymentId) {
      return {
        paymentId: "",
        outcome: "pending",
        refs: [],
        remoteStatus: "",
      };
    }

    let remoteStatus = "";
    try {
      const payment = await this.paymentGateway.fetchPaymentById(normalizedPaymentId);
      remoteStatus = typeof payment?.status === "string" ? payment.status.trim() : "";
    } catch {
      remoteStatus = "";
    }

    const refs =
      await this.repository.findPaymentTransactionRefsByPaymentId(normalizedPaymentId);

    return {
      paymentId: normalizedPaymentId,
      outcome: this.mapOutcome(remoteStatus),
      refs,
      remoteStatus,
    };
  }

  async applyResolution(
    resolution: {
      outcome: PaymentResolutionOutcome;
      refs: Array<{ txId: number; orderId: number }>;
    },
    params: {
      requestIp: string | null;
      successReason: string;
      canceledReason: string;
    },
  ): Promise<void> {
    if (resolution.refs.length === 0) {
      return;
    }

    if (resolution.outcome === "succeeded") {
      await this.repository.applySuccessfulPayment({
        transactionIds: resolution.refs.map((row) => row.txId),
        orderIds: resolution.refs.map((row) => row.orderId),
        requestIp: params.requestIp,
        reason: params.successReason,
      });
      return;
    }

    if (resolution.outcome === "canceled") {
      await this.repository.applyFailedPayment({
        transactionIds: resolution.refs.map((row) => row.txId),
        orderIds: resolution.refs.map((row) => row.orderId),
        requestIp: params.requestIp,
        reason: params.canceledReason,
      });
    }
  }

  private mapOutcome(status: string): PaymentResolutionOutcome {
    if (status === "succeeded") {
      return "succeeded";
    }
    if (status === "canceled") {
      return "canceled";
    }
    return "pending";
  }
}
