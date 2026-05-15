import type { PrismaClient } from "@prisma/client";

export class ProfileNotificationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listNotifications(userId: number) {
    return Promise.all([
      this.prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: "desc" },
      }),
      this.prisma.notification.count({
        where: { user_id: userId, is_read: false },
      }),
    ]);
  }

  listNotificationsSince(userId: number, afterId: number) {
    return this.prisma.notification.findMany({
      where: {
        user_id: userId,
        id: { gt: afterId },
      },
      orderBy: { id: "asc" },
      take: 20,
    });
  }

  markAsRead(userId: number) {
    return this.prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }

  deleteAll(userId: number) {
    return this.prisma.notification.deleteMany({
      where: { user_id: userId },
    });
  }
}
