import type { ReactNode } from "react";
import { ProfilePartnerTab } from "./profile.partner-tab";
import type { ProfileTab } from "./profile.models";

type BaseTabRendererKey =
  | "profile"
  | "addresses"
  | "orders"
  | "wishlist"
  | "partnership";

type BaseTabRenderers = Record<BaseTabRendererKey, () => ReactNode>;

type ProfileTabRouterProps = {
  activeTab: ProfileTab;
  baseTabRenderers: BaseTabRenderers;
  onRequestAddressChange: () => void;
  onOpenListing: (listingPublicId: string) => void;
  onOpenCreateListing?: () => void;
};

export function ProfileTabRouter({
  activeTab,
  baseTabRenderers,
  onRequestAddressChange,
  onOpenListing,
  onOpenCreateListing,
}: ProfileTabRouterProps) {
  if (activeTab in baseTabRenderers) {
    return baseTabRenderers[activeTab as BaseTabRendererKey]();
  }

  return (
    <ProfilePartnerTab
      activeTab={activeTab}
      onRequestAddressChange={onRequestAddressChange}
      onOpenListing={onOpenListing}
      onOpenCreateListing={onOpenCreateListing}
    />
  );
}
