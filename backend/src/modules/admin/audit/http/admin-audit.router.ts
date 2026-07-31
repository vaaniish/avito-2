import { logger } from "../../../../lib/logger";
import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import {
  parseAuditAction,
  parseAuditEntityType,
  parseAuditRiskType,
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
          riskType: parseAuditRiskType(req.query.riskType),
          limit: req.query.limit,
        }),
      );
    } catch (error) {
      logger.error("error_fetching_audit_logs", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
