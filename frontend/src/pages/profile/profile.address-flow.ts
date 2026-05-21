import {
  composeFullAddress,
  normalizeAddressDisplay,
  normalizeFreeformAddressForGeocode,
  sanitizeCityValue,
  sanitizeHouseValue,
  sanitizeRegion,
  sanitizeStreetValue,
} from "./profile.address-helpers";
import type { ProfileGeocodeResult } from "./profile.geocode";
import type { AddressFormState } from "./profile.models";

export type AddressMapSelection = {
  region: string;
  city: string;
  street: string;
  building: string;
  postalCode: string;
  fullAddress?: string;
  lat?: number | null;
  lon?: number | null;
  country?: string;
};

export type CreateAddressPayload = {
  name: string;
  region: string | null;
  city: string;
  street: string;
  house: string;
  postalCode: string;
  lat: number;
  lon: number;
  isDefault: boolean;
};

function hasValidCoordinates(
  lat: number | null | undefined,
  lon: number | null | undefined,
): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lon === "number" &&
    Number.isFinite(lon)
  );
}

export function hasConfirmedYandexHouse(addressForm: Pick<
  AddressFormState,
  "city" | "street" | "house" | "lat" | "lon" | "isYandexAddressConfirmed"
>): boolean {
  return Boolean(
    addressForm.isYandexAddressConfirmed &&
      sanitizeCityValue(addressForm.city) &&
      sanitizeStreetValue(addressForm.street) &&
      sanitizeHouseValue(addressForm.house) &&
      hasValidCoordinates(addressForm.lat, addressForm.lon),
  );
}

export function hasReadyPostalCode(
  addressForm: Pick<AddressFormState, "postalCode">,
): boolean {
  return Boolean(addressForm.postalCode.trim());
}

export function buildAddressValidationErrors(
  addressForm: AddressFormState,
): string[] {
  const errors: string[] = [];
  const name = addressForm.name.trim();
  const fullAddressInput = addressForm.fullAddress.trim();
  const isHouseConfirmed = hasConfirmedYandexHouse(addressForm);

  if (!name) {
    errors.push("Укажите название адреса.");
  }
  if (!fullAddressInput) {
    errors.push("Выберите адрес через подсказки Яндекса или на карте.");
  }
  if (!isHouseConfirmed) {
    errors.push("Подтвердите конечный адрес Яндекса с номером дома.");
    return [...new Set(errors)];
  }
  if (!hasValidCoordinates(addressForm.lat, addressForm.lon)) {
    errors.push("Яндекс не вернул координаты адреса.");
  }

  return [...new Set(errors)];
}

export function createEmptyAddressForm(): AddressFormState {
  return {
    name: "",
    fullAddress: "",
    region: "",
    city: "",
    street: "",
    house: "",
    apartment: "",
    entrance: "",
    postalCode: "",
    lat: null,
    lon: null,
    isYandexAddressConfirmed: false,
  };
}

export function mergeAddressFromMap(
  prev: AddressFormState,
  address: AddressMapSelection,
): AddressFormState {
  const nextRegion = sanitizeRegion(address.region);
  const nextCity = sanitizeCityValue(address.city);
  const nextStreet = sanitizeStreetValue(address.street);
  const nextHouse = sanitizeHouseValue(address.building);
  const nextPostalCode = address.postalCode.trim() || prev.postalCode.trim();
  const canonicalBase = normalizeAddressDisplay(
    address.fullAddress ||
      composeFullAddress({
        region: nextRegion,
        city: nextCity,
        street: nextStreet,
        house: nextHouse,
      }) ||
      prev.fullAddress,
  );
  const nextLat = typeof address.lat === "number" ? address.lat : prev.lat;
  const nextLon = typeof address.lon === "number" ? address.lon : prev.lon;
  const isConfirmed = Boolean(
    canonicalBase &&
      nextCity &&
      nextStreet &&
      nextHouse &&
      hasValidCoordinates(nextLat, nextLon),
  );

  return {
    ...prev,
    region: nextRegion,
    city: nextCity,
    street: nextStreet,
    house: nextHouse,
    postalCode: nextPostalCode,
    lat: nextLat,
    lon: nextLon,
    fullAddress: canonicalBase || prev.fullAddress,
    isYandexAddressConfirmed: isConfirmed,
  };
}

export function resolveMapCenterQuery(
  address: AddressMapSelection,
): string | null {
  const centerCandidate = normalizeAddressDisplay(
    address.fullAddress ||
      composeFullAddress({
        region: sanitizeRegion(address.region),
        city: sanitizeCityValue(address.city),
        street: sanitizeStreetValue(address.street),
        house: sanitizeHouseValue(address.building),
      }),
  );
  return centerCandidate || null;
}

export async function prepareCreateAddressPayload(params: {
  addressForm: AddressFormState;
  currentAddressCount: number;
  geocodeAddress?: (query: string) => Promise<ProfileGeocodeResult | null>;
}): Promise<
  { payload: CreateAddressPayload } | { errors: string[]; error: string }
> {
  const { addressForm, currentAddressCount, geocodeAddress } = params;
  const name = addressForm.name.trim();
  let region = sanitizeRegion(addressForm.region) || null;
  let city = sanitizeCityValue(addressForm.city);
  let street = sanitizeStreetValue(addressForm.street);
  let house = sanitizeHouseValue(addressForm.house);
  let postalCode = addressForm.postalCode.trim();
  let lat = addressForm.lat;
  let lon = addressForm.lon;

  if (geocodeAddress && !addressForm.isYandexAddressConfirmed) {
    const fullAddressInput = addressForm.fullAddress.trim();
    const geocodeSeed = fullAddressInput.includes(",")
      ? fullAddressInput
      : normalizeFreeformAddressForGeocode(fullAddressInput);
    const parsed =
      (await geocodeAddress(fullAddressInput)) ||
      (geocodeSeed !== fullAddressInput
        ? await geocodeAddress(geocodeSeed)
        : null);

    if (parsed) {
      region = sanitizeRegion(parsed.region) || null;
      city = sanitizeCityValue(parsed.city);
      street = sanitizeStreetValue(parsed.street);
      house = sanitizeHouseValue(parsed.house);
      postalCode = parsed.postalCode || postalCode;
      lat = typeof parsed.lat === "number" ? parsed.lat : lat;
      lon = typeof parsed.lon === "number" ? parsed.lon : lon;
    }
  }

  const errors = buildAddressValidationErrors({
    ...addressForm,
    region: region ?? "",
    city,
    street,
    house,
    postalCode,
    lat,
    lon,
    isYandexAddressConfirmed:
      addressForm.isYandexAddressConfirmed ||
      Boolean(
        city &&
          street &&
          house &&
          hasValidCoordinates(lat, lon),
      ),
  });

  if (errors.length > 0 || !hasValidCoordinates(lat, lon)) {
    return {
      errors,
      error: errors[0] ?? "Не удалось подготовить адрес.",
    };
  }

  const resolvedLat = lat as number;
  const resolvedLon = lon as number;

  return {
    payload: {
      name,
      region,
      city,
      street,
      house,
      postalCode,
      lat: resolvedLat,
      lon: resolvedLon,
      isDefault: currentAddressCount === 0,
    },
  };
}
