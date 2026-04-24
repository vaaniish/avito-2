import type { ProfileFormState } from "./profile.models";

type ProfileSettingsTabProps = {
  profileForm: ProfileFormState;
  saveLoading: boolean;
  onFieldChange: (field: keyof ProfileFormState, value: string) => void;
  onSave: () => void;
};

export function ProfileSettingsTab({
  profileForm,
  saveLoading,
  onFieldChange,
  onSave,
}: ProfileSettingsTabProps) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold md:text-xl">Настройки профиля</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          value={profileForm.firstName}
          onChange={(event) => onFieldChange("firstName", event.target.value)}
          placeholder="Имя"
          className="field-control"
        />
        <input
          value={profileForm.lastName}
          onChange={(event) => onFieldChange("lastName", event.target.value)}
          placeholder="Фамилия"
          className="field-control"
        />
      </div>
      <input
        value={profileForm.displayName}
        onChange={(event) => onFieldChange("displayName", event.target.value)}
        placeholder="Отображаемое имя"
        className="field-control"
      />
      <input
        value={profileForm.email}
        onChange={(event) => onFieldChange("email", event.target.value)}
        placeholder="Email"
        className="field-control"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <input
          type="password"
          value={profileForm.oldPassword}
          onChange={(event) => onFieldChange("oldPassword", event.target.value)}
          placeholder="Старый пароль"
          className="field-control"
        />
        <input
          type="password"
          value={profileForm.newPassword}
          onChange={(event) => onFieldChange("newPassword", event.target.value)}
          placeholder="Новый пароль"
          className="field-control"
        />
      </div>
      <button
        onClick={onSave}
        disabled={saveLoading}
        className="btn-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:text-white/90"
      >
        Сохранить изменения
      </button>
    </div>
  );
}
