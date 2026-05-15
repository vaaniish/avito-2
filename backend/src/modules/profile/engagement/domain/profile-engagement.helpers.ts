import {
  evaluateOnboardingProfile,
  type PartnerOnboardingPayload,
} from "../../../partnership/onboarding";
import type {
  ClientOnboardingProfile,
  ListingReviewDto,
  StoredOnboardingProfile,
} from "./profile-engagement.types";

export function toClientOnboardingProfile(
  profile: StoredOnboardingProfile | null,
): ClientOnboardingProfile | null {
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
    publicProfileUrls: profile.public_profile_urls,
    businessRole: profile.business_role,
    categories: profile.categories,
    fulfillmentModel: profile.fulfillment_model,
    country: profile.country,
    region: profile.region,
    city: profile.city,
    warehouseAddress: profile.warehouse_address,
    serviceCenterAddress: profile.service_center_address,
    deliveryCoverageRegions: profile.delivery_coverage_regions,
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
    allowedCategories: profile.allowed_categories,
    listingLimit: profile.listing_limit,
    evaluation: evaluateOnboardingProfile(profile as any),
  };
}

export function storedProfileToPayload(
  profile: StoredOnboardingProfile,
): PartnerOnboardingPayload {
  return {
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
    publicProfileUrls: profile.public_profile_urls,
    businessRole: profile.business_role,
    categories: profile.categories,
    fulfillmentModel: profile.fulfillment_model,
    country: profile.country,
    region: profile.region,
    city: profile.city,
    warehouseAddress: profile.warehouse_address,
    serviceCenterAddress: profile.service_center_address,
    deliveryCoverageRegions: profile.delivery_coverage_regions,
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
  };
}

export function toPartnershipPolicyDto(policy: {
  public_id: string;
  version: string;
  title: string;
  content_url: string;
} | null) {
  if (!policy) return null;
  return {
    id: policy.public_id,
    scope: "partnership" as const,
    version: policy.version,
    title: policy.title,
    contentUrl: policy.content_url,
  };
}

export function toListingReviewDto(review: {
  id: number;
  rating: number;
  comment: string;
  created_at: Date;
  author: {
    display_name: string | null;
    avatar: string | null;
  };
}): ListingReviewDto {
  return {
    id: String(review.id),
    author: review.author.display_name ?? "Аноним",
    rating: review.rating,
    date: review.created_at.toLocaleString("ru-RU", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }),
    sortTs: review.created_at.getTime(),
    comment: review.comment,
    avatar: review.author.avatar,
  };
}
