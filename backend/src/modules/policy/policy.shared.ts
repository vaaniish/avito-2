import type { PolicyScope, PrismaClient } from "@prisma/client";
import {
  normalizePolicyScope,
  toClientPolicyScope,
} from "./domain/policy-scope";
import { PolicyRepository } from "./infrastructure/repositories/policy.repository";

export { normalizePolicyScope, toClientPolicyScope };

export function getActivePolicy(
  prismaClient: PrismaClient,
  scope: PolicyScope,
) {
  const repository = new PolicyRepository(prismaClient);
  return repository.getActivePolicy(scope);
}

export function getPolicyAcceptanceStatus(params: {
  prisma: PrismaClient;
  userId: number;
  scope: PolicyScope;
}) {
  const repository = new PolicyRepository(params.prisma);
  return repository.getPolicyAcceptanceStatus({
    userId: params.userId,
    scope: params.scope,
  });
}

export function acceptPolicyForUser(params: {
  prisma: PrismaClient;
  userId: number;
  scope: PolicyScope;
  requestPolicyPublicId?: string | null;
  requestIp?: string | null;
  requestUserAgent?: string | null;
}) {
  const repository = new PolicyRepository(params.prisma);
  return repository.acceptPolicyForUser({
    userId: params.userId,
    scope: params.scope,
    requestPolicyPublicId: params.requestPolicyPublicId,
    requestIp: params.requestIp,
    requestUserAgent: params.requestUserAgent,
  });
}
