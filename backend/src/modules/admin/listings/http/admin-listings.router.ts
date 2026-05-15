import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { getRequestIp, requireAdmin } from "../../common/http/admin-session";
import type {
  BatchModerateAdminListingsService,
  ListAdminListingModerationEventsService,
  ListAdminListingsService,
  UpdateAdminListingModerationService,
} from "../application/services/admin-listings.service";

export function createAdminListingsRouter(deps: {
  services: {
    listAdminListings: ListAdminListingsService;
    updateAdminListingModeration: UpdateAdminListingModerationService;
    listAdminListingModerationEvents: ListAdminListingModerationEventsService;
    batchModerateAdminListings: BatchModerateAdminListingsService;
  };
}) {
  const router = Router();

  router.get("/listings", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.services.listAdminListings.execute());
    } catch (error) {
      console.error("Error fetching listings:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/listings/:publicId/moderation", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      res.json(
        await deps.services.updateAdminListingModeration.execute({
          publicId: String(req.params.publicId ?? ""),
          status: body.status,
          reasonCode: body.reasonCode,
          reasonNote: body.reasonNote,
          actorUserId: access.user.id,
          requestIp: getRequestIp(req),
        }),
      );
    } catch (error) {
      console.error("Error moderating listing:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/:publicId/moderation-events", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(
        await deps.services.listAdminListingModerationEvents.execute(
          String(req.params.publicId ?? ""),
        ),
      );
    } catch (error) {
      console.error("Error fetching listing moderation events:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listings/moderation/batch", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      const body = (req.body ?? {}) as Record<string, unknown>;
      res.json(
        await deps.services.batchModerateAdminListings.execute({
          listingIds: body.listingIds,
          status: body.status,
          reasonCode: body.reasonCode,
          reasonNote: body.reasonNote,
          actorUserId: access.user.id,
          requestIp: getRequestIp(req),
        }),
      );
    } catch (error) {
      console.error("Error batch moderating listings:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
