import { LogOut, User as UserIcon } from "lucide-react";
import { partnerBaseTabs, partnerTabs, regularTabs } from "./profile.tabs";
import type { ProfileTab, ProfileUser, UserType } from "./profile.models";

type ProfileSidebarProps = {
  userType: UserType;
  activeTab: ProfileTab;
  profile: ProfileUser | null;
  onTabChange: (tab: ProfileTab) => void;
  onLogout: () => void;
};

export function ProfileSidebar({
  userType,
  activeTab,
  profile,
  onTabChange,
  onLogout,
}: ProfileSidebarProps) {
  return (
    <aside className="dashboard-sidebar h-fit p-4 lg:w-80">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-10 w-10 overflow-hidden rounded-full bg-gray-200">
          {userType !== "partner" && profile?.avatar ? (
            <img
              src={profile.avatar}
              alt={profile.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
              <UserIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold">{profile?.displayName || profile?.name}</div>
          <div className="text-xs text-gray-500">На Ecomm с {profile?.joinDate} года</div>
        </div>
      </div>

      {userType === "partner" ? (
        <div className="mb-4">
          <div className="dashboard-sidebar__section">
            <p className="dashboard-sidebar__title">Базовые</p>
            <div className="dashboard-nav-list">
              {partnerBaseTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`dashboard-nav-btn ${
                      activeTab === tab.id ? "dashboard-nav-btn--active" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="dashboard-sidebar__section">
            <p className="dashboard-sidebar__title">Партнерские</p>
            <div className="dashboard-nav-list">
              {partnerTabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`dashboard-nav-btn ${
                      activeTab === tab.id ? "dashboard-nav-btn--active" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="dashboard-sidebar__section mb-4">
          <div className="dashboard-nav-list">
            {regularTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`dashboard-nav-btn ${
                    activeTab === tab.id ? "dashboard-nav-btn--active" : ""
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button
        onClick={onLogout}
        className="btn-secondary flex w-full items-center justify-center gap-2 px-3 py-2 text-sm text-gray-700"
      >
        <LogOut className="h-4 w-4" /> Выйти
      </button>
    </aside>
  );
}
