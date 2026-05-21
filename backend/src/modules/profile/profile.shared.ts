export type AddressParts = {
  region?: string;
  city?: string;
  street?: string;
  house?: string;
};

export type ProfileAddressDto = {
  id: string;
  name: string;
  label: string;
  fullAddress: string;
  region: string;
  city: string;
  street: string;
  house: string;
  building: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
  isDefault: boolean;
};

type ProfileAddressRecord = {
  id: number;
  label: string;
  region: string | null;
  city: string;
  street: string;
  house: string;
  postal_code: string;
  lat: number | null;
  lon: number | null;
  is_default: boolean;
};

export function normalizeTextField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function buildAddressFullAddress(parts: AddressParts): string {
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

export function extractPrimaryCityFromAddresses(
  addresses: Array<{ city: string | null | undefined }>,
): string | null {
  const rawCity = addresses[0]?.city;
  if (typeof rawCity !== "string") {
    return null;
  }

  const city = rawCity.trim();
  return city || null;
}
