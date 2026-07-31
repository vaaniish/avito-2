import { logger } from "../../../../lib/logger";
import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import {
  getRequestIpFromExpressLike,
  normalizeRequestIp,
} from "../../../../common/http/request-meta";
import type { DeliveryProviderCode, YooKassaWebhookPayload } from "../application/profile-orders.types";
import type { CancelProfileOrderService } from "../application/services/cancel-profile-order.service";
import type { CreateOrderService } from "../application/services/create-order.service";
import type { GetOrderPaymentStatusService } from "../application/services/get-order-payment-status.service";
import type { HandleYooKassaWebhookService } from "../application/services/handle-yookassa-webhook.service";
import type { ListProfileOrdersService } from "../application/services/list-profile-orders.service";
import type { PreviewCheckoutPromoService } from "../application/services/preview-checkout-promo.service";

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
    previewCheckoutPromo: PreviewCheckoutPromoService;
    cancelProfileOrder: CancelProfileOrderService;
  };
};

function profileRoles(deps: ProfileOrdersHttpDeps): string[] {
  return [deps.roleBuyer, deps.roleSeller, deps.roleAdmin];
}

function normalizeIp(value: string): string {
  return normalizeRequestIp(value) ?? "";
}

function getRequestIp(req: Request): string | null {
  return getRequestIpFromExpressLike(req);
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
        logger.error("error_in_yookassa_webhook", { error });
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
      logger.error("error_fetching_order_payment_status", { error });
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
        pickupPointAddress?: unknown;
        pickupPointId?: unknown;
        pickupPointProvider?: unknown;
        deliveryType?: unknown;
        paymentMethod?: unknown;
        promoCode?: unknown;
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
        pickupPointAddress:
          typeof body.pickupPointAddress === "string"
            ? body.pickupPointAddress.trim()
            : "",
        pickupPointId:
          typeof body.pickupPointId === "string"
            ? body.pickupPointId.trim()
            : "",
        pickupPointProvider: deps.normalizePickupProvider(
          body.pickupPointProvider,
        ),
        deliveryType: body.deliveryType === "pickup" ? "PICKUP" : "DELIVERY",
        paymentMethod: requestedPaymentMethodRaw || "card",
        promoCode: typeof body.promoCode === "string" ? body.promoCode.trim() : "",
        requestIp: getRequestIp(req),
      });
      res.status(201).json(result);
    } catch (error) {
      logger.error("error_creating_orders", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/orders/promo/preview", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        items?: unknown;
        promoCode?: unknown;
      };

      const rawItems = Array.isArray(body.items) ? body.items : [];
      const parsedItems = rawItems
        .map((item) => item as { listingId?: unknown; quantity?: unknown })
        .map((item) => ({
          listingId:
            typeof item.listingId === "string" ? item.listingId.trim() : "",
          quantity: Number(item.quantity ?? 1),
        }));

      const result = await deps.services.previewCheckoutPromo.execute({
        actorUserId: session.user.id,
        items: parsedItems,
        promoCode: typeof body.promoCode === "string" ? body.promoCode.trim() : "",
      });

      res.status(200).json(result);
    } catch (error) {
      logger.error("error_previewing_checkout_promo", { error });
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
      logger.error("error_fetching_orders", { error });
      sendApplicationError(res, error);
    }
  });

  router.post("/orders/:orderId/cancel", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const orderId =
        typeof req.params.orderId === "string" ? req.params.orderId.trim() : "";
      const result = await deps.services.cancelProfileOrder.execute({
        buyerId: session.user.id,
        orderPublicId: orderId,
        requestIp: getRequestIp(req),
      });
      res.status(200).json(result);
    } catch (error) {
      logger.error("error_cancelling_order", { error });
      sendApplicationError(res, error);
    }
  });

  return router;
}
