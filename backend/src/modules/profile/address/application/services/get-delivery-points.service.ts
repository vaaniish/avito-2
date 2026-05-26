import { validationError } from "../../../../../common/application-error";
import type {
  DeliveryBoundsPayload,
  DeliveryProviderFilter,
  DeliveryLocationPayload,
  DeliveryPaginationPayload,
  DeliveryPointPayload,
  ProfileAddressDeliveryGatewayPort,
} from "../../domain/profile-address.types";

const STATIC_RUSSIAN_POST_FALLBACK_POINT = {
  id: "russian_post_static_fallback",
  provider: "russian_post",
  providerLabel: "Почта России",
  name: "Отделение Почты России",
  address: "Москва, Мясницкая улица, 26А/1",
  city: "Москва",
  lat: 55.7649,
  lng: 37.6379,
  workHours: "По расписанию",
  etaDays: 2,
  cost: 0,
  source: "russian_post_static_fallback",
  sourceExternalId: "static-fallback-russian-post",
  verificationLevel: "provider_feed",
} satisfies DeliveryPointPayload;

function shouldUseStaticRussianPostFallback(
  providerFilter: DeliveryProviderFilter,
): boolean {
  return providerFilter === "all" || providerFilter === "russian_post";
}

function buildStaticRussianPostFallbackLocation(
  cityQuery: string,
): DeliveryLocationPayload {
  const normalizedQuery = cityQuery.trim();
  return {
    city: normalizedQuery || STATIC_RUSSIAN_POST_FALLBACK_POINT.city,
    label: normalizedQuery || STATIC_RUSSIAN_POST_FALLBACK_POINT.address,
    lat: STATIC_RUSSIAN_POST_FALLBACK_POINT.lat,
    lng: STATIC_RUSSIAN_POST_FALLBACK_POINT.lng,
  };
}

function buildStaticRussianPostFallbackPagination(): DeliveryPaginationPayload {
  return {
    total: 1,
    cursor: 0,
    nextCursor: null,
    hasMore: false,
  };
}

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

    try {
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

      const shouldInjectFallback =
        points.length === 0 && shouldUseStaticRussianPostFallback(input.providerFilter);

      return {
        city: location.city,
        location: {
          label: location.label,
          lat: location.lat,
          lng: location.lng,
        },
        providers: this.deliveryProviders,
        activeProvider:
          shouldInjectFallback && input.providerFilter === "all"
            ? "russian_post"
            : input.providerFilter,
        points: shouldInjectFallback ? [STATIC_RUSSIAN_POST_FALLBACK_POINT] : points,
        pagination: shouldInjectFallback
          ? buildStaticRussianPostFallbackPagination()
          : pagination ?? null,
      };
    } catch (error) {
      if (!shouldUseStaticRussianPostFallback(input.providerFilter)) {
        throw error;
      }

      const fallbackLocation = buildStaticRussianPostFallbackLocation(input.city);
      return {
        city: fallbackLocation.city,
        location: {
          label: fallbackLocation.label,
          lat: fallbackLocation.lat,
          lng: fallbackLocation.lng,
        },
        providers: this.deliveryProviders,
        activeProvider: input.providerFilter === "all" ? "russian_post" : input.providerFilter,
        points: [STATIC_RUSSIAN_POST_FALLBACK_POINT],
        pagination: buildStaticRussianPostFallbackPagination(),
      };
    }
  }
}
