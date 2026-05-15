import { buildTargetUrl } from "../../../../notifications/notification.shared";
import {
  createNotification,
} from "../../../../notifications/notification.service";
import type { PartnerQuestionsNotificationPort } from "../../domain/partner-questions.types";

export class PartnerQuestionsNotificationGateway
  implements PartnerQuestionsNotificationPort
{
  async notifyBuyerAboutAnswer(params: {
    buyerId: number;
    listingPublicId: string;
    listingTitle: string;
  }): Promise<void> {
    await createNotification({
      userId: params.buyerId,
      type: "INFO",
      message: `Продавец ответил на ваш вопрос по товару «${params.listingTitle}».`,
      targetUrl: buildTargetUrl("listing", params.listingPublicId),
    });
  }
}
