export type PartnershipStatus =
  | "draft"
  | "submitted"
  | "legal_review"
  | "representative_review"
  | "payout_review"
  | "quality_review"
  | "approved_limited"
  | "needs_more_info"
  | "pending"
  | "approved"
  | "rejected";

export type StatusFilter =
  | "all"
  | "draft"
  | "review"
  | "needs_more_info"
  | "approved_limited"
  | "approved"
  | "rejected";

export type PartnerEvaluation = {
  legalIdentityScore: number;
  representativeScore: number;
  payoutScore: number;
  qualityScore: number;
  categoryRisk: "low" | "medium" | "high";
  operationalScore: number;
  totalScore: number;
  recommendation: "approve" | "approve_limited" | "request_more_documents" | "reject";
  checklist: Array<{ key: string; passed: boolean; label?: string }>;
};

export type OnboardingProfile = {
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
};

export type PartnershipRequest = {
  id: string;
  status: PartnershipStatus;
  allowedActions?: ReviewAction[];
  sellerType: string;
  name: string;
  email: string;
  contact: string;
  link: string;
  category: string;
  inn: string | null;
  geography: string | null;
  socialProfile: string | null;
  credibility: string | null;
  whyUs: string | null;
  createdAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
  adminNote: string | null;
  onboardingProfile: OnboardingProfile | null;
  evaluation: PartnerEvaluation | null;
  applicant: {
    id: string;
    role: string;
    status: string;
    email: string;
    name: string;
  };
  reviewedBy: { id: string; name: string; email: string } | null;
};

export type ReviewAction = "approved_limited" | "approved" | "needs_more_info" | "rejected";
export type ReviewTab = "business" | "contacts" | "sales" | "quality";

export type PartnershipRequestActionResponse = {
  success: boolean;
  status: PartnershipStatus;
  userRole: "regular" | "partner" | null;
  allowedActions?: ReviewAction[];
};
