import type { PrismaClient } from "@prisma/client";

export class AdminCommissionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listTiers() {
    return this.prisma.commissionTier.findMany({
      include: {
        _count: {
          select: {
            seller_profiles: true,
          },
        },
      },
      orderBy: [{ min_sales: "asc" }, { id: "asc" }],
    });
  }

  listExistingTiers() {
    return this.prisma.commissionTier.findMany({
      orderBy: [{ min_sales: "asc" }, { id: "asc" }],
      select: {
        id: true,
        public_id: true,
        min_sales: true,
        max_sales: true,
        commission_rate: true,
      },
    });
  }

  async updateMany(
    tiers: Array<{
      id: number;
      min_sales: number;
      max_sales: number | null;
      commission_rate: number;
    }>,
  ) {
    await this.prisma.$transaction(async (tx) => {
      for (const tier of tiers) {
        await tx.commissionTier.update({
          where: { id: tier.id },
          data: {
            min_sales: tier.min_sales,
            max_sales: tier.max_sales,
            commission_rate: tier.commission_rate,
          },
        });
      }
    });
  }

  findTierByPublicId(publicId: string) {
    return this.prisma.commissionTier.findUnique({
      where: { public_id: publicId },
      select: { id: true, public_id: true, commission_rate: true },
    });
  }

  updateTierRate(id: number, commissionRate: number) {
    return this.prisma.commissionTier.update({
      where: { id },
      data: { commission_rate: commissionRate },
    });
  }
}
