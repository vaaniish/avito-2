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
  | "user.role_changed"
  | "commission_tier.rate_changed"
  | "anti_circumvention.violation_detected"
  | "anti_circumvention.sanction_applied";

export function parseLimit(value: unknown, defaultValue = 200): number {
  if (typeof value !== "string") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue;
  return Math.min(parsed, 500);
}

export function buildListingPublicUrl(listingPublicId: string): string {
  return `/products/${encodeURIComponent(listingPublicId)}`;
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
