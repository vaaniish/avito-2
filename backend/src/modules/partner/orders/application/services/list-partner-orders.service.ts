import { assertOrderStatusTransitionAllowed } from "../../../../orders/order-status-fsm";
import {
  mapExternalDeliveryStatusToOrderStatus,
  mapPartnerOrder,
  normalizeTrackingProvider,
  shouldSyncDeliveryStatus,
} from "../../domain/partner-orders.helpers";
import type {
  PartnerOrdersDeliveryGatewayPort,
  PartnerOrdersRepositoryPort,
} from "../../domain/partner-orders.types";

export class ListPartnerOrdersService {
  constructor(
    private readonly repository: PartnerOrdersRepositoryPort,
    private readonly deliveryGateway: PartnerOrdersDeliveryGatewayPort,
  ) {}

  async execute(sellerId: number) {
    let orders = await this.repository.listOrdersForSeller(sellerId);
    const ordersForSync = orders.filter((order) => shouldSyncDeliveryStatus(order));

    if (ordersForSync.length > 0) {
      await Promise.all(
        ordersForSync.map(async (order) => {
          const tracking = await this.deliveryGateway.fetchTrackingStatus({
            provider: normalizeTrackingProvider(order.tracking_provider),
            trackingNumber: order.tracking_number ?? "",
          });
          if (!tracking) return;

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

          if (tracking.trackingUrl && tracking.trackingUrl !== order.tracking_url) {
            data.tracking_url = tracking.trackingUrl;
          }

          let statusChanged = false;
          if (nextStatus && nextStatus !== order.status) {
            try {
              assertOrderStatusTransitionAllowed({
                fromStatus: order.status as any,
                toStatus: nextStatus as any,
                context: "delivery.sync",
              });
              data.status = nextStatus;
              statusChanged = true;
            } catch {
              statusChanged = false;
            }
          }

          if (nextStatus === "DELIVERED" && !order.delivered_at) {
            data.delivered_at = now;
          }
          if (nextStatus === "COMPLETED") {
            if (!order.delivered_at) data.delivered_at = now;
            if (!order.issued_at) data.issued_at = now;
          }

          await this.repository.updateOrderDeliverySync({
            orderId: order.id,
            data,
          });

          if (statusChanged && nextStatus) {
            await this.repository.writeOrderStatusTransition({
              orderId: order.id,
              orderPublicId: order.public_id,
              fromStatus: order.status,
              toStatus: nextStatus,
              actorUserId: null,
              reason: "delivery.sync.external_status",
              ipAddress: null,
            });
          }
        }),
      );

      orders = await this.repository.listOrdersForSeller(sellerId);
    }

    return orders.map(mapPartnerOrder);
  }
}
