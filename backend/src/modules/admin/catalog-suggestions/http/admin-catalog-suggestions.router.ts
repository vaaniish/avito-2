import { logger } from "../../../../lib/logger";
import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import type { AdminCatalogSuggestionsService } from "../application/services/admin-catalog-suggestions.service";

export function createAdminCatalogSuggestionsRouter(deps: {
  service: AdminCatalogSuggestionsService;
}) {
  const router = Router();

  router.post("/catalog-suggestions/:publicId/approve-reference", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.status(201).json(
        await deps.service.approveReference(
          String(req.params.publicId ?? ""),
          access.user.id,
          (req.body ?? {}) as Record<string, unknown>,
        ),
      );
    } catch (error) {
      logger.error("error_approving_catalog_suggestion_reference", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/catalog-suggestions", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.listSuggestions());
    } catch (error) {
      logger.error("error_fetching_catalog_suggestions", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/catalog-suggestions/:publicId", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(
        await deps.service.updateSuggestion(
          String(req.params.publicId ?? ""),
          access.user.id,
          (req.body ?? {}) as Record<string, unknown>,
        ),
      );
    } catch (error) {
      logger.error("error_updating_catalog_suggestion", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
