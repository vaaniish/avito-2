import { toNotificationDto } from "../../../../notifications/notification.shared";
import type { ProfileNotificationsRepository } from "../../infrastructure/repositories/profile-notifications.repository";

export class ListNotificationsService {
  constructor(private readonly repository: ProfileNotificationsRepository) {}

  async execute(userId: number) {
    const [notifications, unreadCount] = await this.repository.listNotifications(userId);
    return {
      notifications: notifications.map(toNotificationDto),
      unreadCount,
    };
  }
}

export class ListNotificationsSinceService {
  constructor(private readonly repository: ProfileNotificationsRepository) {}

  async execute(input: { userId: number; afterId: number }) {
    return (await this.repository.listNotificationsSince(input.userId, input.afterId)).map(
      toNotificationDto,
    );
  }
}

export class MarkNotificationsReadService {
  constructor(private readonly repository: ProfileNotificationsRepository) {}

  async execute(userId: number) {
    await this.repository.markAsRead(userId);
    return { success: true };
  }
}

export class DeleteNotificationsService {
  constructor(private readonly repository: ProfileNotificationsRepository) {}

  async execute(userId: number) {
    await this.repository.deleteAll(userId);
    return { success: true };
  }
}
