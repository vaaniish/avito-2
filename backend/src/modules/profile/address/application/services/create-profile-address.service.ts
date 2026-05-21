import { validationError } from "../../../../../common/application-error";
import {
  mapUserAddressToDto,
  normalizeNullableTextField,
  normalizeTextField,
} from "../../domain/profile-address.helpers";
import type { ProfileAddressRepositoryPort } from "../../domain/profile-address.types";

export class CreateProfileAddressService {
  constructor(private readonly repository: ProfileAddressRepositoryPort) {}

  async execute(input: {
    userId: number;
    body: Record<string, unknown>;
  }) {
    const label = normalizeTextField(input.body.name ?? input.body.label);
    const region = normalizeNullableTextField(
      input.body.region ?? input.body.regionName,
    );
    const city = normalizeTextField(input.body.city ?? input.body.cityName);
    const street = normalizeTextField(input.body.street);
    const postalCode = normalizeTextField(input.body.postalCode);
    const house = normalizeTextField(input.body.house);

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

    if (!label) {
      throw validationError("Address label is required");
    }
    if (!city || !street || !house) {
      throw validationError("Exact Yandex address is required");
    }
    if (lat === null || lon === null) {
      throw validationError("Address coordinates are required");
    }

    const created = await this.repository.createForUser({
      userId: input.userId,
      data: {
        label,
        region,
        city,
        street,
        house,
        postalCode,
        lat,
        lon,
      },
      isDefault: effectiveIsDefault,
    });

    return mapUserAddressToDto(created);
  }
}
