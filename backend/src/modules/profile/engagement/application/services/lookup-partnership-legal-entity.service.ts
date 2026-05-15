import type { ProfileLegalEntityLookupGatewayPort } from "../../domain/profile-engagement.types";

export class LookupPartnershipLegalEntityService {
  constructor(
    private readonly lookupGateway: ProfileLegalEntityLookupGatewayPort,
  ) {}

  async execute(input: { inn: unknown; legalType: unknown }) {
    const result = await this.lookupGateway.lookup(input);
    return {
      success: true,
      result,
    };
  }
}
