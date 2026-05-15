import type { PrismaClient } from "@prisma/client";
import type {
  AdminPayoutRepositoryPort,
  PayoutProfileRecord,
  PayoutStatusValue,
} from "../../domain/admin-partnership.types";

export class AdminPayoutRepository implements AdminPayoutRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async listProfiles(): Promise<PayoutProfileRecord[]> {
    return (await this.prisma.sellerPayoutProfile.findMany({
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        verified_by: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ updated_at: "desc" }, { id: "desc" }],
    })) as any;
  }

  async findByPublicId(publicId: string): Promise<PayoutProfileRecord | null> {
    return (await this.prisma.sellerPayoutProfile.findUnique({
      where: { public_id: publicId },
      include: {
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            status: true,
          },
        },
        verified_by: {
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
    profileId: number;
    actorUserId: number;
    nextStatus: PayoutStatusValue;
    rejectionReason: string | null;
  }) {
    const updated = await this.prisma.sellerPayoutProfile.update({
      where: { id: params.profileId },
      data: {
        status: params.nextStatus,
        verified_by_id: params.nextStatus === "PENDING" ? null : params.actorUserId,
        verified_at: params.nextStatus === "PENDING" ? null : new Date(),
        rejection_reason: params.rejectionReason,
      },
    });

    return {
      status: updated.status as PayoutStatusValue,
      sellerId: updated.seller_id,
      rejectionReason: updated.rejection_reason,
    };
  }
}
