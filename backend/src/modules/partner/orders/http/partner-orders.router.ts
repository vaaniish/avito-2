import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { ListPartnerOrdersService } from "../application/services/list-partner-orders.service";
import type { UpdatePartnerOrderStatusService } from "../application/services/update-partner-order-status.service";
import type { UpdatePartnerOrderTrackingService } from "../application/services/update-partner-order-tracking.service";

type SessionResult =
  | { ok: true; user: { id: number; role: string } }
  | { ok: false; status: number; message: string };

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}

export function createPartnerOrdersRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  services: {
    listPartnerOrders: ListPartnerOrdersService;
    updatePartnerOrderStatus: UpdatePartnerOrderStatusService;
    updatePartnerOrderTracking: UpdatePartnerOrderTrackingService;
  };
}) {
  const router = Router();
  const roles = ["SELLER", "ADMIN"];

  router.get("/orders", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(await deps.services.listPartnerOrders.execute(session.user.id));
    } catch (error) {
      console.error("Error fetching partner orders:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/orders/:publicId/status", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      const body = (req.body ?? {}) as { status?: unknown };
      res.json(
        await deps.services.updatePartnerOrderStatus.execute({
          sellerId: session.user.id,
          actorUserId: session.user.id,
          requestIp: getRequestIp(req),
          publicId: String(req.params.publicId ?? ""),
          status: body.status,
        }),
      );
    } catch (error) {
      console.error("Error updating order status:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/orders/:publicId/tracking", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      const body = (req.body ?? {}) as {
        tracking_number?: unknown;
        provider?: unknown;
      };
      res.json(
        await deps.services.updatePartnerOrderTracking.execute({
          sellerId: session.user.id,
          actorUserId: session.user.id,
          requestIp: getRequestIp(req),
          publicId: String(req.params.publicId ?? ""),
          tracking_number: body.tracking_number,
          provider: body.provider,
        }),
      );
    } catch (error) {
      console.error("Error applying tracking number:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
