import { type Request, type Response, type Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAdmin, writeAudit } from "./admin.shared";

export function registerAdminCommissionRoutes(adminRouter: Router) {
  adminRouter.get("/commission-tiers", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const tiers = await prisma.commissionTier.findMany({
        include: {
          _count: {
            select: {
              seller_profiles: true,
            },
          },
        },
        orderBy: [{ min_sales: "asc" }, { id: "asc" }],
      });

      res.json(
        tiers.map((tier) => ({
          id: tier.public_id,
          name: tier.name,
          minSales: tier.min_sales,
          maxSales: tier.max_sales,
          commissionRate: tier.commission_rate,
          description: tier.description,
          sellersCount: tier._count.seller_profiles,
        })),
      );
    } catch (error) {
      console.error("Error fetching commission tiers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch("/commission-tiers", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as {
        tiers?: unknown;
      };
      const requestedTiers = Array.isArray(body.tiers) ? body.tiers : [];
      if (requestedTiers.length === 0) {
        res.status(400).json({ error: "No commission tiers provided" });
        return;
      }

      const existingTiers = await prisma.commissionTier.findMany({
        orderBy: [{ min_sales: "asc" }, { id: "asc" }],
        select: {
          id: true,
          public_id: true,
          min_sales: true,
          max_sales: true,
          commission_rate: true,
        },
      });
      const existingByPublicId = new Map(
        existingTiers.map((tier) => [tier.public_id, tier]),
      );

      const nextByPublicId = new Map<
        string,
        { minSales: number; maxSales: number | null; commissionRate: number }
      >();

      for (const rawTier of requestedTiers) {
        if (!rawTier || typeof rawTier !== "object") {
          res.status(400).json({ error: "Invalid commission tier payload" });
          return;
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
          res.status(404).json({ error: "Commission tier not found" });
          return;
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
          res.status(400).json({ error: "Invalid commission tier values" });
          return;
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

      for (let index = 0; index < finalTiers.length; index += 1) {
        const tier = finalTiers[index];
        const previous = finalTiers[index - 1];
        const next = finalTiers[index + 1];

        if (tier.max_sales !== null && tier.min_sales > tier.max_sales) {
          res.status(400).json({
            error: `Минимальные продажи уровня ${tier.public_id} не должны быть больше максимальных`,
          });
          return;
        }

        if (previous?.max_sales !== null && previous && tier.min_sales < previous.max_sales) {
          res.status(400).json({
            error: `Минимальные продажи уровня ${tier.public_id} не должны быть меньше максимума предыдущего уровня`,
          });
          return;
        }

        if (next && tier.max_sales !== null && tier.max_sales > next.min_sales) {
          res.status(400).json({
            error: `Максимальные продажи уровня ${tier.public_id} не должны быть больше минимума следующего уровня`,
          });
          return;
        }
      }

      const changedTiers = finalTiers.filter((tier) => {
        const existing = existingByPublicId.get(tier.public_id);
        return (
          existing &&
          (existing.min_sales !== tier.min_sales ||
            existing.max_sales !== tier.max_sales ||
            existing.commission_rate !== tier.commission_rate)
        );
      });

      await prisma.$transaction(async (tx) => {
        for (const tier of changedTiers) {
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

      for (const tier of changedTiers) {
        const existing = existingByPublicId.get(tier.public_id);
        await writeAudit({
          req,
          actorUserId: access.user.id,
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
      }

      res.json({
        success: true,
        updated: changedTiers.length,
      });
    } catch (error) {
      console.error("Error batch updating commission tiers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch(
    "/commission-tiers/:publicId",
    async (req: Request, res: Response) => {
      try {
        const access = await requireAdmin(req, res);
        if (!access.ok) return;

        const { publicId } = req.params;
        const body = (req.body ?? {}) as { commissionRate?: unknown };
        const nextRate = Number(body.commissionRate);

        if (!Number.isFinite(nextRate) || nextRate <= 0 || nextRate > 100) {
          res.status(400).json({ error: "Invalid commission rate" });
          return;
        }

        const existing = await prisma.commissionTier.findUnique({
          where: { public_id: String(publicId) },
          select: { id: true, commission_rate: true },
        });

        if (!existing) {
          res.status(404).json({ error: "Commission tier not found" });
          return;
        }

        const updated = await prisma.commissionTier.update({
          where: { id: existing.id },
          data: { commission_rate: nextRate },
        });

        await writeAudit({
          req,
          actorUserId: access.user.id,
          action: "commission_tier.rate_changed",
          entityType: "commission_tier",
          entityPublicId: String(publicId),
          details: {
            beforeCommissionRate: existing.commission_rate,
            afterCommissionRate: updated.commission_rate,
          },
        });

        res.json({
          success: true,
          commissionRate: updated.commission_rate,
        });
      } catch (error) {
        console.error("Error updating commission tier:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
