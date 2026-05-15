import {
  notFound,
  validationError,
} from "../../../../../common/application-error";
import { parseUserRole } from "../../domain/admin-users.helpers";
import type {
  AdminAuditWriterPort,
  AdminUsersRepositoryPort,
} from "../../domain/admin-users.types";

export class UpdateAdminUserRoleService {
  constructor(
    private readonly repository: AdminUsersRepositoryPort,
    private readonly auditWriter: AdminAuditWriterPort,
  ) {}

  async execute(input: {
    publicId: string;
    role: unknown;
    actorUserId: number;
    requestIp: string | null;
  }) {
    const nextRole = parseUserRole(input.role);
    if (!nextRole) {
      throw validationError("Invalid user role");
    }

    const existing = await this.repository.findUserForRoleUpdate(input.publicId);
    if (!existing) {
      throw notFound("User not found");
    }
    if (existing.role === "ADMIN") {
      throw validationError("Cannot update admin role");
    }
    if (existing.role === nextRole) {
      return {
        success: true,
        role: nextRole === "SELLER" ? "partner" : "regular",
      };
    }

    await this.repository.updateUserRole({
      userId: existing.id,
      role: nextRole,
    });

    await this.auditWriter.write({
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
      action: "user.role_changed",
      entityPublicId: input.publicId,
      details: {
        beforeRole: existing.role,
        afterRole: nextRole,
      },
    });

    return {
      success: true,
      role: nextRole === "SELLER" ? "partner" : "regular",
    };
  }
}
