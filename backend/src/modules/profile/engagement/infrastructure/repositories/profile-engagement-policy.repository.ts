import type { PrismaClient } from "@prisma/client";
import { PolicyRepository } from "../../../../policy/infrastructure/repositories/policy.repository";
import type {
  ProfileEngagementPolicyPort,
  PartnershipPolicyStatus,
} from "../../domain/profile-engagement.types";

export class ProfileEngagementPolicyRepository
  implements ProfileEngagementPolicyPort
{
  constructor(private readonly prisma: PrismaClient) {}

  async getPartnershipPolicyStatus(
    userId: number,
  ): Promise<PartnershipPolicyStatus> {
    const policyRepository = new PolicyRepository(this.prisma);
    const status = await policyRepository.getPolicyAcceptanceStatus({
      userId,
      scope: "PARTNERSHIP",
    });

    return {
      accepted: status.accepted,
      policy: status.policy,
    };
  }
}
