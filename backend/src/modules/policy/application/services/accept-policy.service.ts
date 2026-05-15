import { conflict, notFound } from "../../../../common/application-error";
import type { NormalizedPolicyScope } from "../../domain/policy-scope";
import type { PolicyRepository } from "../../infrastructure/repositories/policy.repository";

export class AcceptPolicyService {
  constructor(private readonly repository: PolicyRepository) {}

  async execute(input: {
    userId: number;
    scope: NormalizedPolicyScope;
    requestPolicyPublicId?: string | null;
    requestIp?: string | null;
    requestUserAgent?: string | null;
  }) {
    const accepted = await this.repository.acceptPolicyForUser(input);
    if (!accepted.ok) {
      if (accepted.code === "POLICY_NOT_FOUND") {
        throw notFound(accepted.message);
      }
      throw conflict(accepted.message, {
        policy: accepted.policy
          ? {
              id: accepted.policy.public_id,
              scope: accepted.policy.scope,
              version: accepted.policy.version,
              title: accepted.policy.title,
              content_url: accepted.policy.content_url,
            }
          : null,
      });
    }
    return accepted.policy;
  }
}
