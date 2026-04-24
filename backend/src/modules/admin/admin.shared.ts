import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireRole } from "../../lib/session";

const ROLE_ADMIN = "ADMIN";

export type AuditEntityType =
  | "complaint"
  | "kyc_request"
  | "partnership_request"
  | "listing"
  | "user"
  | "seller_payout_profile"
  | "commission_tier"
  | "moderation";

export type AuditAction =
  | "complaint.status_changed"
  | "kyc.status_changed"
  | "partnership_request.status_changed"
  | "seller.payout_profile.status_changed"
  | "listing.moderation_changed"
  | "user.status_changed"
  | "commission_tier.rate_changed"
  | "anti_circumvention.violation_detected"
  | "anti_circumvention.sanction_applied";

export async function requireAdmin(
  req: Request,
  res: Response,
): Promise<{ ok: true; user: { id: number } } | { ok: false }> {
  const session = await requireRole(req, ROLE_ADMIN);
  if (!session.ok) {
    res.status(session.status).json({ error: session.message });
    return { ok: false };
  }

  return {
    ok: true,
    user: {
      id: session.user.id,
    },
  };
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }

  return req.ip || null;
}

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export async function writeAudit(params: {
  req: Request;
  actorUserId: number;
  action: AuditAction;
  entityType: AuditEntityType;
  entityPublicId?: string | null;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: params.actorUserId,
        action: params.action,
        entity_type: params.entityType,
        entity_public_id: params.entityPublicId ?? null,
        details: params.details,
        ip_address: getRequestIp(params.req),
      },
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

export function parseLimit(value: unknown, defaultValue = 200): number {
  if (typeof value !== "string") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, 500);
}

export function buildListingPublicUrl(listingPublicId: string): string {
  return `/?listingId=${encodeURIComponent(listingPublicId)}`;
}

export function extractPrimaryAddressInfo(
  addresses: Array<{ city: string; region: string }>,
): { city: string; region: string } {
  const first = addresses[0];
  return {
    city: first?.city?.trim() ?? "",
    region: first?.region?.trim() ?? "",
  };
}

export function toClientComplaintSanctionStatus(
  status: "ACTIVE" | "COMPLETED",
): "active" | "completed" {
  return status === "ACTIVE" ? "active" : "completed";
}
