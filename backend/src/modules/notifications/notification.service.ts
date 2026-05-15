import { NotificationType, Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import {
  type CreateNotificationInput,
  type NotificationDto,
  toNotificationDto,
} from "./notification.shared";

type NotificationClient = PrismaClient | Prisma.TransactionClient;

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
