import { notFound } from "../../../../common/application-error";
import type { NormalizedPolicyScope } from "../../domain/policy-scope";
import type { PolicyRepository } from "../../infrastructure/repositories/policy.repository";

export class GetActivePolicyService {
  constructor(private readonly repository: PolicyRepository) {}

  async execute(scope: NormalizedPolicyScope) {
    const policy = await this.repository.getActivePolicy(scope);
    if (!policy) {
      throw notFound("Active policy not found");
    }
    return policy;
  }
}
