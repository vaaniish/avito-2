import { logger } from "../../../../lib/logger";
import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import type { AdminPromosService } from "../application/services/admin-promos.service";

export function createAdminPromosRouter(deps: {
  service: AdminPromosService;
}) {
  const router = Router();

  router.get("/promos", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.listPromos((req.query ?? {}) as Record<string, unknown>));
    } catch (error) {
      logger.error("error_loading_admin_promos", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/promos/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.getPromo(String(req.params.publicId ?? "")));
    } catch (error) {
      logger.error("error_loading_promo_detail", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/promos", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(
        await deps.service.createPromo(
          (req.body ?? {}) as Record<string, unknown>,
          access.user.id,
        ),
      );
    } catch (error) {
      logger.error("error_creating_promo", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/promos/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(
        await deps.service.updatePromo(
          String(req.params.publicId ?? ""),
          (req.body ?? {}) as Record<string, unknown>,
          access.user.id,
        ),
      );
    } catch (error) {
      logger.error("error_updating_promo", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
