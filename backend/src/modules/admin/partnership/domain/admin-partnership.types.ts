import type { PartnershipRequestStatus } from "@prisma/client";

export type KycStatusValue = "PENDING" | "APPROVED" | "REJECTED";
export type PartnershipStatusValue =
  | "DRAFT"
  | "SUBMITTED"
  | "LEGAL_REVIEW"
  | "REPRESENTATIVE_REVIEW"
  | "PAYOUT_REVIEW"
  | "QUALITY_REVIEW"
  | "APPROVED_LIMITED"
  | "NEEDS_MORE_INFO"
  | "PENDING"
  | "APPROVED"
  | "REJECTED";
export type PayoutStatusValue = "PENDING" | "VERIFIED" | "REJECTED";
export type ReviewActionClient =
  | "approved_limited"
  | "approved"
  | "needs_more_info"
  | "rejected";

export type AdminRequestMeta = {
  actorUserId: number;
  requestIp: string | null;
};

export type AdminAuditWriteInput = {
  actorUserId: number;
  requestIp: string | null;
  action: string;
  entityType: string;
  entityPublicId?: string | null;
  details?: unknown;
};

export type AdminPartnershipNotificationInput =
  | {
      kind: "partnership";
      userId: number;
      nextStatus: PartnershipStatusValue;
      rejectionReason: string | null;
    }
  | {
      kind: "kyc";
      userId: number;
      nextStatus: KycStatusValue;
      rejectionReason: string | null;
    }
  | {
      kind: "payout";
      userId: number;
      nextStatus: PayoutStatusValue;
      rejectionReason: string | null;
    };

export type AdminOnboardingProfileRecord = {
  public_id: string;
  legal_type: string;
  inn: string;
  ogrn: string;
  kpp: string | null;
  legal_name: string;
  registration_status: string;
  registered_address: string;
  tax_region: string;
  representative_full_name: string;
  representative_role: string;
  representative_phone: string;
  representative_email: string;
  authority_type: string;
  authority_document: string | null;
  website_url: string;
  business_email: string;
  domain_ownership_method: string;
  public_profile_urls: string[];
  business_role: string;
  categories: string[];
  fulfillment_model: string;
  country: string;
  region: string;
  city: string;
  warehouse_address: string;
  service_center_address: string;
  delivery_coverage_regions: string[];
  pickup_available: boolean;
  return_address: string;
  support_phone: string;
  support_email: string;
  service_hours: string;
  monthly_capacity: number;
  product_source_type: string;
  supplier_documents: string;
  diagnostic_process: string;
  grading_standard: string;
  warranty_days: number;
  return_days: number;
  serial_check_policy: string;
  quality_charter_accepted: boolean;
  legal_lookup_verified: boolean;
  email_verified: boolean;
  domain_verified: boolean;
  representative_verified: boolean;
  payout_verified: boolean;
  allowed_categories: string[];
  listing_limit: number;
};

export type PartnershipRequestModerationRecord = {
  id: number;
  public_id: string;
  status: PartnershipStatusValue;
  user_id: number;
  seller_type: string;
  name: string;
  email: string;
  contact: string;
  link: string;
  category: string;
  inn: string | null;
  geography: string | null;
  social_profile: string | null;
  credibility: string | null;
  why_us: string;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  admin_note: string | null;
  created_at: Date;
  onboarding_profile: AdminOnboardingProfileRecord | null;
  user: {
    public_id: string;
    role: string;
    status: string;
    email: string;
    name: string;
    payout_profile: {
      status: string;
    } | null;
  };
  reviewed_by: {
    public_id: string;
    name: string;
    email: string;
  } | null;
};

export type KycRequestRecord = {
  id: number;
  public_id: string;
  created_at: Date;
  status: KycStatusValue;
  seller_id: number;
  email: string;
  phone: string;
  company_name: string;
  inn: string;
  address: string;
  documents: string | null;
  notes: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  seller: {
    public_id: string;
    name: string;
    email: string;
    phone: string | null;
    status: "ACTIVE" | "BLOCKED";
    joined_at: Date;
    seller_profile: {
      is_verified: boolean;
      average_response_minutes: number | null;
      commission_tier: {
        public_id: string;
        name: string;
        commission_rate: number;
      } | null;
    } | null;
    _count: {
      listings: number;
      orders_as_seller: number;
      complaints_against: number;
    };
  };
  reviewed_by: {
    public_id: string;
    name: string;
    email: string;
  } | null;
};

export type PayoutProfileRecord = {
  id: number;
  public_id: string;
  status: PayoutStatusValue;
  legal_type: string;
  legal_name: string;
  tax_id: string;
  bank_account: string;
  bank_bic: string;
  correspondent_account: string;
  bank_name: string;
  recipient_name: string;
  rejection_reason: string | null;
  verified_at: Date | null;
  updated_at: Date;
  seller_id: number;
  seller: {
    public_id: string;
    name: string;
    email: string;
    status: string;
  };
  verified_by: {
    public_id: string;
    name: string;
    email: string;
  } | null;
};

export interface AdminPartnershipRequestRepositoryPort {
  listRequests(): Promise<PartnershipRequestModerationRecord[]>;
  findRequestByPublicId(
    publicId: string,
  ): Promise<PartnershipRequestModerationRecord | null>;
  applyStatusTransition(params: {
    requestId: number;
    actorUserId: number;
    nextStatus: PartnershipStatusValue;
    rejectionReason: string | null;
    adminNote: string | null;
    payoutVerified: boolean;
    currentListingLimit: number | null;
    currentAllowedCategories: string[];
  }): Promise<{ status: PartnershipStatusValue }>;
}

export interface AdminKycRepositoryPort {
  listRequests(): Promise<KycRequestRecord[]>;
  findByPublicId(publicId: string): Promise<KycRequestRecord | null>;
  updateStatus(params: {
    requestId: number;
    actorUserId: number;
    nextStatus: KycStatusValue;
    rejectionReason: string | null;
  }): Promise<{ status: KycStatusValue; sellerId: number; rejectionReason: string | null }>;
}

export interface AdminPayoutRepositoryPort {
  listProfiles(): Promise<PayoutProfileRecord[]>;
  findByPublicId(publicId: string): Promise<PayoutProfileRecord | null>;
  updateStatus(params: {
    profileId: number;
    actorUserId: number;
    nextStatus: PayoutStatusValue;
    rejectionReason: string | null;
  }): Promise<{ status: PayoutStatusValue; sellerId: number; rejectionReason: string | null }>;
}

export interface AdminPartnershipNotificationPort {
  notify(input: AdminPartnershipNotificationInput): Promise<void>;
}

export interface AdminAuditWriterPort {
  write(input: AdminAuditWriteInput): Promise<void>;
}

export type PartnershipStatusParser = PartnershipRequestStatus | null;
