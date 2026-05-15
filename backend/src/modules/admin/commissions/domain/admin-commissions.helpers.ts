import { validationError } from "../../../../common/application-error";

export function mapCommissionTier(tier: {
  public_id: string;
  name: string;
  min_sales: number;
  max_sales: number | null;
  commission_rate: number;
  description: string | null;
  _count?: { seller_profiles: number };
}) {
  return {
    id: tier.public_id,
    name: tier.name,
    minSales: tier.min_sales,
    maxSales: tier.max_sales,
    commissionRate: tier.commission_rate,
    description: tier.description,
    sellersCount: tier._count?.seller_profiles ?? 0,
  };
}

export function parseCommissionRate(value: unknown): number {
  const nextRate = Number(value);
  if (!Number.isFinite(nextRate) || nextRate <= 0 || nextRate > 100) {
    throw validationError("Invalid commission rate");
  }
  return nextRate;
}

export function validateCommissionTierRanges(
  tiers: Array<{
    public_id: string;
    min_sales: number;
    max_sales: number | null;
  }>,
) {
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const previous = tiers[index - 1];
    const next = tiers[index + 1];

    if (tier.max_sales !== null && tier.min_sales > tier.max_sales) {
      throw validationError(
        `Минимальные продажи уровня ${tier.public_id} не должны быть больше максимальных`,
      );
    }

    if (
      previous?.max_sales !== null &&
      previous &&
      tier.min_sales < previous.max_sales
    ) {
      throw validationError(
        `Минимальные продажи уровня ${tier.public_id} не должны быть меньше максимума предыдущего уровня`,
      );
    }

    if (next && tier.max_sales !== null && tier.max_sales > next.min_sales) {
      throw validationError(
        `Максимальные продажи уровня ${tier.public_id} не должны быть больше минимума следующего уровня`,
      );
    }
  }
}
