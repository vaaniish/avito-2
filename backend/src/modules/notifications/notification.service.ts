import { NotificationType, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";

type NotificationClient = PrismaClient | Prisma.TransactionClient;

export type NotificationDto = {
  id: number;
  type: NotificationType;
  message: string;
  url: string;
  isRead: boolean;
  date: Date;
};

export type CreateNotificationInput = {
  userId: number;
  type?: NotificationType;
  message: string;
  targetUrl: string;
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

export function buildTargetUrl(kind: "listing" | "partner" | "orders" | "questions" | "admin", id?: string): string {
  if (kind === "listing" && id) return `/products/${encodeURIComponent(id)}`;
  if (kind === "orders") return "/profile?tab=orders";
  if (kind === "questions") return "/profile?tab=partner-questions";
  if (kind === "partner") return "/profile?tab=partner";
  if (kind === "admin") return id ? `/admin/${id}` : "/admin";
  return "/";
}

export async function createNotification(
  input: CreateNotificationInput,
  client: NotificationClient = prisma,
): Promise<NotificationDto | null> {
  const message = input.message.trim();
  const targetUrl = input.targetUrl.trim() || "/";
  if (!message || !input.userId) return null;

  const notification = await client.notification.create({
    data: {
      user_id: input.userId,
      type: input.type ?? "SYSTEM",
      message: message.slice(0, 1000),
      target_url: targetUrl.slice(0, 500),
    },
  });

  return toNotificationDto(notification);
}

export async function createNotifications(
  inputs: CreateNotificationInput[],
  client: NotificationClient = prisma,
): Promise<void> {
  const rows = inputs
    .map((input) => ({
      user_id: input.userId,
      type: input.type ?? "SYSTEM",
      message: input.message.trim().slice(0, 1000),
      target_url: (input.targetUrl.trim() || "/").slice(0, 500),
    }))
    .filter((row) => row.user_id && row.message);

  if (rows.length === 0) return;
  await client.notification.createMany({ data: rows });
}

export async function notifyAdmins(
  input: Omit<CreateNotificationInput, "userId">,
  client: NotificationClient = prisma,
): Promise<void> {
  const admins = await client.appUser.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });

  await createNotifications(
    admins.map((admin) => ({
      ...input,
      userId: admin.id,
    })),
    client,
  );
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
