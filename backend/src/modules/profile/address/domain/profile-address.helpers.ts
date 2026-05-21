import type { ProfileAddressDto, ProfileAddressRecord } from "./profile-address.types";

export function normalizeTextField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNullableTextField(value: unknown): string | null {
  const normalized = normalizeTextField(value);
  return normalized || null;
}

export function buildAddressFullAddress(parts: {
  region?: string;
  city?: string;
  street?: string;
  house?: string;
}): string {
  const region = normalizeTextField(parts.region);
  const city = normalizeTextField(parts.city);
  const street = normalizeTextField(parts.street);
  const house = normalizeTextField(parts.house);
  const cityPart =
    city &&
    region &&
    city.toLowerCase().replace(/\s+/g, " ") ===
      region.toLowerCase().replace(/\s+/g, " ")
      ? ""
      : city;

  const housePart = house ? `\u0434. ${house}` : "";

  return [region, cityPart, street, housePart].filter(Boolean).join(", ");
}

function buildAddressBuildingLabel(parts: {
  house?: string;
}): string {
  const house = normalizeTextField(parts.house);

  return house ? `\u0434. ${house}` : "";
}

export function mapUserAddressToDto(
  address: ProfileAddressRecord,
): ProfileAddressDto {
  const fullAddress = buildAddressFullAddress({
    region: address.region ?? "",
    city: address.city,
    street: address.street,
    house: address.house,
  });

  return {
    id: String(address.id),
    name: address.label,
    label: address.label,
    fullAddress,
    region: address.region ?? "",
    city: address.city,
    street: address.street,
    house: address.house,
    building: buildAddressBuildingLabel({
      house: address.house,
    }),
    postalCode: address.postal_code,
    lat: address.lat ?? null,
    lon: address.lon ?? null,
    isDefault: address.is_default,
  };
}
