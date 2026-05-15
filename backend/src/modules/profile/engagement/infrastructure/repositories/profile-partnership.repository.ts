import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import {
  makePartnershipPublicId,
  toOnboardingCreateInput,
  type PartnerOnboardingPayload,
} from "../../../../partnership/onboarding";
import type {
  PartnershipRequestRecord,
  ProfilePartnershipRepositoryPort,
  StoredOnboardingProfile,
} from "../../domain/profile-engagement.types";

const ONBOARDING_PROFILE_SELECT = {
  public_id: true,
  legal_type: true,
  inn: true,
  ogrn: true,
  kpp: true,
  legal_name: true,
  registration_status: true,
  registered_address: true,
  tax_region: true,
  representative_full_name: true,
  representative_role: true,
  representative_phone: true,
  representative_email: true,
  authority_type: true,
  authority_document: true,
  website_url: true,
  business_email: true,
  domain_ownership_method: true,
  public_profile_urls: true,
  business_role: true,
  categories: true,
  fulfillment_model: true,
  country: true,
  region: true,
  city: true,
  warehouse_address: true,
  service_center_address: true,
  delivery_coverage_regions: true,
  pickup_available: true,
  return_address: true,
  support_phone: true,
  support_email: true,
  service_hours: true,
  monthly_capacity: true,
  product_source_type: true,
  supplier_documents: true,
  diagnostic_process: true,
  grading_standard: true,
  warranty_days: true,
  return_days: true,
  serial_check_policy: true,
  quality_charter_accepted: true,
  legal_lookup_verified: true,
  email_verified: true,
  domain_verified: true,
  representative_verified: true,
  payout_verified: true,
  allowed_categories: true,
  listing_limit: true,
} as const;

type OnboardingProfileRow = Prisma.PartnerOnboardingProfileGetPayload<{
  select: typeof ONBOARDING_PROFILE_SELECT;
}>;

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapStoredProfile(
  profile: OnboardingProfileRow | null | undefined,
): StoredOnboardingProfile | null {
  if (!profile) return null;
  return {
    ...profile,
    public_profile_urls: stringArray(profile.public_profile_urls),
    categories: stringArray(profile.categories),
    delivery_coverage_regions: stringArray(profile.delivery_coverage_regions),
    allowed_categories: stringArray(profile.allowed_categories),
  };
}

function mapRequestRecord(request: {
  id: number;
  public_id: string;
  status: string;
  name: string;
  email: string;
  contact: string;
  link: string;
  category: string;
  why_us: string;
  onboarding_profile: OnboardingProfileRow | null;
}): PartnershipRequestRecord {
  return {
    ...request,
    onboarding_profile: mapStoredProfile(request.onboarding_profile),
  };
}

export class ProfilePartnershipRepository
  implements ProfilePartnershipRepositoryPort
{
  constructor(private readonly prisma: PrismaClient) {}

  async createDraft(params: {
    userId: number;
    userEmail: string;
    profile: PartnerOnboardingPayload;
  }): Promise<PartnershipRequestRecord> {
    const profile = params.profile as any;
    const created = await this.prisma.partnershipRequest.create({
      data: {
        public_id: makePartnershipPublicId(),
        user_id: params.userId,
        seller_type: profile.legalType,
        status: "DRAFT",
        name: profile.legalName || "Черновик партнера",
        email: profile.businessEmail || params.userEmail,
        contact: profile.representativePhone || "",
        link: profile.websiteUrl || "",
        category: profile.categories[0] ?? "",
        inn: profile.inn || null,
        geography:
          [profile.country, profile.region, profile.city].filter(Boolean).join(", ") ||
          null,
        social_profile: profile.publicProfileUrls[0] ?? null,
        credibility: profile.diagnosticProcess || null,
        why_us: profile.businessRole || "Черновик партнерского онбординга",
        onboarding_profile: {
          create: {
            public_id: makePartnershipPublicId("ONB"),
            ...toOnboardingCreateInput(profile),
          },
        },
      },
      include: {
        onboarding_profile: {
          select: ONBOARDING_PROFILE_SELECT,
        },
      },
    });

    return mapRequestRecord(created as any);
  }

  async findOwnedRequest(params: {
    publicId: string;
    userId: number;
  }): Promise<PartnershipRequestRecord | null> {
    const found = await this.prisma.partnershipRequest.findFirst({
      where: {
        public_id: params.publicId,
        user_id: params.userId,
      },
      include: {
        onboarding_profile: {
          select: ONBOARDING_PROFILE_SELECT,
        },
      },
    });

    return found ? mapRequestRecord(found as any) : null;
  }

  async updateDraft(params: {
    requestId: number;
    existing: PartnershipRequestRecord;
    profile: PartnerOnboardingPayload;
  }): Promise<PartnershipRequestRecord> {
    const profile = params.profile as any;
    const updated = await this.prisma.partnershipRequest.update({
      where: { id: params.requestId },
      data: {
        seller_type: profile.legalType,
        name: profile.legalName || params.existing.name,
        email: profile.businessEmail || params.existing.email,
        contact: profile.representativePhone || params.existing.contact,
        link: profile.websiteUrl || params.existing.link,
        category: profile.categories[0] ?? params.existing.category,
        inn: profile.inn || null,
        geography:
          [profile.country, profile.region, profile.city].filter(Boolean).join(", ") ||
          null,
        social_profile: profile.publicProfileUrls[0] ?? null,
        credibility: profile.diagnosticProcess || null,
        why_us: profile.businessRole || params.existing.why_us,
        onboarding_profile: {
          upsert: {
            create: {
              public_id: makePartnershipPublicId("ONB"),
              ...toOnboardingCreateInput(profile),
            },
            update: toOnboardingCreateInput(profile),
          },
        },
      },
      include: {
        onboarding_profile: {
          select: ONBOARDING_PROFILE_SELECT,
        },
      },
    });

    return mapRequestRecord(updated as any);
  }

  async submitDraft(params: {
    requestId: number;
    nextStatus: "LEGAL_REVIEW" | "REPRESENTATIVE_REVIEW";
  }): Promise<PartnershipRequestRecord> {
    const updated = await this.prisma.partnershipRequest.update({
      where: { id: params.requestId },
      data: {
        status: params.nextStatus,
        rejection_reason: null,
      },
      include: {
        onboarding_profile: {
          select: ONBOARDING_PROFILE_SELECT,
        },
      },
    });

    return mapRequestRecord(updated as any);
  }

  async createLegacyRequest(params: {
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
  }): Promise<{ public_id: string }> {
    const profile = params.profile as any;
    const created = await this.prisma.partnershipRequest.create({
      data: {
        public_id: makePartnershipPublicId(),
        user_id: params.userId,
        seller_type: params.sellerType,
        status: "LEGAL_REVIEW",
        name: params.name,
        email: params.email,
        contact: params.contact,
        link: params.link,
        category: params.category,
        inn: params.inn,
        geography: params.geography,
        social_profile: params.socialProfile,
        credibility: params.credibility,
        why_us: params.whyUs,
        onboarding_profile: {
          create: {
            public_id: makePartnershipPublicId("ONB"),
            ...toOnboardingCreateInput(profile),
          },
        },
      },
      select: {
        public_id: true,
      },
    });

    return created;
  }
}
