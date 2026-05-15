import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { DeliveryProviderCode, YooKassaWebhookPayload } from "../application/profile-orders.types";
import type { CreateOrderService } from "../application/services/create-order.service";
import type { GetOrderPaymentStatusService } from "../application/services/get-order-payment-status.service";
import type { HandleYooKassaWebhookService } from "../application/services/handle-yookassa-webhook.service";
import type { ListProfileOrdersService } from "../application/services/list-profile-orders.service";

type SessionResult =
  | { ok: true; user: { id: number; role: string } }
  | { ok: false; status: number; message: string };

export type ProfileOrdersHttpDeps = {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  roleBuyer: string;
  roleSeller: string;
  roleAdmin: string;
  normalizePickupProvider: (value: unknown) => DeliveryProviderCode;
  services: {
    handleYooKassaWebhook: HandleYooKassaWebhookService;
    getOrderPaymentStatus: GetOrderPaymentStatusService;
    createOrder: CreateOrderService;
    listProfileOrders: ListProfileOrdersService;
  };
};

function profileRoles(deps: ProfileOrdersHttpDeps): string[] {
  return [deps.roleBuyer, deps.roleSeller, deps.roleAdmin];
}

function normalizeIp(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.startsWith("::ffff:")) {
    return normalized.slice("::ffff:".length);
  }
  return normalized;
}

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (typeof forwarded === "string" && forwarded.trim()) {
    const candidate = normalizeIp(forwarded.split(",")[0] ?? "");
    return candidate || null;
  }

  if (typeof req.ip === "string" && req.ip.trim()) {
    const candidate = normalizeIp(req.ip);
    return candidate || null;
  }

  return null;
}

function parseIpAllowlist(rawValue: string | undefined): Set<string> {
  if (!rawValue) return new Set<string>();
  return new Set(
    rawValue
      .split(",")
      .map((value) => normalizeIp(value))
      .filter(Boolean),
  );
}

function isAllowedWebhookRequest(req: Request): boolean {
  const expectedToken = process.env.YOOKASSA_WEBHOOK_TOKEN?.trim();
  if (expectedToken) {
    const token =
      req.header("x-yookassa-webhook-token")?.trim() ||
      req.header("x-webhook-token")?.trim() ||
      "";
    if (!token || token !== expectedToken) {
      return false;
    }
  }

  const allowedIps = parseIpAllowlist(
    process.env.YOOKASSA_WEBHOOK_IP_ALLOWLIST?.trim(),
  );
  if (allowedIps.size === 0) {
    return true;
  }

  const requestIp = getRequestIp(req);
  if (!requestIp) {
    return false;
  }

  return allowedIps.has(requestIp);
}

export function createProfileOrdersHttpRouter(
  deps: ProfileOrdersHttpDeps,
): Router {
  const router = Router();

  router.post(
    "/payments/yookassa/webhook",
    async (req: Request, res: Response) => {
      try {
        if (!isAllowedWebhookRequest(req)) {
          res
            .status(401)
            .json({ success: false, error: "Unauthorized webhook source" });
          return;
        }

        const result = await deps.services.handleYooKassaWebhook.execute({
          payload: (req.body ?? {}) as YooKassaWebhookPayload,
          requestIp: getRequestIp(req),
        });
        res.status(200).json(result);
      } catch (error) {
        console.error("Error in YooKassa webhook:", error);
        res.status(200).json({ success: false });
      }
    },
  );

  router.get("/orders/payment-status", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const rawOrderIds = Array.isArray(req.query.orderIds)
        ? req.query.orderIds.join(",")
        : typeof req.query.orderIds === "string"
          ? req.query.orderIds
          : "";

      const result = await deps.services.getOrderPaymentStatus.execute({
        buyerId: session.user.id,
        orderPublicIds: rawOrderIds.split(","),
        requestIp: getRequestIp(req),
      });
      res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching order payment status:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/orders", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        items?: unknown;
        addressId?: unknown;
        customAddress?: unknown;
        pickupPointId?: unknown;
        pickupPointProvider?: unknown;
        deliveryType?: unknown;
        paymentMethod?: unknown;
      };

      const rawItems = Array.isArray(body.items) ? body.items : [];
      const parsedItems = rawItems
        .map((item) => item as { listingId?: unknown; quantity?: unknown })
        .map((item) => ({
          listingId:
            typeof item.listingId === "string" ? item.listingId.trim() : "",
          quantity: Number(item.quantity ?? 1),
        }));

      const requestedPaymentMethodRaw =
        typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";

      const result = await deps.services.createOrder.execute({
        actorUserId: session.user.id,
        actorRole: session.user.role,
        idempotencyKey: req.header("Idempotency-Key")?.trim() ?? "",
        items: parsedItems,
        addressId: Number(body.addressId ?? 0),
        customAddress:
          typeof body.customAddress === "string" ? body.customAddress.trim() : "",
        pickupPointId:
          typeof body.pickupPointId === "string"
            ? body.pickupPointId.trim()
            : "",
        pickupPointProvider: deps.normalizePickupProvider(
          body.pickupPointProvider,
        ),
        deliveryType: body.deliveryType === "pickup" ? "PICKUP" : "DELIVERY",
        paymentMethod: requestedPaymentMethodRaw || "card",
        requestIp: getRequestIp(req),
      });
      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating orders:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/orders", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const result = await deps.services.listProfileOrders.execute({
        buyerId: session.user.id,
      });
      res.status(200).json(result);
    } catch (error) {
      console.error("Error fetching orders:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
