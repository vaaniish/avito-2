import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { parseNotificationsAfterId } from "../domain/profile-account.helpers";
import type {
  AddWishlistItemService,
  ListWishlistService,
  RemoveWishlistItemService,
} from "../application/services/list-wishlist.service";
import type {
  DeleteNotificationsService,
  ListNotificationsService,
  ListNotificationsSinceService,
  MarkNotificationsReadService,
} from "../application/services/notifications.service";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createProfileAccountRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  profileRoles: string[];
  services: {
    listWishlist: ListWishlistService;
    addWishlistItem: AddWishlistItemService;
    removeWishlistItem: RemoveWishlistItemService;
    listNotifications: ListNotificationsService;
    listNotificationsSince: ListNotificationsSinceService;
    markNotificationsRead: MarkNotificationsReadService;
    deleteNotifications: DeleteNotificationsService;
  };
}) {
  const router = Router();

  router.get("/wishlist", async (req, res) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(await deps.services.listWishlist.execute(session.user.id));
    } catch (error) {
      console.error("Error fetching wishlist:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/wishlist/:listingPublicId", async (req, res) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.status(201).json(
        await deps.services.addWishlistItem.execute({
          userId: session.user.id,
          listingPublicId: String(req.params.listingPublicId ?? ""),
        }),
      );
    } catch (error) {
      console.error("Error adding wishlist item:", error);
      sendApplicationError(res, error);
    }
  });

  router.delete("/wishlist/:listingPublicId", async (req, res) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(
        await deps.services.removeWishlistItem.execute({
          userId: session.user.id,
          listingPublicId: String(req.params.listingPublicId ?? ""),
        }),
      );
    } catch (error) {
      console.error("Error deleting wishlist item:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/notifications", async (req, res) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(await deps.services.listNotifications.execute(session.user.id));
    } catch (error) {
      console.error("Error fetching notifications:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/notifications/stream", async (req: Request, res: Response) => {
    const session = await deps.requireAnyRole(req, deps.profileRoles);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    let lastId = parseNotificationsAfterId(req.query.after);
    let closed = false;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (event: string, data: unknown) => {
      if (closed) return;
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const poll = async () => {
      try {
        const notifications = await deps.services.listNotificationsSince.execute({
          userId: session.user.id,
          afterId: lastId,
        });

        for (const notification of notifications) {
          lastId = Math.max(lastId, notification.id);
          sendEvent("notification", notification);
        }
      } catch (error) {
        console.error("Error streaming notifications:", error);
        sendEvent("error", { message: "Notification stream error" });
      }
    };

    sendEvent("ready", { ok: true });
    void poll();
    const pollTimer = setInterval(() => void poll(), 2500);
    const heartbeatTimer = setInterval(
      () => sendEvent("heartbeat", { ok: true }),
      25000,
    );

    req.on("close", () => {
      closed = true;
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      res.end();
    });
  });

  router.patch("/notifications/mark-as-read", async (req, res) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(await deps.services.markNotificationsRead.execute(session.user.id));
    } catch (error) {
      console.error("Error marking notifications as read:", error);
      sendApplicationError(res, error);
    }
  });

  router.delete("/notifications", async (req, res) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(await deps.services.deleteNotifications.execute(session.user.id));
    } catch (error) {
      console.error("Error deleting notifications:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
