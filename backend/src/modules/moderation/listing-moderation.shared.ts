export const LISTING_MODERATION_REASON_CODES = [
  "QUEUED_FOR_BACKGROUND_MODERATION",
  "AUTO_APPROVE_NO_FLAGS",
  "AUTO_REVIEW_FLAGGED_BY_RULES_OR_AI",
  "AUTO_REJECT_HIGH_CONFIDENCE_VIOLATION",
  "ADMIN_APPROVED_MANUAL_REVIEW",
  "ADMIN_REJECT_QUALITY_INCOMPLETE",
  "ADMIN_REJECT_PHOTO_INCOMPLETE",
  "ADMIN_REJECT_PROHIBITED_CONTENT",
  "ADMIN_REJECT_FAKE_OR_SCAM",
  "ADMIN_REJECT_OTHER",
] as const;

export type ListingModerationReasonCode =
  (typeof LISTING_MODERATION_REASON_CODES)[number];

const REASON_CODE_SET = new Set<string>(LISTING_MODERATION_REASON_CODES);

export function parseListingModerationReasonCode(
  value: unknown,
): ListingModerationReasonCode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (!REASON_CODE_SET.has(normalized)) {
    return null;
  }
  return normalized as ListingModerationReasonCode;
}

export function defaultListingModerationReasonCode(params: {
  moderationStatus: "APPROVED" | "PENDING" | "REJECTED";
}): ListingModerationReasonCode {
  if (params.moderationStatus === "APPROVED") {
    return "ADMIN_APPROVED_MANUAL_REVIEW";
  }
  if (params.moderationStatus === "REJECTED") {
    return "ADMIN_REJECT_OTHER";
  }
  return "QUEUED_FOR_BACKGROUND_MODERATION";
}

export function makeListingModerationEventPublicId(): string {
  return `LME-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
