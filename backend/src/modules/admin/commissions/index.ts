import { prisma } from "../../../lib/prisma";
import { createAdminCommissionsRouter } from "./http/admin-commissions.router";
import { AdminCommissionsAuditGateway } from "./infrastructure/gateways/admin-commissions-audit.gateway";
import { AdminCommissionsRepository } from "./infrastructure/repositories/admin-commissions.repository";
import {
  BatchUpdateCommissionTiersService,
  ListCommissionTiersService,
  UpdateCommissionTierRateService,
} from "./application/services/admin-commissions.service";

const repository = new AdminCommissionsRepository(prisma);
const auditGateway = new AdminCommissionsAuditGateway(prisma);

export const adminCommissionsRouter = createAdminCommissionsRouter({
  services: {
    listCommissionTiers: new ListCommissionTiersService(repository),
    batchUpdateCommissionTiers: new BatchUpdateCommissionTiersService(
      repository,
      auditGateway,
    ),
    updateCommissionTierRate: new UpdateCommissionTierRateService(
      repository,
      auditGateway,
    ),
  },
});
