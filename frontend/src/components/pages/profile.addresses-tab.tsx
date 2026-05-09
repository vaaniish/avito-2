import type { MutableRefObject } from "react";
import { Plus } from "lucide-react";
import type { AddressMapSelection } from "./profile.address-flow";
import { ProfileAddressCreateModal } from "./profile.address-create-modal";
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

      <ProfileAddressCreateModal
        open={addressModalOpen}
        addressForm={addressForm}
        addressMapHint={addressMapHint}
        mapCenterQuery={mapCenterQuery}
        addressFullInputRef={addressFullInputRef}
        onClose={onCloseModal}
        onAddressNameChange={onAddressNameChange}
        onAddressFullAddressChange={onAddressFullAddressChange}
        onAddressFullAddressFocus={onAddressFullAddressFocus}
        onAddressFullAddressBlur={onAddressFullAddressBlur}
        onAddressFullAddressEnter={onAddressFullAddressEnter}
        onAddressFullAddressEscape={onAddressFullAddressEscape}
        onAddressSelectFromMap={onAddressSelectFromMap}
        onCreateAddress={onCreateAddress}
      />
    </div>
  );
}
