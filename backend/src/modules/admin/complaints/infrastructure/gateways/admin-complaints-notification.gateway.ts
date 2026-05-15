import { buildTargetUrl } from "../../../../notifications/notification.shared";
import {
  createNotifications,
} from "../../../../notifications/notification.service";
import type { AdminComplaintsNotificationPort } from "../../domain/admin-complaints.types";

export class AdminComplaintsNotificationGateway
  implements AdminComplaintsNotificationPort
{
  async notifyComplaintStatusUpdate(context: {
    reporterId: number;
    sellerId: number;
    listingPublicId: string;
    listingTitle: string;
    status: "NEW" | "PENDING" | "APPROVED" | "REJECTED";
    enforcementMessage: string | null;
  }): Promise<void> {
    await createNotifications([
      {
        userId: context.reporterId,
        type: "INFO",
        message:
          context.status === "APPROVED"
            ? `Ваша жалоба по объявлению «${context.listingTitle}» одобрена.`
            : context.status === "REJECTED"
              ? `Ваша жалоба по объявлению «${context.listingTitle}» отклонена.`
              : `Статус вашей жалобы по объявлению «${context.listingTitle}» обновлён.`,
        targetUrl: buildTargetUrl("listing", context.listingPublicId),
      },
      {
        userId: context.sellerId,
        type: context.status === "APPROVED" ? "SYSTEM" : "INFO",
        message:
          context.status === "APPROVED"
            ? `Жалоба на объявление «${context.listingTitle}» одобрена.${context.enforcementMessage ? ` ${context.enforcementMessage}` : ""}`
            : context.status === "REJECTED"
              ? `Жалоба на объявление «${context.listingTitle}» отклонена.`
              : `Статус жалобы на объявление «${context.listingTitle}» обновлён.`,
        targetUrl: buildTargetUrl("partner"),
      },
    ]);
  }
}
