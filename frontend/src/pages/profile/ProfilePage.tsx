import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProfileAddresses } from "./profile.addresses.hooks";
import { useProfileData } from "./profile.data.hooks";
import { useProfilePartnership } from "./profile.partnership.hooks";
import {
  getOrderStatusMeta,
  useProfileReviews,
} from "./profile.reviews.hooks";
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
  PartnershipForm,
  ProfilePageProps,
  ProfileTab,
} from "./profile.models";

export function ProfilePage({
  onBack,
  onLogout,
  userType,
  initialTab,
  onTabChange,
  onPartnershipClick,
  onWishlistUpdate,
  onOpenListing,
  onOpenCreateListing,
}: ProfilePageProps) {
  const [localActiveTab, setLocalActiveTab] = useState<ProfileTab>(
    initialTab === "partnership" ? "profile" : initialTab ?? "profile",
  );
  const lastInitialTabRef = useRef<ProfileTab | undefined>(initialTab);

  const {
    addresses,
    isLoading,
    orders,
    profile,
    profileForm,
    saveLoading,
    wishlistItems,
    loadProfile,
    removeWishlistItem,
    saveProfile,
    setProfileForm,
  } = useProfileData({
    onWishlistUpdate,
  });

  const {
    addressForm,
    addressFullInputHandlers,
    addressFullInputRef,
    addressMapHint,
    addressModalOpen,
    mapCenterQuery,
    closeAddressCreateModal,
    createAddress,
    deleteAddress,
    handleAddressChangeFromListings: openAddressModalFromListings,
    handleAddressSelectFromMap,
    onAddressFullAddressChange,
    openAddressCreateModal,
    setAddressForm,
    setDefaultAddress,
  } = useProfileAddresses({
    addresses,
    profile,
    loadProfile,
  });

  const {
    itemToReview,
    reviewForm,
    reviewModalOpen,
    closeReviewModal,
    handlePostReview,
    setReviewForm,
    startReview,
  } = useProfileReviews({
    loadProfile,
  });

  const {
    partnershipForm,
    partnershipPolicy,
    partnershipPolicyAccepted,
    setPartnershipForm,
    setPartnershipPolicyAccepted,
    submitPartnershipRequest,
  } = useProfilePartnership({
    profile,
  });

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
  const fallbackTab = userType === "partner" ? "partner-listings" : "profile";
  const allowedTabIds = useMemo(() => new Set(tabs.map((tab) => tab.id)), [tabs]);
  const activeTab = useMemo<ProfileTab>(
    () => (allowedTabIds.has(localActiveTab) ? localActiveTab : fallbackTab),
    [allowedTabIds, fallbackTab, localActiveTab],
  );

  useEffect(() => {
    if (!allowedTabIds.has(localActiveTab)) {
      setLocalActiveTab(fallbackTab);
    }
  }, [allowedTabIds, fallbackTab, localActiveTab]);

  useEffect(() => {
    const nextTab = initialTab === "partnership" ? fallbackTab : initialTab ?? fallbackTab;
    if (lastInitialTabRef.current === initialTab) {
      return;
    }
    lastInitialTabRef.current = initialTab;
    if (!allowedTabIds.has(nextTab) || nextTab === localActiveTab) {
      return;
    }
    setLocalActiveTab(nextTab);
  }, [allowedTabIds, fallbackTab, initialTab, localActiveTab]);

  useEffect(() => {
    if (initialTab === "partnership") {
      onPartnershipClick?.();
    }
  }, [initialTab, onPartnershipClick]);

  const handleTabChange = useCallback(
    (tab: ProfileTab) => {
      if (tab === "partnership") {
        onPartnershipClick?.();
        return;
      }
      if (tab === localActiveTab) {
        return;
      }
      setLocalActiveTab(tab);
      onTabChange?.(tab);
    },
    [localActiveTab, onPartnershipClick, onTabChange],
  );

  const handleAddressChangeFromListings = useCallback(() => {
    setLocalActiveTab("addresses");
    onTabChange?.("addresses");
    openAddressModalFromListings();
  }, [onTabChange, openAddressModalFromListings]);

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
        startReview(item);
      }}
      onReviewModalClose={closeReviewModal}
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
            onTabChange={handleTabChange}
            onLogout={onLogout}
          />

          <main className="dashboard-sidebar flex-1 p-4 md:p-6">
            <ProfileTabRouter
              activeTab={activeTab}
              baseTabRenderers={baseTabRenderers}
              onRequestAddressChange={handleAddressChangeFromListings}
              onOpenListing={onOpenListing ?? (() => {})}
              onOpenCreateListing={onOpenCreateListing}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
