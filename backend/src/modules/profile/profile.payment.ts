import { randomUUID } from "crypto";

export type YooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
};

type YooKassaConfig = {
  shopId: string;
  secretKey: string;
  returnUrl: string;
  apiUrl: string;
};

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const cause = (error as { cause?: unknown }).cause as
    | { code?: unknown }
    | undefined;
  const code = typeof cause?.code === "string" ? cause.code : "";
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getYooKassaConfig(): YooKassaConfig {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

  if (!shopId || !secretKey) {
    throw new Error(
      "YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.",
    );
  }

  return {
    shopId,
    secretKey,
    returnUrl:
      process.env.YOOKASSA_RETURN_URL?.trim() ||
      "http://localhost:3000/payment-return",
    apiUrl: process.env.YOOKASSA_API_URL?.trim() || "https://api.yookassa.ru/v3",
  };
}

export async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  metadata: Record<string, string>;
  paymentMethod: "card" | "sbp";
  idempotenceKey?: string;
}): Promise<YooKassaPayment> {
  const config = getYooKassaConfig();
  const authToken = Buffer.from(
    `${config.shopId}:${config.secretKey}`,
    "utf8",
  ).toString("base64");

  const payloadBody = JSON.stringify({
    amount: {
      value: params.amountRub.toFixed(2),
      currency: "RUB",
    },
    capture: true,
    payment_method_data: {
      type: params.paymentMethod === "sbp" ? "sbp" : "bank_card",
    },
    save_payment_method: false,
    confirmation: {
      type: "redirect",
      return_url: config.returnUrl,
    },
    description: params.description,
    metadata: params.metadata,
  });

  let response: globalThis.Response | null = null;
  let lastError: unknown = null;
  const maxAttempts = 3;
  const idempotenceKey = params.idempotenceKey?.trim() || randomUUID();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${config.apiUrl}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authToken}`,
          "Content-Type": "application/json",
          "Idempotence-Key": idempotenceKey,
        },
        body: payloadBody,
      });
      break;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }
      await delay(300 * attempt);
    }
  }

  if (!response) {
    if (isRetryableNetworkError(lastError)) {
      throw new Error(
        "YooKassa is temporarily unavailable (DNS/network). Check internet, VPN/proxy, and DNS settings.",
      );
    }
    throw new Error("YooKassa request failed");
  }

  const rawBody = await response.text();
  const payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "description" in payload &&
      typeof (payload as { description?: unknown }).description === "string"
        ? (payload as { description: string }).description
        : `YooKassa request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { id?: unknown }).id !== "string" ||
    typeof (payload as { status?: unknown }).status !== "string"
  ) {
    throw new Error("Invalid YooKassa response");
  }

  return payload as YooKassaPayment;
}

export function extractYooKassaPaymentBaseId(paymentIntentId: string): string {
  const normalized = paymentIntentId.trim();
  if (!normalized) return "";
  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0) return normalized;
  return normalized.slice(0, separatorIndex).trim();
}

export async function fetchYooKassaPaymentById(
  paymentId: string,
): Promise<YooKassaPayment | null> {
  if (!paymentId.trim()) {
    return null;
  }

  const config = getYooKassaConfig();
  const authToken = Buffer.from(
    `${config.shopId}:${config.secretKey}`,
    "utf8",
  ).toString("base64");

  const response = await fetch(
    `${config.apiUrl}/payments/${encodeURIComponent(paymentId)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${authToken}`,
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { id?: unknown }).id !== "string" ||
    typeof (payload as { status?: unknown }).status !== "string"
  ) {
    return null;
  }

  return payload as YooKassaPayment;
}
