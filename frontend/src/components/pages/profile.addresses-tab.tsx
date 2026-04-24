import type { MutableRefObject } from "react";
import { Plus, X } from "lucide-react";
import { YandexMapPicker } from "../../components/YandexMapPicker";
import type { AddressMapSelection } from "./profile.address-flow";
import type { Address, AddressFormState } from "./profile.models";

type ProfileAddressesTabProps = {
  addresses: Address[];
  addressModalOpen: boolean;
  addressForm: AddressFormState;
  addressMapHint: string;
  mapCenterQuery: string | null;
  addressFullInputRef: MutableRefObject<HTMLInputElement | null>;
  onOpenCreateModal: () => void;
  onSetDefaultAddress: (id: string) => void;
  onDeleteAddress: (id: string) => void;
  onCloseModal: () => void;
  onAddressNameChange: (value: string) => void;
  onAddressFullAddressChange: (value: string) => void;
  onAddressFullAddressFocus: () => void;
  onAddressFullAddressBlur: () => void;
  onAddressFullAddressEnter: () => void;
  onAddressFullAddressEscape: () => void;
  onAddressSelectFromMap: (address: AddressMapSelection) => void;
  onCreateAddress: () => void;
};

function getAddressLine(address: Address): string {
  const baseAddress =
    address.fullAddress ||
    [address.region, address.city, address.street, address.building, address.postalCode]
      .filter(Boolean)
      .join(", ");

  if (!address.postalCode) return baseAddress;
  if (/(?:индекс\s*)?\d{6}/iu.test(baseAddress)) return baseAddress;
  return `${baseAddress}, индекс ${address.postalCode}`;
}

export function ProfileAddressesTab({
  addresses,
  addressModalOpen,
  addressForm,
  addressMapHint,
  mapCenterQuery,
  addressFullInputRef,
  onOpenCreateModal,
  onSetDefaultAddress,
  onDeleteAddress,
  onCloseModal,
  onAddressNameChange,
  onAddressFullAddressChange,
  onAddressFullAddressFocus,
  onAddressFullAddressBlur,
  onAddressFullAddressEnter,
  onAddressFullAddressEscape,
  onAddressSelectFromMap,
  onCreateAddress,
}: ProfileAddressesTabProps) {
  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold md:text-xl">Адреса доставки</h3>
        <button
          onClick={onOpenCreateModal}
          className="btn-primary px-3 py-2 flex items-center gap-1.5 text-sm"
        >
          <Plus className="w-4 h-4" /> Добавить
        </button>
      </div>

      <div className="space-y-3">
        {addresses.map((address) => (
          <div
            key={address.id}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="font-semibold break-words">
                  {address.name}{" "}
                  {address.isDefault && (
                    <span className="text-xs text-green-600">(по умолчанию)</span>
                  )}
                </div>
                <div className="text-sm text-gray-600 break-words">
                  {getAddressLine(address)}
                </div>
              </div>
              <div className="flex items-center gap-2 self-start">
                {!address.isDefault && (
                  <button
                    onClick={() => onSetDefaultAddress(address.id)}
                    className="btn-secondary text-xs px-2 py-1.5"
                  >
                    По умолчанию
                  </button>
                )}
                <button
                  onClick={() => onDeleteAddress(address.id)}
                  disabled={address.isDefault}
                  title={
                    address.isDefault
                      ? "Адрес по умолчанию удалить нельзя"
                      : "Удалить адрес"
                  }
                  className={`btn-secondary text-xs px-2 py-1.5 ${
                    address.isDefault
                      ? "cursor-not-allowed text-gray-400 opacity-60"
                      : "text-red-600"
                  }`}
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        ))}
        {addresses.length === 0 && (
          <div className="text-sm text-gray-500">Нет сохраненных адресов</div>
        )}
      </div>

      {addressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className="flex max-h-[92vh] flex-col overflow-hidden rounded-2xl border border-[#d7e1ec] bg-white shadow-[0_30px_80px_-40px_rgba(15,23,42,0.65)]"
            style={{ width: "min(940px, 96vw)" }}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h4 className="text-lg font-semibold">Новый адрес</h4>
              <button onClick={onCloseModal}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4">
              <div className="space-y-3 overflow-visible">
                <input
                  value={addressForm.name}
                  onChange={(event) => onAddressNameChange(event.target.value)}
                  placeholder="Название адреса"
                  className="field-control"
                />

                <div className="relative z-30">
                  <input
                    ref={addressFullInputRef}
                    value={addressForm.fullAddress}
                    onChange={(event) => {
                      onAddressFullAddressChange(event.target.value);
                    }}
                    onFocus={onAddressFullAddressFocus}
                    onBlur={onAddressFullAddressBlur}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        onAddressFullAddressEscape();
                        return;
                      }

                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      onAddressFullAddressEnter();
                    }}
                    placeholder="Полный адрес: Кировская область, Киров, Октябрьский пр-кт, д. 117, подъезд 2, кв. 220"
                    className="field-control"
                  />
                </div>

                {addressForm.postalCode && (
                  <p className="text-xs text-gray-600">
                    Индекс по адресу: {addressForm.postalCode}
                  </p>
                )}
                {addressMapHint && (
                  <p className="text-xs text-amber-700">{addressMapHint}</p>
                )}

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <YandexMapPicker
                    onAddressSelect={onAddressSelectFromMap}
                    height={520}
                    centerQuery={mapCenterQuery}
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
              <button onClick={onCreateAddress} className="btn-primary flex-1 py-2.5">
                Сохранить
              </button>
              <button onClick={onCloseModal} className="btn-secondary flex-1 py-2.5">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
