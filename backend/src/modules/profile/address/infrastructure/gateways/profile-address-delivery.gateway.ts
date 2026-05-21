import type {
  DeliveryBoundsPayload,
  DeliveryProviderFilter,
  ProfileAddressDeliveryGatewayPort,
} from "../../domain/profile-address.types";

export class ProfileAddressDeliveryGateway
  implements ProfileAddressDeliveryGatewayPort
{
  constructor(
    private readonly getDeliveryPointsImpl: (
      query: string,
      providerFilter: DeliveryProviderFilter,
      options?: {
        cursor?: number;
        limit?: number;
        bounds?: DeliveryBoundsPayload;
      },
    ) => Promise<{
      location: { city: string; label: string; lat: number; lng: number };
      points: Record<string, unknown>[];
      pagination?: {
        total: number;
        cursor: number;
        nextCursor: number | null;
        hasMore: boolean;
      };
    }>,
  ) {}

  getDeliveryPoints(
    query: string,
    providerFilter: DeliveryProviderFilter,
    options?: {
      cursor?: number;
      limit?: number;
      bounds?: DeliveryBoundsPayload;
    },
  ) {
    return this.getDeliveryPointsImpl(query, providerFilter, options);
  }
}
