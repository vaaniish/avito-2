import { logger } from "../../../lib/logger";
import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../common/http/map-application-error";
import type { GetCartRecommendationsService } from "../application/services/get-cart-recommendations.service";
import type { GetHomeRecommendationsService } from "../application/services/get-home-recommendations.service";
import type { GetSimilarRecommendationsService } from "../application/services/get-similar-recommendations.service";
import type { RecordRecommendationEventService } from "../application/services/record-recommendation-event.service";

type SessionUser = { id: number; public_id: string; role: string } | null;

export function createRecommendationsRouter(deps: {
  getSessionUser: (req: Request) => Promise<SessionUser>;
  services: {
    getHomeRecommendations: GetHomeRecommendationsService;
    getSimilarRecommendations: GetSimilarRecommendationsService;
    getCartRecommendations: GetCartRecommendationsService;
    recordRecommendationEvent: RecordRecommendationEventService;
  };
}) {
  const router = Router();

  router.get("/home", async (req: Request, res: Response) => {
    try {
      const sessionUser = await deps.getSessionUser(req);
      res.json(
        await deps.services.getHomeRecommendations.execute({
          userId: sessionUser?.id ?? null,
        }),
      );
    } catch (error) {
      logger.error("error_fetching_home_recommendations", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/:publicId/similar", async (req: Request, res: Response) => {
    try {
      const sessionUser = await deps.getSessionUser(req);
      res.json(
        await deps.services.getSimilarRecommendations.execute({
          userId: sessionUser?.id ?? null,
          listingPublicId: String(req.params.publicId ?? ""),
        }),
      );
    } catch (error) {
      logger.error("error_fetching_similar_recommendations", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/cart", async (req: Request, res: Response) => {
    try {
      const sessionUser = await deps.getSessionUser(req);
      const body = (req.body ?? {}) as { listingPublicIds?: unknown };
      res.json(
        await deps.services.getCartRecommendations.execute({
          userId: sessionUser?.id ?? null,
          listingPublicIds: body.listingPublicIds,
        }),
      );
    } catch (error) {
      logger.error("error_fetching_cart_recommendations", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/events", async (req: Request, res: Response) => {
    try {
      const sessionUser = await deps.getSessionUser(req);
      if (!sessionUser) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const body = (req.body ?? {}) as {
        listingPublicId?: unknown;
        eventType?: unknown;
        sourcePage?: unknown;
      };
      res.status(201).json(
        await deps.services.recordRecommendationEvent.execute({
          userId: sessionUser.id,
          listingPublicId:
            typeof body.listingPublicId === "string" ? body.listingPublicId : undefined,
          eventType: String(body.eventType ?? "VIEW") as any,
          sourcePage: typeof body.sourcePage === "string" ? body.sourcePage : undefined,
          sessionId: sessionUser.public_id,
        }),
      );
    } catch (error) {
      logger.error("error_recording_recommendation_event", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
