import { notFound, validationError } from "../../../../../common/application-error";
import {
  mapUserAddressToDto,
  normalizeNullableTextField,
  normalizeTextField,
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

    const updated = await this.repository.updateForUser({
      id: existing.id,
      userId: input.userId,
      isDefault: hasIsDefault ? Boolean(input.body.isDefault) : undefined,
      data: {
        label:
          input.body.name === undefined && input.body.label === undefined
            ? undefined
            : normalizeTextField(input.body.name ?? input.body.label) || "",
        region:
          input.body.region === undefined && input.body.regionName === undefined
            ? undefined
            : normalizeNullableTextField(
                input.body.region ?? input.body.regionName,
              ),
        city:
          input.body.city === undefined
            ? undefined
            : normalizeTextField(input.body.city) || "",
        street:
          input.body.street === undefined
            ? undefined
            : normalizeTextField(input.body.street) || "",
        house:
          input.body.house === undefined
            ? undefined
            : normalizeTextField(input.body.house) || "",
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
