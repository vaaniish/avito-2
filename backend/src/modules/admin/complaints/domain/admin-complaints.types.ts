export type ComplaintStatusValue = "NEW" | "PENDING" | "APPROVED" | "REJECTED";
export type ComplaintPriority = "low" | "medium" | "high";
export type ComplaintSortBy = "createdAt" | "riskScore" | "queueScore";
export type ComplaintSortOrder = "asc" | "desc";
export type ComplaintStatusClient = "new" | "pending" | "approved" | "rejected";

export type ComplaintDto = {
  id: string;
  createdAt: Date;
  status: ComplaintStatusClient;
  targetType: "listing";
  complaintType: string;
  listingId: string;
  listingUrl: string;
  listingTitle: string;
  listingPrice: number;
  listingCreatedAt: Date;
  listingStatus: string;
  listingModerationStatus: string;
  listingCity: string;
  listingRegion: string;
  listingComplaintsCount: number;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerPhone: string | null;
  sellerStatus: "active" | "blocked";
  sellerBlockedUntil: Date | null;
  sellerBlockReason: string | null;
  sellerJoinedAt: Date;
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
  checkedAt: Date | null;
  checkedBy: { id: string; name: string; email: string } | null;
  actionTaken: string | null;
  sanction: {
    id: string;
    level: string;
    status: "active" | "completed";
    startsAt: Date | null;
    endsAt: Date | null;
    reason: string | null;
    createdAt: Date | null;
  } | null;
  activeSellerSanction: {
    id: string;
    level: string;
    status: "active" | "completed";
    startsAt: Date | null;
    endsAt: Date | null;
    reason: string | null;
    createdAt: Date | null;
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

export type ComplaintHistoryEventDto = {
  id: string;
  type: string;
  fromStatus: ComplaintStatusClient | null;
  toStatus: ComplaintStatusClient | null;
  note: string | null;
  metadata: unknown;
  createdAt: Date;
  actor: { id: string; name: string; email: string } | null;
};

export type ComplaintStatsDto = {
  total: number;
  new: number;
  pending: number;
  approved: number;
  rejected: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
};

export type ComplaintListResponseDto = {
  items: ComplaintDto[];
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
    status: string[];
    priority: ComplaintPriority[];
    moderator: string | null;
    from: Date | null;
    to: Date | null;
    q: string;
  };
  options: {
    moderators: Array<{ id: string; name: string; email: string }>;
  };
};

export type ComplaintSellerSummaryDto = {
  seller: {
    id: string;
    name: string;
    email: string;
    status: string;
    blockedUntil: Date | null;
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
    status: string;
    complaintType: string;
    listingId: string;
    listingTitle: string;
    createdAt: Date;
  }>;
};

export type IdempotencyStartResult =
  | { kind: "created"; recordId: number }
  | { kind: "cached"; statusCode: number; body: unknown }
  | { kind: "conflict"; message: string };

export type ComplaintStatusUpdateRequest = {
  complaintPublicId: string;
  nextStatus: ComplaintStatusValue;
  actionTaken: string | null;
  actorUserId: number;
  requestIp: string | null;
};

export type ComplaintStatusUpdatePayload = {
  success: true;
  status: ComplaintStatusClient;
  enforcement:
    | {
        applied: true;
        approvedViolationsCount: number;
        level: string;
        sanctionId: string;
        sellerStatus: "active" | "blocked";
        blockedUntil: Date | null;
        listingStatus: "inactive";
        listingModerationStatus: "rejected";
        message: string;
      }
    | null;
  cascade?: {
    updatedCount: number;
    cascadedComplaintIds: string[];
  };
};

export type ComplaintStatusNotificationContext = {
  reporterId: number;
  sellerId: number;
  listingPublicId: string;
  listingTitle: string;
  status: ComplaintStatusValue;
  enforcementMessage: string | null;
};

export type LegacyComplaintStatusUpdateResult =
  | { kind: "not_found" }
  | { kind: "invalid_transition"; message: string }
  | {
      kind: "updated";
      payload: ComplaintStatusUpdatePayload;
      notifications: ComplaintStatusNotificationContext;
    };

export type ComplaintStatusUpdateResult =
  | { kind: "cached"; payload: ComplaintStatusUpdatePayload }
  | { kind: "not_found" }
  | { kind: "locked"; message: string }
  | { kind: "conflict"; message: string }
  | {
      kind: "updated";
      payload: ComplaintStatusUpdatePayload;
      notifications: ComplaintStatusNotificationContext;
    };

export type ComplaintListFilters = {
  statuses?: ComplaintStatusValue[];
  moderatorPublicId?: string;
  from?: Date | null;
  to?: Date | null;
  query?: string;
};

export type AdminRequestMeta = {
  actorUserId: number;
  requestIp: string | null;
  idempotencyKey?: string;
};

export interface AdminComplaintsRepositoryPort {
  findLegacyComplaints(): Promise<ComplaintDto[]>;
  updateLegacyComplaintStatus(
    input: ComplaintStatusUpdateRequest,
  ): Promise<LegacyComplaintStatusUpdateResult>;
  listComplaints(filters: ComplaintListFilters): Promise<ComplaintDto[]>;
  beginAdminIdempotency(params: {
    actorUserId: number;
    action: string;
    key: string;
    requestHash: string;
  }): Promise<IdempotencyStartResult>;
  completeAdminIdempotency(params: {
    recordId: number;
    statusCode: number;
    body: unknown;
  }): Promise<void>;
  updateComplaintStatus(
    input: ComplaintStatusUpdateRequest,
  ): Promise<ComplaintStatusUpdateResult>;
  fetchRelatedListingComplaints(
    complaintPublicId: string,
  ): Promise<
    | { kind: "not_found" }
    | {
        kind: "found";
        currentComplaintId: string;
        items: Array<{
          id: string;
          createdAt: Date;
          status: ComplaintStatusClient;
          complaintType: string;
          reporterName: string;
          priority: ComplaintPriority;
          queueScore: number;
        }>;
      }
  >;
  fetchSellerSummary(
    complaintPublicId: string,
  ): Promise<ComplaintSellerSummaryDto | null>;
  fetchComplaintDetails(complaintPublicId: string): Promise<{
    complaint: ComplaintDto;
    history: ComplaintHistoryEventDto[];
  } | null>;
}

export interface AdminComplaintsNotificationPort {
  notifyComplaintStatusUpdate(
    context: ComplaintStatusNotificationContext,
  ): Promise<void>;
}
