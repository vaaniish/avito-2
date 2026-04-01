declare global {
  interface Window {
    ym?: ((...args: any[]) => void) & {
      a?: any[];
      l?: number;
    };
    __ecommYandexMetrikaInited?: boolean;
  }
}

const METRIKA_ID = Number(
  import.meta.env.VITE_YANDEX_METRIKA_ID?.toString().trim() ?? "",
);

function isValidCounterId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function initYandexMetrika(): void {
  if (!isValidCounterId(METRIKA_ID)) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__ecommYandexMetrikaInited) return;

  // Yandex official bootstrap pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).ym =
    window.ym ||
    function (...args: any[]) {
      (window.ym!.a = window.ym!.a || []).push(args);
    };
  window.ym.l = Date.now();

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://mc.yandex.ru/metrika/tag.js";
  document.head.appendChild(script);

  window.ym(METRIKA_ID, "init", {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });

  window.__ecommYandexMetrikaInited = true;
}

export function trackListingViewInMetrika(params: {
  listingId: string;
  sellerId?: string;
}): void {
  if (!isValidCounterId(METRIKA_ID)) return;
  if (typeof window === "undefined" || !window.ym) return;

  window.ym(METRIKA_ID, "reachGoal", "listing_view", {
    listing_id: params.listingId,
    seller_id: params.sellerId ?? "",
    source: "product_detail",
  });
}

