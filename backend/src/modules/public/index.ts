import { policyModule } from "../policy";
import { GetCurrentPolicyService } from "./application/get-current-policy.service";
import { createPublicRouter } from "./http/public.router";

export const publicRouter = createPublicRouter({
  getCurrentPolicyService: new GetCurrentPolicyService(
    policyModule.getActivePolicyService,
  ),
});
