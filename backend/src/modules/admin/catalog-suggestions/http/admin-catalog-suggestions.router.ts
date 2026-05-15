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
      console.error("Error approving catalog suggestion reference:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/catalog-suggestions", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.service.listSuggestions());
    } catch (error) {
      console.error("Error fetching catalog suggestions:", error);
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
      console.error("Error updating catalog suggestion:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
