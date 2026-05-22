import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../common/http/map-application-error";
import type {
  AdminRecomputeRecommendationsService,
  ExplainRecommendationsService,
} from "../application/services/admin-recommendations.service";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createAdminRecommendationsRouter(deps: {
  requireRole: (req: Request, role: string) => Promise<SessionResult>;
  roleAdmin: string;
  services: {
    recompute: AdminRecomputeRecommendationsService;
    explain: ExplainRecommendationsService;
  };
}) {
  const router = Router();

  router.post("/recommendations/recompute", async (req: Request, res: Response) => {
    try {
      const access = await deps.requireRole(req, deps.roleAdmin);
      if (!access.ok) {
        res.status(access.status).json({ error: access.message });
        return;
      }
      res.json(await deps.services.recompute.execute());
    } catch (error) {
      console.error("Error recomputing recommendations:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/recommendations/explain", async (req: Request, res: Response) => {
    try {
      const access = await deps.requireRole(req, deps.roleAdmin);
      if (!access.ok) {
        res.status(access.status).json({ error: access.message });
        return;
      }

      const listingIds = String(req.query.listingIds ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      res.json(
        await deps.services.explain.execute({
          userId: typeof req.query.userId === "string" ? Number(req.query.userId) : null,
          context:
            req.query.context === "similar" || req.query.context === "cart"
              ? req.query.context
              : "home",
          listingPublicId:
            typeof req.query.listingId === "string" ? req.query.listingId : null,
          listingPublicIds: listingIds,
        }),
      );
    } catch (error) {
      console.error("Error explaining recommendations:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
