import type { Dispatch, SetStateAction } from "react";
import {
  composeFullAddress,
  normalizeFreeformAddressForGeocode,
  sanitizeCityValue,
  sanitizeHouseValue,
  sanitizeRegion,
  sanitizeStreetValue,
} from "./profile.address-helpers";
import type { ProfileGeocodeResult } from "./profile.geocode";
import type { AddressFormState } from "./profile.models";

type AddressAutofillParams = {
  fullAddress: string;
  geocodeAddressWithTimeout: (
    query: string,
    timeoutMs?: number,
  ) => Promise<ProfileGeocodeResult | null>;
  setAddressForm: Dispatch<SetStateAction<AddressFormState>>;
};

export function scheduleAddressAutofill({
  fullAddress,
  geocodeAddressWithTimeout,
  setAddressForm,
}: AddressAutofillParams): (() => void) | void {
  const rawAddress = fullAddress.trim();
  if (rawAddress.length < 6) return;

  const numberMatches = rawAddress.match(/\b\d{1,4}[a-zа-я/-]?\b/giu) ?? [];
  const hasHouseLikeInput =
    /(?:дом|д\.?)\s*[0-9a-zа-я/-]+/iu.test(rawAddress) ||
    (numberMatches.length >= 1 &&
      rawAddress.split(/\s+/).filter(Boolean).length >= 3);
  if (!hasHouseLikeInput) return;

  let cancelled = false;
  const timer = window.setTimeout(async () => {
    const geocodeQuery = rawAddress.includes(",")
      ? rawAddress
      : normalizeFreeformAddressForGeocode(rawAddress);

    const parsed = await geocodeAddressWithTimeout(geocodeQuery, 900);
    if (cancelled || !parsed) return;

    let nextPostalCode = parsed.postalCode || "";
    let nextLat = typeof parsed.lat === "number" ? parsed.lat : null;
    let nextLon = typeof parsed.lon === "number" ? parsed.lon : null;

    if (!nextPostalCode) {
      const houseOnlyAddress = composeFullAddress({
        region: sanitizeRegion(parsed.region),
        city: sanitizeCityValue(parsed.city),
        street: sanitizeStreetValue(parsed.street),
        house: sanitizeHouseValue(parsed.house),
      });
      if (houseOnlyAddress) {
        const houseOnlyParsed = await geocodeAddressWithTimeout(houseOnlyAddress, 700);
        if (!cancelled && houseOnlyParsed) {
          nextPostalCode = houseOnlyParsed.postalCode || nextPostalCode;
          nextLat =
            typeof houseOnlyParsed.lat === "number" ? houseOnlyParsed.lat : nextLat;
          nextLon =
            typeof houseOnlyParsed.lon === "number" ? houseOnlyParsed.lon : nextLon;
        }
      }
    }

    setAddressForm((prev) => {
      if (prev.fullAddress.trim() !== rawAddress) return prev;

      const nextRegion = sanitizeRegion(parsed.region) || prev.region;
      const nextCity = sanitizeCityValue(parsed.city) || prev.city;
      const nextStreet = sanitizeStreetValue(parsed.street) || prev.street;
      const nextHouse = sanitizeHouseValue(parsed.house) || prev.house;
      const nextPostal = nextPostalCode || prev.postalCode;
      const resolvedLat = typeof nextLat === "number" ? nextLat : prev.lat;
      const resolvedLon = typeof nextLon === "number" ? nextLon : prev.lon;

      if (
        nextRegion === prev.region &&
        nextCity === prev.city &&
        nextStreet === prev.street &&
        nextHouse === prev.house &&
        nextPostal === prev.postalCode &&
        resolvedLat === prev.lat &&
        resolvedLon === prev.lon
      ) {
        return prev;
      }

      return {
        ...prev,
        region: nextRegion,
        city: nextCity,
        street: nextStreet,
        house: nextHouse,
        postalCode: nextPostal,
        lat: resolvedLat,
        lon: resolvedLon,
      };
    });
  }, 550);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
