import { notFound, validationError } from "../../../../../common/application-error";
import {
  mapUserAddressToDto,
  normalizeTextField,
  parseLegacyBuilding,
} from "../../domain/profile-address.helpers";
import type { ProfileAddressRepositoryPort } from "../../domain/profile-address.types";

export class UpdateProfileAddressService {
  constructor(private readonly repository: ProfileAddressRepositoryPort) {}

  async execute(input: {
    id: number;
    userId: number;
    body: Record<string, unknown>;
  }) {
    if (!Number.isInteger(input.id)) {
      throw validationError("Invalid address id");
    }

    const existing = await this.repository.findByIdForUser({
      id: input.id,
      userId: input.userId,
    });
    if (!existing) {
      throw notFound("Address not found");
    }

    const hasIsDefault = typeof input.body.isDefault === "boolean";
    const legacyBuilding = normalizeTextField(input.body.building);
    const parsedLegacyBuilding = parseLegacyBuilding(legacyBuilding);

    const updated = await this.repository.updateForUser({
      id: existing.id,
      userId: input.userId,
      isDefault: hasIsDefault ? Boolean(input.body.isDefault) : undefined,
      data: {
        label:
          input.body.name === undefined && input.body.label === undefined
            ? undefined
            : normalizeTextField(input.body.name ?? input.body.label) || "",
        fullAddress:
          input.body.fullAddress === undefined
            ? undefined
            : normalizeTextField(input.body.fullAddress) || "",
        region:
          input.body.region === undefined
            ? undefined
            : normalizeTextField(input.body.region) || "",
        city:
          input.body.city === undefined
            ? undefined
            : normalizeTextField(input.body.city) || "",
        street:
          input.body.street === undefined
            ? undefined
            : normalizeTextField(input.body.street) || "",
        house:
          input.body.house === undefined && !parsedLegacyBuilding.house
            ? undefined
            : normalizeTextField(input.body.house) || parsedLegacyBuilding.house,
        apartment:
          input.body.apartment === undefined && !parsedLegacyBuilding.apartment
            ? undefined
            : normalizeTextField(input.body.apartment) ||
              parsedLegacyBuilding.apartment,
        entrance:
          input.body.entrance === undefined && !parsedLegacyBuilding.entrance
            ? undefined
            : normalizeTextField(input.body.entrance) ||
              parsedLegacyBuilding.entrance,
        postalCode:
          input.body.postalCode === undefined
            ? undefined
            : normalizeTextField(input.body.postalCode) || "",
        lat:
          typeof input.body.lat === "number" && Number.isFinite(input.body.lat)
            ? input.body.lat
            : undefined,
        lon:
          typeof input.body.lon === "number" && Number.isFinite(input.body.lon)
            ? input.body.lon
            : undefined,
      },
    });

    return mapUserAddressToDto(updated);
  }
}
