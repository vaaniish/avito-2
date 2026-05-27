import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { getRequestIpFromExpressLike } from "../../../../common/http/request-meta";
import { requireAdmin } from "../../common/http/admin-session";
import type { ListKycRequestsService } from "../application/services/list-kyc-requests.service";
import type { ListPartnershipRequestsService } from "../application/services/list-partnership-requests.service";
import type { ListPayoutProfilesService } from "../application/services/list-payout-profiles.service";
import type { UpdateKycStatusService } from "../application/services/update-kyc-status.service";
import type { UpdatePartnershipRequestStatusService } from "../application/services/update-partnership-request-status.service";

export function createAdminPartnershipRouter(deps: {
  services: {
    listPartnershipRequests: ListPartnershipRequestsService;
    updatePartnershipRequestStatus: UpdatePartnershipRequestStatusService;
    listKycRequests: ListKycRequestsService;
    updateKycStatus: UpdateKycStatusService;
    listPayoutProfiles: ListPayoutProfilesService;
  };
}) {
  const router = Router();

  router.get("/partnership-requests", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.services.listPartnershipRequests.execute());
    } catch (error) {
      console.error("Error fetching partnership requests:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/partnership-requests/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      const body = (req.body ?? {}) as {
        status?: unknown;
        rejectionReason?: unknown;
        adminNote?: unknown;
      };
      res.json(
        await deps.services.updatePartnershipRequestStatus.execute({
          publicId: String(req.params.publicId ?? ""),
          status: body.status,
          rejectionReason: body.rejectionReason,
          adminNote: body.adminNote,
          requestMeta: {
            actorUserId: access.user.id,
            requestIp: getRequestIpFromExpressLike(req),
          },
        }),
      );
    } catch (error) {
      console.error("Error updating partnership request:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/kyc-requests", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.services.listKycRequests.execute());
    } catch (error) {
      console.error("Error fetching KYC requests:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/kyc-requests/:publicId", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      const body = (req.body ?? {}) as {
        status?: unknown;
        rejectionReason?: unknown;
      };
      res.json(
        await deps.services.updateKycStatus.execute({
          publicId: String(req.params.publicId ?? ""),
          status: body.status,
          rejectionReason: body.rejectionReason,
          requestMeta: {
            actorUserId: access.user.id,
            requestIp: getRequestIpFromExpressLike(req),
          },
        }),
      );
    } catch (error) {
      console.error("Error updating KYC request:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/payout-profiles", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.services.listPayoutProfiles.execute());
    } catch (error) {
      console.error("Error fetching payout profiles:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
