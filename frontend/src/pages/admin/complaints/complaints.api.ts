import { apiGet, apiPatch } from "../../../shared/lib/api";
import type {
  ComplaintDetail,
  ComplaintListResponse,
  ComplaintStatsResponse,
  ComplaintStatusUpdateResponse,
  RelatedListingResponse,
  SellerSummaryResponse,
  StatusAction,
} from "./complaints.types";

export function fetchComplaints(queryString: string) {
  return apiGet<ComplaintListResponse>(`/admin/complaints?${queryString}`);
}

export function fetchComplaintStats(queryString: string) {
  return apiGet<ComplaintStatsResponse>(`/admin/complaints/stats?${queryString}`);
}

export function fetchComplaintDetail(complaintId: string) {
  return apiGet<ComplaintDetail>(`/admin/complaints/${complaintId}`);
}

export function fetchRelatedListingComplaints(complaintId: string) {
  return apiGet<RelatedListingResponse>(`/admin/complaints/${complaintId}/related-listing`);
}

export function fetchComplaintSellerSummary(complaintId: string) {
  return apiGet<SellerSummaryResponse>(`/admin/complaints/${complaintId}/seller-summary`);
}

export function updateComplaintStatus(params: {
  complaintId: string;
  status: StatusAction;
  actionTaken: string | null;
  idempotencyKey: string;
}) {
  return apiPatch<ComplaintStatusUpdateResponse>(
    `/admin/complaints/${params.complaintId}/status`,
    {
      status: params.status,
      actionTaken: params.actionTaken,
    },
    {
      "Idempotency-Key": params.idempotencyKey,
    },
  );
}
