import type { PrismaClient } from "@prisma/client";
import type { PolicyAcceptanceRepository } from "../application/auth.ports";

export class PrismaPolicyAcceptanceRepository
  implements PolicyAcceptanceRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async acceptCheckoutPolicyForUser(input: {
    userId: number;
    requestIp: string | null;
    requestUserAgent: string | null;
  }): Promise<void> {
    const policy = await this.prisma.platformPolicy.findFirst({
      where: {
        scope: "CHECKOUT",
        is_active: true,
      },
      orderBy: [{ activated_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
      },
    });

    if (!policy) {
      return;
    }

    await this.prisma.policyAcceptance.upsert({
      where: {
        policy_id_user_id: {
          policy_id: policy.id,
          user_id: input.userId,
        },
      },
      create: {
        policy_id: policy.id,
        user_id: input.userId,
        accepted_ip: input.requestIp,
        accepted_ua: input.requestUserAgent,
      },
      update: {
        accepted_at: new Date(),
        accepted_ip: input.requestIp,
        accepted_ua: input.requestUserAgent,
      },
    });
  }
}
