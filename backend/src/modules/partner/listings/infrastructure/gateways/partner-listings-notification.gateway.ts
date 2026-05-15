import {
  buildTargetUrl,
  listingModerationNotification,
} from "../../../../notifications/notification.shared";
import {
  createNotification,
  notifyAdmins,
} from "../../../../notifications/notification.service";
import type { PartnerListingsNotificationPort } from "../../domain/partner-listings.types";

export class PartnerListingsNotificationGateway
  implements PartnerListingsNotificationPort
{
  async notifyAdminsAboutQueuedListing(params: {
    listingPublicId: string;
    title: string;
  }): Promise<void> {
    await notifyAdmins({
      type: "SYSTEM",
      message: `Новое объявление «${params.title}» ожидает модерации.`,
      targetUrl: buildTargetUrl("admin", "listings"),
    });
  }

  async notifySellerAboutModerationDecision(params: {
    sellerId: number;
    listingPublicId: string;
    title: string;
    moderationStatus: "APPROVED" | "REJECTED" | "PENDING";
    reasonNote?: string | null;
    reasonCode?: string | null;
  }): Promise<void> {
    const notification = listingModerationNotification({
      sellerId: params.sellerId,
      listingPublicId: params.listingPublicId,
      title: params.title,
      moderationStatus: params.moderationStatus,
      reasonNote: params.reasonNote,
      reasonCode: params.reasonCode,
    });
    await createNotification(notification);
  }

  async notifyAdminsAboutManualModeration(params: {
    title: string;
  }): Promise<void> {
    await notifyAdmins({
      type: "SYSTEM",
      message: `Объявление «${params.title}» требует ручной модерации.`,
      targetUrl: buildTargetUrl("admin", "listings"),
    });
  }
}
