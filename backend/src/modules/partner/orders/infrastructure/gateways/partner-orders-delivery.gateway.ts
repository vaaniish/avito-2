import { ensureYandexTrackingForOrders } from "../../../../profile/profile.delivery";
import {
  fetchTrackingStatus,
  validateTrackingNumber,
} from "../../../order-delivery";
import { prisma } from "../../../../../lib/prisma";
import type { PartnerOrdersDeliveryGatewayPort } from "../../domain/partner-orders.types";

export class PartnerOrdersDeliveryGateway
  implements PartnerOrdersDeliveryGatewayPort
{
  ensureYandexTracking(orderIds: number[]) {
    return ensureYandexTrackingForOrders(prisma, orderIds);
  }

  fetchTrackingStatus(params: {
    provider: "russian_post" | "yandex_pvz";
    trackingNumber: string;
  }) {
    return fetchTrackingStatus(params);
  }

  validateTrackingNumber(params: {
    provider: "russian_post" | "yandex_pvz";
    trackingNumber: string;
  }) {
    return validateTrackingNumber(params);
  }
}
