import {
  lookupDadataParty,
} from "../../../../partnership/dadata";
import {
  externalServiceError,
  notFound,
  validationError,
} from "../../../../../common/application-error";
import type {
  LegalLookupResult,
  ProfileLegalEntityLookupGatewayPort,
} from "../../domain/profile-engagement.types";

export class ProfileLegalEntityLookupGateway
  implements ProfileLegalEntityLookupGatewayPort
{
  async lookup(params: {
    inn: unknown;
    legalType: unknown;
  }): Promise<LegalLookupResult> {
    const lookup = await lookupDadataParty(params);
    if (!lookup.ok) {
      if (lookup.status === 400) {
        throw validationError(lookup.error, { details: lookup.details });
      }
      if (lookup.status === 404) {
        throw notFound(lookup.error);
      }
      throw externalServiceError(lookup.error, { details: lookup.details });
    }
    return lookup.result;
  }
}
