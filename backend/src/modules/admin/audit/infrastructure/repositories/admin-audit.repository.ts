import type { PrismaClient } from "@prisma/client";
import type {
  AuditAction,
  AuditEntityType,
} from "../../../common/domain/admin-common.helpers";

export class AdminAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listLogs(params: {
    action?: AuditAction;
    entityType?: AuditEntityType;
  }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.action ? { action: params.action } : {}),
        ...(params.entityType ? { entity_type: params.entityType } : {}),
      },
      include: {
        actor: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 1000,
    });
  }
}
