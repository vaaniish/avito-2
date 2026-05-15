import { conflict, notFound, validationError } from "../../../../../common/application-error";
import { assertOrderStatusTransitionAllowed } from "../../../../orders/order-status-fsm";
import {
  mapExternalDeliveryStatusToOrderStatus,
  normalizeTrackingProvider,
} from "../../domain/partner-orders.helpers";
import type {
  PartnerOrdersDeliveryGatewayPort,
  PartnerOrdersNotificationPort,
  PartnerOrdersRepositoryPort,
} from "../../domain/partner-orders.types";

export class UpdatePartnerOrderTrackingService {
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
    tracking_number: unknown;
    provider: unknown;
  }) {
    const rawTrackingNumber =
      typeof input.tracking_number === "string"
        ? input.tracking_number.trim()
        : "";
    if (!rawTrackingNumber) {
      throw validationError("Tracking number is required");
    }

    const existing = await this.repository.findOrderForTrackingUpdate({
      sellerId: input.sellerId,
      publicId: input.publicId,
    });
    if (!existing) {
      throw notFound("Order not found");
    }
    if (existing.delivery_type !== "DELIVERY") {
      throw validationError(
        "Tracking number is available only for delivery orders",
      );
    }
    if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
      throw conflict(
        "Tracking number cannot be changed for completed orders",
      );
    }

    const provider = normalizeTrackingProvider(input.provider);
    const validation = await this.deliveryGateway.validateTrackingNumber({
      provider,
      trackingNumber: rawTrackingNumber,
    });
    if (!validation.valid) {
      throw validationError(
        "Invalid tracking number for selected delivery service",
      );
    }

    assertOrderStatusTransitionAllowed({
      fromStatus: existing.status as any,
      toStatus: "SHIPPED" as any,
      context: "seller.tracking_assigned",
    });

    await this.repository.updateTrackingAssignment({
      orderId: existing.id,
      provider,
      trackingNumber: validation.normalizedTrackingNumber,
      trackingUrl: validation.trackingUrl || null,
    });

    if (existing.status !== "SHIPPED") {
      await this.repository.writeOrderStatusTransition({
        orderId: existing.id,
        orderPublicId: existing.public_id,
        fromStatus: existing.status,
        toStatus: "SHIPPED",
        actorUserId: input.actorUserId,
        reason: "seller.tracking_assigned",
        ipAddress: input.requestIp,
      });
    }

    await this.notificationPort.notifyBuyerOrderShipped({
      orderPublicId: existing.public_id,
      buyerId: existing.buyer_id,
      trackingNumber: validation.normalizedTrackingNumber,
    });

    const refreshed = await this.repository.findOrderDeliveryState(existing.id);
    if (refreshed) {
      const tracking = await this.deliveryGateway.fetchTrackingStatus({
        provider,
        trackingNumber: validation.normalizedTrackingNumber,
      });
      if (tracking) {
        const nextStatus = mapExternalDeliveryStatusToOrderStatus(tracking.status);
        const now = new Date();
        const data: {
          status?: string;
          tracking_url?: string | null;
          delivery_checked_at: Date;
          delivery_ext_status: string | null;
          delivered_at?: Date;
          issued_at?: Date;
        } = {
          delivery_checked_at: now,
          delivery_ext_status: tracking.rawStatus ?? tracking.status,
        };
        if (tracking.trackingUrl && tracking.trackingUrl !== refreshed.tracking_url) {
          data.tracking_url = tracking.trackingUrl;
        }
        if (nextStatus && nextStatus !== refreshed.status) {
          data.status = nextStatus;
          if (nextStatus === "DELIVERED" && !refreshed.delivered_at) {
            data.delivered_at = now;
          }
          if (nextStatus === "COMPLETED") {
            if (!refreshed.delivered_at) data.delivered_at = now;
            if (!refreshed.issued_at) data.issued_at = now;
          }
        }
        await this.repository.updateOrderDeliverySync({
          orderId: existing.id,
          data,
        });
        if (nextStatus && nextStatus !== refreshed.status) {
          await this.repository.writeOrderStatusTransition({
            orderId: existing.id,
            orderPublicId: existing.public_id,
            fromStatus: refreshed.status,
            toStatus: nextStatus,
            actorUserId: null,
            reason: "delivery.sync.after_tracking_update",
            ipAddress: input.requestIp,
          });
        }
      }
    }

    const finalState = await this.repository.findOrderDeliveryState(existing.id);
    return {
      success: true,
      status: finalState?.status ?? "SHIPPED",
      tracking_provider: finalState?.tracking_provider ?? provider,
      tracking_number:
        finalState?.tracking_number ?? validation.normalizedTrackingNumber,
      tracking_url: finalState?.tracking_url ?? validation.trackingUrl,
      delivery_ext_status: finalState?.delivery_ext_status ?? null,
    };
  }
}
