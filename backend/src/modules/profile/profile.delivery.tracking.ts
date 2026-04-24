import { type PrismaClient } from "@prisma/client";
import {
  DeliveryProviderCode,
  YANDEX_DELIVERY_BASE_URL,
  YANDEX_DELIVERY_MERCHANT_ID,
  YANDEX_DELIVERY_SANDBOX_SOURCE_STATION_ID,
  YANDEX_DELIVERY_SOURCE_STATION_ID,
  YANDEX_DELIVERY_TIMEOUT_MS,
  YANDEX_DELIVERY_TOKEN,
  fetchWithTimeout,
  normalizePickupProvider,
} from "./profile.delivery.shared";
import { normalizeTextField } from "./profile.shared";

type YandexRequestCreateResult = {
  requestId: string | null;
  status: string;
  sharingUrl: string | null;
};
const PICKUP_POINT_TAG_RE = /\[PICKUP_ID:([^\]]+)\]/u;
const PICKUP_PROVIDER_TAG_RE = /\[PICKUP_PROVIDER:([^\]]+)\]/u;

function createYandexDeliveryHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${YANDEX_DELIVERY_TOKEN}`,
    "Accept-Language": "ru",
    "Content-Type": "application/json",
  };
}

function formatUtcIsoWithMicros(value: Date): string {
  const base = value.toISOString().replace("Z", "");
  return `${base.replace(/\.\d{3}$/u, ".000000")}Z`;
}

async function fetchYandexRequestInfoById(
  requestId: string,
): Promise<YandexRequestCreateResult | null> {
  if (!requestId.trim()) return null;
  if (!YANDEX_DELIVERY_TOKEN) return null;

  const url = new URL(
    `${YANDEX_DELIVERY_BASE_URL.replace(/\/+$/u, "")}/api/b2b/platform/request/info`,
  );
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("slim", "true");

  const response = await fetchWithTimeout(
    url.toString(),
    {
      method: "GET",
      headers: createYandexDeliveryHeaders(),
    },
    YANDEX_DELIVERY_TIMEOUT_MS,
  );

  if (!response.ok) return null;
  const payload = (await response.json()) as {
    request_id?: unknown;
    state?: {
      status?: unknown;
    };
    sharing_url?: unknown;
  };

  return {
    requestId:
      typeof payload.request_id === "string" ? payload.request_id.trim() : null,
    status:
      payload.state && typeof payload.state.status === "string"
        ? payload.state.status.trim()
        : "CREATED",
    sharingUrl:
      typeof payload.sharing_url === "string"
        ? payload.sharing_url.trim()
        : null,
  };
}

async function createYandexDeliveryRequestForOrder(params: {
  orderPublicId: string;
  totalPrice: number;
  pickupPointId: string;
  buyerName: string;
  buyerEmail: string;
}): Promise<YandexRequestCreateResult | null> {
  if (!YANDEX_DELIVERY_TOKEN) return null;

  const now = new Date();
  const intervalFrom = new Date(now.getTime() + 10 * 60 * 1000);
  const intervalTo = new Date(intervalFrom.getTime() + 60 * 60 * 1000);

  const buyerNameParts = params.buyerName
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const firstName = buyerNameParts[0] || "Покупатель";
  const lastName = buyerNameParts.slice(1).join(" ") || "Ecomm";
  const isSandboxHost = YANDEX_DELIVERY_BASE_URL.includes(".tst.yandex.net");
  const sourceStationCandidates = [YANDEX_DELIVERY_SOURCE_STATION_ID];
  if (isSandboxHost && YANDEX_DELIVERY_SANDBOX_SOURCE_STATION_ID) {
    if (!sourceStationCandidates.includes(YANDEX_DELIVERY_SANDBOX_SOURCE_STATION_ID)) {
      sourceStationCandidates.push(YANDEX_DELIVERY_SANDBOX_SOURCE_STATION_ID);
    }
  }

  let lastError: unknown = null;

  for (const sourceStationId of sourceStationCandidates) {
    const infoBlock: {
      operator_request_id: string;
      merchant_id?: string;
      comment: string;
    } = {
      operator_request_id: params.orderPublicId,
      comment: `Order ${params.orderPublicId} (sandbox)`,
    };
    if (YANDEX_DELIVERY_MERCHANT_ID) {
      infoBlock.merchant_id = YANDEX_DELIVERY_MERCHANT_ID;
    }

    const createBody = {
      info: infoBlock,
      source: {
        platform_station: {
          platform_id: sourceStationId,
        },
        interval_utc: {
          from: formatUtcIsoWithMicros(intervalFrom),
          to: formatUtcIsoWithMicros(intervalTo),
        },
      },
      destination: {
        type: "platform_station",
        platform_station: {
          platform_id: params.pickupPointId,
        },
        custom_location: null,
        interval_utc: null,
      },
      items: [
        {
          count: 1,
          name: `Order ${params.orderPublicId}`,
          article: params.orderPublicId,
          billing_details: {
            inn: "9715386101",
            nds: 22,
            unit_price: params.totalPrice,
            assessed_unit_price: params.totalPrice,
          },
          physical_dims: {
            dx: 10,
            dy: 10,
            dz: 10,
            predefined_volume: 20,
          },
          place_barcode: `PL-${params.orderPublicId}`,
          cargo_types: [80],
          fitting: false,
        },
      ],
      places: [
        {
          physical_dims: {
            weight_gross: 100,
            dx: 10,
            dy: 10,
            dz: 10,
          },
          barcode: `PL-${params.orderPublicId}`,
        },
      ],
      billing_info: {
        payment_method: "already_paid",
        delivery_cost: 0,
      },
      recipient_info: {
        first_name: firstName,
        last_name: lastName,
        phone: "+79990000000",
        email: params.buyerEmail || "buyer@example.com",
      },
      last_mile_policy: "self_pickup",
      particular_items_refuse: false,
      forbid_unboxing: false,
    };

    try {
      const createResponse = await fetchWithTimeout(
        `${YANDEX_DELIVERY_BASE_URL.replace(/\/+$/u, "")}/api/b2b/platform/request/create?send_unix=false`,
        {
          method: "POST",
          headers: createYandexDeliveryHeaders(),
          body: JSON.stringify(createBody),
        },
        YANDEX_DELIVERY_TIMEOUT_MS,
      );

      const responseText = await createResponse.text();
      const responseJson = responseText
        ? (() => {
            try {
              return JSON.parse(responseText) as {
                request_id?: unknown;
                state?: { status?: unknown };
                sharing_url?: unknown;
                code?: unknown;
                message?: unknown;
              };
            } catch {
              return null;
            }
          })()
        : null;

      if (!createResponse.ok) {
        const error = new Error(
          `Yandex request/create failed: ${createResponse.status} ${createResponse.statusText}${
            responseText ? ` | ${responseText}` : ""
          }`,
        ) as Error & { yandexCode?: string; yandexMessage?: string };
        error.yandexCode =
          responseJson && typeof responseJson.code === "string"
            ? responseJson.code
            : undefined;
        error.yandexMessage =
          responseJson && typeof responseJson.message === "string"
            ? responseJson.message
            : undefined;
        throw error;
      }

      const requestId =
        responseJson && typeof responseJson.request_id === "string"
          ? responseJson.request_id.trim()
          : "";
      if (!requestId) return null;

      const info = await fetchYandexRequestInfoById(requestId);
      if (info) return info;

      return {
        requestId,
        status:
          responseJson &&
          responseJson.state &&
          typeof responseJson.state.status === "string"
            ? responseJson.state.status.trim()
            : "CREATED",
        sharingUrl:
          responseJson && typeof responseJson.sharing_url === "string"
            ? responseJson.sharing_url.trim()
            : null,
      };
    } catch (error) {
      lastError = error;
      const yandexCode =
        typeof error === "object" &&
        error !== null &&
        "yandexCode" in error &&
        typeof (error as { yandexCode?: unknown }).yandexCode === "string"
          ? ((error as { yandexCode?: string }).yandexCode ?? "")
          : "";
      if (
        isSandboxHost &&
        yandexCode === "pickups_not_configured" &&
        sourceStationId !== YANDEX_DELIVERY_SANDBOX_SOURCE_STATION_ID
      ) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  return null;
}

export function appendPickupPointMetaToAddress(
  address: string,
  pickupPointId: string | null,
  pickupProvider: DeliveryProviderCode,
): string {
  const base = address.trim();
  const pointId = (pickupPointId ?? "").trim();
  const tags: string[] = [];
  if (pointId) {
    tags.push(`[PICKUP_ID:${pointId}]`);
  }
  tags.push(`[PICKUP_PROVIDER:${pickupProvider}]`);
  const cleanBase = base
    .replace(PICKUP_POINT_TAG_RE, "")
    .replace(PICKUP_PROVIDER_TAG_RE, "")
    .trim();
  return [cleanBase, ...tags].filter(Boolean).join(" ").trim();
}

function extractPickupPointIdFromAddress(address: string | null): string {
  const raw = normalizeTextField(address);
  if (!raw) return "";
  const match = raw.match(PICKUP_POINT_TAG_RE);
  if (!match) return "";
  return String(match[1] ?? "").trim();
}

function extractPickupProviderFromAddress(address: string | null): DeliveryProviderCode {
  const raw = normalizeTextField(address);
  if (!raw) return "yandex_pvz";
  const match = raw.match(PICKUP_PROVIDER_TAG_RE);
  if (!match) return "yandex_pvz";
  return normalizePickupProvider(String(match[1] ?? "").trim());
}

export function stripPickupPointTag(address: string | null): string {
  const raw = normalizeTextField(address);
  if (!raw) return "";
  return raw
    .replace(PICKUP_POINT_TAG_RE, "")
    .replace(PICKUP_PROVIDER_TAG_RE, "")
    .trim();
}

async function ensureYandexTrackingForOrdersInternal(
  prisma: PrismaClient,
  orderIds: number[],
): Promise<void> {
  if (orderIds.length === 0) return;

  const orders = await prisma.marketOrder.findMany({
    where: {
      id: { in: orderIds },
      delivery_type: "DELIVERY",
      OR: [
        { tracking_number: null },
        { tracking_number: { startsWith: "YND-ORD-" } },
      ],
      status: { in: ["PAID", "PREPARED", "PROCESSING"] },
    },
    include: {
      buyer: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  for (const order of orders) {
    const pickupProvider = extractPickupProviderFromAddress(order.delivery_address);
    if (pickupProvider !== "yandex_pvz") {
      await prisma.marketOrder.update({
        where: { id: order.id },
        data: {
          tracking_provider: pickupProvider,
        },
      });
      continue;
    }

    const pickupPointId = extractPickupPointIdFromAddress(order.delivery_address);
    if (!pickupPointId) {
      continue;
    }

    let createdRequest: YandexRequestCreateResult | null = null;
    try {
      createdRequest = await createYandexDeliveryRequestForOrder({
        orderPublicId: order.public_id,
        totalPrice: order.total_price,
        pickupPointId,
        buyerName: order.buyer.name,
        buyerEmail: order.buyer.email,
      });
    } catch (error) {
      console.warn(
        `Unable to create Yandex delivery request for ${order.public_id}:`,
        error,
      );
    }

    const hasLegacyTracking =
      typeof order.tracking_number === "string" &&
      order.tracking_number.trim().startsWith("YND-ORD-");

    if (!createdRequest?.requestId) {
      if (hasLegacyTracking || order.tracking_url) {
        await prisma.marketOrder.update({
          where: { id: order.id },
          data: {
            tracking_number: null,
            tracking_url: null,
          },
        });
      }
      continue;
    }

    await prisma.marketOrder.update({
      where: { id: order.id },
      data: {
        tracking_provider: "yandex_pvz",
        tracking_number: createdRequest.requestId,
        tracking_url:
          createdRequest.sharingUrl ||
          `https://dostavka.yandex.ru/route/${encodeURIComponent(createdRequest.requestId)}`,
        delivery_ext_status: createdRequest.status || "CREATED",
      },
    });
  }
}
export async function ensureYandexTrackingForOrders(
  prisma: PrismaClient,
  orderIds: number[],
): Promise<void> {
  return ensureYandexTrackingForOrdersInternal(prisma, orderIds);
}
