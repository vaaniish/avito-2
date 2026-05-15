import { validationError } from "../../../../../common/application-error";
import type {
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
        },
      );

    const activeProvider =
      input.providerFilter === "all"
        ? ((points[0]?.provider as string | undefined) ?? "yandex_pvz")
        : input.providerFilter;

    return {
      city: location.city,
      location: {
        label: location.label,
        lat: location.lat,
        lng: location.lng,
      },
      providers: this.deliveryProviders,
      activeProvider,
      points,
      pagination: pagination ?? null,
    };
  }
}
