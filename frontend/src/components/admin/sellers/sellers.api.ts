import { apiGet, apiPatch } from "../../../lib/api";
import type { PartnershipRequest, ReviewAction } from "./sellers.types";

export function fetchPartnershipRequests(): Promise<PartnershipRequest[]> {
  return apiGet<PartnershipRequest[]>("/admin/partnership-requests");
}

export function updatePartnershipRequestStatus(
  requestId: string,
  status: ReviewAction,
  note: string,
): Promise<{ success: boolean }> {
  const body =
    status === "rejected"
      ? { status, rejectionReason: note }
      : { status, adminNote: note || undefined };

  return apiPatch<{ success: boolean }>(
    `/admin/partnership-requests/${encodeURIComponent(requestId)}`,
    body,
  );
}
