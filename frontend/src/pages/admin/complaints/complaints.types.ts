export type ComplaintStatus = "new" | "pending" | "approved" | "rejected";
export type ComplaintStatusFilter = ComplaintStatus | "all";
export type ComplaintPriority = "low" | "medium" | "high";
export type ComplaintSortBy = "queueScore" | "riskScore" | "createdAt";
export type ComplaintSortOrder = "asc" | "desc";
export type ListingStatus = "active" | "inactive" | "moderation";
export type ListingModerationStatus = "approved" | "rejected" | "pending";
export type SellerStatus = "active" | "blocked";
export type ComplaintSanctionStatus = "active" | "completed";
export type ComplaintSanctionLevel = "warning" | "temp_3_days" | "temp_30_days" | "permanent";
export type DetailTab = "overview" | "sanctions";
export type StatusAction = "approved" | "rejected";

export type ComplaintHistoryItem = {
  id: string;
  type: string;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus | null;
  note: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type ComplaintItem = {
  id: string;
  createdAt: string;
  status: ComplaintStatus;
  targetType: "listing";
  complaintType: string;
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  listingPrice: number;
  listingCreatedAt: string;
  listingStatus: ListingStatus;
  listingModerationStatus: ListingModerationStatus;
  listingCity: string;
  listingRegion: string;
  listingComplaintsCount: number;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string | null;
  sellerStatus: SellerStatus;
  sellerBlockedUntil: string | null;
  sellerBlockReason: string | null;
  sellerJoinedAt: string;
  sellerVerified: boolean;
  sellerResponseMinutes: number | null;
  reporterId: string;
  reporterName: string;
  reporterEmail: string;
  sellerComplaintsCount: number;
  sellerViolationsCount: number;
  sellerListingsCount: number;
  sellerOrdersCount: number;
  description: string;
  checkedAt: string | null;
  checkedBy: { id: string; name: string; email: string } | null;
  actionTaken: string | null;
  sanction: {
    id: string;
    level: ComplaintSanctionLevel;
    status: ComplaintSanctionStatus;
    startsAt: string | null;
    endsAt: string | null;
    reason: string | null;
    createdAt: string | null;
  } | null;
  activeSellerSanction: {
    id: string;
    level: ComplaintSanctionLevel;
    status: ComplaintSanctionStatus;
    startsAt: string | null;
    endsAt: string | null;
    reason: string | null;
    createdAt: string | null;
  } | null;
  evaluation: {
    score: number;
    recommendation: "approve" | "reject" | "manual_review";
    reasons: string[];
  };
  riskScore: number;
  queueScore: number;
  priority: ComplaintPriority;
  ageHours: number;
};

export type ComplaintDetail = ComplaintItem & {
  history: ComplaintHistoryItem[];
};

export type ComplaintListResponse = {
  items: ComplaintItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  sort: {
    by: ComplaintSortBy;
    order: ComplaintSortOrder;
  };
  filters: {
    status: ComplaintStatus[];
    priority: ComplaintPriority[];
    moderator: string | null;
    from: string | null;
    to: string | null;
    q: string;
  };
  options: {
    moderators: Array<{
      id: string;
      name: string;
      email: string;
    }>;
  };
};

export type ComplaintStatsResponse = {
  total: number;
  new: number;
  pending: number;
  approved: number;
  rejected: number;
  highPriority?: number;
  mediumPriority?: number;
  lowPriority?: number;
};

export type RelatedListingComplaint = {
  id: string;
  createdAt: string;
  status: ComplaintStatus;
  complaintType: string;
  reporterName: string;
  priority: ComplaintPriority;
  queueScore: number;
  isCurrent: boolean;
};

export type SellerSummaryResponse = {
  seller: {
    id: string;
    name: string;
    email: string;
    status: SellerStatus;
    blockedUntil: string | null;
    blockReason: string | null;
    verified: boolean;
    listingsCount: number;
    ordersCount: number;
  };
  complaints: {
    total: number;
    approved: number;
    pending: number;
    new: number;
    rejected: number;
  };
  cases: {
    total: number;
    approved: number;
    rejected: number;
  };
  activeSanctionsCount: number;
  recentCases: Array<{
    id: string;
    status: ComplaintStatus;
    complaintType: string;
    listingId: string;
    listingTitle: string;
    createdAt: string;
  }>;
};

export type ComplaintStatusUpdateResponse = {
  success: boolean;
  status: ComplaintStatus;
  enforcement: {
    applied: true;
    approvedViolationsCount: number;
    level: ComplaintSanctionLevel;
    sanctionId: string;
    sellerStatus: SellerStatus;
    blockedUntil: string | null;
    listingStatus: "inactive";
    listingModerationStatus: "rejected";
    message: string;
  } | null;
  cascade: {
    updatedCount: number;
    cascadedComplaintIds: string[];
  };
};

export type RelatedListingResponse = {
  items: RelatedListingComplaint[];
};

export type FiltersState = {
  status: ComplaintStatusFilter;
  search: string;
  from: string;
  to: string;
  page: number;
  pageSize: number;
  sortBy: ComplaintSortBy;
  sortOrder: ComplaintSortOrder;
};
