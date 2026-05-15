import type { PartnerOnboardingPayload } from "../../../partnership/onboarding";

export type ClientOnboardingProfile = {
  id: string;
  legalType: string;
  inn: string;
  ogrn: string;
  kpp: string | null;
  legalName: string;
  registrationStatus: string;
  registeredAddress: string;
  taxRegion: string;
  representativeFullName: string;
  representativeRole: string;
  representativePhone: string;
  representativeEmail: string;
  authorityType: string;
  authorityDocument: string | null;
  websiteUrl: string;
  businessEmail: string;
  domainOwnershipMethod: string;
  publicProfileUrls: string[];
  businessRole: string;
  categories: string[];
  fulfillmentModel: string;
  country: string;
  region: string;
  city: string;
  warehouseAddress: string;
  serviceCenterAddress: string;
  deliveryCoverageRegions: string[];
  pickupAvailable: boolean;
  returnAddress: string;
  supportPhone: string;
  supportEmail: string;
  serviceHours: string;
  monthlyCapacity: number;
  productSourceType: string;
  supplierDocuments: string;
  diagnosticProcess: string;
  gradingStandard: string;
  warrantyDays: number;
  returnDays: number;
  serialCheckPolicy: string;
  qualityCharterAccepted: boolean;
  legalLookupVerified: boolean;
  emailVerified: boolean;
  domainVerified: boolean;
  representativeVerified: boolean;
  payoutVerified: boolean;
  allowedCategories: string[];
  listingLimit: number;
  evaluation: unknown;
};

export type StoredOnboardingProfile = {
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

export type PartnershipRequestRecord = {
  id: number;
  public_id: string;
  status: string;
  name: string;
  email: string;
  contact: string;
  link: string;
  category: string;
  why_us: string;
  onboarding_profile: StoredOnboardingProfile | null;
};

export type PartnershipPolicyStatus = {
  accepted: boolean;
  policy: {
    public_id: string;
    version: string;
    title: string;
    content_url: string;
  } | null;
};

export type LegalLookupResult = {
  inn: string;
  ogrn: string;
  kpp: string | null;
  legalName: string;
  registeredAddress: string;
  taxRegion: string;
  registrationStatus: "active" | "inactive";
  dadataType: "LEGAL" | "INDIVIDUAL";
  managementName: string | null;
  managementPost: string | null;
};

export type ListingReviewDto = {
  id: string;
  author: string;
  rating: number;
  date: string;
  sortTs: number;
  comment: string;
  avatar: string | null;
};

export interface ProfilePartnershipRepositoryPort {
  createDraft(params: {
    userId: number;
    userEmail: string;
    profile: PartnerOnboardingPayload;
  }): Promise<PartnershipRequestRecord>;
  findOwnedRequest(params: {
    publicId: string;
    userId: number;
  }): Promise<PartnershipRequestRecord | null>;
  updateDraft(params: {
    requestId: number;
    existing: PartnershipRequestRecord;
    profile: PartnerOnboardingPayload;
  }): Promise<PartnershipRequestRecord>;
  submitDraft(params: {
    requestId: number;
    nextStatus: "LEGAL_REVIEW" | "REPRESENTATIVE_REVIEW";
  }): Promise<PartnershipRequestRecord>;
  createLegacyRequest(params: {
    userId: number;
    sellerType: "COMPANY" | "IP" | "BRAND";
    name: string;
    email: string;
    contact: string;
    link: string;
    category: string;
    inn: string;
    geography: string;
    socialProfile: string;
    credibility: string;
    whyUs: string;
    profile: PartnerOnboardingPayload;
  }): Promise<{ public_id: string }>;
}

export interface ProfileListingReviewRepositoryPort {
  findListingForReview(
    listingPublicId: string,
  ): Promise<{ id: number; seller_id: number } | null>;
  countCompletedBuyerOrdersForListing(params: {
    buyerUserId: number;
    listingId: number;
  }): Promise<number>;
  hasExistingReview(params: {
    listingId: number;
    authorId: number;
  }): Promise<boolean>;
  createReviewAndRefreshSellerRating(params: {
    listingId: number;
    sellerId: number;
    authorId: number;
    rating: number;
    comment: string;
  }): Promise<{
    id: number;
    rating: number;
    comment: string;
    created_at: Date;
    author: {
      display_name: string | null;
      avatar: string | null;
    };
  }>;
}

export interface ProfileEngagementPolicyPort {
  getPartnershipPolicyStatus(userId: number): Promise<PartnershipPolicyStatus>;
}

export interface ProfileLegalEntityLookupGatewayPort {
  lookup(params: {
    inn: unknown;
    legalType: unknown;
  }): Promise<LegalLookupResult>;
}
