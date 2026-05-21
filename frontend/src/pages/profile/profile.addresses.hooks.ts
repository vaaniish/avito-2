import { useCallback, useMemo, useState } from "react";
import { apiDelete, apiPost } from "../../shared/lib/api";
import { notifyError, notifyInfo } from "../../shared/ui/notifications";
import {
  hasConfirmedYandexHouse,
  hasReadyPostalCode,
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
import {
  sanitizeCityValue,
  sanitizeHouseValue,
  sanitizeStreetValue,
} from "./profile.address-helpers";
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
  const [addressValidationErrors, setAddressValidationErrors] = useState<string[]>([]);
  const [, setAddressSuggestions] = useState<AddressSuggestionOption[]>([]);
  const [, setIsAddressInputFocused] = useState(false);
  const [, setAddressSuggestionActiveIndex] = useState(-1);
  const [, setIsNativeAddressSuggestEnabled] = useState(true);
  const [mapCenterQuery, setMapCenterQuery] = useState<string | null>(null);

  const {
    addressInputBlurTimeoutRef,
    isSelectingAddressSuggestionRef,
    addressFullInputRef,
  } = useProfileAddressGeocoding({
    addressModalOpen,
    setAddressForm,
    setAddressValidationErrors,
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
      setAddressValidationErrors,
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
      setAddressValidationErrors,
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
    });

    if ("errors" in prepared) {
      setAddressValidationErrors(prepared.errors);
      setAddressMapHint(
        hasConfirmedYandexHouse(addressForm)
          ? ""
          : "Выберите конечный адрес Яндекса с номером дома.",
      );
      return;
    }

    try {
      setAddressValidationErrors([]);
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
    const hasExactHouse = Boolean(
      sanitizeCityValue(address.city) &&
        sanitizeStreetValue(address.street) &&
        sanitizeHouseValue(address.building) &&
        typeof address.lat === "number" &&
        Number.isFinite(address.lat) &&
        typeof address.lon === "number" &&
        Number.isFinite(address.lon),
    );
    const nextAddressForm = mergeAddressFromMap(createEmptyAddressForm(), address);
    setAddressValidationErrors([]);
    setAddressForm((prev) => ({
      ...prev,
      ...nextAddressForm,
      name: prev.name,
      fullAddress: nextAddressForm.fullAddress || prev.fullAddress,
    }));
    setAddressMapHint(
      hasExactHouse
        ? hasReadyPostalCode({
            postalCode: address.postalCode,
          })
          ? ""
          : "Яндекс не вернул почтовый индекс для этого дома. Это не мешает сохранению адреса."
        : "Выберите на карте точный дом, а не только улицу или район.",
    );
    setMapCenterQuery(resolveMapCenterQuery(address));
  }, []);

  return {
    addressForm,
    addressFullInputHandlers,
    addressFullInputRef,
    addressMapHint,
    addressValidationErrors,
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
