import type { PrismaClient } from "@prisma/client";
import type {
  AdminUserListRecord,
  AdminUserSanctionAggregate,
  AdminUsersRepositoryPort,
  UserRoleValue,
  UserStatusValue,
} from "../../domain/admin-users.types";

export class AdminUsersRepository implements AdminUsersRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  listUsers(): Promise<AdminUserListRecord[]> {
    return this.prisma.appUser.findMany({
      include: {
        addresses: {
          select: {
            city: true,
            region: true,
          },
          orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
          take: 1,
        },
        seller_profile: {
          select: {
            is_verified: true,
            average_response_minutes: true,
          },
        },
        orders_as_buyer: {
          orderBy: [{ created_at: "desc" }],
          select: {
            public_id: true,
            status: true,
            total_price: true,
            created_at: true,
          },
        },
        orders_as_seller: {
          orderBy: [{ created_at: "desc" }],
          select: {
            public_id: true,
            status: true,
            total_price: true,
            created_at: true,
          },
        },
        listings: {
          select: {
            public_id: true,
            status: true,
            moderation_status: true,
            created_at: true,
          },
        },
        complaints_reported: {
          select: {
            id: true,
          },
        },
        complaints_against: {
          select: {
            id: true,
          },
        },
        kyc_requests: {
          orderBy: [{ created_at: "desc" }],
          take: 1,
          select: {
            public_id: true,
            status: true,
            created_at: true,
            reviewed_at: true,
          },
        },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
  }

  async loadSanctionAggregate(
    userIds: number[],
  ): Promise<AdminUserSanctionAggregate> {
    const [
      approvedViolationsRaw,
      sanctionsTotalRaw,
      activeSanctionsRaw,
      latestSanctionsRaw,
    ] = await Promise.all([
      userIds.length > 0
        ? this.prisma.complaint.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
              status: "APPROVED",
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.complaintSanction.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.complaintSanction.groupBy({
            by: ["seller_id"],
            where: {
              seller_id: { in: userIds },
              status: "ACTIVE",
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      userIds.length > 0
        ? this.prisma.complaintSanction.findMany({
            where: {
              seller_id: { in: userIds },
            },
            select: {
              seller_id: true,
              public_id: true,
              level: true,
              status: true,
              starts_at: true,
              ends_at: true,
              reason: true,
              created_at: true,
            },
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
          })
        : Promise.resolve([]),
    ]);

    const approvedViolationsByUser = new Map<number, number>();
    for (const item of approvedViolationsRaw) {
      approvedViolationsByUser.set(item.seller_id, item._count._all);
    }

    const sanctionsTotalByUser = new Map<number, number>();
    for (const item of sanctionsTotalRaw) {
      sanctionsTotalByUser.set(item.seller_id, item._count._all);
    }

    const activeSanctionsByUser = new Map<number, number>();
    for (const item of activeSanctionsRaw) {
      activeSanctionsByUser.set(item.seller_id, item._count._all);
    }

    const latestSanctionByUser = new Map<
      number,
      (typeof latestSanctionsRaw)[number]
    >();
    for (const sanction of latestSanctionsRaw) {
      if (!latestSanctionByUser.has(sanction.seller_id)) {
        latestSanctionByUser.set(sanction.seller_id, sanction);
      }
    }

    return {
      approvedViolationsByUser,
      sanctionsTotalByUser,
      activeSanctionsByUser,
      latestSanctionByUser,
    };
  }

  findUserForStatusUpdate(publicId: string) {
    return this.prisma.appUser.findUnique({
      where: { public_id: publicId },
      select: {
        id: true,
        public_id: true,
        role: true,
        status: true,
        block_reason: true,
        blocked_until: true,
      },
    });
  }

  updateUserStatus(params: {
    userId: number;
    status: UserStatusValue;
    blockReason: string | null;
  }) {
    return this.prisma.appUser.update({
      where: { id: params.userId },
      data: {
        status: params.status,
        block_reason: params.blockReason,
        blocked_until: null,
      },
      select: {
        status: true,
        blocked_until: true,
        block_reason: true,
      },
    });
  }

  findUserForRoleUpdate(publicId: string) {
    return this.prisma.appUser.findUnique({
      where: { public_id: publicId },
      select: {
        id: true,
        public_id: true,
        role: true,
      },
    });
  }

  async updateUserRole(params: {
    userId: number;
    role: UserRoleValue;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.appUser.update({
        where: { id: params.userId },
        data: {
          role: params.role,
        },
      });

      if (params.role === "SELLER") {
        await tx.sellerProfile.upsert({
          where: { user_id: params.userId },
          create: {
            user_id: params.userId,
            is_verified: false,
          },
          update: {},
        });
      }
    });
  }
}
