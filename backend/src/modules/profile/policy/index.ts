import { requireAnyRole } from "../../../lib/session";
import { policyModule } from "../../policy";
import { createProfilePolicyRouter } from "./http/profile-policy.router";

export const profilePolicyRouter = createProfilePolicyRouter({
  requireAnyRole,
  acceptPolicyService: policyModule.acceptPolicyService,
});
