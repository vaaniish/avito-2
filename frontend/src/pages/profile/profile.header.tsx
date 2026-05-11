import type { ProfileUser } from "./profile.models";

type ProfileHeaderProps = {
  profile: ProfileUser | null;
  onBack: () => void;
};

export function ProfileHeader({ profile, onBack }: ProfileHeaderProps) {
  return (
    <section className="dashboard-card mb-4 p-4 md:mb-6 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="dashboard-title">Личный кабинет</h1>
          <p className="dashboard-subtitle break-words">
            {profile?.displayName || profile?.name} • {profile?.email}
          </p>
        </div>
        <button onClick={onBack} className="back-link text-sm">
          ← На главную
        </button>
      </div>
    </section>
  );
}
