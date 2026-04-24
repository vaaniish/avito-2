import type { PolicyScope, PrismaClient } from "@prisma/client";

export type NormalizedPolicyScope = PolicyScope;

export function normalizePolicyScope(value: unknown): NormalizedPolicyScope | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "checkout") return "CHECKOUT";
  if (raw === "partnership") return "PARTNERSHIP";
  return null;
}

function getRequestIpLike(params: { header?: string; ip?: string }): string | null {
  const forwarded = params.header?.trim();
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  const reqIp = params.ip?.trim();
  return reqIp || null;
}

export function toClientPolicyScope(scope: PolicyScope): "checkout" | "partnership" {
  return scope === "CHECKOUT" ? "checkout" : "partnership";
}

export async function getActivePolicy(prisma: PrismaClient, scope: PolicyScope) {
  return prisma.platformPolicy.findFirst({
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

export async function getPolicyAcceptanceStatus(params: {
  prisma: PrismaClient;
  userId: number;
  scope: PolicyScope;
}) {
  const policy = await getActivePolicy(params.prisma, params.scope);
  if (!policy) {
    return {
      hasActivePolicy: false,
      accepted: true,
      policy: null,
      acceptedAt: null,
    } as const;
  }

  const acceptance = await params.prisma.policyAcceptance.findUnique({
    where: {
      policy_id_user_id: {
        policy_id: policy.id,
        user_id: params.userId,
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
  } as const;
}

export async function acceptPolicyForUser(params: {
  prisma: PrismaClient;
  userId: number;
  scope: PolicyScope;
  requestPolicyPublicId?: string | null;
  requestIp?: string | null;
  requestUserAgent?: string | null;
}) {
  const policy = await getActivePolicy(params.prisma, params.scope);
  if (!policy) {
    return {
      ok: false,
      code: "POLICY_NOT_FOUND",
      message: "No active policy found for the requested scope.",
    } as const;
  }

  if (
    params.requestPolicyPublicId &&
    params.requestPolicyPublicId.trim() &&
    params.requestPolicyPublicId.trim() !== policy.public_id
  ) {
    return {
      ok: false,
      code: "POLICY_VERSION_MISMATCH",
      message: "Policy version mismatch. Refresh and accept the latest policy version.",
      policy,
    } as const;
  }

  await params.prisma.policyAcceptance.upsert({
    where: {
      policy_id_user_id: {
        policy_id: policy.id,
        user_id: params.userId,
      },
    },
    create: {
      policy_id: policy.id,
      user_id: params.userId,
      accepted_ip: params.requestIp ?? null,
      accepted_ua: params.requestUserAgent ?? null,
    },
    update: {
      accepted_at: new Date(),
      accepted_ip: params.requestIp ?? null,
      accepted_ua: params.requestUserAgent ?? null,
    },
  });

  return {
    ok: true,
    policy,
  } as const;
}

export function getRequestMetaFromExpressLike(req: {
  header: (name: string) => string | undefined;
  ip?: string;
}) {
  return {
    ipAddress: getRequestIpLike({
      header: req.header("x-forwarded-for"),
      ip: req.ip,
    }),
    userAgent: req.header("user-agent")?.trim() || null,
  };
}
