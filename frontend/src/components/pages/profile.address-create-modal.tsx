import type { MutableRefObject } from "react";
import { YandexMapPicker } from "../../components/YandexMapPicker";
import { AppModal } from "../ui/app-modal";
import type { AddressMapSelection } from "./profile.address-flow";
import type { AddressFormState } from "./profile.models";

type ProfileAddressCreateModalProps = {
  open: boolean;
  addressForm: AddressFormState;
  addressMapHint: string;
  mapCenterQuery: string | null;
  addressFullInputRef: MutableRefObject<HTMLInputElement | null>;
  onClose: () => void;
  onAddressNameChange: (value: string) => void;
  onAddressFullAddressChange: (value: string) => void;
  onAddressFullAddressFocus: () => void;
  onAddressFullAddressBlur: () => void;
  onAddressFullAddressEnter: () => void;
  onAddressFullAddressEscape: () => void;
  onAddressSelectFromMap: (address: AddressMapSelection) => void;
  onCreateAddress: () => void;
};

export function ProfileAddressCreateModal({
  open,
  addressForm,
  addressMapHint,
  mapCenterQuery,
  addressFullInputRef,
  onClose,
  onAddressNameChange,
  onAddressFullAddressChange,
  onAddressFullAddressFocus,
  onAddressFullAddressBlur,
  onAddressFullAddressEnter,
  onAddressFullAddressEscape,
  onAddressSelectFromMap,
  onCreateAddress,
}: ProfileAddressCreateModalProps) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Новый адрес"
      size="xl"
      bodyClassName="app-modal__body--wide"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary px-5 py-2.5">
            Отмена
          </button>
          <button onClick={onCreateAddress} className="btn-primary px-5 py-2.5">
            Сохранить
          </button>
        </>
      }
    >
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
    </AppModal>
  );
}
