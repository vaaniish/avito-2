import { Suspense, lazy } from "react";
import type { ProfileTab } from "./profile.models";

const PartnerListingsPage = lazy(() =>
  import("../partner-listings/PartnerListingsPage").then((module) => ({
    default: module.PartnerListingsPage,
  })),
);
const PartnerOrdersPage = lazy(() =>
  import("./PartnerOrdersPage").then((module) => ({
    default: module.PartnerOrdersPage,
  })),
);
const PartnerFinancePage = lazy(() =>
  import("./PartnerFinancePage").then((module) => ({
    default: module.PartnerFinancePage,
  })),
);
const QuestionsPage = lazy(() =>
  import("./QuestionsPage").then((module) => ({
    default: module.QuestionsPage,
  })),
);

type ProfilePartnerTabProps = {
  activeTab: ProfileTab;
  onRequestAddressChange: () => void;
  onOpenListing: (listingPublicId: string) => void;
  onOpenCreateListing?: () => void;
};

export function ProfilePartnerTab({
  activeTab,
  onRequestAddressChange,
  onOpenListing,
  onOpenCreateListing,
}: ProfilePartnerTabProps) {
  if (activeTab === "partner-listings") {
    return (
      <Suspense
        fallback={<div className="text-sm text-gray-500">Загрузка объявлений...</div>}
      >
        <PartnerListingsPage
          onRequestAddressChange={onRequestAddressChange}
          onOpenListing={onOpenListing}
          onOpenCreateListing={onOpenCreateListing}
        />
      </Suspense>
    );
  }

  if (activeTab === "partner-questions") {
    return (
      <Suspense
        fallback={<div className="text-sm text-gray-500">Загрузка вопросов...</div>}
      >
        <QuestionsPage />
      </Suspense>
    );
  }

  if (activeTab === "partner-finance") {
    return (
      <Suspense
        fallback={<div className="text-sm text-gray-500">Загрузка финансов...</div>}
      >
        <PartnerFinancePage />
      </Suspense>
    );
  }

  if (activeTab === "partner-orders") {
    return (
      <Suspense
        fallback={<div className="text-sm text-gray-500">Загрузка заказов...</div>}
      >
        <PartnerOrdersPage onOpenListing={onOpenListing} />
      </Suspense>
    );
  }

  return null;
}
