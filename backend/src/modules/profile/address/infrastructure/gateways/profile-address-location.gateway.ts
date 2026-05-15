import type { ProfileAddressLocationGatewayPort } from "../../domain/profile-address.types";

export class ProfileAddressLocationGateway
  implements ProfileAddressLocationGatewayPort
{
  constructor(
    private readonly loadLocationSuggestionsByYandex: (
      query: string,
      limit: number,
    ) => Promise<unknown[]>,
  ) {}

  loadSuggestions(query: string, limit: number) {
    return this.loadLocationSuggestionsByYandex(query, limit);
  }
}
