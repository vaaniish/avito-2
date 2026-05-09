import type { PartnershipStatus } from "./sellers.types";
import { statusBadgeClass, statusLabel } from "./sellers.utils";

export function SellerStatusBadge({ status }: { status: PartnershipStatus }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}
