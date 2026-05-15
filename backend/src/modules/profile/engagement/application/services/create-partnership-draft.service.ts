import { validationError } from "../../../../../common/application-error";
import {
  toClientOnboardingProfile,
} from "../../domain/profile-engagement.helpers";
import type {
  ProfilePartnershipRepositoryPort,
} from "../../domain/profile-engagement.types";
import {
  validateAndNormalizeOnboardingPayload,
  type PartnerOnboardingPayload,
  toClientPartnershipStatus,
} from "../../../../partnership/onboarding";

export class CreatePartnershipDraftService {
  constructor(
    private readonly repository: ProfilePartnershipRepositoryPort,
  ) {}

  async execute(input: {
    userId: number;
    userEmail: string;
    payload: PartnerOnboardingPayload;
  }) {
    const normalized = validateAndNormalizeOnboardingPayload(input.payload, {
      allowDraft: true,
    });
    if (!normalized.ok) {
      throw validationError("Invalid onboarding draft", {
        details: normalized.errors,
      });
    }

    const created = await this.repository.createDraft({
      userId: input.userId,
      userEmail: input.userEmail,
      profile: normalized.profile,
    });

    return {
      success: true,
      requestId: created.public_id,
      status: toClientPartnershipStatus(created.status as never),
      profile: toClientOnboardingProfile(created.onboarding_profile),
    };
  }
}
