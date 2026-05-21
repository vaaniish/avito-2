import { validationError } from "../../../../../common/application-error";
import type {
  DeliveryBoundsPayload,
  DeliveryProviderFilter,
  ProfileAddressDeliveryGatewayPort,
} from "../../domain/profile-address.types";

export class GetDeliveryPointsService {
  constructor(
    private readonly deliveryGateway: ProfileAddressDeliveryGatewayPort,
    private readonly deliveryProviders: Array<{ code: string; label: string }>,
  ) {}

  async execute(input: {
    city: string;
    providerFilter: DeliveryProviderFilter;
    cursor: number;
    limit?: number;
    bounds?: DeliveryBoundsPayload;
  }) {
    if (!input.city) {
      throw validationError("City query is required");
    }

    const { location, points, pagination } =
      await this.deliveryGateway.getDeliveryPoints(
        input.city,
        input.providerFilter,
        {
          cursor: input.cursor,
          limit: input.limit,
          bounds: input.bounds,
        },
      );

    return {
      city: location.city,
      location: {
        label: location.label,
        lat: location.lat,
        lng: location.lng,
      },
      providers: this.deliveryProviders,
      activeProvider: input.providerFilter,
      points,
      pagination: pagination ?? null,
    };
  }
}
