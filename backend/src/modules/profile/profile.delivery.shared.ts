export type DeliveryProviderCode = "russian_post" | "yandex_pvz";
export type DeliveryProviderFilter = DeliveryProviderCode | "all";

export const DELIVERY_PROVIDER_LABELS: Record<DeliveryProviderCode, string> = {
  russian_post: "Почта России",
  yandex_pvz: "Яндекс ПВЗ",
};

export const DELIVERY_PROVIDERS: Array<{
  code: DeliveryProviderCode;
  label: string;
}> = [
  {
    code: "yandex_pvz",
    label: DELIVERY_PROVIDER_LABELS.yandex_pvz,
  },
  {
    code: "russian_post",
    label: DELIVERY_PROVIDER_LABELS.russian_post,
  },
];

export function parseDeliveryProviderFilter(
  value: unknown,
): DeliveryProviderFilter {
  if (typeof value !== "string") return "all";
  const normalized = value.trim();
  if (
    normalized === "all" ||
    normalized === "yandex_pvz" ||
    normalized === "russian_post"
  ) {
    return normalized;
  }
  return "all";
}

export function normalizePickupProvider(value: unknown): DeliveryProviderCode {
  if (value === "russian_post") return "russian_post";
  return "yandex_pvz";
}

export function toLocalizedDeliveryDate(date: Date): string {
  const deliveryDate = new Date(date.getTime());
  deliveryDate.setDate(deliveryDate.getDate() + 3);
  return deliveryDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

export const YANDEX_DELIVERY_BASE_URL =
  process.env.YANDEX_DELIVERY_BASE_URL?.trim() ||
  process.env.YANDEX_DELIVERY_TEST_BASE_URL?.trim() ||
  "https://b2b.taxi.tst.yandex.net";

export const YANDEX_DELIVERY_TOKEN =
  process.env.YANDEX_DELIVERY_TOKEN?.trim() ||
  process.env.YANDEX_DELIVERY_TEST_TOKEN?.trim() ||
  "";

export const YANDEX_DELIVERY_TIMEOUT_MS = Number(
  process.env.YANDEX_DELIVERY_TIMEOUT_MS ??
    process.env.YANDEX_DELIVERY_TEST_TIMEOUT_MS ??
    "10000",
);

export const YANDEX_DELIVERY_SOURCE_STATION_ID =
  process.env.YANDEX_DELIVERY_SOURCE_STATION_ID?.trim() ||
  process.env.YANDEX_DELIVERY_TEST_SOURCE_STATION_ID?.trim() ||
  "fbed3aa1-2cc6-4370-ab4d-59c5cc9bb924";

export const YANDEX_DELIVERY_MERCHANT_ID =
  process.env.YANDEX_DELIVERY_MERCHANT_ID?.trim() ||
  process.env.YANDEX_DELIVERY_TEST_MERCHANT_ID?.trim() ||
  "";

export const YANDEX_DELIVERY_SANDBOX_SOURCE_STATION_ID =
  process.env.YANDEX_DELIVERY_SANDBOX_SOURCE_STATION_ID?.trim() ||
  "e1139f6d-e34f-47a9-a55f-31f032a861a6";

export const YANDEX_DELIVERY_OPERATOR_IDS = (
  process.env.YANDEX_DELIVERY_OPERATOR_IDS?.trim() ||
  process.env.YANDEX_DELIVERY_TEST_OPERATOR_IDS?.trim() ||
  "market_l4g"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number.isFinite(timeoutMs) ? Math.max(2000, timeoutMs) : 7000,
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
