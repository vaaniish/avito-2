import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import { ListPartnerOrdersService } from "./application/services/list-partner-orders.service";
import { UpdatePartnerOrderStatusService } from "./application/services/update-partner-order-status.service";
import { UpdatePartnerOrderTrackingService } from "./application/services/update-partner-order-tracking.service";
import { createPartnerOrdersRouter } from "./http/partner-orders.router";
import { PartnerOrdersDeliveryGateway } from "./infrastructure/gateways/partner-orders-delivery.gateway";
import { PartnerOrdersNotificationGateway } from "./infrastructure/gateways/partner-orders-notification.gateway";
import { PartnerOrdersRepository } from "./infrastructure/repositories/partner-orders.repository";

const repository = new PartnerOrdersRepository(prisma);
const deliveryGateway = new PartnerOrdersDeliveryGateway();
const notificationGateway = new PartnerOrdersNotificationGateway();

export const partnerOrdersRouter = createPartnerOrdersRouter({
  requireAnyRole,
  services: {
    listPartnerOrders: new ListPartnerOrdersService(
      repository,
      deliveryGateway,
    ),
    updatePartnerOrderStatus: new UpdatePartnerOrderStatusService(
      repository,
      deliveryGateway,
      notificationGateway,
    ),
    updatePartnerOrderTracking: new UpdatePartnerOrderTrackingService(
      repository,
      deliveryGateway,
      notificationGateway,
    ),
  },
});
