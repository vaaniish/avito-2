import type { PrismaClient } from "@prisma/client";
import type {
  AdminKycRepositoryPort,
  KycRequestRecord,
  KycStatusValue,
} from "../../domain/admin-partnership.types";

export class AdminKycRepository implements AdminKycRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async listRequests(): Promise<KycRequestRecord[]> {
    return (await this.prisma.kycRequest.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            joined_at: true,
            seller_profile: {
              select: {
                is_verified: true,
                average_response_minutes: true,
                commission_tier: {
                  select: {
                    public_id: true,
                    name: true,
                    commission_rate: true,
                  },
                },
              },
            },
            _count: {
              select: {
                listings: true,
                orders_as_seller: true,
                complaints_against: true,
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
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    })) as any;
  }

  async findByPublicId(publicId: string): Promise<KycRequestRecord | null> {
    return (await this.prisma.kycRequest.findUnique({
      where: { public_id: publicId },
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            joined_at: true,
            seller_profile: {
              select: {
                is_verified: true,
                average_response_minutes: true,
                commission_tier: {
                  select: {
                    public_id: true,
                    name: true,
                    commission_rate: true,
                  },
                },
              },
            },
            _count: {
              select: {
                listings: true,
                orders_as_seller: true,
                complaints_against: true,
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
      },
    })) as any;
  }

  async updateStatus(params: {
    requestId: number;
    actorUserId: number;
    nextStatus: KycStatusValue;
    rejectionReason: string | null;
  }) {
    const updated = await this.prisma.kycRequest.update({
      where: { id: params.requestId },
      data: {
        status: params.nextStatus,
        reviewed_at: new Date(),
        reviewed_by_id: params.actorUserId,
        rejection_reason: params.rejectionReason,
      },
    });

    return {
      status: updated.status as KycStatusValue,
      sellerId: updated.seller_id,
      rejectionReason: updated.rejection_reason,
    };
  }
}
