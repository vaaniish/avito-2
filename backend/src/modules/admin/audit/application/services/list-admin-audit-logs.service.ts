import { parseLimit } from "../../../common/domain/admin-common.helpers";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_RISK_TYPES,
  type AuditRiskType,
  matchesAuditFullText,
} from "../../domain/admin-audit.helpers";
import type { AdminAuditRepository } from "../../infrastructure/repositories/admin-audit.repository";

type AuditTarget = {
  id: string;
  name: string | null;
  email: string | null;
};

type AuditActor = {
  id: string;
  name: string;
  email: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getDetailString(
  details: unknown,
  keys: string[],
): string | null {
  if (!isRecord(details)) return null;
  for (const key of keys) {
    const value = details[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return null;
}

function normalizeStatus(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

function formatRole(value: string | null): string | null {
  if (!value) return null;
  if (value === "BUYER") return "покупатель";
  if (value === "SELLER") return "партнёр";
  if (value === "ADMIN") return "администратор";
  return value.toLowerCase();
}

function buildRiskType(action: string, details: unknown): AuditRiskType {
  if (action === "user.role_changed") return "role_changed";
  if (action === "commission_tier.rate_changed") return "commission_changed";

  const afterStatus = normalizeStatus(
    getDetailString(details, ["afterStatus", "послеСтатуса"]),
  );
  return afterStatus === "ACTIVE" ? "user_unblocked" : "user_blocked";
}

function isRiskAuditAction(action: string): boolean {
  return AUDIT_ACTIONS.some((allowedAction) => allowedAction === action);
}

function buildSummary(params: { riskType: AuditRiskType; details: unknown }): string {
  if (params.riskType === "user_blocked") {
    const source = getDetailString(params.details, ["source"]);
    return source === "complaint_approved_auto_enforcement"
      ? "Заблокировал пользователя по жалобе"
      : "Заблокировал пользователя";
  }

  if (params.riskType === "user_unblocked") {
    return "Разблокировал пользователя";
  }

  if (params.riskType === "role_changed") {
    return "Изменил роль пользователя";
  }

  return "Изменил ставку комиссии";
}

function buildReason(params: {
  riskType: AuditRiskType;
  details: unknown;
}): string | null {
  if (params.riskType === "user_blocked") {
    return getDetailString(params.details, [
      "afterBlockReason",
      "actionTaken",
      "причина",
      "послеПричины",
    ]);
  }

  if (params.riskType === "user_unblocked") {
    return getDetailString(params.details, [
      "beforeBlockReason",
      "afterBlockReason",
      "причина",
      "доПричины",
    ]);
  }

  if (params.riskType === "role_changed") {
    const beforeRole = formatRole(
      getDetailString(params.details, ["beforeRole", "доРоли"]),
    );
    const afterRole = formatRole(
      getDetailString(params.details, ["afterRole", "послеРоли"]),
    );
    return beforeRole && afterRole ? `${beforeRole} -> ${afterRole}` : null;
  }

  const beforeRate = getDetailString(params.details, [
    "beforeCommissionRate",
    "доСтавки",
  ]);
  const afterRate = getDetailString(params.details, [
    "afterCommissionRate",
    "послеСтавки",
  ]);
  return beforeRate && afterRate ? `${beforeRate}% -> ${afterRate}%` : null;
}

export class ListAdminAuditLogsService {
  constructor(private readonly repository: AdminAuditRepository) {}

  async execute(input: {
    q?: unknown;
    action?: any;
    entityType?: any;
    riskType?: AuditRiskType;
    limit?: unknown;
  }) {
    const q = typeof input.q === "string" ? input.q.trim() : "";
    const fetchedLogs = await this.repository.listLogs({
      action: input.action,
      entityType: input.entityType,
    });
    const riskLogs = fetchedLogs.filter(
      (log) => isRiskAuditAction(log.action) && log.actor !== null,
    );

    const targetUserIds = Array.from(
      new Set(
        riskLogs
          .filter(
            (log) =>
              log.entity_type === "user" && typeof log.entity_public_id === "string",
          )
          .map((log) => String(log.entity_public_id)),
      ),
    );
    const targetUsers = await this.repository.listTargetUsersByPublicIds(
      targetUserIds,
    );
    const targetUsersByPublicId = new Map(
      targetUsers.map((user) => [user.public_id, user]),
    );

    const enrichedLogs = riskLogs.map((log) => {
      const riskType = buildRiskType(log.action, log.details);
      const targetUser =
        log.entity_type === "user" && log.entity_public_id
          ? targetUsersByPublicId.get(log.entity_public_id) ?? null
          : null;
      const target: AuditTarget | null = targetUser
        ? {
            id: targetUser.public_id,
            name: targetUser.name,
            email: targetUser.email,
          }
        : null;
      const actor: AuditActor | null = log.actor
        ? {
            id: log.actor.public_id,
            name: log.actor.name,
            email: log.actor.email,
          }
        : null;
      const reason = buildReason({ riskType, details: log.details });
      const summary = buildSummary({
        riskType,
        details: log.details,
      });

      return {
        id: log.public_id,
        createdAt: log.created_at,
        action: log.action,
        entityType: log.entity_type,
        entityId: log.entity_public_id,
        ipAddress: log.ip_address,
        details: log.details,
        riskType,
        summary,
        target,
        reason,
        actor,
      };
    });

    const riskFilteredLogs = input.riskType
      ? enrichedLogs.filter((log) => log.riskType === input.riskType)
      : enrichedLogs;
    const logs = q
      ? riskFilteredLogs.filter((log) =>
          matchesAuditFullText(
            {
              id: log.id,
              action: log.action,
              entityType: log.entityType,
              entityId: log.entityId,
              ipAddress: log.ipAddress,
              details: log.details,
              riskType: log.riskType,
              summary: log.summary,
              reason: log.reason,
              target: log.target,
              createdAt: log.createdAt.toISOString(),
              actor: log.actor,
            },
            q,
          ),
        )
      : riskFilteredLogs;

    return {
      logs: logs.slice(0, parseLimit(input.limit, 200)),
      availableActions: AUDIT_ACTIONS,
      availableEntities: AUDIT_ENTITY_TYPES,
      availableRiskTypes: AUDIT_RISK_TYPES,
    };
  }
}
