import type { PolicyScope, PrismaClient } from "@prisma/client";
import type {
  AcceptPolicyResult,
  PolicyAcceptanceStatus,
} from "../../domain/policy.types";

export class PolicyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getActivePolicy(scope: PolicyScope) {
    return this.prisma.platformPolicy.findFirst({
      where: {
        scope,
        is_active: true,
      },
      orderBy: [{ activated_at: "desc" }, { id: "desc" }],
      select: {
        id: true,
        public_id: true,
        scope: true,
        version: true,
        title: true,
        content_url: true,
        activated_at: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async getPolicyAcceptanceStatus(input: {
    userId: number;
    scope: PolicyScope;
  }): Promise<PolicyAcceptanceStatus> {
    const policy = await this.getActivePolicy(input.scope);
    if (!policy) {
      return {
        hasActivePolicy: false,
        accepted: true,
        policy: null,
        acceptedAt: null,
      };
    }

    const acceptance = await this.prisma.policyAcceptance.findUnique({
      where: {
        policy_id_user_id: {
          policy_id: policy.id,
          user_id: input.userId,
        },
      },
      select: {
        accepted_at: true,
      },
    });

    return {
      hasActivePolicy: true,
      accepted: Boolean(acceptance),
      policy,
      acceptedAt: acceptance?.accepted_at ?? null,
    };
  }

  async acceptPolicyForUser(input: {
    userId: number;
    scope: PolicyScope;
    requestPolicyPublicId?: string | null;
    requestIp?: string | null;
    requestUserAgent?: string | null;
  }): Promise<AcceptPolicyResult> {
    const policy = await this.getActivePolicy(input.scope);
    if (!policy) {
      return {
        ok: false,
        code: "POLICY_NOT_FOUND",
        message: "No active policy found for the requested scope.",
      };
    }

    if (
      input.requestPolicyPublicId &&
      input.requestPolicyPublicId.trim() &&
      input.requestPolicyPublicId.trim() !== policy.public_id
    ) {
      return {
        ok: false,
        code: "POLICY_VERSION_MISMATCH",
        message:
          "Policy version mismatch. Refresh and accept the latest policy version.",
        policy,
      };
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
        accepted_ip: input.requestIp ?? null,
        accepted_ua: input.requestUserAgent ?? null,
      },
      update: {
        accepted_at: new Date(),
        accepted_ip: input.requestIp ?? null,
        accepted_ua: input.requestUserAgent ?? null,
      },
    });

    return {
      ok: true,
      policy,
    };
  }
}
