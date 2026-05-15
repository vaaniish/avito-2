import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { GetProfileOverviewService } from "../application/services/get-profile-overview.service";
import type { UpdateProfileUserService } from "../application/services/update-profile-user.service";

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
      console.error("Error fetching profile data:", error);
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

      res.json(
        await deps.services.updateProfileUser.execute({
          userId: session.user.id,
          payload: (req.body ?? {}) as Record<string, unknown>,
          toClientRole: deps.toClientRole,
        }),
      );
    } catch (error) {
      console.error("Error updating profile:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
