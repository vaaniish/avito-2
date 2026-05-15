import { validationError } from "../../../../common/application-error";
import { ListingModerationDecision } from "@prisma/client";

export type ModerationStatusValue = "PENDING" | "APPROVED" | "REJECTED";
export type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";

export function parseModerationStatus(
  status: unknown,
): ModerationStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

export function requireModerationStatus(
  status: unknown,
): ModerationStatusValue {
  const parsed = parseModerationStatus(status);
  if (!parsed) {
    throw validationError("Invalid moderation status");
  }
  return parsed;
}

export function toModerationDecision(
  status: ModerationStatusValue,
): ListingModerationDecision {
  if (status === "APPROVED") return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  return "QUEUED";
}

export function buildAutoFlags(listing: {
  description: string | null;
  seller: { joined_at: Date };
  complaints_count: number;
}): string[] {
  const flags: string[] = [];
  const joinedDays = Math.floor(
    (Date.now() - listing.seller.joined_at.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (joinedDays <= 30) flags.push("new_seller");

  const description = (listing.description ?? "").toLowerCase();
  if (/\b(telegram|whatsapp|prepayment|transfer)\b/.test(description)) {
    flags.push("forbidden_words");
  }
  if (/\+\d|@|\.ru|\.com/.test(description)) {
    flags.push("contacts_in_description");
  }
  if (
    (listing.description ?? "").length > 200 &&
    /(!!!|\bcheap\b|\burgent\b)/i.test(listing.description ?? "")
  ) {
    flags.push("spam_text");
  }
  if (listing.complaints_count > 0) flags.push("seller_with_complaints");
  if (listing.complaints_count > 1) flags.push("multiple_reports");
  return flags;
}

export function resolveNextListingStatus(params: {
  moderationStatus: ModerationStatusValue;
  activationBlockedByOrder: boolean;
}): ListingStatusValue {
  if (params.moderationStatus === "APPROVED") {
    return params.activationBlockedByOrder ? "INACTIVE" : "ACTIVE";
  }
  if (params.moderationStatus === "REJECTED") {
    return "INACTIVE";
  }
  return "MODERATION";
}
