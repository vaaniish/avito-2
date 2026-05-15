export type NotificationType =
  | "SYSTEM"
  | "INFO"
  | "ORDER_STATUS"
  | "NEW_QUESTION";

export type CreateNotificationInput = {
  userId: number;
  type?: NotificationType;
  message: string;
  targetUrl: string;
};

export type NotificationDto = {
  id: number;
  type: NotificationType;
  message: string;
  url: string;
  isRead: boolean;
  date: Date;
};

export function toNotificationDto(notification: {
  id: number;
  type: NotificationType;
  message: string;
  target_url: string;
  is_read: boolean;
  created_at: Date;
}): NotificationDto {
  return {
    id: notification.id,
    type: notification.type,
    message: notification.message,
    url: notification.target_url,
    isRead: notification.is_read,
    date: notification.created_at,
  };
}

export function buildTargetUrl(
  kind: "listing" | "partner" | "orders" | "questions" | "admin",
  id?: string,
): string {
  if (kind === "listing" && id) return `/products/${encodeURIComponent(id)}`;
  if (kind === "orders") return "/profile?tab=orders";
  if (kind === "questions") return "/profile?tab=partner-questions";
  if (kind === "partner") return "/profile?tab=partner";
  if (kind === "admin") return id ? `/admin/${id}` : "/admin";
  return "/";
}

export function listingModerationNotification(params: {
  sellerId: number;
  listingPublicId: string;
  title: string;
  moderationStatus: "APPROVED" | "REJECTED" | "PENDING";
  reasonNote?: string | null;
  reasonCode?: string | null;
}): CreateNotificationInput {
  const title = params.title.trim() || params.listingPublicId;
  const reason =
    params.reasonNote?.trim() ||
    (params.reasonCode ? humanizeReasonCode(params.reasonCode) : "");
  const message =
    params.moderationStatus === "APPROVED"
      ? `Объявление «${title}» одобрено и опубликовано.`
      : params.moderationStatus === "REJECTED"
        ? `Объявление «${title}» отклонено.${reason ? ` Причина: ${reason}` : ""}`
        : `Объявление «${title}» отправлено на дополнительную проверку.`;

  return {
    userId: params.sellerId,
    type: params.moderationStatus === "REJECTED" ? "SYSTEM" : "INFO",
    message,
    targetUrl: buildTargetUrl("partner"),
  };
}

export function humanizeReasonCode(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}
