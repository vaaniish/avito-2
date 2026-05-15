import type { AuditAction, AuditEntityType } from "../../common/domain/admin-common.helpers";

export const AUDIT_ENTITY_TYPES: AuditEntityType[] = [
  "complaint",
  "kyc_request",
  "partnership_request",
  "listing",
  "user",
  "seller_payout_profile",
  "commission_tier",
  "moderation",
];

export const AUDIT_ACTIONS: AuditAction[] = [
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

export function parseAuditAction(value: unknown): AuditAction | undefined {
  if (typeof value !== "string") return undefined;
  return AUDIT_ACTIONS.find((action) => action === value);
}

export function parseAuditEntityType(
  value: unknown,
): AuditEntityType | undefined {
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

export function matchesAuditFullText(input: unknown, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return toSearchText(input).includes(normalized);
}
