import { createHash } from "node:crypto";
import type {
  ComplaintDto,
  ComplaintListFilters,
  ComplaintPriority,
  ComplaintSortBy,
  ComplaintSortOrder,
  ComplaintStatusClient,
  ComplaintStatusValue,
} from "./admin-complaints.types";

export const COMPLAINT_STATUS_IDEMPOTENCY_ACTION = "complaint.status.update";
export const MAX_COMPLAINT_PAGE_SIZE = 100;

export function parseComplaintStatus(status: unknown): ComplaintStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  if (status === "new") return "NEW";
  return null;
}

export function buildComplaintEvaluation(params: {
  complaintType: string;
  listingComplaintCount: number;
  sellerComplaintCount: number;
}): {
  score: number;
  recommendation: "approve" | "reject" | "manual_review";
  reasons: string[];
} {
  let rawScore = 0;
  const reasons: string[] = [];

  if (params.sellerComplaintCount >= 5) {
    rawScore += 30;
    reasons.push("seller_has_many_complaints");
  } else if (params.sellerComplaintCount >= 2) {
    rawScore += 15;
    reasons.push("seller_has_repeat_complaints");
  }

  if (params.listingComplaintCount >= 3) {
    rawScore += 20;
    reasons.push("listing_has_multiple_reports");
  } else if (params.listingComplaintCount >= 2) {
    rawScore += 10;
    reasons.push("listing_has_repeat_reports");
  }

  const normalizedType = params.complaintType.toLowerCase();
  if (
    normalizedType.includes("вне") ||
    normalizedType.includes("platform") ||
    normalizedType.includes("payment")
  ) {
    rawScore += 20;
    reasons.push("high_risk_type_payment_off_platform");
  }

  if (reasons.length === 0) {
    reasons.push("insufficient_objective_signals");
  }

  const score = Math.round((rawScore / 70) * 100);
  const recommendation =
    score >= 60 ? "approve" : score <= 20 ? "reject" : "manual_review";

  return { score, recommendation, reasons };
}

export function makePublicId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function toClientComplaintStatus(
  status: ComplaintStatusValue,
): ComplaintStatusClient {
  if (status === "NEW") return "new";
  if (status === "PENDING") return "pending";
  if (status === "APPROVED") return "approved";
  return "rejected";
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

export function parseQueryValues(input: unknown): string[] {
  if (typeof input === "string") {
    return input
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(input)) {
    return input.flatMap((item) => parseQueryValues(item));
  }
  return [];
}

export function parseComplaintStatusesFilter(
  input: unknown,
): ComplaintStatusValue[] {
  const parsed = parseQueryValues(input)
    .map((item) => parseComplaintStatus(item.toLowerCase()))
    .filter((item): item is ComplaintStatusValue => item !== null);
  return Array.from(new Set(parsed));
}

export function parseComplaintPriorityFilter(input: unknown): ComplaintPriority[] {
  const parsed = parseQueryValues(input)
    .map((item) => item.toLowerCase())
    .filter(
      (item): item is ComplaintPriority =>
        item === "low" || item === "medium" || item === "high",
    );
  return Array.from(new Set(parsed));
}

export function parseDateQuery(input: unknown): Date | null {
  if (typeof input !== "string" || !input.trim()) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function parsePageQuery(input: unknown): number {
  if (typeof input !== "string") return 1;
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0) return 1;
  return parsed;
}

export function parsePageSizeQuery(input: unknown): number {
  if (typeof input !== "string") return 20;
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, MAX_COMPLAINT_PAGE_SIZE);
}

export function parseComplaintSortBy(input: unknown): ComplaintSortBy {
  if (input === "createdAt") return "createdAt";
  if (input === "riskScore") return "riskScore";
  if (input === "queueScore") return "queueScore";
  return "queueScore";
}

export function parseComplaintSortOrder(input: unknown): ComplaintSortOrder {
  return input === "asc" ? "asc" : "desc";
}

export function normalizeQueryText(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

export function computeComplaintQueueMetrics(params: {
  createdAt: Date;
  riskScore: number;
  listingComplaintsCount: number;
  sellerViolationsCount: number;
}): { queueScore: number; priority: ComplaintPriority; ageHours: number } {
  const ageHours = Math.max(
    0,
    Math.floor((Date.now() - params.createdAt.getTime()) / (1000 * 60 * 60)),
  );
  const ageBoost = Math.min(30, Math.floor(ageHours / 12) * 2);
  const repeatBoost = Math.min(36, params.sellerViolationsCount * 9);
  const listingBoost = Math.min(
    20,
    Math.max(0, params.listingComplaintsCount - 1) * 7,
  );
  const queueScore = params.riskScore + ageBoost + repeatBoost + listingBoost;

  if (queueScore >= 85) {
    return { queueScore, priority: "high", ageHours };
  }
  if (queueScore >= 45) {
    return { queueScore, priority: "medium", ageHours };
  }
  return { queueScore, priority: "low", ageHours };
}

export function complaintPriorityRank(priority: ComplaintPriority): number {
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

export function sortComplaints(
  complaints: ComplaintDto[],
  sortBy: ComplaintSortBy,
  sortOrder: ComplaintSortOrder,
): ComplaintDto[] {
  const sorted = [...complaints];
  const direction = sortOrder === "asc" ? 1 : -1;

  sorted.sort((left, right) => {
    if (sortBy === "createdAt") {
      return (left.createdAt.getTime() - right.createdAt.getTime()) * direction;
    }
    if (sortBy === "riskScore") {
      const diff = (left.riskScore - right.riskScore) * direction;
      if (diff !== 0) return diff;
      return (left.createdAt.getTime() - right.createdAt.getTime()) * direction;
    }

    const queueDiff = (left.queueScore - right.queueScore) * direction;
    if (queueDiff !== 0) return queueDiff;

    const priorityDiff =
      (complaintPriorityRank(left.priority) -
        complaintPriorityRank(right.priority)) *
      direction;
    if (priorityDiff !== 0) return priorityDiff;

    return (left.createdAt.getTime() - right.createdAt.getTime()) * direction;
  });

  return sorted;
}

export function normalizeComplaintFilters(input: {
  statuses?: unknown;
  moderator?: unknown;
  from?: unknown;
  to?: unknown;
  q?: unknown;
}): ComplaintListFilters {
  const query = normalizeQueryText(input.q);
  return {
    statuses: parseComplaintStatusesFilter(input.statuses),
    moderatorPublicId:
      typeof input.moderator === "string" ? input.moderator : undefined,
    from: parseDateQuery(input.from),
    to: parseDateQuery(input.to),
    query,
  };
}

export function makeIdempotencyHash(params: {
  complaintPublicId: string;
  status: ComplaintStatusValue;
  actionTaken: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        complaintPublicId: params.complaintPublicId,
        status: params.status,
        actionTaken: params.actionTaken ?? null,
      }),
    )
    .digest("hex");
}
