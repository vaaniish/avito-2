import type { PrismaClient } from "@prisma/client";
import { buildTargetUrl } from "../../../../notifications/notification.shared";
import {
  createNotifications,
} from "../../../../notifications/notification.service";

export class ProfileOrdersNotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async notifySellersAboutNewOrders(
    orders: Array<{
      seller_id: number;
      order_id: string;
      total_price: number;
    }>,
  ): Promise<void> {
    await createNotifications(
      orders.map((order) => ({
        userId: order.seller_id,
        type: "ORDER_STATUS",
        message: `Новый заказ ${order.order_id} на сумму ${order.total_price.toLocaleString("ru-RU")} ₽.`,
        targetUrl: buildTargetUrl("partner"),
      })),
      this.prisma,
    );
  }
}
