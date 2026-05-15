import { toClientRole } from "../../../../utils/format";
import { toClientSanctionLevel } from "../../complaints/domain/complaint-sanction.helpers";
import type {
  AdminUserListRecord,
  AdminUserSanctionAggregate,
  UserRoleValue,
  UserStatusValue,
} from "./admin-users.types";

export const MAX_BLOCK_REASON_LENGTH = 500;

export function parseUserStatus(value: unknown): UserStatusValue | null {
  if (value === "active") return "ACTIVE";
  if (value === "blocked") return "BLOCKED";
  return null;
}

export function parseUserRole(value: unknown): UserRoleValue | null {
  if (value === "regular") return "BUYER";
  if (value === "partner") return "SELLER";
  return null;
}

export function toClientComplaintSanctionStatus(
  status: "ACTIVE" | "COMPLETED",
): "active" | "completed" {
  return status === "ACTIVE" ? "active" : "completed";
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

export function mapAdminUserListItem(
  user: AdminUserListRecord,
  aggregate: AdminUserSanctionAggregate,
) {
  const buyerSpent = user.orders_as_buyer.reduce(
    (sum, order) => sum + order.total_price,
    0,
  );
  const sellerRevenue = user.orders_as_seller.reduce(
    (sum, order) => sum + order.total_price,
    0,
  );
  const activeListings = user.listings.filter(
    (listing) =>
      listing.status === "ACTIVE" && listing.moderation_status === "APPROVED",
  ).length;
  const pendingListings = user.listings.filter(
    (listing) => listing.moderation_status === "PENDING",
  ).length;
  const lastBuyerOrderDate = user.orders_as_buyer[0]?.created_at ?? null;
  const lastSellerOrderDate = user.orders_as_seller[0]?.created_at ?? null;
  const kycLatest = user.kyc_requests[0] ?? null;
  const latestSanction = aggregate.latestSanctionByUser.get(user.id) ?? null;

  return {
    id: user.public_id,
    name: user.name,
    email: user.email,
    role: toClientRole(user.role),
    status: user.status.toLowerCase(),
    joinedAt: user.joined_at,
    city: extractPrimaryAddressInfo(user.addresses).city || null,
    phone: user.phone,
    blockReason: user.block_reason,
    blockedUntil: user.blocked_until,
    buyerOrders: user.orders_as_buyer.length,
    sellerOrders: user.orders_as_seller.length,
    buyerSpent,
    sellerRevenue,
    avgBuyerCheck:
      user.orders_as_buyer.length > 0
        ? Math.round(buyerSpent / user.orders_as_buyer.length)
        : 0,
    avgSellerCheck:
      user.orders_as_seller.length > 0
        ? Math.round(sellerRevenue / user.orders_as_seller.length)
        : 0,
    activeListings,
    pendingListings,
    totalListings: user.listings.length,
    complaintsMade: user.complaints_reported.length,
    complaintsAgainst: user.complaints_against.length,
    approvedViolations: aggregate.approvedViolationsByUser.get(user.id) ?? 0,
    sanctionsTotal: aggregate.sanctionsTotalByUser.get(user.id) ?? 0,
    sanctionsActive: aggregate.activeSanctionsByUser.get(user.id) ?? 0,
    latestSanction: latestSanction
      ? {
          id: latestSanction.public_id,
          level: toClientSanctionLevel(latestSanction.level as any),
          status: toClientComplaintSanctionStatus(latestSanction.status),
          startsAt: latestSanction.starts_at,
          endsAt: latestSanction.ends_at,
          reason: latestSanction.reason,
          createdAt: latestSanction.created_at,
        }
      : null,
    isSellerVerified: Boolean(user.seller_profile?.is_verified),
    sellerResponseMinutes: user.seller_profile?.average_response_minutes ?? null,
    lastBuyerOrderDate,
    lastSellerOrderDate,
    kycLatest: kycLatest
      ? {
          id: kycLatest.public_id,
          status: kycLatest.status.toLowerCase(),
          createdAt: kycLatest.created_at,
          reviewedAt: kycLatest.reviewed_at,
        }
      : null,
  };
}
