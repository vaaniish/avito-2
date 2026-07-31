import { logger } from "../../../../lib/logger";
import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { getRequestIpFromExpressLike } from "../../../../common/http/request-meta";
import { requireAdmin } from "../../common/http/admin-session";
import type { GetComplaintDetailsService } from "../application/services/get-complaint-details.service";
import type { GetComplaintStatsService } from "../application/services/get-complaint-stats.service";
import type { GetComplaintsLegacyService } from "../application/services/get-complaints-legacy.service";
import type { GetRelatedListingComplaintsService } from "../application/services/get-related-listing-complaints.service";
import type { GetSellerSummaryService } from "../application/services/get-seller-summary.service";
import type { ListComplaintsService } from "../application/services/list-complaints.service";
import type { UpdateComplaintLegacyService } from "../application/services/update-complaint-legacy.service";
import type { UpdateComplaintStatusService } from "../application/services/update-complaint-status.service";

export function createAdminComplaintsRouter(deps: {
  services: {
    getComplaintsLegacy: GetComplaintsLegacyService;
    updateComplaintLegacy: UpdateComplaintLegacyService;
    getComplaintStats: GetComplaintStatsService;
    listComplaints: ListComplaintsService;
    getRelatedListingComplaints: GetRelatedListingComplaintsService;
    getSellerSummary: GetSellerSummaryService;
    getComplaintDetails: GetComplaintDetailsService;
    updateComplaintStatus: UpdateComplaintStatusService;
  };
}) {
  const router = Router();

  router.get("/complaints-legacy", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      res.json(await deps.services.getComplaintsLegacy.execute());
    } catch (error) {
      logger.error("error_fetching_complaints", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/complaints/:publicId/legacy", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as {
        status?: unknown;
        actionTaken?: unknown;
      };

      res.json(
        await deps.services.updateComplaintLegacy.execute({
          complaintPublicId: String(req.params.publicId ?? ""),
          status: body.status,
          actionTaken: body.actionTaken,
          actorUserId: access.user.id,
          requestIp: getRequestIpFromExpressLike(req),
        }),
      );
    } catch (error) {
      logger.error("error_updating_legacy_complaint", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/complaints/stats", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      res.json(
        await deps.services.getComplaintStats.execute(
          req.query as Record<string, unknown>,
        ),
      );
    } catch (error) {
      logger.error("error_fetching_complaint_stats", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/complaints", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      res.json(
        await deps.services.listComplaints.execute(
          req.query as Record<string, unknown>,
        ),
      );
    } catch (error) {
      logger.error("error_fetching_complaints", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/complaints/:id/related-listing", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      res.json(
        await deps.services.getRelatedListingComplaints.execute({
          complaintPublicId: String(req.params.id ?? ""),
        }),
      );
    } catch (error) {
      logger.error("error_fetching_related_listing_complaints", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/complaints/:id/seller-summary", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      res.json(
        await deps.services.getSellerSummary.execute({
          complaintPublicId: String(req.params.id ?? ""),
        }),
      );
    } catch (error) {
      logger.error("error_fetching_seller_summary", { error });
      sendApplicationError(res, error);
    }
  });

  router.get("/complaints/:id", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      res.json(
        await deps.services.getComplaintDetails.execute({
          complaintPublicId: String(req.params.id ?? ""),
        }),
      );
    } catch (error) {
      logger.error("error_fetching_complaint_details", { error });
      sendApplicationError(res, error);
    }
  });

  async function handleStatusUpdate(
    req: Request,
    res: Response,
    complaintPublicId: string,
  ): Promise<void> {
    const access = await requireAdmin(req, res);
    if (!access.ok) return;

    const body = (req.body ?? {}) as {
      status?: unknown;
      actionTaken?: unknown;
    };

    res.json(
      await deps.services.updateComplaintStatus.execute({
        complaintPublicId,
        status: body.status,
        actionTaken: body.actionTaken,
        actorUserId: access.user.id,
        requestIp: getRequestIpFromExpressLike(req),
        idempotencyKey: req.header("Idempotency-Key")?.trim() ?? "",
      }),
    );
  }

  router.patch("/complaints/:id/status", async (req: Request, res: Response) => {
    try {
      await handleStatusUpdate(req, res, String(req.params.id ?? ""));
    } catch (error) {
      logger.error("error_updating_complaint_status", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/complaints/:publicId", async (req: Request, res: Response) => {
    try {
      await handleStatusUpdate(req, res, String(req.params.publicId ?? ""));
    } catch (error) {
      logger.error("error_updating_complaint_status", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
