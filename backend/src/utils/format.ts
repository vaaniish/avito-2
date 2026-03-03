export function toClientRole(role: string): "regular" | "partner" | "admin" {
  if (role === "ADMIN") return "admin";
  if (role === "SELLER") return "partner";
  return "regular";
}

export function toClientCondition(condition: string): "new" | "used" {
  return condition === "NEW" ? "new" : "used";
}

export function toPartnerListingStatus(status: string): "active" | "inactive" | "moderation" {
  if (status === "INACTIVE") return "inactive";
  if (status === "MODERATION") return "moderation";
  return "active";
}

export function toAdminListingStatus(
  moderationStatus: string,
): "pending" | "approved" | "rejected" {
  if (moderationStatus === "APPROVED") return "approved";
  if (moderationStatus === "REJECTED") return "rejected";
  return "pending";
}

export function toProfileOrderStatus(
  status: string,
): "processing" | "completed" | "cancelled" | "shipped" {
  if (status === "COMPLETED") return "completed";
  if (status === "CANCELLED") return "cancelled";
  if (status === "SHIPPED") return "shipped";
  return "processing";
}

export function toQuestionStatus(status: string): "pending" | "answered" {
  return status === "ANSWERED" ? "answered" : "pending";
}
