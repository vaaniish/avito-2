import { type UserAddress } from "@prisma/client";

export type LegacyBuildingParts = {
  house: string;
  apartment: string;
  entrance: string;
};

export type AddressParts = {
  region?: string;
  city?: string;
  street?: string;
  house?: string;
  apartment?: string;
  entrance?: string;
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
  apartment: string;
  entrance: string;
  building: string;
  postalCode: string;
  lat: number | null;
  lon: number | null;
  isDefault: boolean;
};

export function normalizeTextField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseLegacyBuilding(value: string): LegacyBuildingParts {
  const raw = value.trim();
  if (!raw) {
    return {
      house: "",
      apartment: "",
      entrance: "",
    };
  }

  const houseMatch = raw.match(/(?:^|,\s*)(?:\u0434(?:\u043e\u043c)?\.?)\s*([^,]+)/iu);
  const apartmentMatch = raw.match(
    /(?:^|,\s*)(?:\u043a\u0432(?:\u0430\u0440\u0442\u0438\u0440\u0430)?\.?)\s*([^,]+)/iu,
  );
  const entranceMatch = raw.match(
    /(?:^|,\s*)(?:\u043f\u043e\u0434[\u044a\u044c]?\u0435\u0437\u0434)\s*([^,]+)/iu,
  );

  const fallbackHouse = raw.split(",")[0]?.trim() ?? "";
  return {
    house: (houseMatch?.[1] ?? fallbackHouse).trim(),
    apartment: (apartmentMatch?.[1] ?? "").trim(),
    entrance: (entranceMatch?.[1] ?? "").trim(),
  };
}

export function buildAddressFullAddress(parts: AddressParts): string {
  const region = normalizeTextField(parts.region);
  const city = normalizeTextField(parts.city);
  const street = normalizeTextField(parts.street);
  const house = normalizeTextField(parts.house);
  const apartment = normalizeTextField(parts.apartment);
  const entrance = normalizeTextField(parts.entrance);

  const housePart = house ? `\u0434. ${house}` : "";
  const entrancePart = entrance ? `\u043f\u043e\u0434\u044a\u0435\u0437\u0434 ${entrance}` : "";
  const apartmentPart = apartment ? `\u043a\u0432. ${apartment}` : "";

  return [region, city, street, housePart, entrancePart, apartmentPart]
    .filter(Boolean)
    .join(", ");
}

function buildAddressBuildingLabel(parts: {
  house?: string;
  apartment?: string;
  entrance?: string;
}): string {
  const house = normalizeTextField(parts.house);
  const apartment = normalizeTextField(parts.apartment);
  const entrance = normalizeTextField(parts.entrance);

  return [
    house ? `\u0434. ${house}` : "",
    entrance ? `\u043f\u043e\u0434\u044a\u0435\u0437\u0434 ${entrance}` : "",
    apartment ? `\u043a\u0432. ${apartment}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

export function mapUserAddressToDto(address: UserAddress): ProfileAddressDto {
  const fullAddress =
    normalizeTextField(address.full_address) ||
    buildAddressFullAddress({
      region: address.region,
      city: address.city,
      street: address.street,
      house: address.house,
      apartment: address.apartment ?? "",
      entrance: address.entrance ?? "",
    });

  return {
    id: String(address.id),
    name: address.label,
    label: address.label,
    fullAddress,
    region: address.region,
    city: address.city,
    street: address.street,
    house: address.house,
    apartment: address.apartment ?? "",
    entrance: address.entrance ?? "",
    building: buildAddressBuildingLabel({
      house: address.house,
      apartment: address.apartment ?? "",
      entrance: address.entrance ?? "",
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
