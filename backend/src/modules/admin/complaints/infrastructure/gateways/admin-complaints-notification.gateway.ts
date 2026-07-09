import { buildTargetUrl } from "../../../../notifications/notification.shared";
import {
  createNotifications,
} from "../../../../notifications/notification.service";
import { RELATED_LISTING_REMOVED_RESOLUTION_KIND } from "../../domain/admin-complaints.service";
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
    resolutionKind?: string | null;
    relatedResolvedReporterIds?: number[];
  }): Promise<void> {
    const listingRemoved =
      context.status === "REJECTED" &&
      context.resolutionKind === RELATED_LISTING_REMOVED_RESOLUTION_KIND;

    await createNotifications([
      {
        userId: context.reporterId,
        type: "INFO",
        message:
          context.status === "APPROVED"
            ? `Ваша жалоба по объявлению «${context.listingTitle}» одобрена.`
            : listingRemoved
              ? `Объявление «${context.listingTitle}» снято с продажи после рассмотрения жалобы.`
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
            : listingRemoved
              ? `Жалоба на объявление «${context.listingTitle}» закрыта: объявление уже снято с продажи.`
            : context.status === "REJECTED"
              ? `Жалоба на объявление «${context.listingTitle}» отклонена.`
              : `Статус жалобы на объявление «${context.listingTitle}» обновлён.`,
        targetUrl: buildTargetUrl("partner"),
      },
      ...(context.relatedResolvedReporterIds ?? [])
        .filter((reporterId) => reporterId !== context.reporterId)
        .map((reporterId) => ({
          userId: reporterId,
          type: "INFO" as const,
          message: `Объявление «${context.listingTitle}» снято с продажи после рассмотрения жалобы.`,
          targetUrl: buildTargetUrl("listing", context.listingPublicId),
        })),
    ]);
  }
}
