import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { jsonStringArray } from "../../../../partnership/onboarding";
import type {
  AdminOnboardingProfileRecord,
  AdminPartnershipRequestRepositoryPort,
  PartnershipRequestModerationRecord,
  PartnershipStatusValue,
} from "../../domain/admin-partnership.types";

const ONBOARDING_PROFILE_INCLUDE = {
  onboarding_profile: true,
} as const;

function mapOnboardingProfile(profile: any): AdminOnboardingProfileRecord | null {
  if (!profile) return null;
  return {
    ...profile,
    public_profile_urls: jsonStringArray(profile.public_profile_urls),
    categories: jsonStringArray(profile.categories),
    delivery_coverage_regions: jsonStringArray(profile.delivery_coverage_regions),
    allowed_categories: jsonStringArray(profile.allowed_categories),
  };
}

function mapRequest(record: any): PartnershipRequestModerationRecord {
  return {
    ...record,
    status: record.status,
    onboarding_profile: mapOnboardingProfile(record.onboarding_profile),
  };
}

export class AdminPartnershipRequestRepository
  implements AdminPartnershipRequestRepositoryPort
{
  constructor(private readonly prisma: PrismaClient) {}

  async listRequests(): Promise<PartnershipRequestModerationRecord[]> {
    const requests = await this.prisma.partnershipRequest.findMany({
      include: {
        user: {
          select: {
            public_id: true,
            role: true,
            status: true,
            email: true,
            name: true,
            payout_profile: {
              select: {
                status: true,
              },
            },
          },
        },
        reviewed_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        onboarding_profile: true,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });

    return requests.map(mapRequest);
  }

  async findRequestByPublicId(
    publicId: string,
  ): Promise<PartnershipRequestModerationRecord | null> {
    const request = await this.prisma.partnershipRequest.findUnique({
      where: { public_id: publicId },
      include: {
        user: {
          select: {
            public_id: true,
            role: true,
            status: true,
            email: true,
            name: true,
            payout_profile: {
              select: {
                status: true,
              },
            },
          },
        },
        reviewed_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
        onboarding_profile: true,
      },
    });

    return request ? mapRequest(request) : null;
  }

  async applyStatusTransition(params: {
    requestId: number;
    actorUserId: number;
    nextStatus: PartnershipStatusValue;
    rejectionReason: string | null;
    adminNote: string | null;
    payoutVerified: boolean;
    currentListingLimit: number | null;
    currentAllowedCategories: string[];
  }): Promise<{ status: PartnershipStatusValue }> {
    return this.prisma.$transaction(async (tx) => {
      const next = await tx.partnershipRequest.update({
        where: { id: params.requestId },
        data: {
          status: params.nextStatus,
          reviewed_by_id: params.actorUserId,
          reviewed_at: new Date(),
          rejection_reason: params.rejectionReason,
          admin_note: params.adminNote,
        },
      });

      const onboarding = await tx.partnerOnboardingProfile.findUnique({
        where: { request_id: params.requestId },
        select: { id: true },
      });

      if (onboarding) {
        await tx.partnerOnboardingProfile.update({
          where: { request_id: params.requestId },
          data: {
            payout_verified: params.payoutVerified,
            allowed_categories: params.currentAllowedCategories as Prisma.InputJsonValue,
            listing_limit:
              params.nextStatus === "APPROVED_LIMITED"
                ? 20
                : params.currentListingLimit ?? 20,
          },
        });
      }

      const requestOwner = await tx.partnershipRequest.findUnique({
        where: { id: params.requestId },
        select: { user_id: true },
      });

      if (!requestOwner) {
        throw new Error("PARTNERSHIP_REQUEST_NOT_FOUND_AFTER_UPDATE");
      }

      if (
        params.nextStatus === "APPROVED" ||
        params.nextStatus === "APPROVED_LIMITED"
      ) {
        await tx.appUser.update({
          where: { id: requestOwner.user_id },
          data: {
            role: "SELLER",
            status: "ACTIVE",
          },
        });

        await tx.sellerProfile.upsert({
          where: { user_id: requestOwner.user_id },
          create: {
            user_id: requestOwner.user_id,
            is_verified: params.nextStatus === "APPROVED",
          },
          update: {
            is_verified: params.nextStatus === "APPROVED",
          },
        });
      }

      if (params.nextStatus === "REJECTED") {
        await tx.appUser.update({
          where: { id: requestOwner.user_id },
          data: {
            role: "BUYER",
          },
        });
      }

      return { status: next.status as PartnershipStatusValue };
    });
  }
}
