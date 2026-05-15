import { notFound, validationError } from "../../../../../common/application-error";
import {
  mapCommissionTier,
  parseCommissionRate,
  validateCommissionTierRanges,
} from "../../domain/admin-commissions.helpers";
import type { AdminCommissionsRepository } from "../../infrastructure/repositories/admin-commissions.repository";
import type { AdminCommissionsAuditGateway } from "../../infrastructure/gateways/admin-commissions-audit.gateway";

export class ListCommissionTiersService {
  constructor(private readonly repository: AdminCommissionsRepository) {}

  async execute() {
    return (await this.repository.listTiers()).map(mapCommissionTier);
  }
}

export class BatchUpdateCommissionTiersService {
  constructor(
    private readonly repository: AdminCommissionsRepository,
    private readonly auditGateway: AdminCommissionsAuditGateway,
  ) {}

  async execute(input: {
    tiers?: unknown;
    actorUserId: number;
    requestIp: string | null;
  }) {
    const requestedTiers = Array.isArray(input.tiers) ? input.tiers : [];
    if (requestedTiers.length === 0) {
      throw validationError("No commission tiers provided");
    }

    const existingTiers = await this.repository.listExistingTiers();
    const existingByPublicId = new Map(
      existingTiers.map((tier) => [tier.public_id, tier]),
    );

    const nextByPublicId = new Map<
      string,
      { minSales: number; maxSales: number | null; commissionRate: number }
    >();

    for (const rawTier of requestedTiers) {
      if (!rawTier || typeof rawTier !== "object") {
        throw validationError("Invalid commission tier payload");
      }

      const item = rawTier as {
        id?: unknown;
        minSales?: unknown;
        maxSales?: unknown;
        commissionRate?: unknown;
      };
      const publicId = typeof item.id === "string" ? item.id.trim() : "";
      const existing = existingByPublicId.get(publicId);
      if (!existing) {
        throw notFound("Commission tier not found");
      }

      const minSales = Number(item.minSales);
      const maxSales = item.maxSales === null ? null : Number(item.maxSales);
      const commissionRate = Number(item.commissionRate);
      if (
        !Number.isInteger(minSales) ||
        minSales < 0 ||
        (maxSales !== null && (!Number.isInteger(maxSales) || maxSales < 0)) ||
        !Number.isFinite(commissionRate) ||
        commissionRate <= 0 ||
        commissionRate > 100
      ) {
        throw validationError("Invalid commission tier values");
      }

      nextByPublicId.set(publicId, {
        minSales,
        maxSales,
        commissionRate,
      });
    }

    const finalTiers = existingTiers.map((tier) => {
      const next = nextByPublicId.get(tier.public_id);
      return {
        ...tier,
        min_sales: next?.minSales ?? tier.min_sales,
        max_sales: next?.maxSales ?? tier.max_sales,
        commission_rate: next?.commissionRate ?? tier.commission_rate,
      };
    });

    validateCommissionTierRanges(finalTiers);

    const changedTiers = finalTiers.filter((tier) => {
      const existing = existingByPublicId.get(tier.public_id);
      return (
        existing &&
        (existing.min_sales !== tier.min_sales ||
          existing.max_sales !== tier.max_sales ||
          existing.commission_rate !== tier.commission_rate)
      );
    });

    await this.repository.updateMany(changedTiers);
    await Promise.all(
      changedTiers.map((tier) => {
        const existing = existingByPublicId.get(tier.public_id);
        return this.auditGateway.write({
          actorUserId: input.actorUserId,
          requestIp: input.requestIp,
          action: "commission_tier.rate_changed",
          entityType: "commission_tier",
          entityPublicId: tier.public_id,
          details: {
            beforeMinSales: existing?.min_sales,
            afterMinSales: tier.min_sales,
            beforeMaxSales: existing?.max_sales,
            afterMaxSales: tier.max_sales,
            beforeCommissionRate: existing?.commission_rate,
            afterCommissionRate: tier.commission_rate,
          },
        });
      }),
    );

    return {
      success: true,
      updated: changedTiers.length,
    };
  }
}

export class UpdateCommissionTierRateService {
  constructor(
    private readonly repository: AdminCommissionsRepository,
    private readonly auditGateway: AdminCommissionsAuditGateway,
  ) {}

  async execute(input: {
    publicId: string;
    commissionRate: unknown;
    actorUserId: number;
    requestIp: string | null;
  }) {
    const nextRate = parseCommissionRate(input.commissionRate);
    const existing = await this.repository.findTierByPublicId(input.publicId);
    if (!existing) {
      throw notFound("Commission tier not found");
    }

    const updated = await this.repository.updateTierRate(existing.id, nextRate);
    await this.auditGateway.write({
      actorUserId: input.actorUserId,
      requestIp: input.requestIp,
      action: "commission_tier.rate_changed",
      entityType: "commission_tier",
      entityPublicId: input.publicId,
      details: {
        beforeCommissionRate: existing.commission_rate,
        afterCommissionRate: updated.commission_rate,
      },
    });

    return {
      success: true,
      commissionRate: updated.commission_rate,
    };
  }
}
