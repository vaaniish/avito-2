import { useCallback, useEffect, useRef } from "react";
import { RUSSIA_BOUNDS, YANDEX_GEOSUGGEST_API_KEY } from "./profile.address-utils";
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
import { mountNativeAddressSuggest } from "./profile.address-suggest";
import { scheduleAddressAutofill } from "./profile.address-autofill";
import { geocodeAddress as geocodeProfileAddress, type ProfileGeocodeResult } from "./profile.geocode";
import type { AddressFormState, AddressSuggestionOption } from "./profile.models";

export function useProfileAddressGeocoding(params: {
  addressModalOpen: boolean;
  fullAddress: string;
  setAddressForm: React.Dispatch<React.SetStateAction<AddressFormState>>;
  setAddressMapHint: React.Dispatch<React.SetStateAction<string>>;
  setAddressSuggestions: React.Dispatch<React.SetStateAction<AddressSuggestionOption[]>>;
  setIsAddressInputFocused: React.Dispatch<React.SetStateAction<boolean>>;
  setAddressSuggestionActiveIndex: React.Dispatch<React.SetStateAction<number>>;
  setIsNativeAddressSuggestEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  setMapCenterQuery: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const addressInputBlurTimeoutRef = useRef<number | null>(null);
  const isSelectingAddressSuggestionRef = useRef(false);
  const addressFullInputRef = useRef<HTMLInputElement | null>(null);
  const nativeAddressSuggestViewRef = useRef<any>(null);
  const applyFullAddressValueRef = useRef<(value: string) => Promise<void>>(async () => {});

  const geocodeAddressWithTimeout = useCallback(async (query: string, timeoutMs = 900) => {
    let timeoutId = 0;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
    });
    const result = await Promise.race([geocodeProfileAddress(query), timeoutPromise]);
    if (timeoutId) window.clearTimeout(timeoutId);
    return result as ProfileGeocodeResult | null;
  }, []);

  const applyFullAddressValue = useCallback(async (inputValue: string) => {
    const rawInput = inputValue.trim();
    if (!rawInput) return;
    const geocodeSeed = rawInput.includes(",") ? rawInput : normalizeFreeformAddressForGeocode(rawInput);
    const parsed =
      (await geocodeAddressWithTimeout(rawInput, 900)) ||
      (geocodeSeed !== rawInput ? await geocodeAddressWithTimeout(geocodeSeed, 900) : null);

    if (!parsed) {
      params.setAddressForm((prev) => ({ ...prev, fullAddress: normalizeAddressDisplay(rawInput) }));
      params.setAddressMapHint("Не удалось определить координаты. Выберите подсказку или точку на карте.");
      return;
    }

    const apartmentFromInput = sanitizeApartmentValue(extractApartmentNumber(rawInput));
    const entranceFromInput = sanitizeEntranceValue(extractEntranceNumber(rawInput));
    let nextCenterQuery: string | null = null;

    params.setAddressForm((prev) => {
      const region = sanitizeRegion(parsed.region);
      const city = sanitizeCityValue(parsed.city);
      const street = sanitizeStreetValue(parsed.street);
      const house = sanitizeHouseValue(parsed.house);
      const canonicalBase = normalizeAddressDisplay(
        parsed.formatted ||
          composeFullAddress({ region, city, street, house }) ||
          rawInput,
      );
      nextCenterQuery = canonicalBase || null;
      return {
        ...prev,
        fullAddress: canonicalBase || rawInput,
        region,
        city,
        street,
        house,
        apartment: apartmentFromInput,
        entrance: entranceFromInput,
        postalCode: parsed.postalCode || "",
        lat: typeof parsed.lat === "number" ? parsed.lat : prev.lat,
        lon: typeof parsed.lon === "number" ? parsed.lon : prev.lon,
      };
    });

    params.setAddressMapHint("");
    params.setMapCenterQuery(nextCenterQuery);
  }, [geocodeAddressWithTimeout, params]);

  useEffect(() => {
    applyFullAddressValueRef.current = applyFullAddressValue;
  }, [applyFullAddressValue]);

  useEffect(() => {
    if (!params.addressModalOpen) return;
    return mountNativeAddressSuggest({
      addressInputRef: addressFullInputRef,
      suggestViewRef: nativeAddressSuggestViewRef,
      geosuggestApiKey: YANDEX_GEOSUGGEST_API_KEY,
      bounds: RUSSIA_BOUNDS,
      onSuggestEnabled: params.setIsNativeAddressSuggestEnabled,
      onSelectValue: async (selectedValue) => {
        if (addressInputBlurTimeoutRef.current) {
          window.clearTimeout(addressInputBlurTimeoutRef.current);
          addressInputBlurTimeoutRef.current = null;
        }
        isSelectingAddressSuggestionRef.current = false;
        params.setAddressForm((prev) => ({ ...prev, fullAddress: selectedValue }));
        params.setAddressSuggestions([]);
        params.setAddressSuggestionActiveIndex(-1);
        await applyFullAddressValueRef.current(selectedValue);
        params.setIsAddressInputFocused(true);
      },
    });
  }, [params, applyFullAddressValueRef]);

  useEffect(() => {
    if (!params.addressModalOpen) return;
    return scheduleAddressAutofill({
      fullAddress: params.fullAddress,
      geocodeAddressWithTimeout,
      setAddressForm: params.setAddressForm,
    });
  }, [geocodeAddressWithTimeout, params]);

  return {
    geocodeAddressWithTimeout,
    applyFullAddressValueRef,
    addressInputBlurTimeoutRef,
    isSelectingAddressSuggestionRef,
    addressFullInputRef,
    nativeAddressSuggestViewRef,
  };
}
