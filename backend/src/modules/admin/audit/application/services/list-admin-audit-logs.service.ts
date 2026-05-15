import { parseLimit } from "../../../common/domain/admin-common.helpers";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  matchesAuditFullText,
} from "../../domain/admin-audit.helpers";
import type { AdminAuditRepository } from "../../infrastructure/repositories/admin-audit.repository";

export class ListAdminAuditLogsService {
  constructor(private readonly repository: AdminAuditRepository) {}

  async execute(input: {
    q?: unknown;
    action?: any;
    entityType?: any;
    limit?: unknown;
  }) {
    const q = typeof input.q === "string" ? input.q.trim() : "";
    const fetchedLogs = await this.repository.listLogs({
      action: input.action,
      entityType: input.entityType,
    });
    const logs = q
      ? fetchedLogs.filter((log) =>
          matchesAuditFullText(
            {
              id: log.public_id,
              action: log.action,
              entityType: log.entity_type,
              entityId: log.entity_public_id,
              ipAddress: log.ip_address,
              details: log.details,
              createdAt: log.created_at.toISOString(),
              actor: log.actor
                ? {
                    id: log.actor.public_id,
                    name: log.actor.name,
                    email: log.actor.email,
                  }
                : null,
            },
            q,
          ),
        )
      : fetchedLogs;

    return {
      logs: logs.slice(0, parseLimit(input.limit, 200)).map((log) => ({
        id: log.public_id,
        createdAt: log.created_at,
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_public_id,
        ipAddress: log.ip_address,
        details: log.details,
        actor: log.actor
          ? {
              id: log.actor.public_id,
              name: log.actor.name,
              email: log.actor.email,
            }
          : null,
      })),
      availableActions: AUDIT_ACTIONS,
      availableEntities: AUDIT_ENTITY_TYPES,
    };
  }
}
