import { buildTargetUrl } from "../../../notifications/notification.shared";
import {
  createNotification,
  notifyAdmins,
} from "../../../notifications/notification.service";

export class CatalogNotificationGateway {
  async notifySellerAboutQuestion(params: {
    sellerId: number;
    listingTitle: string;
  }): Promise<void> {
    await createNotification({
      userId: params.sellerId,
      type: "NEW_QUESTION",
      message: `Новый вопрос по вашему товару «${params.listingTitle}».`,
      targetUrl: buildTargetUrl("questions"),
    });
  }

  async notifyAdminsAboutComplaint(params: {
    listingTitle: string;
  }): Promise<void> {
    await notifyAdmins({
      type: "SYSTEM",
      message: `Новая жалоба на объявление «${params.listingTitle}».`,
      targetUrl: buildTargetUrl("admin", "complaints"),
    });
  }

  async notifySellerAboutComplaint(params: {
    sellerId: number;
    listingTitle: string;
  }): Promise<void> {
    await createNotification({
      userId: params.sellerId,
      type: "SYSTEM",
      message: `На объявление «${params.listingTitle}» поступила жалоба. Мы проверим обращение.`,
      targetUrl: buildTargetUrl("partner"),
    });
  }
}
