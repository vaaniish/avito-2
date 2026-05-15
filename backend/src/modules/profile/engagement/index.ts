import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import { CreateLegacyPartnershipRequestService } from "./application/services/create-legacy-partnership-request.service";
import { CreateListingReviewService } from "./application/services/create-listing-review.service";
import { CreatePartnershipDraftService } from "./application/services/create-partnership-draft.service";
import { LookupPartnershipLegalEntityService } from "./application/services/lookup-partnership-legal-entity.service";
import { SubmitPartnershipDraftService } from "./application/services/submit-partnership-draft.service";
import { UpdatePartnershipDraftService } from "./application/services/update-partnership-draft.service";
import { createProfileEngagementRouter } from "./http/profile-engagement.router";
import { ProfileLegalEntityLookupGateway } from "./infrastructure/gateways/profile-legal-entity-lookup.gateway";
import { ProfileEngagementPolicyRepository } from "./infrastructure/repositories/profile-engagement-policy.repository";
import { ProfileListingReviewRepository } from "./infrastructure/repositories/profile-listing-review.repository";
import { ProfilePartnershipRepository } from "./infrastructure/repositories/profile-partnership.repository";

const partnershipRepository = new ProfilePartnershipRepository(prisma);
const reviewRepository = new ProfileListingReviewRepository(prisma);
const policyRepository = new ProfileEngagementPolicyRepository(prisma);
const legalLookupGateway = new ProfileLegalEntityLookupGateway();

export const profileEngagementRouter = createProfileEngagementRouter({
  requireAnyRole,
  services: {
    lookupPartnershipLegalEntity: new LookupPartnershipLegalEntityService(
      legalLookupGateway,
    ),
    createPartnershipDraft: new CreatePartnershipDraftService(
      partnershipRepository,
    ),
    updatePartnershipDraft: new UpdatePartnershipDraftService(
      partnershipRepository,
    ),
    submitPartnershipDraft: new SubmitPartnershipDraftService(
      partnershipRepository,
      policyRepository,
    ),
    createLegacyPartnershipRequest: new CreateLegacyPartnershipRequestService(
      partnershipRepository,
      policyRepository,
    ),
    createListingReview: new CreateListingReviewService(reviewRepository),
  },
});
