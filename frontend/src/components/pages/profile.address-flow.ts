import {
  composeFullAddress,
  extractApartmentNumber,
  extractEntranceNumber,
  normalizeAddressDisplay,
  normalizeFreeformAddressForGeocode,
  sanitizeApartmentValue,
  sanitizeCityValue,
  sanitizeEntranceValue,
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
  apartment?: string;
  entrance?: string;
};

export type CreateAddressPayload = {
  name: string;
  fullAddress: string;
  region: string;
  city: string;
  street: string;
  house: string;
  apartment: string;
  entrance: string;
  postalCode: string;
  lat: number;
  lon: number;
  isDefault: boolean;
};

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
  const nextApartment = sanitizeApartmentValue(address.apartment);
  const nextEntrance = sanitizeEntranceValue(address.entrance);
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

  return {
    ...prev,
    region: nextRegion,
    city: nextCity,
    street: nextStreet,
    house: nextHouse,
    apartment: nextApartment,
    entrance: nextEntrance,
    postalCode: address.postalCode || prev.postalCode,
    lat: typeof address.lat === "number" ? address.lat : prev.lat,
    lon: typeof address.lon === "number" ? address.lon : prev.lon,
    fullAddress: canonicalBase || prev.fullAddress,
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
  geocodeAddress: (query: string) => Promise<ProfileGeocodeResult | null>;
}): Promise<{ payload: CreateAddressPayload } | { error: string }> {
  const { addressForm, currentAddressCount, geocodeAddress } = params;
  const name = addressForm.name.trim();
  const fullAddressInput = addressForm.fullAddress.trim();

  if (!name || !fullAddressInput) {
    return {
      error: "Заполните обязательные поля: название и полный адрес.",
    };
  }

  const geocodeSeed = fullAddressInput.includes(",")
    ? fullAddressInput
    : normalizeFreeformAddressForGeocode(fullAddressInput);
  const parsed =
    (await geocodeAddress(fullAddressInput)) ||
    (geocodeSeed !== fullAddressInput
      ? await geocodeAddress(geocodeSeed)
      : null);

  if (!parsed) {
    return {
      error:
        "Не удалось определить координаты. Выберите подсказку или точку на карте.",
    };
  }

  const region = sanitizeRegion(parsed.region);
  const city = sanitizeCityValue(parsed.city);
  const street = sanitizeStreetValue(parsed.street);
  const house = sanitizeHouseValue(parsed.house);
  const apartment = sanitizeApartmentValue(
    addressForm.apartment || extractApartmentNumber(fullAddressInput),
  );
  const entrance = sanitizeEntranceValue(
    addressForm.entrance || extractEntranceNumber(fullAddressInput),
  );
  const postalCode = parsed.postalCode || addressForm.postalCode.trim();
  const lat = typeof parsed.lat === "number" ? parsed.lat : addressForm.lat;
  const lon = typeof parsed.lon === "number" ? parsed.lon : addressForm.lon;

  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    typeof lon !== "number" ||
    !Number.isFinite(lon)
  ) {
    return {
      error:
        "Не удалось определить координаты. Выберите подсказку или точку на карте.",
    };
  }

  const canonicalBase = normalizeAddressDisplay(
    parsed.formatted ||
      composeFullAddress({
        region,
        city,
        street,
        house,
      }) ||
      fullAddressInput,
  );

  return {
    payload: {
      name,
      fullAddress: canonicalBase || fullAddressInput,
      region,
      city,
      street,
      house,
      apartment,
      entrance,
      postalCode,
      lat,
      lon,
      isDefault: currentAddressCount === 0,
    },
  };
}
