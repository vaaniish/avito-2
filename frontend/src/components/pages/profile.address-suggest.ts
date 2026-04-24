import type { MutableRefObject } from "react";

type MountNativeAddressSuggestParams = {
  addressInputRef: MutableRefObject<HTMLInputElement | null>;
  suggestViewRef: MutableRefObject<any>;
  geosuggestApiKey: string;
  bounds: number[][];
  onSelectValue: (value: string) => void | Promise<void>;
  onSuggestEnabled?: (enabled: boolean) => void;
};

function createSuggestProvider(ymaps: any, geosuggestApiKey: string) {
  if (!geosuggestApiKey) {
    return "yandex#map";
  }

  return {
    suggest: (request: unknown, options?: { results?: number }) => {
      const query = String(request ?? "").trim();
      if (!query) {
        return ymaps.vow.resolve([]);
      }

      const limitRaw = Number(options?.results ?? 8);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 10)
          : 8;

      const url = new URL("https://suggest-maps.yandex.ru/v1/suggest");
      url.searchParams.set("apikey", geosuggestApiKey);
      url.searchParams.set("text", query);
      url.searchParams.set("lang", "ru_RU");
      url.searchParams.set("results", String(limit));
      url.searchParams.set("types", "biz,geo");
      url.searchParams.set("attrs", "uri");
      url.searchParams.set("print_address", "1");
      url.searchParams.set("org_address_kind", "house");

      return ymaps.vow.resolve(
        fetch(url.toString(), { method: "GET" })
          .then((response) =>
            response.ok ? response.json() : Promise.resolve({ results: [] }),
          )
          .then((payload: unknown) => {
            const rawResults =
              payload &&
              typeof payload === "object" &&
              Array.isArray((payload as { results?: unknown[] }).results)
                ? (payload as { results: unknown[] }).results
                : [];

            return rawResults
              .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const item = entry as {
                  title?: { text?: string };
                  subtitle?: { text?: string };
                  address?: { formatted_address?: string };
                  value?: string;
                  displayName?: string;
                };

                const title = String(item.title?.text ?? "").trim();
                const subtitle = String(
                  item.subtitle?.text ?? item.address?.formatted_address ?? "",
                ).trim();
                const singleLine = [title, subtitle]
                  .filter(Boolean)
                  .join(", ")
                  .trim();
                const value =
                  singleLine || String(item.value ?? item.displayName ?? "").trim();
                if (!value) return null;

                return {
                  value,
                  displayName: value,
                };
              })
              .filter(
                (item): item is { value: string; displayName: string } =>
                  Boolean(item),
              );
          })
          .catch(() => []),
      );
    },
  };
}

export function mountNativeAddressSuggest({
  addressInputRef,
  suggestViewRef,
  geosuggestApiKey,
  bounds,
  onSelectValue,
  onSuggestEnabled,
}: MountNativeAddressSuggestParams): () => void {
  let cancelled = false;
  let retryTimer = 0;

  const destroyNativeSuggest = () => {
    const current = suggestViewRef.current;
    if (!current) return;
    try {
      current.destroy?.();
    } catch {
      // no-op
    }
    suggestViewRef.current = null;
  };

  const initNativeSuggest = () => {
    if (cancelled || suggestViewRef.current) return;

    const ymaps = (window as unknown as { ymaps?: any }).ymaps;
    const inputEl = addressInputRef.current;
    if (!ymaps?.SuggestView || !inputEl) {
      retryTimer = window.setTimeout(initNativeSuggest, 120);
      return;
    }

    try {
      const suggestView = new ymaps.SuggestView(inputEl, {
        provider: createSuggestProvider(ymaps, geosuggestApiKey),
        results: 8,
        boundedBy: bounds,
        strictBounds: true,
      });

      suggestView.events?.add?.("select", (event: any) => {
        const item = event?.get?.("item");
        const selectedValue = String(item?.value ?? "").trim();
        if (!selectedValue) return;
        void onSelectValue(selectedValue);
      });

      suggestViewRef.current = suggestView;
      onSuggestEnabled?.(true);
    } catch {
      // keep one-source suggest mode; hide custom list even on failures
    }
  };

  initNativeSuggest();

  return () => {
    cancelled = true;
    if (retryTimer) {
      window.clearTimeout(retryTimer);
    }
    destroyNativeSuggest();
  };
}
