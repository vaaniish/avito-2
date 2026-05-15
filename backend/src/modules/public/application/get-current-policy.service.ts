import { validationError } from "../../../common/application-error";
import { toClientPolicyScope } from "../../policy/domain/policy-scope";
import type { GetActivePolicyService } from "../../policy/application/services/get-active-policy.service";
import type { NormalizedPolicyScope } from "../../policy/domain/policy-scope";

export class GetCurrentPolicyService {
  constructor(private readonly getActivePolicyService: GetActivePolicyService) {}

  async execute(scope: NormalizedPolicyScope | null) {
    if (!scope) {
      throw validationError(
        "Invalid policy scope. Use checkout or partnership.",
      );
    }

    const policy = await this.getActivePolicyService.execute(scope);
    return {
      id: policy.public_id,
      scope: toClientPolicyScope(policy.scope),
      version: policy.version,
      title: policy.title,
      contentUrl: policy.content_url,
      activatedAt: policy.activated_at,
      updatedAt: policy.updated_at,
    };
  }
}
