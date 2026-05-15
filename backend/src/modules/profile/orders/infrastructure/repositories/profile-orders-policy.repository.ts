import type { PrismaClient } from "@prisma/client";
import { PolicyRepository } from "../../../../policy/infrastructure/repositories/policy.repository";

export class ProfileOrdersPolicyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getCheckoutPolicyStatus(userId: number) {
    const policyRepository = new PolicyRepository(this.prisma);
    return policyRepository.getPolicyAcceptanceStatus({
      userId,
      scope: "CHECKOUT",
    });
  }
}
