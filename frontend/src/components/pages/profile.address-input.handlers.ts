import type { MutableRefObject } from "react";
import type { AddressSuggestionOption } from "./profile.models";

type CreateAddressInputHandlersParams = {
  fullAddress: string;
  addressInputBlurTimeoutRef: MutableRefObject<number | null>;
  isSelectingAddressSuggestionRef: MutableRefObject<boolean>;
  applyFullAddressValueRef: MutableRefObject<(value: string) => Promise<void>>;
  setAddressMapHint: (value: string) => void;
  setIsAddressInputFocused: (value: boolean) => void;
  setAddressSuggestionActiveIndex: (value: number) => void;
  setAddressSuggestions: (value: AddressSuggestionOption[]) => void;
};

export function createAddressInputHandlers({
  fullAddress,
  addressInputBlurTimeoutRef,
  isSelectingAddressSuggestionRef,
  applyFullAddressValueRef,
  setAddressMapHint,
  setIsAddressInputFocused,
  setAddressSuggestionActiveIndex,
  setAddressSuggestions,
}: CreateAddressInputHandlersParams) {
  const onFocus = () => {
    if (addressInputBlurTimeoutRef.current) {
      window.clearTimeout(addressInputBlurTimeoutRef.current);
      addressInputBlurTimeoutRef.current = null;
    }
    isSelectingAddressSuggestionRef.current = false;
    setIsAddressInputFocused(true);
    setAddressSuggestionActiveIndex(-1);
  };

  const onBlur = () => {
    if (addressInputBlurTimeoutRef.current) {
      window.clearTimeout(addressInputBlurTimeoutRef.current);
    }
    addressInputBlurTimeoutRef.current = window.setTimeout(() => {
      addressInputBlurTimeoutRef.current = null;
      const keepFocused = isSelectingAddressSuggestionRef.current;
      isSelectingAddressSuggestionRef.current = false;
      if (keepFocused) {
        setIsAddressInputFocused(true);
        return;
      }
      setIsAddressInputFocused(false);
      setAddressSuggestionActiveIndex(-1);
    }, 120);
  };

  const onEnter = () => {
    const currentValue = fullAddress.trim();
    if (!currentValue) return;

    void (async () => {
      try {
        await applyFullAddressValueRef.current(currentValue);
        setAddressMapHint("");
        setIsAddressInputFocused(true);
      } catch {
        setAddressMapHint(
          "Не удалось применить адрес. Попробуйте выбрать вариант из подсказок.",
        );
      }
    })();
  };

  const onEscape = () => {
    setAddressSuggestions([]);
    setAddressSuggestionActiveIndex(-1);
    setIsAddressInputFocused(false);
  };

  return {
    onFocus,
    onBlur,
    onEnter,
    onEscape,
  };
}
