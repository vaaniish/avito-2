import type { ProfileAddressLocationGatewayPort } from "../../domain/profile-address.types";

export class GetLocationSuggestionsService {
  constructor(
    private readonly locationGateway: ProfileAddressLocationGatewayPort,
  ) {}

  async execute(input: { query: string; limit: number }) {
    if (!input.query) {
      return { query: "", suggestions: [] };
    }

    let suggestions: unknown[] = [];
    try {
      suggestions = await this.locationGateway.loadSuggestions(
        input.query,
        input.limit,
      );
    } catch (error) {
      console.warn("Location suggest degraded to empty result:", error);
    }

    return {
      query: input.query,
      suggestions,
    };
  }
}
