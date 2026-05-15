import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import type { GetComplaintDetailsService } from "../application/services/get-complaint-details.service";
import type { GetComplaintStatsService } from "../application/services/get-complaint-stats.service";
import type { GetComplaintsLegacyService } from "../application/services/get-complaints-legacy.service";
import type { GetRelatedListingComplaintsService } from "../application/services/get-related-listing-complaints.service";
import type { GetSellerSummaryService } from "../application/services/get-seller-summary.service";
import type { ListComplaintsService } from "../application/services/list-complaints.service";
import type { UpdateComplaintLegacyService } from "../application/services/update-complaint-legacy.service";
import type { UpdateComplaintStatusService } from "../application/services/update-complaint-status.service";

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}

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
      console.error("Error fetching complaints:", error);
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
          requestIp: getRequestIp(req),
        }),
      );
    } catch (error) {
      console.error("Error updating legacy complaint:", error);
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
      console.error("Error fetching complaint stats:", error);
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
      console.error("Error fetching complaints:", error);
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
      console.error("Error fetching related listing complaints:", error);
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
      console.error("Error fetching seller summary:", error);
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
      console.error("Error fetching complaint details:", error);
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
        requestIp: getRequestIp(req),
        idempotencyKey: req.header("Idempotency-Key")?.trim() ?? "",
      }),
    );
  }

  router.patch("/complaints/:id/status", async (req: Request, res: Response) => {
    try {
      await handleStatusUpdate(req, res, String(req.params.id ?? ""));
    } catch (error) {
      console.error("Error updating complaint status:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/complaints/:publicId", async (req: Request, res: Response) => {
    try {
      await handleStatusUpdate(req, res, String(req.params.publicId ?? ""));
    } catch (error) {
      console.error("Error updating complaint status:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
