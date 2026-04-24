import { Suspense, lazy } from "react";
import type { ProfileTab } from "./profile.models";

const PartnerListingsPage = lazy(() =>
  import("./PartnerListingsPage").then((module) => ({
    default: module.PartnerListingsPage,
  })),
);
const PartnerOrdersPage = lazy(() =>
  import("./PartnerOrdersPage").then((module) => ({
    default: module.PartnerOrdersPage,
  })),
);
const QuestionsPage = lazy(() =>
  import("../partner/QuestionsPage").then((module) => ({
    default: module.QuestionsPage,
  })),
);

type ProfilePartnerTabProps = {
  activeTab: ProfileTab;
  onRequestAddressChange: () => void;
};

export function ProfilePartnerTab({
  activeTab,
  onRequestAddressChange,
}: ProfilePartnerTabProps) {
  if (activeTab === "partner-listings") {
    return (
      <Suspense
        fallback={<div className="text-sm text-gray-500">Загрузка объявлений...</div>}
      >
        <PartnerListingsPage onRequestAddressChange={onRequestAddressChange} />
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

  if (activeTab === "partner-orders") {
    return (
      <Suspense
        fallback={<div className="text-sm text-gray-500">Загрузка заказов...</div>}
      >
        <PartnerOrdersPage />
      </Suspense>
    );
  }

  return null;
}
