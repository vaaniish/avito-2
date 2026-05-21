import { useCallback, useEffect, useRef } from "react";
import { RUSSIA_BOUNDS, YANDEX_GEOSUGGEST_API_KEY } from "./profile.address-utils";
import {
  composeFullAddress,
  normalizeAddressDisplay,
  normalizeFreeformAddressForGeocode,
  sanitizeCityValue,
  sanitizeHouseValue,
  sanitizeRegion,
  sanitizeStreetValue,
} from "./profile.address-helpers";
import { hasReadyPostalCode } from "./profile.address-flow";
import {
  mountNativeAddressSuggest,
  type NativeAddressSuggestOption,
} from "./profile.address-suggest";
import { geocodeAddress as geocodeProfileAddress, type ProfileGeocodeResult } from "./profile.geocode";
import type { AddressFormState, AddressSuggestionOption } from "./profile.models";

export function useProfileAddressGeocoding(params: {
  addressModalOpen: boolean;
  setAddressForm: React.Dispatch<React.SetStateAction<AddressFormState>>;
  setAddressValidationErrors: React.Dispatch<React.SetStateAction<string[]>>;
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

    if (
      !parsed ||
      !sanitizeCityValue(parsed.city) ||
      !sanitizeStreetValue(parsed.street) ||
      !sanitizeHouseValue(parsed.house) ||
      typeof parsed.lat !== "number" ||
      !Number.isFinite(parsed.lat) ||
      typeof parsed.lon !== "number" ||
      !Number.isFinite(parsed.lon)
    ) {
      params.setAddressValidationErrors([]);
      params.setAddressForm((prev) => ({
        ...prev,
        fullAddress: normalizeAddressDisplay(rawInput),
        region: "",
        city: "",
        street: "",
        house: "",
        postalCode: "",
        lat: null,
        lon: null,
        isYandexAddressConfirmed: false,
      }));
      params.setAddressMapHint(
        "Выберите конечный адрес Яндекса с номером дома.",
      );
      return;
    }

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
      const nextState: AddressFormState = {
        ...prev,
        fullAddress: canonicalBase || rawInput,
        region,
        city,
        street,
        house,
        postalCode: parsed.postalCode || "",
        lat: typeof parsed.lat === "number" ? parsed.lat : prev.lat,
        lon: typeof parsed.lon === "number" ? parsed.lon : prev.lon,
        isYandexAddressConfirmed: true,
      };
      return nextState;
    });

    params.setAddressMapHint(
      hasReadyPostalCode({
        postalCode: parsed.postalCode || "",
      })
        ? ""
        : "Яндекс не вернул почтовый индекс для этого дома. Это не мешает сохранению адреса.",
    );
    params.setAddressValidationErrors([]);
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
      suggestTypes: "geo",
      onlyHouseGeoResults: true,
      onSuggestEnabled: params.setIsNativeAddressSuggestEnabled,
      onSelectValue: async (
        selectedValue,
        option?: NativeAddressSuggestOption,
      ) => {
        if (addressInputBlurTimeoutRef.current) {
          window.clearTimeout(addressInputBlurTimeoutRef.current);
          addressInputBlurTimeoutRef.current = null;
        }
        isSelectingAddressSuggestionRef.current = false;
        if (option && !option.isHouseResult) {
          params.setAddressMapHint(
            "Выберите конечный адрес Яндекса с номером дома.",
          );
          params.setIsAddressInputFocused(true);
          return;
        }
        params.setAddressForm((prev) => ({ ...prev, fullAddress: selectedValue }));
        params.setAddressSuggestions([]);
        params.setAddressSuggestionActiveIndex(-1);
        await applyFullAddressValueRef.current(selectedValue);
        params.setIsAddressInputFocused(true);
      },
    });
  }, [params, applyFullAddressValueRef]);

  return {
    applyFullAddressValueRef,
    addressInputBlurTimeoutRef,
    isSelectingAddressSuggestionRef,
    addressFullInputRef,
  };
}
