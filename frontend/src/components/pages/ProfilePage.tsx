import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "../../lib/api";
import { notifyError, notifyInfo, notifySuccess } from "../ui/notifications";
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
import {
  createEmptyAddressForm,
  mergeAddressFromMap,
  prepareCreateAddressPayload,
  resolveMapCenterQuery,
  type AddressMapSelection,
} from "./profile.address-flow";
import { createAddressInputHandlers } from "./profile.address-input.handlers";
import {
  closeAddressCreateModal as closeAddressCreateModalHandler,
  handleAddressFullAddressChange as handleAddressFullAddressChangeHandler,
  openAddressCreateModal as openAddressCreateModalHandler,
  resetAddressModalState as resetAddressModalStateHandler,
} from "./profile.address-modal.handlers";
import { scheduleAddressAutofill } from "./profile.address-autofill";
import { mountNativeAddressSuggest } from "./profile.address-suggest";
import { geocodeAddress as geocodeProfileAddress } from "./profile.geocode";
import { partnerBaseTabs, partnerTabs, regularTabs } from "./profile.tabs";
import { ProfileAddressesTab } from "./profile.addresses-tab";
import { ProfileHeader } from "./profile.header";
import { ProfileSidebar } from "./profile.sidebar";
import { ProfileSettingsTab } from "./profile.settings-tab";
import { ProfileTabRouter } from "./profile.tab-router";
import {
  ProfileOrdersTab,
  ProfilePartnershipTab,
  ProfileWishlistTab,
} from "./profile.tab-panels";
import type {
  Address,
  AddressFormState,
  AddressSuggestionOption,
  Order,
  OrderItem,
  PartnershipForm,
  ProfileFormState,
  ProfilePageProps,
  ProfilePayload,
  ProfileUpdateResponse,
  ProfileTab,
  ProfileUser,
  WishlistItem,
} from "./profile.models";

type PartnershipPolicy = {
  id: string;
  title: string;
  version: string;
  contentUrl: string;
};

export function ProfilePage({
  onBack,
  onLogout,
  userType,
  initialTab,
  onTabChange,
  onWishlistUpdate,
  onOpenListing,
}: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab ?? "profile");
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItem[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

  const [profileForm, setProfileForm] = useState<ProfileFormState>({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    oldPassword: "",
    newPassword: "",
  });

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressFormState>(createEmptyAddressForm);
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
  const applyFullAddressValueRef = useRef<(value: string) => Promise<void>>(async () => {});

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [itemToReview, setItemToReview] = useState<OrderItem | null>(null);
  const [reviewForm, setReviewForm] = useState({ rating: 0, comment: "" });

  const [partnershipForm, setPartnershipForm] = useState<PartnershipForm>({
    sellerType: "company",
    name: "",
    email: "",
    contact: "",
    link: "",
    category: "",
    inn: "",
    geography: "",
    socialProfile: "",
    credibility: "",
    whyUs: "",
  });
  const [partnershipPolicy, setPartnershipPolicy] = useState<PartnershipPolicy>({
    id: "",
    title: "правила партнерства и безопасной сделки",
    version: "",
    contentUrl: "/terms",
  });
  const [partnershipPolicyAccepted, setPartnershipPolicyAccepted] = useState(false);

  const handleOpenListing = useCallback(
    (listingPublicId: string) => {
      const normalizedListingId = listingPublicId.trim();
      if (!normalizedListingId) return;
      if (onOpenListing) {
        onOpenListing(normalizedListingId);
        return;
      }
      window.location.assign(`/products/${encodeURIComponent(normalizedListingId)}`);
    },
    [onOpenListing],
  );

  const tabs = useMemo(
    () => (userType === "partner" ? [...partnerBaseTabs, ...partnerTabs] : regularTabs),
    [userType],
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(userType === "partner" ? "partner-listings" : "profile");
    }
  }, [activeTab, tabs, userType]);

  useEffect(() => {
    if (!initialTab) return;
    setActiveTab((prev) => (prev === initialTab ? prev : initialTab));
  }, [initialTab]);

  useEffect(() => {
    onTabChange?.(activeTab);
  }, [activeTab, onTabChange]);

  useEffect(() => {
    let cancelled = false;
    const loadPartnershipPolicy = async () => {
      try {
        const policy = await apiGet<{
          id: string;
          title: string;
          version: string;
          contentUrl: string;
        }>("/public/policy/current?scope=partnership");
        if (cancelled) return;
        if (
          typeof policy.id === "string" &&
          typeof policy.title === "string" &&
          typeof policy.contentUrl === "string"
        ) {
          setPartnershipPolicy({
            id: policy.id,
            title: policy.title,
            version: typeof policy.version === "string" ? policy.version : "",
            contentUrl: policy.contentUrl,
          });
        }
      } catch {
        // keep fallback
      }
    };
    void loadPartnershipPolicy();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadProfile = useCallback(async (showGlobalLoader = false) => {
    if (showGlobalLoader) {
      setIsLoading(true);
    }
    try {
      const data = await apiGet<ProfilePayload>("/profile/me");
      setProfile(data.user);
      setAddresses(data.addresses);
      setOrders(data.orders);
      setWishlistItems(data.wishlist);
      setProfileForm({
        firstName: data.user.firstName || "",
        lastName: data.user.lastName || "",
        displayName: data.user.displayName || data.user.name || "",
        email: data.user.email,
        oldPassword: "",
        newPassword: "",
      });
      setPartnershipForm((prev) => ({
        ...prev,
        name: data.user.displayName || data.user.name,
        email: data.user.email,
      }));
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось загрузить профиль");
    } finally {
      if (showGlobalLoader) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadProfile(true);
  }, [loadProfile]);

  const handlePostReview = async () => {
    if (!itemToReview) return;
    if (reviewForm.rating === 0) {
      notifyInfo("Пожалуйста, поставьте оценку.");
      return;
    }
    if (reviewForm.comment.trim().length < 3) {
      notifyInfo("Комментарий слишком короткий.");
      return;
    }

    try {
      await apiPost(`/profile/listings/${itemToReview.listingPublicId}/review`, {
        rating: reviewForm.rating,
        comment: reviewForm.comment,
      });
      notifySuccess("Спасибо за ваш отзыв!");
      setReviewModalOpen(false);
      setItemToReview(null);
      setReviewForm({ rating: 0, comment: "" });
      // Optionally, refetch orders or update state to show "review submitted"
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить отзыв.");
    }
  };

  const saveProfile = async () => {
    setSaveLoading(true);
    try {
      const payload: Record<string, string> = {
        firstName: profileForm.firstName,
        lastName: profileForm.lastName,
        displayName: profileForm.displayName,
        email: profileForm.email,
      };

      if (profileForm.newPassword) {
        payload.oldPassword = profileForm.oldPassword;
        payload.newPassword = profileForm.newPassword;
      }

      const updateResponse = await apiPatch<ProfileUpdateResponse>("/profile/me", payload);
      if (!updateResponse.success) {
        throw new Error("Не удалось обновить профиль");
      }
      await loadProfile();
      notifySuccess("Профиль обновлен");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось сохранить профиль");
    } finally {
      setSaveLoading(false);
    }
  };

  const applyFullAddressValue = async (inputValue: string) => {
    const rawInput = inputValue.trim();
    if (!rawInput) return;

    const geocodeSeed = rawInput.includes(",")
      ? rawInput
      : normalizeFreeformAddressForGeocode(rawInput);
    const parsed =
      await geocodeAddressWithTimeout(rawInput, 900) ||
      (geocodeSeed !== rawInput ? await geocodeAddressWithTimeout(geocodeSeed, 900) : null);

    if (!parsed) {
      setAddressForm((prev) => ({
        ...prev,
        fullAddress: normalizeAddressDisplay(rawInput),
      }));
      setAddressMapHint("Не удалось определить координаты. Выберите подсказку или точку на карте.");
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
      const apartment = apartmentFromInput;
      const entrance = entranceFromInput;
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
        apartment,
        entrance,
        postalCode: parsed.postalCode || "",
        lat: typeof parsed.lat === "number" ? parsed.lat : prev.lat,
        lon: typeof parsed.lon === "number" ? parsed.lon : prev.lon,
      };
    });

    setAddressMapHint("");
    setMapCenterQuery(nextCenterQuery);
  };

  useEffect(() => {
    applyFullAddressValueRef.current = applyFullAddressValue;
  }, [applyFullAddressValue]);

  const geocodeAddressWithTimeout = useCallback(async (
    query: string,
    timeoutMs = 900,
  ) => {
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
  }, []);

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

  const createAddress = async () => {
    const prepared = await prepareCreateAddressPayload({
      addressForm,
      currentAddressCount: addresses.length,
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

      await loadProfile();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось добавить адрес");
    }
  };

  const deleteAddress = async (id: string) => {
    const targetAddress = addresses.find((item) => item.id === id);
    if (targetAddress?.isDefault) {
      notifyInfo("Нельзя удалить адрес по умолчанию");
      return;
    }

    try {
      await apiDelete<{ success: boolean }>(`/profile/addresses/${id}`);
      await loadProfile();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить адрес");
    }
  };

  const setDefaultAddress = async (id: string) => {
    try {
      await apiPost<{ success: boolean }>(`/profile/addresses/${id}/default`);
      await loadProfile();
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось установить адрес по умолчанию");
    }
  };

  const handleAddressSelectFromMap = (address: AddressMapSelection) => {
    setAddressForm((prev) => mergeAddressFromMap(prev, address));
    setAddressMapHint("");
    setMapCenterQuery(resolveMapCenterQuery(address));
  };
  const removeWishlistItem = async (id: string) => {
    try {
      await apiDelete<{ success: boolean }>(`/profile/wishlist/${id}`);
      setWishlistItems((prev) => prev.filter((item) => item.id !== id));
      // Обновляем глобальное состояние вишлиста
      onWishlistUpdate?.(id, false);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось удалить из избранного");
    }
  };

  const submitPartnershipRequest = async () => {
    if (!partnershipForm.name || !partnershipForm.email || !partnershipForm.contact || !partnershipForm.link || !partnershipForm.category || !partnershipForm.whyUs) {
      notifyInfo("Заполните обязательные поля заявки");
      return;
    }

    if (!partnershipPolicyAccepted) {
      notifyInfo("Перед отправкой заявки нужно принять правила партнерства.");
      return;
    }

    try {
      await apiPost<{ success: boolean }>("/profile/policy-acceptance", {
        scope: "partnership",
        policyId: partnershipPolicy.id || undefined,
      });
      const response = await apiPost<{ success: boolean; request_id: string }>("/profile/partnership-requests", partnershipForm);
      notifySuccess(`Заявка отправлена: ${response.request_id}`);
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Не удалось отправить заявку");
    }
  };

  const getOrderStatusMeta = (status: Order["status"]) => {
    const map: Record<Order["status"], { label: string; className: string }> = {
      processing: { label: "В обработке", className: "bg-amber-50 text-amber-700 border-amber-200" },
      shipped: { label: "Отправлен", className: "bg-blue-50 text-blue-700 border-blue-200" },
      completed: { label: "Завершен", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
      cancelled: { label: "Отменен", className: "bg-red-50 text-red-700 border-red-200" },
    };
    return map[status];
  };

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
      addresses,
      profile,
      resetAddressModalState,
      setIsNativeAddressSuggestEnabled,
      setMapCenterQuery,
      setAddressModalOpen,
    });
  }, [addresses, profile, resetAddressModalState]);

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
    setActiveTab("addresses");
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

  const renderProfileTab = () => (
    <ProfileSettingsTab
      profileForm={profileForm}
      saveLoading={saveLoading}
      onFieldChange={(field, value) => {
        setProfileForm((prev) => ({ ...prev, [field]: value }));
      }}
      onSave={() => {
        void saveProfile();
      }}
    />
  );

  const renderAddressesTab = () => (
    <ProfileAddressesTab
      addresses={addresses}
      addressModalOpen={addressModalOpen}
      addressForm={addressForm}
      addressMapHint={addressMapHint}
      mapCenterQuery={mapCenterQuery}
      addressFullInputRef={addressFullInputRef}
      onOpenCreateModal={openAddressCreateModal}
      onSetDefaultAddress={(id) => {
        void setDefaultAddress(id);
      }}
      onDeleteAddress={(id) => {
        void deleteAddress(id);
      }}
      onCloseModal={closeAddressCreateModal}
      onAddressNameChange={(value) => {
        setAddressForm((prev) => ({ ...prev, name: value }));
      }}
      onAddressFullAddressChange={onAddressFullAddressChange}
      onAddressFullAddressFocus={addressFullInputHandlers.onFocus}
      onAddressFullAddressBlur={addressFullInputHandlers.onBlur}
      onAddressFullAddressEnter={addressFullInputHandlers.onEnter}
      onAddressFullAddressEscape={addressFullInputHandlers.onEscape}
      onAddressSelectFromMap={handleAddressSelectFromMap}
      onCreateAddress={() => {
        void createAddress();
      }}
    />
  );

  const renderOrdersTab = () => (
    <ProfileOrdersTab
      orders={orders}
      reviewModalOpen={reviewModalOpen}
      itemToReview={itemToReview}
      reviewForm={reviewForm}
      getOrderStatusMeta={getOrderStatusMeta}
      onOpenListing={handleOpenListing}
      onStartReview={(item) => {
        setItemToReview(item);
        setReviewModalOpen(true);
      }}
      onReviewModalClose={() => setReviewModalOpen(false)}
      onReviewRatingChange={(rating) => {
        setReviewForm((prev) => ({ ...prev, rating }));
      }}
      onReviewCommentChange={(comment) => {
        setReviewForm((prev) => ({ ...prev, comment }));
      }}
      onSubmitReview={() => {
        void handlePostReview();
      }}
    />
  );

  const renderWishlistTab = () => (
    <ProfileWishlistTab
      wishlistItems={wishlistItems}
      onOpenListing={handleOpenListing}
      onRemoveWishlistItem={(listingPublicId) => {
        void removeWishlistItem(listingPublicId);
      }}
    />
  );

  const renderPartnershipTab = () => (
    <ProfilePartnershipTab
      partnershipForm={partnershipForm}
      onFieldChange={(field, value) => {
        setPartnershipForm((prev) => ({
          ...prev,
          [field]:
            field === "sellerType"
              ? (value as PartnershipForm["sellerType"])
              : value,
        }));
      }}
      onSubmit={() => {
        void submitPartnershipRequest();
      }}
      policyAccepted={partnershipPolicyAccepted}
      policyTitle={
        partnershipPolicy.version
          ? `${partnershipPolicy.title} (v${partnershipPolicy.version})`
          : partnershipPolicy.title
      }
      policyUrl={partnershipPolicy.contentUrl || "/terms"}
      onPolicyAcceptedChange={setPartnershipPolicyAccepted}
    />
  );

  const baseTabRenderers = {
    profile: renderProfileTab,
    addresses: renderAddressesTab,
    orders: renderOrdersTab,
    wishlist: renderWishlistTab,
    partnership: renderPartnershipTab,
  } as const;

  if (isLoading) {
    return <div className="pt-28 max-w-[1200px] mx-auto px-4 text-gray-500">Загрузка профиля...</div>;
  }

  return (
    <div className="min-h-screen app-shell pb-10 pt-24 md:pb-16 md:pt-28">
      <div className="page-container">
        <ProfileHeader profile={profile} onBack={onBack} />

        <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          <ProfileSidebar
            userType={userType}
            activeTab={activeTab}
            profile={profile}
            onTabChange={setActiveTab}
            onLogout={onLogout}
          />

          <main className="dashboard-sidebar flex-1 p-4 md:p-6">
            <ProfileTabRouter
              activeTab={activeTab}
              baseTabRenderers={baseTabRenderers}
              onRequestAddressChange={handleAddressChangeFromListings}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
