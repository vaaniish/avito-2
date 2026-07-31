import { logger } from "../../../../lib/logger";
import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { GetProfileOverviewService } from "../application/services/get-profile-overview.service";
import type { UpdateProfileUserService } from "../application/services/update-profile-user.service";
import { getAuthSessionContext } from "../../../../lib/session";
import { authSessionService } from "../../../auth/composition";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createProfileUserRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  profileRoles: string[];
  services: {
    getProfileOverview: GetProfileOverviewService;
    updateProfileUser: UpdateProfileUserService;
  };
  toClientRole: (role: string) => "regular" | "partner" | "admin";
}) {
  const router = Router();

  router.get("/me", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(await deps.services.getProfileOverview.execute(session.user.id));
    } catch (error) {
      logger.error("error_fetching_profile_data", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/me", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, deps.profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const result = await deps.services.updateProfileUser.execute({
          userId: session.user.id,
          payload: (req.body ?? {}) as Record<string, unknown>,
          toClientRole: deps.toClientRole,
        });
      if (typeof req.body?.newPassword === "string" && req.body.newPassword.length > 0) {
        const context = await getAuthSessionContext(req);
        if (context) {
          await authSessionService.revokeOthers(context.userId, context.sessionId);
        }
      }
      res.json(result);
    } catch (error) {
      logger.error("error_updating_profile", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
