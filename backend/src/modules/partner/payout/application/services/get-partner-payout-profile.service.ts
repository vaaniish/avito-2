import { payoutProfileToClient } from "../../domain/partner-payout.helpers";
import type { PartnerPayoutRepositoryPort } from "../../domain/partner-payout.types";

export class GetPartnerPayoutProfileService {
  constructor(private readonly repository: PartnerPayoutRepositoryPort) {}

  async execute(sellerId: number) {
    const [profile, sellerIdentity] = await Promise.all([
      this.repository.getProfile(sellerId),
      this.repository.getSellerIdentity(sellerId),
    ]);
    return {
      profile: profile ? payoutProfileToClient(profile) : null,
      sellerIdentity,
    };
  }
}
