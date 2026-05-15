import type { NormalizedPolicyScope } from "../../domain/policy-scope";
import type { PolicyRepository } from "../../infrastructure/repositories/policy.repository";

export class GetPolicyAcceptanceStatusService {
  constructor(private readonly repository: PolicyRepository) {}

  execute(input: { userId: number; scope: NormalizedPolicyScope }) {
    return this.repository.getPolicyAcceptanceStatus(input);
  }
}
