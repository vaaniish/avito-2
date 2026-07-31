import { logger } from "../../../../lib/logger";
import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { getRequestIpFromExpressLike } from "../../../../common/http/request-meta";
import type { GetPartnerPayoutProfileService } from "../application/services/get-partner-payout-profile.service";
import type { UpsertPartnerPayoutProfileService } from "../application/services/upsert-partner-payout-profile.service";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createPartnerPayoutRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  services: {
    getPartnerPayoutProfile: GetPartnerPayoutProfileService;
    upsertPartnerPayoutProfile: UpsertPartnerPayoutProfileService;
  };
}) {
  const router = Router();
  const roles = ["SELLER", "ADMIN"];

  router.get("/payout-profile", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(
        await deps.services.getPartnerPayoutProfile.execute(session.user.id),
      );
    } catch (error) {
      logger.error("error_fetching_payout_profile", { error });
      sendApplicationError(res, error);
    }
  });

  router.put("/payout-profile", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(
        await deps.services.upsertPartnerPayoutProfile.execute({
          sellerId: session.user.id,
          actorUserId: session.user.id,
          requestIp: getRequestIpFromExpressLike(req),
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      logger.error("error_upserting_payout_profile", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
