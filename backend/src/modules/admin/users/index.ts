import { prisma } from "../../../lib/prisma";
import { ListAdminUsersService } from "./application/services/list-admin-users.service";
import { UpdateAdminUserRoleService } from "./application/services/update-admin-user-role.service";
import { UpdateAdminUserStatusService } from "./application/services/update-admin-user-status.service";
import { createAdminUsersRouter } from "./http/admin-users.router";
import { AdminUsersAuditGateway } from "./infrastructure/gateways/admin-users-audit.gateway";
import { AdminUsersRepository } from "./infrastructure/repositories/admin-users.repository";

const repository = new AdminUsersRepository(prisma);
const auditGateway = new AdminUsersAuditGateway(prisma);

export const adminUsersRouter = createAdminUsersRouter({
  services: {
    listAdminUsers: new ListAdminUsersService(repository),
    updateAdminUserStatus: new UpdateAdminUserStatusService(
      repository,
      auditGateway,
    ),
    updateAdminUserRole: new UpdateAdminUserRoleService(
      repository,
      auditGateway,
    ),
  },
});
