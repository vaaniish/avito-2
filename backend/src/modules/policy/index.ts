import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { AcceptPolicyService } from "./application/services/accept-policy.service";
import { GetActivePolicyService } from "./application/services/get-active-policy.service";
import { GetPolicyAcceptanceStatusService } from "./application/services/get-policy-acceptance-status.service";
import { PolicyRepository } from "./infrastructure/repositories/policy.repository";

export function createPolicyModule(prismaClient: PrismaClient) {
  const repository = new PolicyRepository(prismaClient);
  return {
    repository,
    getActivePolicyService: new GetActivePolicyService(repository),
    getPolicyAcceptanceStatusService: new GetPolicyAcceptanceStatusService(
      repository,
    ),
    acceptPolicyService: new AcceptPolicyService(repository),
  };
}

export const policyModule = createPolicyModule(prisma);
