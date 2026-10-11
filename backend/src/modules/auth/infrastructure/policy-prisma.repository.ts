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
    await this.prisma.$executeRaw`
      INSERT INTO "PolicyAcceptance" (
        "policy_id",
        "user_id",
        "accepted_at",
        "accepted_ip",
        "accepted_ua"
      )
      SELECT
        "id",
        ${input.userId},
        CURRENT_TIMESTAMP,
        ${input.requestIp},
        ${input.requestUserAgent}
      FROM "PlatformPolicy"
      WHERE "scope" = 'CHECKOUT'::"PolicyScope"
        AND "is_active" = true
      ORDER BY "activated_at" DESC, "id" DESC
      LIMIT 1
      ON CONFLICT ("policy_id", "user_id") DO UPDATE SET
        "accepted_at" = CURRENT_TIMESTAMP,
        "accepted_ip" = EXCLUDED."accepted_ip",
        "accepted_ua" = EXCLUDED."accepted_ua"
    `;
  }
}
