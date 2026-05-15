import { conflict, notFound, validationError } from "../../../../../common/application-error";
import { assertOrderStatusTransitionAllowed } from "../../../../orders/order-status-fsm";
import { parseSellerEditableOrderStatus } from "../../domain/partner-orders.helpers";
import type {
  PartnerOrdersDeliveryGatewayPort,
  PartnerOrdersNotificationPort,
  PartnerOrdersRepositoryPort,
} from "../../domain/partner-orders.types";

export class UpdatePartnerOrderStatusService {
  constructor(
    private readonly repository: PartnerOrdersRepositoryPort,
    private readonly deliveryGateway: PartnerOrdersDeliveryGatewayPort,
    private readonly notificationPort: PartnerOrdersNotificationPort,
  ) {}

  async execute(input: {
    sellerId: number;
    actorUserId: number;
    requestIp: string | null;
    publicId: string;
    status: unknown;
  }) {
    const nextStatus = parseSellerEditableOrderStatus(input.status);
    if (!nextStatus) {
      throw validationError("Invalid order status");
    }

    const existing = await this.repository.findOrderForStatusUpdate({
      sellerId: input.sellerId,
      publicId: input.publicId,
    });
    if (!existing) {
      throw notFound("Order not found");
    }
    if (existing.status !== "PAID") {
      throw conflict("Only PAID orders can be moved to PREPARED manually");
    }

    assertOrderStatusTransitionAllowed({
      fromStatus: existing.status as any,
      toStatus: nextStatus as any,
      context: "seller.mark_prepared",
    });

    const updated = await this.repository.setPreparedIfPaid(existing.id);
    if (!updated) {
      throw conflict(
        "Order status was updated automatically. Reload and retry.",
      );
    }

    await this.repository.writeOrderStatusTransition({
      orderId: existing.id,
      orderPublicId: existing.public_id,
      fromStatus: existing.status,
      toStatus: nextStatus,
      actorUserId: input.actorUserId,
      reason: "seller.mark_prepared",
      ipAddress: input.requestIp,
    });

    await this.notificationPort.notifyBuyerOrderPrepared(
      existing.public_id,
      existing.buyer_id,
    );

    let trackingNumber: string | null = null;
    let trackingUrl: string | null = null;
    let trackingProvider = existing.tracking_provider;
    let deliveryExternalStatus: string | null = null;
    let deliveryError: string | null = null;

    if (
      existing.delivery_type === "DELIVERY" &&
      nextStatus === "PREPARED" &&
      existing.tracking_provider === "yandex_pvz"
    ) {
      try {
        await this.deliveryGateway.ensureYandexTracking([existing.id]);
      } catch (error) {
        deliveryError =
          error instanceof Error
            ? error.message
            : "Не удалось создать данные по доставке.";
      }

      const refreshed = await this.repository.findOrderDeliveryState(existing.id);
      trackingProvider = refreshed?.tracking_provider ?? trackingProvider;
      trackingNumber = refreshed?.tracking_number ?? null;
      trackingUrl = refreshed?.tracking_url ?? null;
      deliveryExternalStatus = refreshed?.delivery_ext_status ?? null;

      if (!trackingNumber && !deliveryError) {
        deliveryError =
          "Заявка доставки пока не создана. Попробуйте обновить страницу чуть позже.";
      }
    }

    return {
      success: true,
      status: nextStatus,
      tracking: trackingNumber
        ? {
            trackingNumber,
            trackingUrl,
            trackingProvider,
            deliveryExternalStatus,
          }
        : null,
      deliveryError,
    };
  }
}
