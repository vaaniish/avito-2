import { apiGet, apiPatch } from "../../../shared/lib/api";
import type {
  PartnershipRequest,
  PartnershipRequestActionResponse,
  ReviewAction,
} from "./sellers.types";
import { normalizePartnershipRequest } from "./sellers.utils";

export function fetchPartnershipRequests(): Promise<PartnershipRequest[]> {
  return apiGet<PartnershipRequest[]>("/admin/partnership-requests").then((items) =>
    items.map((item) => normalizePartnershipRequest(item)),
  );
}

export function updatePartnershipRequestStatus(
  requestId: string,
  status: ReviewAction,
  note: string,
): Promise<PartnershipRequestActionResponse> {
  const body =
    status === "rejected"
      ? { status, rejectionReason: note }
      : { status, adminNote: note || undefined };

  return apiPatch<PartnershipRequestActionResponse>(
    `/admin/partnership-requests/${encodeURIComponent(requestId)}`,
    body,
  ).then((result) => ({
    ...result,
    allowedActions:
      result.allowedActions ??
      normalizePartnershipRequest({
        id: requestId,
        status: result.status,
        sellerType: "",
        name: "",
        email: "",
        contact: "",
        link: "",
        category: "",
        inn: null,
        geography: null,
        socialProfile: null,
        credibility: null,
        whyUs: null,
        createdAt: "",
        reviewedAt: null,
        rejectionReason: null,
        adminNote: null,
        onboardingProfile: null,
        evaluation: null,
        applicant: {
          id: "",
          role: "buyer",
          status: "active",
          email: "",
          name: "",
        },
        reviewedBy: null,
      }).allowedActions,
  }));
}
