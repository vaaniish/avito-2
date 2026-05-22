import { apiGet, apiPatch, apiPost } from "../../../shared/lib/api";
import type {
  AdminPromoDetail,
  AdminPromoFormPayload,
  AdminPromoSummary,
} from "./promos.types";

export function fetchAdminPromos(tab: "current" | "expired") {
  return apiGet<{ tab: "current" | "expired"; items: AdminPromoSummary[] }>(
    `/admin/promos?tab=${encodeURIComponent(tab)}`,
  );
}

export function fetchAdminPromo(publicId: string) {
  return apiGet<AdminPromoDetail>(`/admin/promos/${encodeURIComponent(publicId)}`);
}

export function createAdminPromo(payload: AdminPromoFormPayload) {
  return apiPost<AdminPromoDetail>("/admin/promos", payload);
}

export function updateAdminPromo(publicId: string, payload: AdminPromoFormPayload) {
  return apiPatch<AdminPromoDetail>(
    `/admin/promos/${encodeURIComponent(publicId)}`,
    payload,
  );
}
