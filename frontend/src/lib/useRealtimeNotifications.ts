import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiDelete,
  apiGet,
  apiPatch,
  openNotificationStream,
  type ApiNotification,
} from "./api";
import { notifyInfo } from "../components/ui/notifications";

type NotificationsResponse = {
  notifications: ApiNotification[];
  unreadCount: number;
};

function mergeNotifications(current: ApiNotification[], next: ApiNotification[]): ApiNotification[] {
  const byId = new Map<number, ApiNotification>();
  for (const notification of current) byId.set(notification.id, notification);
  for (const notification of next) byId.set(notification.id, notification);
  return Array.from(byId.values()).sort((a, b) => b.id - a.id);
}

export function useRealtimeNotifications(isAuthenticated: boolean) {
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastSeenIdRef = useRef(0);
  const fallbackTimerRef = useRef<number | null>(null);

  const newestId = useMemo(
    () => notifications.reduce((max, notification) => Math.max(max, notification.id), 0),
    [notifications],
  );

  const loadNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    const data = await apiGet<NotificationsResponse>("/profile/notifications");
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
    lastSeenIdRef.current = data.notifications.reduce(
      (max, notification) => Math.max(max, notification.id),
      lastSeenIdRef.current,
    );
  }, [isAuthenticated]);

  const markAllAsRead = useCallback(async () => {
    await apiPatch<{ success: boolean }>("/profile/notifications/mark-as-read");
    setUnreadCount(0);
    setNotifications((current) =>
      current.map((notification) => ({ ...notification, isRead: true })),
    );
  }, []);

  const deleteAll = useCallback(async () => {
    await apiDelete<{ success: boolean }>("/profile/notifications");
    setUnreadCount(0);
    setNotifications([]);
    lastSeenIdRef.current = 0;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      lastSeenIdRef.current = 0;
      return;
    }

    let disposed = false;
    const controller = new AbortController();

    const startFallbackPolling = () => {
      if (fallbackTimerRef.current !== null) return;
      fallbackTimerRef.current = window.setInterval(() => {
        void loadNotifications().catch((error) => {
          console.error("Failed to poll notifications:", error);
        });
      }, 30000);
    };

    void loadNotifications()
      .then(() =>
        openNotificationStream({
          after: lastSeenIdRef.current,
          signal: controller.signal,
          onNotification(notification) {
            if (disposed) return;
            lastSeenIdRef.current = Math.max(lastSeenIdRef.current, notification.id);
            setNotifications((current) => mergeNotifications(current, [notification]));
            setUnreadCount((current) => current + (notification.isRead ? 0 : 1));
            notifyInfo(notification.message);
            window.dispatchEvent(
              new CustomEvent("app-notification-received", {
                detail: notification,
              }),
            );
          },
        }),
      )
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Notification stream failed:", error);
        startFallbackPolling();
      });

    return () => {
      disposed = true;
      controller.abort();
      if (fallbackTimerRef.current !== null) {
        window.clearInterval(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, [isAuthenticated, loadNotifications]);

  return {
    notifications,
    unreadCount,
    newestId,
    reload: loadNotifications,
    markAllAsRead,
    deleteAll,
  };
}

export type { ApiNotification };
