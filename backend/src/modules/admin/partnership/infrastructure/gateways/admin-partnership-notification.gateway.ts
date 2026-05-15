import { buildTargetUrl } from "../../../../notifications/notification.shared";
import {
  createNotification,
} from "../../../../notifications/notification.service";
import type {
  AdminPartnershipNotificationInput,
  AdminPartnershipNotificationPort,
} from "../../domain/admin-partnership.types";

export class AdminPartnershipNotificationGateway
  implements AdminPartnershipNotificationPort
{
  async notify(input: AdminPartnershipNotificationInput): Promise<void> {
    if (input.kind === "partnership") {
      await createNotification({
        userId: input.userId,
        type: input.nextStatus === "REJECTED" ? "SYSTEM" : "INFO",
        message:
          input.nextStatus === "REJECTED"
            ? `Партнёрская заявка отклонена.${input.rejectionReason ? ` Причина: ${input.rejectionReason}` : ""}`
            : input.nextStatus === "APPROVED" || input.nextStatus === "APPROVED_LIMITED"
              ? "Партнёрская заявка одобрена."
              : "Статус партнёрской заявки обновлён.",
        targetUrl: buildTargetUrl("partner"),
      });
      return;
    }

    if (input.kind === "kyc") {
      await createNotification({
        userId: input.userId,
        type: input.nextStatus === "REJECTED" ? "SYSTEM" : "INFO",
        message:
          input.nextStatus === "REJECTED"
            ? `KYC-проверка отклонена.${input.rejectionReason ? ` Причина: ${input.rejectionReason}` : ""}`
            : input.nextStatus === "APPROVED"
              ? "KYC-проверка одобрена."
              : "KYC-проверка снова ожидает рассмотрения.",
        targetUrl: buildTargetUrl("partner"),
      });
      return;
    }

    await createNotification({
      userId: input.userId,
      type: input.nextStatus === "REJECTED" ? "SYSTEM" : "INFO",
      message:
        input.nextStatus === "REJECTED"
          ? `Платёжный профиль отклонён.${input.rejectionReason ? ` Причина: ${input.rejectionReason}` : ""}`
          : input.nextStatus === "VERIFIED"
            ? "Платёжный профиль подтверждён."
            : "Платёжный профиль снова ожидает проверки.",
      targetUrl: buildTargetUrl("partner"),
    });
  }
}
