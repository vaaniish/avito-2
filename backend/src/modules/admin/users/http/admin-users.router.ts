import { logger } from "../../../../lib/logger";
import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { getRequestIpFromExpressLike } from "../../../../common/http/request-meta";
import { requireAdmin } from "../../common/http/admin-session";
import type { ListAdminUsersService } from "../application/services/list-admin-users.service";
import type { UpdateAdminUserRoleService } from "../application/services/update-admin-user-role.service";
import type { UpdateAdminUserStatusService } from "../application/services/update-admin-user-status.service";

export function createAdminUsersRouter(deps: {
  services: {
    listAdminUsers: ListAdminUsersService;
    updateAdminUserStatus: UpdateAdminUserStatusService;
    updateAdminUserRole: UpdateAdminUserRoleService;
  };
}) {
  const router = Router();

  router.get("/users", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      res.json(await deps.services.listAdminUsers.execute());
    } catch (error) {
      logger.error("error_fetching_users", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/users/:publicId/status", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as {
        status?: unknown;
        blockReason?: unknown;
      };

      res.json(
        await deps.services.updateAdminUserStatus.execute({
          publicId: String(req.params.publicId ?? ""),
          status: body.status,
          blockReason: body.blockReason,
          actorUserId: access.user.id,
          requestIp: getRequestIpFromExpressLike(req),
        }),
      );
    } catch (error) {
      logger.error("error_updating_user_status", { error });
      sendApplicationError(res, error);
    }
  });

  router.patch("/users/:publicId/role", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as { role?: unknown };
      res.json(
        await deps.services.updateAdminUserRole.execute({
          publicId: String(req.params.publicId ?? ""),
          role: body.role,
          actorUserId: access.user.id,
          requestIp: getRequestIpFromExpressLike(req),
        }),
      );
    } catch (error) {
      logger.error("error_updating_user_role", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
