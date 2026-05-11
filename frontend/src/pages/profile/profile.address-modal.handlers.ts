import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { createEmptyAddressForm } from "./profile.address-flow";
import {
  composeFullAddress,
  normalizeAddressDisplay,
  sanitizeCityValue,
  sanitizeHouseValue,
  sanitizeRegion,
  sanitizeStreetValue,
} from "./profile.address-helpers";
import type {
  Address,
  AddressFormState,
  AddressSuggestionOption,
  ProfileUser,
} from "./profile.models";

export function handleAddressFullAddressChange(params: {
  value: string;
  setAddressMapHint: (value: string) => void;
  setIsAddressInputFocused: (value: boolean) => void;
  setAddressForm: Dispatch<SetStateAction<AddressFormState>>;
}) {
  const { value, setAddressMapHint, setIsAddressInputFocused, setAddressForm } =
    params;
  setAddressMapHint("");
  setIsAddressInputFocused(true);
  setAddressForm((prev) => ({ ...prev, fullAddress: value }));
}

export function resetAddressModalState(params: {
  addressInputBlurTimeoutRef: MutableRefObject<number | null>;
  isSelectingAddressSuggestionRef: MutableRefObject<boolean>;
  setAddressMapHint: (value: string) => void;
  setAddressSuggestions: (value: AddressSuggestionOption[]) => void;
  setAddressSuggestionActiveIndex: (value: number) => void;
  setIsAddressInputFocused: (value: boolean) => void;
  setMapCenterQuery: (value: string | null) => void;
  setAddressForm: Dispatch<SetStateAction<AddressFormState>>;
}) {
  const {
    addressInputBlurTimeoutRef,
    isSelectingAddressSuggestionRef,
    setAddressMapHint,
    setAddressSuggestions,
    setAddressSuggestionActiveIndex,
    setIsAddressInputFocused,
    setMapCenterQuery,
    setAddressForm,
  } = params;

  if (addressInputBlurTimeoutRef.current) {
    window.clearTimeout(addressInputBlurTimeoutRef.current);
    addressInputBlurTimeoutRef.current = null;
  }
  isSelectingAddressSuggestionRef.current = false;
  setAddressMapHint("");
  setAddressSuggestions([]);
  setAddressSuggestionActiveIndex(-1);
  setIsAddressInputFocused(false);
  setMapCenterQuery(null);
  setAddressForm(createEmptyAddressForm());
}

export function openAddressCreateModal(params: {
  addresses: Address[];
  profile: ProfileUser | null;
  resetAddressModalState: () => void;
  setIsNativeAddressSuggestEnabled: (value: boolean) => void;
  setMapCenterQuery: (value: string | null) => void;
  setAddressModalOpen: (value: boolean) => void;
}) {
  const {
    addresses,
    profile,
    resetAddressModalState: resetModalState,
    setIsNativeAddressSuggestEnabled,
    setMapCenterQuery,
    setAddressModalOpen,
  } = params;

  resetModalState();
  setIsNativeAddressSuggestEnabled(true);
  const defaultAddress =
    addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
  const initialCenter = normalizeAddressDisplay(
    defaultAddress?.fullAddress ||
      composeFullAddress({
        region: sanitizeRegion(defaultAddress?.region || ""),
        city: sanitizeCityValue(defaultAddress?.city || profile?.city || ""),
        street: sanitizeStreetValue(defaultAddress?.street || ""),
        house: sanitizeHouseValue(defaultAddress?.house || ""),
      }) ||
      sanitizeCityValue(profile?.city || "") ||
      "Россия",
  );
  setMapCenterQuery(initialCenter || "Россия");
  setAddressModalOpen(true);
}

export function closeAddressCreateModal(params: {
  resetAddressModalState: () => void;
  setAddressModalOpen: (value: boolean) => void;
}) {
  const { resetAddressModalState: resetModalState, setAddressModalOpen } = params;
  resetModalState();
  setAddressModalOpen(false);
}
