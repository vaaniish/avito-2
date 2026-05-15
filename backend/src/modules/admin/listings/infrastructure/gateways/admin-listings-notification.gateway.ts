import { createNotification } from "../../../../notifications/notification.service";
import { listingModerationNotification } from "../../../../notifications/notification.shared";

export class AdminListingsNotificationGateway {
  async notifyModerationDecision(input: {
    sellerId: number;
    listingPublicId: string;
    title: string;
    moderationStatus: "APPROVED" | "REJECTED" | "PENDING";
    reasonNote?: string | null;
    reasonCode?: string | null;
  }) {
    await createNotification(
      listingModerationNotification({
        sellerId: input.sellerId,
        listingPublicId: input.listingPublicId,
        title: input.title,
        moderationStatus: input.moderationStatus,
        reasonNote: input.reasonNote,
        reasonCode: input.reasonCode,
      }),
    );
  }

  async notifyMany(
    inputs: Array<{
      sellerId: number;
      listingPublicId: string;
      title: string;
      moderationStatus: "APPROVED" | "REJECTED";
      reasonNote?: string | null;
      reasonCode?: string | null;
    }>,
  ) {
    await Promise.all(inputs.map((input) => this.notifyModerationDecision(input)));
  }
}
