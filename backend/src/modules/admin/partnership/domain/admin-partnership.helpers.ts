import {
  evaluateOnboardingProfile,
  jsonStringArray,
  parsePartnershipStatus as parseOnboardingPartnershipStatus,
  toClientPartnershipStatus,
} from "../../../partnership/onboarding";
import type {
  AdminOnboardingProfileRecord,
  KycRequestRecord,
  KycStatusValue,
  PartnershipRequestModerationRecord,
  PartnershipStatusValue,
  PayoutProfileRecord,
  PayoutStatusValue,
  ReviewActionClient,
} from "./admin-partnership.types";

const REVIEWABLE_PARTNERSHIP_STATUSES = new Set<PartnershipStatusValue>([
  "SUBMITTED",
  "LEGAL_REVIEW",
  "REPRESENTATIVE_REVIEW",
  "PAYOUT_REVIEW",
  "QUALITY_REVIEW",
  "PENDING",
]);

export function toClientReviewAction(
  status: PartnershipStatusValue,
): ReviewActionClient {
  if (status === "APPROVED_LIMITED") return "approved_limited";
  if (status === "APPROVED") return "approved";
  if (status === "NEEDS_MORE_INFO") return "needs_more_info";
  return "rejected";
}

export function getAllowedPartnershipActions(
  status: PartnershipStatusValue,
): ReviewActionClient[] {
  if (REVIEWABLE_PARTNERSHIP_STATUSES.has(status)) {
    return ["approved_limited", "approved", "needs_more_info", "rejected"];
  }
  if (status === "APPROVED") {
    return ["rejected"];
  }
  if (status === "APPROVED_LIMITED") {
    return ["approved", "needs_more_info", "rejected"];
  }
  if (status === "NEEDS_MORE_INFO") {
    return ["approved_limited", "approved", "rejected"];
  }
  return [];
}

export function parseKycStatus(status: unknown): KycStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

export function parsePartnershipStatus(
  status: unknown,
): PartnershipStatusValue | null {
  return parseOnboardingPartnershipStatus(status) as PartnershipStatusValue | null;
}

export function parsePayoutStatus(status: unknown): PayoutStatusValue | null {
  if (status === "verified") return "VERIFIED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

export function splitEvidenceFiles(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\n;|]/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildKycEvaluation(params: {
  documentsCount: number;
  hasInn: boolean;
  hasAddress: boolean;
  sellerComplaintsCount: number;
  sellerStatus: "ACTIVE" | "BLOCKED";
}) {
  const checklist = [
    { key: "documents_attached", passed: params.documentsCount > 0 },
    { key: "inn_provided", passed: params.hasInn },
    { key: "address_provided", passed: params.hasAddress },
    { key: "seller_not_blocked", passed: params.sellerStatus !== "BLOCKED" },
  ];

  const completenessScore = Math.round(
    (checklist.filter((item) => item.passed).length / checklist.length) * 100,
  );

  const riskPoints =
    (params.sellerStatus === "BLOCKED" ? 40 : 0) +
    (params.sellerComplaintsCount >= 5
      ? 35
      : params.sellerComplaintsCount >= 2
        ? 20
        : 5) +
    (params.documentsCount === 0 ? 35 : params.documentsCount < 2 ? 15 : 0);

  const riskLevel =
    riskPoints >= 65 ? "high" : riskPoints >= 35 ? "medium" : "low";
  const recommendation =
    riskLevel === "high"
      ? "reject"
      : completenessScore < 75
        ? "request_more_documents"
        : "approve";

  return {
    completenessScore,
    riskLevel,
    recommendation,
    checklist,
  };
}

export function mapAdminOnboardingProfile(
  profile: AdminOnboardingProfileRecord | null,
) {
  if (!profile) return null;
  return {
    id: profile.public_id,
    legalType: profile.legal_type,
    inn: profile.inn,
    ogrn: profile.ogrn,
    kpp: profile.kpp,
    legalName: profile.legal_name,
    registrationStatus: profile.registration_status,
    registeredAddress: profile.registered_address,
    taxRegion: profile.tax_region,
    representativeFullName: profile.representative_full_name,
    representativeRole: profile.representative_role,
    representativePhone: profile.representative_phone,
    representativeEmail: profile.representative_email,
    authorityType: profile.authority_type,
    authorityDocument: profile.authority_document,
    websiteUrl: profile.website_url,
    businessEmail: profile.business_email,
    domainOwnershipMethod: profile.domain_ownership_method,
    publicProfileUrls: jsonStringArray(profile.public_profile_urls),
    businessRole: profile.business_role,
    categories: jsonStringArray(profile.categories),
    fulfillmentModel: profile.fulfillment_model,
    country: profile.country,
    region: profile.region,
    city: profile.city,
    warehouseAddress: profile.warehouse_address,
    serviceCenterAddress: profile.service_center_address,
    deliveryCoverageRegions: jsonStringArray(profile.delivery_coverage_regions),
    pickupAvailable: profile.pickup_available,
    returnAddress: profile.return_address,
    supportPhone: profile.support_phone,
    supportEmail: profile.support_email,
    serviceHours: profile.service_hours,
    monthlyCapacity: profile.monthly_capacity,
    productSourceType: profile.product_source_type,
    supplierDocuments: profile.supplier_documents,
    diagnosticProcess: profile.diagnostic_process,
    gradingStandard: profile.grading_standard,
    warrantyDays: profile.warranty_days,
    returnDays: profile.return_days,
    serialCheckPolicy: profile.serial_check_policy,
    qualityCharterAccepted: profile.quality_charter_accepted,
    legalLookupVerified: profile.legal_lookup_verified,
    emailVerified: profile.email_verified,
    domainVerified: profile.domain_verified,
    representativeVerified: profile.representative_verified,
    payoutVerified: profile.payout_verified,
    allowedCategories: jsonStringArray(profile.allowed_categories),
    listingLimit: profile.listing_limit,
  };
}

export function mapPartnershipRequestItem(
  requestItem: PartnershipRequestModerationRecord,
) {
  const onboardingProfile = requestItem.onboarding_profile;
  const evaluation = onboardingProfile
    ? evaluateOnboardingProfile(onboardingProfile as any)
    : null;
  return {
    id: requestItem.public_id,
    status: toClientPartnershipStatus(requestItem.status as any),
    allowedActions: getAllowedPartnershipActions(requestItem.status),
    sellerType: requestItem.seller_type,
    name: requestItem.name,
    email: requestItem.email,
    contact: requestItem.contact,
    link: requestItem.link,
    category: requestItem.category,
    inn: requestItem.inn,
    geography: requestItem.geography,
    socialProfile: requestItem.social_profile,
    credibility: requestItem.credibility,
    whyUs: requestItem.why_us,
    createdAt: requestItem.created_at,
    reviewedAt: requestItem.reviewed_at,
    rejectionReason: requestItem.rejection_reason,
    adminNote: requestItem.admin_note,
    onboardingProfile: mapAdminOnboardingProfile(onboardingProfile),
    evaluation,
    applicant: {
      id: requestItem.user.public_id,
      role: requestItem.user.role.toLowerCase(),
      status: requestItem.user.status.toLowerCase(),
      email: requestItem.user.email,
      name: requestItem.user.name,
    },
    reviewedBy: requestItem.reviewed_by
      ? {
          id: requestItem.reviewed_by.public_id,
          name: requestItem.reviewed_by.name,
          email: requestItem.reviewed_by.email,
        }
      : null,
  };
}

export function mapKycRequestItem(requestItem: KycRequestRecord) {
  return {
    id: requestItem.public_id,
    createdAt: requestItem.created_at,
    status: requestItem.status.toLowerCase(),
    sellerId: requestItem.seller.public_id,
    sellerName: requestItem.seller.name,
    sellerEmail: requestItem.seller.email,
    sellerPhone: requestItem.seller.phone,
    sellerStatus: requestItem.seller.status.toLowerCase(),
    sellerJoinedAt: requestItem.seller.joined_at,
    sellerVerified: Boolean(requestItem.seller.seller_profile?.is_verified),
    sellerResponseMinutes:
      requestItem.seller.seller_profile?.average_response_minutes ?? null,
    sellerCommissionTier: requestItem.seller.seller_profile?.commission_tier
      ? {
          id: requestItem.seller.seller_profile.commission_tier.public_id,
          name: requestItem.seller.seller_profile.commission_tier.name,
          rate: requestItem.seller.seller_profile.commission_tier.commission_rate,
        }
      : null,
    sellerListingsCount: requestItem.seller._count.listings,
    sellerOrdersCount: requestItem.seller._count.orders_as_seller,
    sellerComplaintsCount: requestItem.seller._count.complaints_against,
    email: requestItem.email,
    phone: requestItem.phone,
    companyName: requestItem.company_name,
    inn: requestItem.inn,
    address: requestItem.address,
    documents: requestItem.documents,
    documentFiles: splitEvidenceFiles(requestItem.documents),
    notes: requestItem.notes,
    reviewedAt: requestItem.reviewed_at,
    reviewedBy: requestItem.reviewed_by
      ? {
          id: requestItem.reviewed_by.public_id,
          name: requestItem.reviewed_by.name,
          email: requestItem.reviewed_by.email,
        }
      : null,
    rejectionReason: requestItem.rejection_reason,
    evaluation: buildKycEvaluation({
      documentsCount: splitEvidenceFiles(requestItem.documents).length,
      hasInn: requestItem.inn.trim().length > 0,
      hasAddress: requestItem.address.trim().length > 0,
      sellerComplaintsCount: requestItem.seller._count.complaints_against,
      sellerStatus: requestItem.seller.status,
    }),
  };
}

export function mapPayoutProfileItem(profile: PayoutProfileRecord) {
  return {
    id: profile.public_id,
    status: profile.status.toLowerCase(),
    legalType: profile.legal_type,
    legalName: profile.legal_name,
    taxId: profile.tax_id,
    bankAccount: profile.bank_account,
    bankBic: profile.bank_bic,
    correspondentAccount: profile.correspondent_account,
    bankName: profile.bank_name,
    recipientName: profile.recipient_name,
    rejectionReason: profile.rejection_reason,
    verifiedAt: profile.verified_at,
    updatedAt: profile.updated_at,
    seller: {
      id: profile.seller.public_id,
      name: profile.seller.name,
      email: profile.seller.email,
      status: profile.seller.status.toLowerCase(),
    },
    verifiedBy: profile.verified_by
      ? {
          id: profile.verified_by.public_id,
          name: profile.verified_by.name,
          email: profile.verified_by.email,
        }
      : null,
  };
}
