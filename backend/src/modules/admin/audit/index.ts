import { prisma } from "../../../lib/prisma";
import { ListAdminAuditLogsService } from "./application/services/list-admin-audit-logs.service";
import { createAdminAuditRouter } from "./http/admin-audit.router";
import { AdminAuditRepository } from "./infrastructure/repositories/admin-audit.repository";

const repository = new AdminAuditRepository(prisma);

export const adminAuditRouter = createAdminAuditRouter({
  services: {
    listAdminAuditLogs: new ListAdminAuditLogsService(repository),
  },
});
