import { validationError } from "../../../../../common/application-error";
import {
  buildAddressFullAddress,
  mapUserAddressToDto,
  normalizeTextField,
  parseLegacyBuilding,
} from "../../domain/profile-address.helpers";
import type { ProfileAddressRepositoryPort } from "../../domain/profile-address.types";

export class CreateProfileAddressService {
  constructor(private readonly repository: ProfileAddressRepositoryPort) {}

  async execute(input: {
    userId: number;
    body: Record<string, unknown>;
  }) {
    const label = normalizeTextField(input.body.name ?? input.body.label);
    const fullAddress = normalizeTextField(input.body.fullAddress);
    const region = normalizeTextField(input.body.region ?? input.body.regionName);
    const city = normalizeTextField(input.body.city ?? input.body.cityName);
    const street = normalizeTextField(input.body.street);
    const postalCode = normalizeTextField(input.body.postalCode);
    const legacyBuilding = normalizeTextField(input.body.building);

    const parsedLegacyBuilding = parseLegacyBuilding(legacyBuilding);
    const house = normalizeTextField(input.body.house) || parsedLegacyBuilding.house;
    const apartment =
      normalizeTextField(input.body.apartment) || parsedLegacyBuilding.apartment;
    const entrance =
      normalizeTextField(input.body.entrance) || parsedLegacyBuilding.entrance;

    const lat =
      typeof input.body.lat === "number" && Number.isFinite(input.body.lat)
        ? input.body.lat
        : null;
    const lon =
      typeof input.body.lon === "number" && Number.isFinite(input.body.lon)
        ? input.body.lon
        : null;
    const isDefault = Boolean(input.body.isDefault);
    const existingCount = await this.repository.countByUserId(input.userId);
    const effectiveIsDefault = isDefault || existingCount === 0;

    const normalizedFullAddress =
      fullAddress ||
      buildAddressFullAddress({
        region,
        city,
        street,
        house,
        apartment,
        entrance,
      }) ||
      [region, city, street, house].filter(Boolean).join(", ");

    if (!label) {
      throw validationError("Address label is required");
    }
    if (!normalizedFullAddress) {
      throw validationError("Address text is required");
    }
    if (lat === null || lon === null) {
      throw validationError("Address coordinates are required");
    }

    const created = await this.repository.createForUser({
      userId: input.userId,
      data: {
        label,
        fullAddress: normalizedFullAddress,
        region,
        city,
        street,
        house,
        apartment,
        entrance,
        postalCode,
        lat,
        lon,
      },
      isDefault: effectiveIsDefault,
    });

    return mapUserAddressToDto(created);
  }
}
