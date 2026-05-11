import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiPost } from "../../shared/lib/api";
import { notifyError, notifyInfo } from "../../shared/ui/notifications";
import {
  createEmptyAddressForm,
  mergeAddressFromMap,
  prepareCreateAddressPayload,
  resolveMapCenterQuery,
  type AddressMapSelection,
} from "./profile.address-flow";
import { useProfileAddressGeocoding } from "./profile.address-geocode.hooks";
import { createAddressInputHandlers } from "./profile.address-input.handlers";
import {
  closeAddressCreateModal as closeAddressCreateModalHandler,
  handleAddressFullAddressChange as handleAddressFullAddressChangeHandler,
  openAddressCreateModal as openAddressCreateModalHandler,
  resetAddressModalState as resetAddressModalStateHandler,
} from "./profile.address-modal.handlers";
import { geocodeAddress as geocodeProfileAddress } from "./profile.geocode";
import type {
  Address,
  AddressFormState,
  AddressSuggestionOption,
  ProfileUser,
} from "./profile.models";

export function useProfileAddresses(params: {
  addresses: Address[];
  profile: ProfileUser | null;
  loadProfile: (showGlobalLoader?: boolean) => Promise<void>;
}) {
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressFormState>(createEmptyAddressForm);
  const [addressMapHint, setAddressMapHint] = useState("");
  const [, setAddressSuggestions] = useState<AddressSuggestionOption[]>([]);
  const [, setIsAddressInputFocused] = useState(false);
  const [, setAddressSuggestionActiveIndex] = useState(-1);
  const [, setIsNativeAddressSuggestEnabled] = useState(true);
  const [mapCenterQuery, setMapCenterQuery] = useState<string | null>(null);

  const {
    geocodeAddressWithTimeout,
    applyFullAddressValueRef,
    addressInputBlurTimeoutRef,
    isSelectingAddressSuggestionRef,
    addressFullInputRef,
    nativeAddressSuggestViewRef,
  } = useProfileAddressGeocoding({
    addressModalOpen,
    fullAddress: addressForm.fullAddress,
    setAddressForm,
    setAddressMapHint,
    setAddressSuggestions,
    setIsAddressInputFocused,
    setAddressSuggestionActiveIndex,
    setIsNativeAddressSuggestEnabled,
    setMapCenterQuery,
  });

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
      addresses: params.addresses,
      profile: params.profile,
      resetAddressModalState,
      setIsNativeAddressSuggestEnabled,
      setMapCenterQuery,
      setAddressModalOpen,
    });
  }, [params.addresses, params.profile, resetAddressModalState]);

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

  const handleAddressChangeFromListings = useCallback(() => {
    openAddressCreateModal();
  }, [openAddressCreateModal]);

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

  const createAddress = useCallback(async () => {
    const prepared = await prepareCreateAddressPayload({
      addressForm,
      currentAddressCount: params.addresses.length,
      geocodeAddress: geocodeProfileAddress,
    });

    if ("error" in prepared) {
      setAddressMapHint(prepared.error);
      return;
    }

    try {
      await apiPost<Address>("/profile/addresses", prepared.payload);
      resetAddressModalState();
      setAddressModalOpen(false);
      await params.loadProfile();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось добавить адрес");
    }
  }, [addressForm, params, resetAddressModalState]);

  const deleteAddress = useCallback(async (id: string) => {
    const targetAddress = params.addresses.find((item) => item.id === id);
    if (targetAddress?.isDefault) {
      notifyInfo("Нельзя удалить адрес по умолчанию");
      return;
    }

    try {
      await apiDelete<{ success: boolean }>(`/profile/addresses/${id}`);
      await params.loadProfile();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить адрес");
    }
  }, [params]);

  const setDefaultAddress = useCallback(async (id: string) => {
    try {
      await apiPost<{ success: boolean }>(`/profile/addresses/${id}/default`);
      await params.loadProfile();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось установить адрес по умолчанию");
    }
  }, [params]);

  const handleAddressSelectFromMap = useCallback((address: AddressMapSelection) => {
    setAddressForm((prev) => mergeAddressFromMap(prev, address));
    setAddressMapHint("");
    setMapCenterQuery(resolveMapCenterQuery(address));
  }, []);

  return {
    addressForm,
    addressFullInputHandlers,
    addressFullInputRef,
    addressMapHint,
    addressModalOpen,
    mapCenterQuery,
    closeAddressCreateModal,
    createAddress,
    deleteAddress,
    handleAddressChangeFromListings,
    handleAddressSelectFromMap,
    onAddressFullAddressChange,
    openAddressCreateModal,
    setAddressForm,
    setDefaultAddress,
  };
}
