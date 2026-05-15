import {
  notFound,
  preconditionFailed,
  validationError,
} from "../../../../../common/application-error";
import {
  storedProfileToPayload,
  toClientOnboardingProfile,
  toPartnershipPolicyDto,
} from "../../domain/profile-engagement.helpers";
import type {
  ProfileEngagementPolicyPort,
  ProfilePartnershipRepositoryPort,
} from "../../domain/profile-engagement.types";
import {
  toClientPartnershipStatus,
  validateAndNormalizeOnboardingPayload,
} from "../../../../partnership/onboarding";

export class SubmitPartnershipDraftService {
  constructor(
    private readonly repository: ProfilePartnershipRepositoryPort,
    private readonly policyPort: ProfileEngagementPolicyPort,
  ) {}

  async execute(input: { publicId: string; userId: number }) {
    const policyStatus = await this.policyPort.getPartnershipPolicyStatus(
      input.userId,
    );
    if (!policyStatus.accepted) {
      throw preconditionFailed(
        "Before submitting a partnership request, accept the partnership policy.",
        {
          policy: toPartnershipPolicyDto(policyStatus.policy),
        },
      );
    }

    const existing = await this.repository.findOwnedRequest({
      publicId: input.publicId,
      userId: input.userId,
    });

    if (!existing?.onboarding_profile) {
      throw notFound("Partnership draft not found");
    }

    const validation = validateAndNormalizeOnboardingPayload(
      storedProfileToPayload(existing.onboarding_profile),
    );
    if (!validation.ok) {
      throw validationError(
        "Заполните обязательные поля партнерской проверки",
        { details: validation.errors },
      );
    }

    const nextStatus = existing.onboarding_profile.legal_lookup_verified
      ? "REPRESENTATIVE_REVIEW"
      : "LEGAL_REVIEW";
    const updated = await this.repository.submitDraft({
      requestId: existing.id,
      nextStatus,
    });

    return {
      success: true,
      requestId: updated.public_id,
      status: toClientPartnershipStatus(updated.status as never),
      profile: toClientOnboardingProfile(updated.onboarding_profile),
    };
  }
}
