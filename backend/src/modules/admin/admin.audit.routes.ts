import { Prisma } from "@prisma/client";
import { type Request, type Response, type Router } from "express";
import {
  parseLimit,
  requireAdmin,
  type AuditAction,
  type AuditEntityType,
} from "./admin.shared";
import { prisma } from "../../lib/prisma";

const AUDIT_ENTITY_TYPES: AuditEntityType[] = [
  "complaint",
  "kyc_request",
  "partnership_request",
  "listing",
  "user",
  "seller_payout_profile",
  "commission_tier",
  "moderation",
];

const AUDIT_ACTIONS: AuditAction[] = [
  "complaint.status_changed",
  "kyc.status_changed",
  "partnership_request.status_changed",
  "seller.payout_profile.status_changed",
  "listing.moderation_changed",
  "user.status_changed",
  "commission_tier.rate_changed",
  "anti_circumvention.violation_detected",
  "anti_circumvention.sanction_applied",
];

function parseAuditAction(value: unknown): AuditAction | undefined {
  if (typeof value !== "string") return undefined;
  return AUDIT_ACTIONS.find((action) => action === value);
}

function parseAuditEntityType(value: unknown): AuditEntityType | undefined {
  if (typeof value !== "string") return undefined;
  return AUDIT_ENTITY_TYPES.find((entity) => entity === value);
}

function toSearchText(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input.toLowerCase();
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input).toLowerCase();
  }
  if (input instanceof Date) return input.toISOString().toLowerCase();
  if (Array.isArray(input)) {
    return input.map((item) => toSearchText(item)).join(" ");
  }
  if (typeof input === "object") {
    return Object.values(input as Record<string, unknown>)
      .map((value) => toSearchText(value))
      .join(" ");
  }
  return "";
}

function matchesFullText(input: unknown, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return toSearchText(input).includes(normalized);
}

export function registerAdminAuditRoutes(adminRouter: Router) {
  adminRouter.get("/audit-logs", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const action = parseAuditAction(req.query.action);
      const entityType = parseAuditEntityType(req.query.entityType);
      const limit = parseLimit(req.query.limit, 200);

      const where: Prisma.AuditLogWhereInput = {};

      if (action) {
        where.action = action;
      }

      if (entityType) {
        where.entity_type = entityType;
      }

      const fetchedLogs = await prisma.auditLog.findMany({
        where,
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

      const normalizedQuery = q.trim().toLowerCase();
      const logs = normalizedQuery
        ? fetchedLogs.filter((log) =>
            matchesFullText(
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
              normalizedQuery,
            ),
          )
        : fetchedLogs;

      res.json({
        logs: logs.slice(0, limit).map((log) => ({
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
      });
    } catch (error) {
      console.error("Error fetching audit logs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
