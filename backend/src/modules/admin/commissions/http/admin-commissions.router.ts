import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin, getRequestIp } from "../../common/http/admin-session";
import type {
  BatchUpdateCommissionTiersService,
  ListCommissionTiersService,
  UpdateCommissionTierRateService,
} from "../application/services/admin-commissions.service";

export function createAdminCommissionsRouter(deps: {
  services: {
    listCommissionTiers: ListCommissionTiersService;
    batchUpdateCommissionTiers: BatchUpdateCommissionTiersService;
    updateCommissionTierRate: UpdateCommissionTierRateService;
  };
}) {
  const router = Router();

  router.get("/commission-tiers", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.services.listCommissionTiers.execute());
    } catch (error) {
      console.error("Error fetching commission tiers:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/commission-tiers", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(
        await deps.services.batchUpdateCommissionTiers.execute({
          tiers: (req.body ?? {})["tiers"],
          actorUserId: access.user.id,
          requestIp: getRequestIp(req),
        }),
      );
    } catch (error) {
      console.error("Error batch updating commission tiers:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/commission-tiers/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(
        await deps.services.updateCommissionTierRate.execute({
          publicId: String(req.params.publicId ?? ""),
          commissionRate: (req.body ?? {})["commissionRate"],
          actorUserId: access.user.id,
          requestIp: getRequestIp(req),
        }),
      );
    } catch (error) {
      console.error("Error updating commission tier:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
