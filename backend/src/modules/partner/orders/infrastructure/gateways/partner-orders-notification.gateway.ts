import { buildTargetUrl } from "../../../../notifications/notification.shared";
import {
  createNotification,
} from "../../../../notifications/notification.service";
import type { PartnerOrdersNotificationPort } from "../../domain/partner-orders.types";

export class PartnerOrdersNotificationGateway
  implements PartnerOrdersNotificationPort
{
  notifyBuyerOrderPrepared(orderPublicId: string, buyerId: number) {
    return createNotification({
      userId: buyerId,
      type: "ORDER_STATUS",
      message: `Заказ ${orderPublicId} подготовлен продавцом.`,
      targetUrl: buildTargetUrl("orders"),
    }).then(() => undefined);
  }

  notifyBuyerOrderShipped(params: {
    orderPublicId: string;
    buyerId: number;
    trackingNumber: string;
  }) {
    return createNotification({
      userId: params.buyerId,
      type: "ORDER_STATUS",
      message: `Заказ ${params.orderPublicId} отправлен. Трек-номер: ${params.trackingNumber}.`,
      targetUrl: buildTargetUrl("orders"),
    }).then(() => undefined);
  }
}
