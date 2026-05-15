import {
  conflict,
  notFound,
  validationError,
} from "../../../../../common/application-error";
import {
  toClientOnboardingProfile,
} from "../../domain/profile-engagement.helpers";
import type { ProfilePartnershipRepositoryPort } from "../../domain/profile-engagement.types";
import {
  toClientPartnershipStatus,
  validateAndNormalizeOnboardingPayload,
  type PartnerOnboardingPayload,
} from "../../../../partnership/onboarding";

export class UpdatePartnershipDraftService {
  constructor(
    private readonly repository: ProfilePartnershipRepositoryPort,
  ) {}

  async execute(input: {
    publicId: string;
    userId: number;
    payload: PartnerOnboardingPayload;
  }) {
    const existing = await this.repository.findOwnedRequest({
      publicId: input.publicId,
      userId: input.userId,
    });

    if (!existing) {
      throw notFound("Partnership request not found");
    }

    if (!["DRAFT", "NEEDS_MORE_INFO"].includes(existing.status)) {
      throw conflict("Only draft or needs_more_info requests can be edited.");
    }

    const normalized = validateAndNormalizeOnboardingPayload(input.payload, {
      allowDraft: true,
    });
    if (!normalized.ok) {
      throw validationError("Invalid onboarding draft", {
        details: normalized.errors,
      });
    }

    const updated = await this.repository.updateDraft({
      requestId: existing.id,
      existing,
      profile: normalized.profile,
    });

    return {
      success: true,
      requestId: updated.public_id,
      status: toClientPartnershipStatus(updated.status as never),
      profile: toClientOnboardingProfile(updated.onboarding_profile),
    };
  }
}
