import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import {
  parseAuditAction,
  parseAuditEntityType,
} from "../domain/admin-audit.helpers";
import type { ListAdminAuditLogsService } from "../application/services/list-admin-audit-logs.service";

export function createAdminAuditRouter(deps: {
  services: {
    listAdminAuditLogs: ListAdminAuditLogsService;
  };
}) {
  const router = Router();

  router.get("/audit-logs", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(
        await deps.services.listAdminAuditLogs.execute({
          q: req.query.q,
          action: parseAuditAction(req.query.action),
          entityType: parseAuditEntityType(req.query.entityType),
          limit: req.query.limit,
        }),
      );
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
