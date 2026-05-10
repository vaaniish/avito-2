import { MarketOrder, MarketOrderItem, OrderStatus, PlatformTransaction } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import { buildTargetUrl, createNotification } from "../notifications/notification.service";
import { assertOrderStatusTransitionAllowed } from "../orders/order-status-fsm";
import {
  fetchTrackingStatus,
  type DeliveryExternalStatus,
  type DeliveryProviderCode,
  validateTrackingNumber,
} from "./order-delivery";

const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const ORDER_DELIVERY_SYNC_INTERVAL_MS = 2 * 60 * 1000;
const DEFAULT_TRACKING_PROVIDER: DeliveryProviderCode = "yandex_pvz";

type PartnerOrderRow = MarketOrder & {
  items: Array<MarketOrderItem & { listing: { public_id: string } | null }>;
  transactions: PlatformTransaction[];
  buyer: {
    public_id: string;
    name: string;
  };
};

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}

function toDeliveryType(value: string): "pickup" | "delivery" {
  return value === "PICKUP" ? "pickup" : "delivery";
}

function parseOrderStatus(value: unknown): OrderStatus | null {
  const raw = typeof value === "string" ? value.toUpperCase() : "";
  if (raw === "CREATED") return "CREATED";
  if (raw === "PAID") return "PAID";
  if (raw === "PROCESSING") return "PROCESSING";
  if (raw === "PREPARED") return "PREPARED";
  if (raw === "SHIPPED") return "SHIPPED";
  if (raw === "DELIVERED") return "DELIVERED";
  if (raw === "COMPLETED") return "COMPLETED";
  if (raw === "CANCELLED") return "CANCELLED";
  return null;
}

function parseSellerEditableOrderStatus(value: unknown): OrderStatus | null {
  const raw = parseOrderStatus(value);
  if (raw === "PREPARED") return raw;
  return null;
}

function normalizeTrackingProvider(value: unknown): DeliveryProviderCode {
  if (value === "russian_post") return "russian_post";
  if (value === "yandex_pvz") return "yandex_pvz";
  return DEFAULT_TRACKING_PROVIDER;
}

function mapExternalDeliveryStatusToOrderStatus(
  status: DeliveryExternalStatus,
): OrderStatus | null {
  if (status === "IN_TRANSIT") return "SHIPPED";
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "ISSUED") return "COMPLETED";
  if (status === "CANCELLED") return "CANCELLED";
  return null;
}

async function writeOrderStatusTransition(params: {
  orderId: number;
  orderPublicId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorUserId: number | null;
  reason: string;
  ipAddress: string | null;
}): Promise<void> {
  await prisma.orderStatusHistory.create({
    data: {
      order_id: params.orderId,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      changed_by_id: params.actorUserId,
      reason: params.reason,
    },
  });

  await prisma.auditLog.create({
    data: {
      public_id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
      actor_user_id: params.actorUserId,
      action: "order.status_changed",
      entity_type: "order",
      entity_public_id: params.orderPublicId,
      details: {
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        reason: params.reason,
      },
      ip_address: params.ipAddress,
    },
  });
}

function shouldSyncDeliveryStatus(
  order: Pick<
    MarketOrder,
    "status" | "delivery_type" | "tracking_number" | "delivery_checked_at"
  >,
): boolean {
  if (order.delivery_type !== "DELIVERY") return false;
  if (!order.tracking_number) return false;
  if (order.status === "CANCELLED" || order.status === "COMPLETED") return false;
  if (!order.delivery_checked_at) return true;
  return Date.now() - order.delivery_checked_at.getTime() >= ORDER_DELIVERY_SYNC_INTERVAL_MS;
}

async function syncSingleOrderDeliveryStatus(
  order: Pick<
    MarketOrder,
    | "id"
    | "public_id"
    | "status"
    | "delivery_type"
    | "tracking_provider"
    | "tracking_number"
    | "tracking_url"
    | "delivered_at"
    | "issued_at"
    | "delivery_checked_at"
  >,
): Promise<void> {
  if (!shouldSyncDeliveryStatus(order)) return;

  const provider = normalizeTrackingProvider(order.tracking_provider);
  const tracking = await fetchTrackingStatus({
    provider,
    trackingNumber: order.tracking_number ?? "",
  });
  if (!tracking) return;

  const nextStatus = mapExternalDeliveryStatusToOrderStatus(tracking.status);
  const now = new Date();
  const data: Partial<MarketOrder> = {
    delivery_checked_at: now,
    delivery_ext_status: tracking.rawStatus ?? tracking.status,
  };
  if (tracking.trackingUrl && tracking.trackingUrl !== order.tracking_url) {
    data.tracking_url = tracking.trackingUrl;
  }

  let statusChanged = false;
  if (nextStatus && nextStatus !== order.status) {
    if (
      ((fromStatus, toStatus) => {
        try {
          assertOrderStatusTransitionAllowed({ fromStatus, toStatus, context: "delivery.sync" });
          return true;
        } catch {
          return false;
        }
      })(order.status, nextStatus)
    ) {
      data.status = nextStatus;
      statusChanged = true;
    }
  }

  if (nextStatus === "DELIVERED" && !order.delivered_at) {
    data.delivered_at = now;
  }
  if (nextStatus === "COMPLETED") {
    if (!order.delivered_at) data.delivered_at = now;
    if (!order.issued_at) data.issued_at = now;
  }

  await prisma.marketOrder.update({ where: { id: order.id }, data });
  if (statusChanged && nextStatus) {
    await writeOrderStatusTransition({
      orderId: order.id,
      orderPublicId: order.public_id,
      fromStatus: order.status,
      toStatus: nextStatus,
      actorUserId: null,
      reason: "delivery.sync.external_status",
      ipAddress: null,
    });
  }
}

export function registerPartnerOrdersRoutes(router: Router): void {
  router.get("/orders", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      let orders = await prisma.marketOrder.findMany({
        where: { seller_id: session.user.id },
        include: {
          buyer: { select: { public_id: true, name: true } },
          items: { include: { listing: { select: { public_id: true } } } },
          transactions: { orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 1 },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      const ordersForSync = orders.filter((order) => shouldSyncDeliveryStatus(order));
      if (ordersForSync.length > 0) {
        await Promise.all(ordersForSync.map((order) => syncSingleOrderDeliveryStatus(order)));
        orders = await prisma.marketOrder.findMany({
          where: { seller_id: session.user.id },
          include: {
            buyer: { select: { public_id: true, name: true } },
            items: { include: { listing: { select: { public_id: true } } } },
            transactions: { orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 1 },
          },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
        });
      }

      res.json(
        orders.map((order: PartnerOrderRow) => {
          const latestTransaction = order.transactions[0] ?? null;
          const grossAmount = latestTransaction?.amount ?? order.total_price;
          const commissionAmount = latestTransaction?.commission ?? null;
          const sellerPayout = commissionAmount === null ? null : grossAmount - commissionAmount;

          return {
            id: order.public_id,
            buyer_name: order.buyer.name,
            buyer_id: order.buyer.public_id,
            total_price: order.total_price,
            status: order.status,
            delivery_type: toDeliveryType(order.delivery_type),
            created_at: order.created_at,
            tracking_provider: order.tracking_provider,
            tracking_number: order.tracking_number,
            tracking_url: order.tracking_url,
            delivery_ext_status: order.delivery_ext_status,
            delivery_address: order.delivery_address,
            finance: {
              gross_amount: grossAmount,
              commission_rate: latestTransaction?.commission_rate ?? null,
              commission_amount: commissionAmount,
              seller_payout: sellerPayout,
              transaction_status: latestTransaction?.status ?? null,
              payment_provider: latestTransaction?.payment_provider?.toLowerCase() ?? null,
              payment_intent_id: latestTransaction?.payment_intent_id ?? null,
            },
            items: order.items.map((item) => ({
              id: String(item.id),
              listing_public_id: item.listing?.public_id ?? "",
              name: item.name,
              quantity: item.quantity,
              price: item.price,
            })),
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching partner orders:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/orders/:publicId/status", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { status?: unknown };
      const nextStatus = parseSellerEditableOrderStatus(body.status);
      if (!nextStatus) {
        res.status(400).json({ error: "Invalid order status" });
        return;
      }

      const existing = await prisma.marketOrder.findFirst({
        where: { public_id: String(publicId), seller_id: session.user.id },
        select: {
          id: true,
          public_id: true,
          status: true,
          delivery_type: true,
          delivery_address: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          total_price: true,
          buyer_id: true,
          buyer: { select: { name: true, email: true, phone: true } },
          items: { select: { name: true, price: true, quantity: true } },
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      if (existing.status !== "PAID") {
        res.status(409).json({ error: "Only PAID orders can be moved to PREPARED manually" });
        return;
      }

      assertOrderStatusTransitionAllowed({
        fromStatus: existing.status,
        toStatus: nextStatus,
        context: "seller.mark_prepared",
      });

      const updatedCount = await prisma.marketOrder.updateMany({
        where: { id: existing.id, status: "PAID" },
        data: { status: nextStatus },
      });

      if (updatedCount.count === 0) {
        res.status(409).json({ error: "Order status was updated automatically. Reload and retry." });
        return;
      }

      await writeOrderStatusTransition({
        orderId: existing.id,
        orderPublicId: existing.public_id,
        fromStatus: existing.status,
        toStatus: nextStatus,
        actorUserId: session.user.id,
        reason: "seller.mark_prepared",
        ipAddress: getRequestIp(req),
      });

      await createNotification({
        userId: existing.buyer_id,
        type: "ORDER_STATUS",
        message: `Заказ ${existing.public_id} подготовлен продавцом.`,
        targetUrl: buildTargetUrl("orders"),
      });

      res.json({ success: true, status: nextStatus, tracking: null, deliveryError: null });
    } catch (error) {
      console.error("Error updating order status:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("ORDER_STATUS_TRANSITION_NOT_ALLOWED")) {
        res.status(409).json({ error: "Order transition is not allowed by workflow rules." });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/orders/:publicId/tracking", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { publicId } = req.params;
      const body = (req.body ?? {}) as { tracking_number?: unknown; provider?: unknown };
      const rawTrackingNumber = typeof body.tracking_number === "string" ? body.tracking_number.trim() : "";
      if (!rawTrackingNumber) {
        res.status(400).json({ error: "Tracking number is required" });
        return;
      }

      const existing = await prisma.marketOrder.findFirst({
        where: { public_id: String(publicId), seller_id: session.user.id },
        select: {
          id: true,
          public_id: true,
          status: true,
          buyer_id: true,
          delivery_type: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          delivery_checked_at: true,
          delivered_at: true,
          issued_at: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      if (existing.delivery_type !== "DELIVERY") {
        res.status(400).json({ error: "Tracking number is available only for delivery orders" });
        return;
      }
      if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
        res.status(409).json({ error: "Tracking number cannot be changed for completed orders" });
        return;
      }

      const provider = normalizeTrackingProvider(body.provider);
      const validation = await validateTrackingNumber({ provider, trackingNumber: rawTrackingNumber });
      if (!validation.valid) {
        res.status(400).json({ error: "Invalid tracking number for selected delivery service" });
        return;
      }

      assertOrderStatusTransitionAllowed({
        fromStatus: existing.status,
        toStatus: "SHIPPED",
        context: "seller.tracking_assigned",
      });

      await prisma.marketOrder.update({
        where: { id: existing.id },
        data: {
          status: "SHIPPED",
          tracking_provider: provider,
          tracking_number: validation.normalizedTrackingNumber,
          tracking_url: validation.trackingUrl || null,
          delivery_checked_at: new Date(),
          delivery_ext_status: null,
          delivered_at: null,
          issued_at: null,
        },
      });

      if (existing.status !== "SHIPPED") {
        await writeOrderStatusTransition({
          orderId: existing.id,
          orderPublicId: existing.public_id,
          fromStatus: existing.status,
          toStatus: "SHIPPED",
          actorUserId: session.user.id,
          reason: "seller.tracking_assigned",
          ipAddress: getRequestIp(req),
        });
      }

      await createNotification({
        userId: existing.buyer_id,
        type: "ORDER_STATUS",
        message: `Заказ ${existing.public_id} отправлен. Трек-номер: ${validation.normalizedTrackingNumber}.`,
        targetUrl: buildTargetUrl("orders"),
      });

      const refreshed = await prisma.marketOrder.findUnique({
        where: { id: existing.id },
        select: {
          id: true,
          public_id: true,
          status: true,
          delivery_type: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          delivery_checked_at: true,
          delivered_at: true,
          issued_at: true,
        },
      });
      if (refreshed) {
        await syncSingleOrderDeliveryStatus(refreshed);
      }

      const finalState = await prisma.marketOrder.findUnique({
        where: { id: existing.id },
        select: {
          status: true,
          tracking_provider: true,
          tracking_number: true,
          tracking_url: true,
          delivery_ext_status: true,
        },
      });

      if (finalState && finalState.status !== "SHIPPED") {
        assertOrderStatusTransitionAllowed({
          fromStatus: "SHIPPED",
          toStatus: finalState.status,
          context: "delivery.sync.after_tracking_update",
        });
        await writeOrderStatusTransition({
          orderId: existing.id,
          orderPublicId: existing.public_id,
          fromStatus: "SHIPPED",
          toStatus: finalState.status,
          actorUserId: null,
          reason: "delivery.sync.after_tracking_update",
          ipAddress: getRequestIp(req),
        });
      }

      res.json({
        success: true,
        status: finalState?.status ?? "SHIPPED",
        tracking_provider: finalState?.tracking_provider ?? provider,
        tracking_number: finalState?.tracking_number ?? validation.normalizedTrackingNumber,
        tracking_url: finalState?.tracking_url ?? validation.trackingUrl,
        delivery_ext_status: finalState?.delivery_ext_status ?? null,
      });
    } catch (error) {
      console.error("Error applying tracking number:", error);
      const message = error instanceof Error ? error.message : "";
      if (message.includes("ORDER_STATUS_TRANSITION_NOT_ALLOWED")) {
        res.status(409).json({ error: "Tracking update conflicts with current order workflow state." });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
