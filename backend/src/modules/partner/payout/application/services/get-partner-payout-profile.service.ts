import { payoutProfileToClient } from "../../domain/partner-payout.helpers";
import type { PartnerPayoutRepositoryPort } from "../../domain/partner-payout.types";

export class GetPartnerPayoutProfileService {
  constructor(private readonly repository: PartnerPayoutRepositoryPort) {}

  async execute(sellerId: number) {
    const profile = await this.repository.getProfile(sellerId);
    return {
      profile: profile ? payoutProfileToClient(profile) : null,
    };
  }
}
