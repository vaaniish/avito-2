import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import type { ListAdminUsersService } from "../application/services/list-admin-users.service";
import type { UpdateAdminUserRoleService } from "../application/services/update-admin-user-role.service";
import type { UpdateAdminUserStatusService } from "../application/services/update-admin-user-status.service";

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}

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
      console.error("Error fetching users:", error);
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
          requestIp: getRequestIp(req),
        }),
      );
    } catch (error) {
      console.error("Error updating user status:", error);
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
          requestIp: getRequestIp(req),
        }),
      );
    } catch (error) {
      console.error("Error updating user role:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
