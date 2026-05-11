import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createProfileAddress, fetchProfileAddresses } from "./partner-listings.api";
import type { FormState, ProfileAddressDto } from "./partner-listings.types";
import { normalizeProfileAddresses } from "./partner-listings.utils";
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
} from "../profile/profile.address-helpers";
import { scheduleAddressAutofill } from "../profile/profile.address-autofill";
import {
  createEmptyAddressForm,
  mergeAddressFromMap,
  prepareCreateAddressPayload,
  resolveMapCenterQuery,
  type AddressMapSelection,
} from "../profile/profile.address-flow";
import { createAddressInputHandlers } from "../profile/profile.address-input.handlers";
import {
  closeAddressCreateModal as closeAddressCreateModalHandler,
  handleAddressFullAddressChange as handleAddressFullAddressChangeHandler,
  openAddressCreateModal as openAddressCreateModalHandler,
  resetAddressModalState as resetAddressModalStateHandler,
} from "../profile/profile.address-modal.handlers";
import { mountNativeAddressSuggest } from "../profile/profile.address-suggest";
import { RUSSIA_BOUNDS, YANDEX_GEOSUGGEST_API_KEY } from "../profile/profile.address-utils";
import { geocodeAddress as geocodeProfileAddress } from "../profile/profile.geocode";
import type { AddressFormState, AddressSuggestionOption } from "../profile/profile.models";

export function usePartnerListingAddressFlow({
  isCreateOpen,
  setForm,
  showNotice,
}: {
  isCreateOpen: boolean;
  setForm: Dispatch<SetStateAction<FormState>>;
  showNotice: (message: string, tone?: "success" | "error" | "info") => void;
}) {
  const [profileAddresses, setProfileAddresses] = useState<ProfileAddressDto[]>([]);
  const [addressBook, setAddressBook] = useState<string[]>([]);
  const [defaultProfileAddress, setDefaultProfileAddress] =
    useState<ProfileAddressDto | null>(null);
  const [selectedMeetingAddressId, setSelectedMeetingAddressId] =
    useState<string>("");
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] =
    useState<AddressFormState>(createEmptyAddressForm);
  const [addressMapHint, setAddressMapHint] = useState("");
  const [, setAddressSuggestions] = useState<AddressSuggestionOption[]>([]);
  const [, setIsAddressInputFocused] = useState(false);
  const [, setAddressSuggestionActiveIndex] = useState(-1);
  const [, setIsNativeAddressSuggestEnabled] = useState(true);
  const [mapCenterQuery, setMapCenterQuery] = useState<string | null>(null);
  const addressInputBlurTimeoutRef = useRef<number | null>(null);
  const isSelectingAddressSuggestionRef = useRef(false);
  const addressFullInputRef = useRef<HTMLInputElement | null>(null);
  const nativeAddressSuggestViewRef = useRef<any>(null);
  const applyFullAddressValueRef = useRef<(value: string) => Promise<void>>(
    async () => {},
  );

  const loadProfileAddresses = useCallback(async () => {
    try {
      const addressesData = await fetchProfileAddresses();
      const normalizedAddresses = normalizeProfileAddresses(addressesData);
      const defaultAddress =
        normalizedAddresses.find((address) => address.isDefault) ??
        normalizedAddresses[0] ??
        null;

      setProfileAddresses(normalizedAddresses);
      setAddressBook(
        Array.from(
          new Set(normalizedAddresses.map((address) => address.fullAddress)),
        ),
      );
      setDefaultProfileAddress(defaultAddress);
      setSelectedMeetingAddressId((currentId) => {
        if (
          currentId &&
          normalizedAddresses.some((address) => address.id === currentId)
        ) {
          return currentId;
        }
        return defaultAddress?.id ?? "";
      });
      return normalizedAddresses;
    } catch {
      setProfileAddresses([]);
      setAddressBook([]);
      setDefaultProfileAddress(null);
      setSelectedMeetingAddressId("");
      return [];
    }
  }, []);

  useEffect(() => {
    void loadProfileAddresses();
  }, [loadProfileAddresses]);

  useEffect(() => {
    if (!isCreateOpen) return;
    const defaultAddressValue = defaultProfileAddress?.fullAddress?.trim();
    if (!defaultAddressValue) return;
    setSelectedMeetingAddressId(
      (currentId) => currentId || defaultProfileAddress?.id || "",
    );
    setForm((prev) => {
      if (prev.meetingAddress.trim()) return prev;
      return { ...prev, meetingAddress: defaultAddressValue };
    });
  }, [defaultProfileAddress, isCreateOpen, setForm]);

  const selectMeetingAddress = useCallback(
    (address: ProfileAddressDto) => {
      setSelectedMeetingAddressId(address.id);
      setForm((prev) => ({
        ...prev,
        meetingAddress: address.fullAddress.trim(),
      }));
    },
    [setForm],
  );

  const geocodeAddressWithTimeout = useCallback(
    async (query: string, timeoutMs = 900) => {
      let timeoutId = 0;
      const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
      });

      const result = await Promise.race([
        geocodeProfileAddress(query),
        timeoutPromise,
      ]);

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }

      return result;
    },
    [],
  );

  const applyFullAddressValue = useCallback(
    async (inputValue: string) => {
      const rawInput = inputValue.trim();
      if (!rawInput) return;

      const geocodeSeed = rawInput.includes(",")
        ? rawInput
        : normalizeFreeformAddressForGeocode(rawInput);
      const parsed =
        (await geocodeAddressWithTimeout(rawInput, 900)) ||
        (geocodeSeed !== rawInput
          ? await geocodeAddressWithTimeout(geocodeSeed, 900)
          : null);

      if (!parsed) {
        setAddressForm((prev) => ({
          ...prev,
          fullAddress: normalizeAddressDisplay(rawInput),
        }));
        setAddressMapHint(
          "Не удалось определить координаты. Выберите подсказку или точку на карте.",
        );
        return;
      }

      const apartmentFromInput = sanitizeApartmentValue(
        extractApartmentNumber(rawInput),
      );
      const entranceFromInput = sanitizeEntranceValue(
        extractEntranceNumber(rawInput),
      );

      let nextCenterQuery: string | null = null;
      setAddressForm((prev) => {
        const region = sanitizeRegion(parsed.region);
        const city = sanitizeCityValue(parsed.city);
        const street = sanitizeStreetValue(parsed.street);
        const house = sanitizeHouseValue(parsed.house);
        const canonicalBase = normalizeAddressDisplay(
          parsed.formatted ||
            composeFullAddress({
              region,
              city,
              street,
              house,
            }) ||
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

      setAddressMapHint("");
      setMapCenterQuery(nextCenterQuery);
    },
    [geocodeAddressWithTimeout],
  );

  useEffect(() => {
    applyFullAddressValueRef.current = applyFullAddressValue;
  }, [applyFullAddressValue]);

  useEffect(() => {
    if (!addressModalOpen) return;
    return mountNativeAddressSuggest({
      addressInputRef: addressFullInputRef,
      suggestViewRef: nativeAddressSuggestViewRef,
      geosuggestApiKey: YANDEX_GEOSUGGEST_API_KEY,
      bounds: RUSSIA_BOUNDS,
      onSuggestEnabled: setIsNativeAddressSuggestEnabled,
      onSelectValue: async (selectedValue) => {
        if (addressInputBlurTimeoutRef.current) {
          window.clearTimeout(addressInputBlurTimeoutRef.current);
          addressInputBlurTimeoutRef.current = null;
        }
        isSelectingAddressSuggestionRef.current = false;
        setAddressForm((prev) => ({ ...prev, fullAddress: selectedValue }));
        setAddressSuggestions([]);
        setAddressSuggestionActiveIndex(-1);
        await applyFullAddressValueRef.current(selectedValue);
        setIsAddressInputFocused(true);
      },
    });
  }, [addressModalOpen]);

  useEffect(() => {
    if (!addressModalOpen) return;
    return scheduleAddressAutofill({
      fullAddress: addressForm.fullAddress,
      geocodeAddressWithTimeout,
      setAddressForm,
    });
  }, [addressModalOpen, addressForm.fullAddress, geocodeAddressWithTimeout]);

  const resetAddressModalState = useCallback(() => {
    resetAddressModalStateHandler({
      addressInputBlurTimeoutRef,
      isSelectingAddressSuggestionRef,
      setAddressMapHint,
      setAddressSuggestions,
      setAddressSuggestionActiveIndex,
      setIsAddressInputFocused,
      setMapCenterQuery,
      setAddressForm,
    });
  }, []);

  const openAddressCreateModal = useCallback(() => {
    openAddressCreateModalHandler({
      addresses: profileAddresses,
      profile: null,
      resetAddressModalState,
      setIsNativeAddressSuggestEnabled,
      setMapCenterQuery,
      setAddressModalOpen,
    });
  }, [profileAddresses, resetAddressModalState]);

  const closeAddressCreateModal = useCallback(() => {
    closeAddressCreateModalHandler({
      resetAddressModalState,
      setAddressModalOpen,
    });
  }, [resetAddressModalState]);

  const onAddressFullAddressChange = useCallback((value: string) => {
    handleAddressFullAddressChangeHandler({
      value,
      setAddressMapHint,
      setIsAddressInputFocused,
      setAddressForm,
    });
  }, []);

  const addressFullInputHandlers = useMemo(
    () =>
      createAddressInputHandlers({
        fullAddress: addressForm.fullAddress,
        addressInputBlurTimeoutRef,
        isSelectingAddressSuggestionRef,
        applyFullAddressValueRef,
        setAddressMapHint,
        setIsAddressInputFocused,
        setAddressSuggestionActiveIndex,
        setAddressSuggestions,
      }),
    [addressForm.fullAddress],
  );

  const handleAddressSelectFromMap = useCallback(
    (address: AddressMapSelection) => {
      setAddressForm((prev) => mergeAddressFromMap(prev, address));
      setAddressMapHint("");
      setMapCenterQuery(resolveMapCenterQuery(address));
    },
    [],
  );

  const createAddress = useCallback(async () => {
    const prepared = await prepareCreateAddressPayload({
      addressForm,
      currentAddressCount: profileAddresses.length,
      geocodeAddress: geocodeProfileAddress,
    });

    if ("error" in prepared) {
      setAddressMapHint(prepared.error);
      return;
    }

    try {
      const created = await createProfileAddress(prepared.payload);
      resetAddressModalState();
      setAddressModalOpen(false);

      const refreshedAddresses = await loadProfileAddresses();
      const selectedAddress =
        refreshedAddresses.find((address) => address.id === created.id) ??
        normalizeProfileAddresses([created])[0] ??
        null;
      if (selectedAddress) {
        selectMeetingAddress(selectedAddress);
      }
      showNotice("Адрес самовывоза добавлен", "success");
    } catch (error) {
      setAddressMapHint(
        error instanceof Error ? error.message : "Не удалось добавить адрес",
      );
    }
  }, [
    addressForm,
    loadProfileAddresses,
    profileAddresses.length,
    resetAddressModalState,
    selectMeetingAddress,
    showNotice,
  ]);

  return {
    profileAddresses,
    addressBook,
    defaultProfileAddress,
    selectedMeetingAddressId,
    setSelectedMeetingAddressId,
    addressModalOpen,
    addressForm,
    setAddressForm,
    addressMapHint,
    mapCenterQuery,
    addressFullInputRef,
    selectMeetingAddress,
    openAddressCreateModal,
    closeAddressCreateModal,
    onAddressFullAddressChange,
    addressFullInputHandlers,
    handleAddressSelectFromMap,
    createAddress,
  };
}
