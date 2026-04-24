import {
  AppUser,
  MarketOrder,
  MarketOrderItem,
  OrderStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { createHash } from "crypto";
import { Router, type Request, type Response } from "express";
import { assertOrderStatusTransitionAllowed } from "../orders/order-status-fsm";
import { getPolicyAcceptanceStatus } from "../policy/policy.shared";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

type DeliveryProviderCode = "russian_post" | "yandex_pvz";

type YooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
};

type YooKassaWebhookPayload = {
  event?: unknown;
  object?: {
    id?: unknown;
    status?: unknown;
  } | null;
};

const LISTING_RESERVATION_CONFLICT = "LISTING_RESERVATION_CONFLICT";
const CHECKOUT_CREATE_ACTION = "checkout.orders.create";

type IdempotencyStartResult =
  | { kind: "created"; recordId: number }
  | { kind: "cached"; statusCode: number; body: unknown }
  | { kind: "conflict"; message: string };

function serializeForJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function makeIdempotencyHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
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

  const allowedIps = parseIpAllowlist(process.env.YOOKASSA_WEBHOOK_IP_ALLOWLIST?.trim());
  if (allowedIps.size === 0) {
    return true;
  }

  const requestIp = getRequestIp(req);
  if (!requestIp) {
    return false;
  }

  return allowedIps.has(requestIp);
}

async function beginCheckoutIdempotency(params: {
  prisma: PrismaClient;
  actorUserId: number;
  action: string;
  key: string;
  requestHash: string;
}): Promise<IdempotencyStartResult> {
  const delegate = (
    params.prisma as unknown as {
      checkoutIdempotencyKey?: {
        findFirst: (args: unknown) => Promise<{
          id: number;
          request_hash: string;
          response_status: number | null;
          response_body: unknown;
        } | null>;
        create: (args: unknown) => Promise<{ id: number }>;
      };
    }
  ).checkoutIdempotencyKey;
  if (!delegate) {
    throw new Error("CHECKOUT_IDEMPOTENCY_DELEGATE_NOT_AVAILABLE");
  }

  const lookupWhere = {
    actor_user_id: params.actorUserId,
    action: params.action,
    idempotency_key: params.key,
  };

  const existing = await delegate.findFirst({
    where: lookupWhere,
    select: {
      id: true,
      request_hash: true,
      response_status: true,
      response_body: true,
    },
  });

  if (existing) {
    if (existing.request_hash !== params.requestHash) {
      return {
        kind: "conflict",
        message:
          "Idempotency-Key reuse with different payload is not allowed for checkout.",
      };
    }

    if (existing.response_status && existing.response_body) {
      return {
        kind: "cached",
        statusCode: existing.response_status,
        body: existing.response_body,
      };
    }

    return {
      kind: "conflict",
      message: "Checkout request with this Idempotency-Key is already in progress.",
    };
  }

  try {
    const created = await delegate.create({
      data: {
        public_id: `CID-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
        actor_user_id: params.actorUserId,
        action: params.action,
        idempotency_key: params.key,
        request_hash: params.requestHash,
      },
      select: {
        id: true,
      },
    });
    return { kind: "created", recordId: created.id };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const resolved = await delegate.findFirst({
      where: lookupWhere,
      select: {
        id: true,
        request_hash: true,
        response_status: true,
        response_body: true,
      },
    });

    if (!resolved) {
      throw error;
    }

    if (resolved.request_hash !== params.requestHash) {
      return {
        kind: "conflict",
        message:
          "Idempotency-Key reuse with different payload is not allowed for checkout.",
      };
    }

    if (resolved.response_status && resolved.response_body) {
      return {
        kind: "cached",
        statusCode: resolved.response_status,
        body: resolved.response_body,
      };
    }

    return {
      kind: "conflict",
      message: "Checkout request with this Idempotency-Key is already in progress.",
    };
  }
}

async function completeCheckoutIdempotency(params: {
  prisma: PrismaClient;
  recordId: number;
  statusCode: number;
  body: unknown;
}): Promise<void> {
  const delegate = (
    params.prisma as unknown as {
      checkoutIdempotencyKey?: {
        update: (args: unknown) => Promise<unknown>;
      };
    }
  ).checkoutIdempotencyKey;
  if (!delegate) {
    throw new Error("CHECKOUT_IDEMPOTENCY_DELEGATE_NOT_AVAILABLE");
  }

  await delegate.update({
    where: { id: params.recordId },
    data: {
      response_status: params.statusCode,
      response_body: serializeForJson(params.body),
    },
  });
}

async function abortCheckoutIdempotency(params: {
  prisma: PrismaClient;
  recordId: number;
}): Promise<void> {
  const delegate = (
    params.prisma as unknown as {
      checkoutIdempotencyKey?: {
        deleteMany: (args: unknown) => Promise<unknown>;
      };
    }
  ).checkoutIdempotencyKey;
  if (!delegate) {
    return;
  }

  await delegate.deleteMany({
    where: { id: params.recordId },
  });
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

async function writeOrderStatusTransitionRecords(params: {
  tx: Prisma.TransactionClient;
  transitions: Array<{
    orderId: number;
    orderPublicId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    changedById: number | null;
    reason: string;
    ipAddress: string | null;
  }>;
}): Promise<void> {
  if (params.transitions.length === 0) {
    return;
  }

  for (const transition of params.transitions) {
    assertOrderStatusTransitionAllowed({
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      context: transition.reason,
    });
  }

  await params.tx.orderStatusHistory.createMany({
    data: params.transitions.map((transition) => ({
      order_id: transition.orderId,
      from_status: transition.fromStatus,
      to_status: transition.toStatus,
      changed_by_id: transition.changedById,
      reason: transition.reason,
    })),
  });

  await Promise.all(
    params.transitions.map((transition) =>
      params.tx.auditLog.create({
        data: {
          public_id: makeAuditPublicId(),
          actor_user_id: transition.changedById,
          action: "order.status_changed",
          entity_type: "order",
          entity_public_id: transition.orderPublicId,
          details: serializeForJson({
            fromStatus: transition.fromStatus,
            toStatus: transition.toStatus,
            reason: transition.reason,
          }),
          ip_address: transition.ipAddress,
        },
      }),
    ),
  );
}

async function releaseReservedListingsByOrderIds(
  tx: Prisma.TransactionClient,
  orderIds: number[],
): Promise<void> {
  const uniqueOrderIds = uniqueNumbers(orderIds);
  if (uniqueOrderIds.length === 0) {
    return;
  }

  const orderItems = await tx.marketOrderItem.findMany({
    where: {
      order_id: { in: uniqueOrderIds },
      listing_id: { not: null },
    },
    select: {
      listing_id: true,
    },
  });

  const listingIds = uniqueNumbers(
    orderItems
      .map((item) => item.listing_id)
      .filter((listingId): listingId is number => listingId !== null),
  );

  if (listingIds.length === 0) {
    return;
  }

  const lockedByOtherOrders = await tx.marketOrderItem.findMany({
    where: {
      listing_id: { in: listingIds },
      order: {
        status: { not: "CANCELLED" },
      },
    },
    select: {
      listing_id: true,
    },
  });

  const blockedListingIds = new Set(
    lockedByOtherOrders
      .map((item) => item.listing_id)
      .filter((listingId): listingId is number => listingId !== null),
  );
  const releasableListingIds = listingIds.filter((listingId) => !blockedListingIds.has(listingId));
  if (releasableListingIds.length === 0) {
    return;
  }

  await tx.marketplaceListing.updateMany({
    where: {
      id: { in: releasableListingIds },
      status: "INACTIVE",
      moderation_status: "APPROVED",
    },
    data: {
      status: "ACTIVE",
    },
  });
}

type ProfileOrdersRouterDeps = {
  prisma: PrismaClient;
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  roleBuyer: string;
  roleSeller: string;
  roleAdmin: string;
  fallbackListingImage: string;
  normalizePickupProvider: (value: unknown) => DeliveryProviderCode;
  normalizeTextField: (value: unknown) => string;
  buildAddressFullAddress: (parts: {
    region?: string;
    city?: string;
    street?: string;
    house?: string;
    apartment?: string;
    entrance?: string;
  }) => string;
  appendPickupPointMetaToAddress: (
    address: string,
    pickupPointId: string | null,
    pickupProvider: DeliveryProviderCode,
  ) => string;
  stripPickupPointTag: (address: string | null) => string;
  toLocalizedDeliveryDate: (date: Date) => string;
  extractPrimaryCityFromAddresses: (
    addresses: Array<{ city: string }>,
  ) => string | null;
  toProfileOrderStatus: (
    status: string,
  ) => "processing" | "completed" | "cancelled" | "shipped";
  createYooKassaPayment: (params: {
    amountRub: number;
    description: string;
    metadata: Record<string, string>;
    paymentMethod: "card" | "sbp";
    idempotenceKey?: string;
  }) => Promise<YooKassaPayment>;
  fetchYooKassaPaymentById: (paymentId: string) => Promise<YooKassaPayment | null>;
  extractYooKassaPaymentBaseId: (paymentIntentId: string) => string;
  ensureYandexTrackingForOrders: (orderIds: number[]) => Promise<void>;
};

function profileRoles(deps: ProfileOrdersRouterDeps): string[] {
  return [deps.roleBuyer, deps.roleSeller, deps.roleAdmin];
}

export function createProfileOrdersRouter(
  deps: ProfileOrdersRouterDeps,
): Router {
  const router = Router();

  router.post(
    "/payments/yookassa/webhook",
    async (req: Request, res: Response) => {
      try {
        if (!isAllowedWebhookRequest(req)) {
          res.status(401).json({ success: false, error: "Unauthorized webhook source" });
          return;
        }

        const payload = (req.body ?? {}) as YooKassaWebhookPayload;
        const event = typeof payload.event === "string" ? payload.event.trim() : "";
        const paymentId =
          payload.object && typeof payload.object.id === "string"
            ? payload.object.id.trim()
            : "";
        const webhookStatus =
          payload.object && typeof payload.object.status === "string"
            ? payload.object.status.trim()
            : "";

        if (!paymentId) {
          res.status(200).json({ success: true, ignored: true });
          return;
        }

        let effectiveStatus = webhookStatus;
        try {
          const remotePayment = await deps.fetchYooKassaPaymentById(paymentId);
          if (remotePayment?.status) {
            effectiveStatus = remotePayment.status;
          }
        } catch (error) {
          console.warn("Unable to validate YooKassa payment in webhook:", error);
        }

        const isSucceeded =
          event === "payment.succeeded" || effectiveStatus === "succeeded";
        const isCanceled =
          event === "payment.canceled" || effectiveStatus === "canceled";

        if (!isSucceeded && !isCanceled) {
          res.status(200).json({ success: true, ignored: true });
          return;
        }

        const txStatus = isSucceeded ? "SUCCESS" : "FAILED";
        let affectedOrderIds: number[] = [];
        const requestIp = getRequestIp(req);

        await deps.prisma.$transaction(async (tx) => {
          const matched = await tx.platformTransaction.findMany({
            where: {
              payment_provider: "YOOMONEY",
              OR: [
                { payment_intent_id: paymentId },
                { payment_intent_id: { startsWith: `${paymentId}:` } },
              ],
            },
            select: {
              id: true,
              order_id: true,
            },
          });

          if (matched.length === 0) {
            return;
          }

          const txIds = matched.map((row) => row.id);
          const orderIds = uniqueNumbers(matched.map((row) => row.order_id));
          affectedOrderIds = orderIds;

          await tx.platformTransaction.updateMany({
            where: {
              id: { in: txIds },
              status: { in: ["HELD", "PENDING"] },
            },
            data: {
              status: txStatus,
            },
          });

          if (isSucceeded) {
            const payableOrders = await tx.marketOrder.findMany({
              where: {
                id: { in: orderIds },
                status: "CREATED",
              },
              select: {
                id: true,
                public_id: true,
                status: true,
              },
            });

            if (payableOrders.length === 0) {
              return;
            }

            await tx.marketOrder.updateMany({
              where: {
                id: { in: payableOrders.map((order) => order.id) },
                status: "CREATED",
              },
              data: {
                status: "PAID",
              },
            });

            await writeOrderStatusTransitionRecords({
              tx,
              transitions: payableOrders.map((order) => ({
                orderId: order.id,
                orderPublicId: order.public_id,
                fromStatus: order.status,
                toStatus: "PAID",
                changedById: null,
                reason: "payment.webhook.succeeded",
                ipAddress: requestIp,
              })),
            });
            return;
          }

          const cancellableOrders = await tx.marketOrder.findMany({
            where: {
              id: { in: orderIds },
              status: "CREATED",
            },
            select: {
              id: true,
              public_id: true,
              status: true,
            },
          });

          const cancellableOrderIds = cancellableOrders.map((order) => order.id);
          if (cancellableOrderIds.length === 0) {
            return;
          }

          await tx.marketOrder.updateMany({
            where: {
              id: { in: cancellableOrderIds },
              status: "CREATED",
            },
            data: {
              status: "CANCELLED",
            },
          });

          await releaseReservedListingsByOrderIds(tx, cancellableOrderIds);

          await writeOrderStatusTransitionRecords({
            tx,
            transitions: cancellableOrders.map((order) => ({
              orderId: order.id,
              orderPublicId: order.public_id,
              fromStatus: order.status,
              toStatus: "CANCELLED",
              changedById: null,
              reason: "payment.webhook.canceled",
              ipAddress: requestIp,
            })),
          });
        });

        if (isSucceeded && affectedOrderIds.length > 0) {
          await deps.ensureYandexTrackingForOrders(affectedOrderIds);
        }

        res.status(200).json({ success: true });
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

      const orderPublicIds = [
        ...new Set(
          rawOrderIds
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ];

      if (orderPublicIds.length === 0) {
        res.status(400).json({ error: "orderIds query is required" });
        return;
      }

      let orders = await deps.prisma.marketOrder.findMany({
        where: {
          buyer_id: session.user.id,
          public_id: { in: orderPublicIds },
        },
        include: {
          transactions: {
            orderBy: [{ created_at: "desc" }],
            take: 1,
          },
        },
      });

      const latestTransactions = orders
        .map((order) => order.transactions[0] ?? null)
        .filter(
          (
            tx,
          ): tx is NonNullable<typeof tx> =>
            tx !== null &&
            tx.payment_provider === "YOOMONEY" &&
            (tx.status === "HELD" || tx.status === "PENDING"),
        );

      if (latestTransactions.length > 0) {
        const groupedByBasePaymentId = new Map<
          string,
          Array<{ txId: number; orderId: number }>
        >();

        for (const tx of latestTransactions) {
          const basePaymentId = deps.extractYooKassaPaymentBaseId(tx.payment_intent_id);
          if (!basePaymentId) {
            continue;
          }
          const current = groupedByBasePaymentId.get(basePaymentId) ?? [];
          current.push({ txId: tx.id, orderId: tx.order_id });
          groupedByBasePaymentId.set(basePaymentId, current);
        }

        const succeededTxIds: number[] = [];
        const succeededOrderIds: number[] = [];
        const failedTxIds: number[] = [];
        const failedOrderIds: number[] = [];

        const lookupResults = await Promise.all(
          Array.from(groupedByBasePaymentId.entries()).map(
            async ([basePaymentId, refs]) => {
              try {
                const payment = await deps.fetchYooKassaPaymentById(basePaymentId);
                return {
                  refs,
                  status: payment?.status ?? "",
                };
              } catch {
                return {
                  refs,
                  status: "",
                };
              }
            },
          ),
        );

        for (const result of lookupResults) {
          if (result.status === "succeeded") {
            for (const ref of result.refs) {
              succeededTxIds.push(ref.txId);
              succeededOrderIds.push(ref.orderId);
            }
            continue;
          }
          if (result.status === "canceled") {
            for (const ref of result.refs) {
              failedTxIds.push(ref.txId);
              failedOrderIds.push(ref.orderId);
            }
          }
        }

        if (succeededTxIds.length > 0 || failedTxIds.length > 0) {
          const requestIp = getRequestIp(req);
          await deps.prisma.$transaction(async (tx) => {
            if (succeededTxIds.length > 0) {
              await tx.platformTransaction.updateMany({
                where: {
                  id: { in: succeededTxIds },
                  status: { in: ["HELD", "PENDING"] },
                },
                data: {
                  status: "SUCCESS",
                },
              });

              const payableOrders = await tx.marketOrder.findMany({
                where: {
                  id: { in: uniqueNumbers(succeededOrderIds) },
                  status: "CREATED",
                },
                select: {
                  id: true,
                  public_id: true,
                  status: true,
                },
              });

              if (payableOrders.length > 0) {
                await tx.marketOrder.updateMany({
                  where: {
                    id: { in: payableOrders.map((order) => order.id) },
                    status: "CREATED",
                  },
                  data: {
                    status: "PAID",
                  },
                });

                await writeOrderStatusTransitionRecords({
                  tx,
                  transitions: payableOrders.map((order) => ({
                    orderId: order.id,
                    orderPublicId: order.public_id,
                    fromStatus: order.status,
                    toStatus: "PAID",
                    changedById: null,
                    reason: "payment.poll.succeeded",
                    ipAddress: requestIp,
                  })),
                });
              }
            }

            if (failedTxIds.length > 0) {
              await tx.platformTransaction.updateMany({
                where: {
                  id: { in: failedTxIds },
                  status: { in: ["HELD", "PENDING"] },
                },
                data: {
                  status: "FAILED",
                },
              });
              const cancellableOrders = await tx.marketOrder.findMany({
                where: {
                  id: { in: uniqueNumbers(failedOrderIds) },
                  status: "CREATED",
                },
                select: {
                  id: true,
                  public_id: true,
                  status: true,
                },
              });

              const cancellableOrderIds = cancellableOrders.map((order) => order.id);

              if (cancellableOrderIds.length > 0) {
                await tx.marketOrder.updateMany({
                  where: {
                    id: { in: cancellableOrderIds },
                    status: "CREATED",
                  },
                  data: {
                    status: "CANCELLED",
                  },
                });

                await releaseReservedListingsByOrderIds(tx, cancellableOrderIds);

                await writeOrderStatusTransitionRecords({
                  tx,
                  transitions: cancellableOrders.map((order) => ({
                    orderId: order.id,
                    orderPublicId: order.public_id,
                    fromStatus: order.status,
                    toStatus: "CANCELLED",
                    changedById: null,
                    reason: "payment.poll.canceled",
                    ipAddress: requestIp,
                  })),
                });
              }
            }
          });

          if (succeededOrderIds.length > 0) {
            await deps.ensureYandexTrackingForOrders(succeededOrderIds);
          }

          orders = await deps.prisma.marketOrder.findMany({
            where: {
              buyer_id: session.user.id,
              public_id: { in: orderPublicIds },
            },
            include: {
              transactions: {
                orderBy: [{ created_at: "desc" }],
                take: 1,
              },
            },
          });
        }
      }

      const paymentOrders = orders.map((order) => ({
        orderId: order.public_id,
        orderStatus: order.status,
        paymentStatus: order.transactions[0]?.status ?? null,
        paymentProvider: order.transactions[0]?.payment_provider ?? null,
        paymentIntentId: order.transactions[0]?.payment_intent_id ?? null,
      }));

      const hasFailed = paymentOrders.some(
        (order) =>
          order.orderStatus === "CANCELLED" ||
          order.paymentStatus === "FAILED" ||
          order.paymentStatus === "CANCELLED",
      );
      const isPaid =
        paymentOrders.length > 0 &&
        paymentOrders.every(
          (order) =>
            order.orderStatus === "PAID" || order.paymentStatus === "SUCCESS",
        );
      const summary = hasFailed ? "failed" : isPaid ? "paid" : "pending";

      res.json({
        summary,
        orders: paymentOrders,
      });
    } catch (error) {
      console.error("Error fetching order payment status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/orders", async (req: Request, res: Response) => {
    let checkoutIdempotencyRecordId: number | null = null;

    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const checkoutPolicyStatus = await getPolicyAcceptanceStatus({
        prisma: deps.prisma,
        userId: session.user.id,
        scope: "CHECKOUT",
      });
      if (!checkoutPolicyStatus.accepted) {
        res.status(412).json({
          error: "Before checkout, accept the current marketplace checkout policy.",
          policy: checkoutPolicyStatus.policy
            ? {
                id: checkoutPolicyStatus.policy.public_id,
                scope: "checkout",
                version: checkoutPolicyStatus.policy.version,
                title: checkoutPolicyStatus.policy.title,
                contentUrl: checkoutPolicyStatus.policy.content_url,
              }
            : null,
        });
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
      const idempotencyKey = req.header("Idempotency-Key")?.trim() ?? "";
      if (!idempotencyKey) {
        res.status(400).json({ error: "Idempotency-Key header is required" });
        return;
      }
      if (idempotencyKey.length > 180) {
        res.status(400).json({ error: "Idempotency-Key is too long" });
        return;
      }

      const rawItems = Array.isArray(body.items) ? body.items : [];
      const parsedItems = rawItems
        .map((item) => item as { listingId?: unknown; quantity?: unknown })
        .map((item: { listingId?: unknown; quantity?: unknown }) => ({
          listingId: typeof item.listingId === "string" ? item.listingId.trim() : "",
          quantity: Number(item.quantity ?? 1),
        }))
        .filter(
          (item) =>
            item.listingId &&
            Number.isInteger(item.quantity) &&
            item.quantity > 0,
        );

      const requestedPaymentMethodRaw =
        typeof body.paymentMethod === "string" ? body.paymentMethod.trim() : "";
      const addressId = Number(body.addressId ?? 0);
      const customAddress =
        typeof body.customAddress === "string" ? body.customAddress.trim() : "";
      const pickupPointId =
        typeof body.pickupPointId === "string" ? body.pickupPointId.trim() : "";
      const pickupPointProviderRaw =
        typeof body.pickupPointProvider === "string"
          ? body.pickupPointProvider.trim()
          : "";
      const deliveryType = body.deliveryType === "pickup" ? "PICKUP" : "DELIVERY";
      const idempotencyHash = makeIdempotencyHash({
        deliveryType,
        paymentMethod: requestedPaymentMethodRaw || "card",
        addressId: Number.isInteger(addressId) ? addressId : 0,
        customAddress,
        pickupPointId,
        pickupPointProvider: pickupPointProviderRaw,
        items: parsedItems
          .map((item) => ({
            listingId: item.listingId,
            quantity: item.quantity,
          }))
          .sort((left, right) => left.listingId.localeCompare(right.listingId)),
      });
      const idempotencyStart = await beginCheckoutIdempotency({
        prisma: deps.prisma,
        actorUserId: session.user.id,
        action: CHECKOUT_CREATE_ACTION,
        key: idempotencyKey,
        requestHash: idempotencyHash,
      });

      if (idempotencyStart.kind === "cached") {
        res.status(idempotencyStart.statusCode).json(idempotencyStart.body);
        return;
      }

      if (idempotencyStart.kind === "conflict") {
        res.status(409).json({ error: idempotencyStart.message });
        return;
      }

      checkoutIdempotencyRecordId = idempotencyStart.recordId;
      const requestIp = getRequestIp(req);
      const respondAndComplete = async (statusCode: number, payload: unknown): Promise<void> => {
        if (checkoutIdempotencyRecordId !== null) {
          await completeCheckoutIdempotency({
            prisma: deps.prisma,
            recordId: checkoutIdempotencyRecordId,
            statusCode,
            body: payload,
          });
          checkoutIdempotencyRecordId = null;
        }
        res.status(statusCode).json(payload);
      };

      if (parsedItems.length === 0) {
        await respondAndComplete(400, {
          error: "Корзина пуста или содержит некорректные позиции",
        });
        return;
      }

      if (parsedItems.some((item) => item.quantity !== 1)) {
        await respondAndComplete(400, {
          error: "Каждое объявление можно добавить в заказ только в количестве 1",
        });
        return;
      }

      const hasDuplicateListings =
        new Set(parsedItems.map((item) => item.listingId)).size !==
        parsedItems.length;
      if (hasDuplicateListings) {
        await respondAndComplete(400, {
          error: "Нельзя оформить один и тот же товар в заказе несколько раз",
        });
        return;
      }

      const listingPublicIds = [
        ...new Set(parsedItems.map((item: { listingId: string }) => item.listingId)),
      ];
      const listings = await deps.prisma.marketplaceListing.findMany({
        where: {
          public_id: { in: listingPublicIds },
          moderation_status: "APPROVED",
          status: "ACTIVE",
        },
        include: {
          images: {
            select: { url: true },
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            take: 1,
          },
        },
      });

      if (listings.length !== listingPublicIds.length) {
        await respondAndComplete(400, {
          error: "Некоторые товары недоступны для заказа",
        });
        return;
      }

      const listingByPublicId = new Map<
        string,
        {
          id: number;
          public_id: string;
          seller_id: number;
          title: string;
          images: Array<{ url: string }>;
          price: number;
        }
      >(
        listings.map((listing) => [listing.public_id, listing]),
      );
      const groupedBySeller = new Map<
        number,
        Array<{
          listing_id: number;
          name: string;
          image: string | null;
          price: number;
          quantity: number;
        }>
      >();

      for (const item of parsedItems) {
        const listing = listingByPublicId.get(item.listingId);
        if (!listing) {
          await respondAndComplete(400, {
            error: `Товар ${item.listingId} не найден`,
          });
          return;
        }

        const current = groupedBySeller.get(listing.seller_id) ?? [];
        current.push({
          listing_id: listing.id,
          name: listing.title,
          image: listing.images[0]?.url ?? deps.fallbackListingImage,
          price: listing.price,
          quantity: 1,
        });
        groupedBySeller.set(listing.seller_id, current);
      }

      const requestedPaymentMethod = requestedPaymentMethodRaw || "card";
      if (requestedPaymentMethod !== "card" && requestedPaymentMethod !== "sbp") {
        await respondAndComplete(400, { error: "Unsupported payment method" });
        return;
      }

      const pickupPointProvider = deps.normalizePickupProvider(body.pickupPointProvider);

      let deliveryAddress = customAddress;
      if (!deliveryAddress && Number.isInteger(addressId) && addressId > 0) {
        const selectedAddress = await deps.prisma.userAddress.findFirst({
          where: {
            id: addressId,
            user_id: session.user.id,
          },
        });
        if (selectedAddress) {
          deliveryAddress =
            deps.normalizeTextField(selectedAddress.full_address) ||
            deps.buildAddressFullAddress({
              region: selectedAddress.region,
              city: selectedAddress.city,
              street: selectedAddress.street,
              house: selectedAddress.house,
              apartment: selectedAddress.apartment ?? "",
              entrance: selectedAddress.entrance ?? "",
            });
        }
      }

      if (!deliveryAddress) {
        const defaultAddress = await deps.prisma.userAddress.findFirst({
          where: {
            user_id: session.user.id,
            is_default: true,
          },
        });
        if (defaultAddress) {
          deliveryAddress =
            deps.normalizeTextField(defaultAddress.full_address) ||
            deps.buildAddressFullAddress({
              region: defaultAddress.region,
              city: defaultAddress.city,
              street: defaultAddress.street,
              house: defaultAddress.house,
              apartment: defaultAddress.apartment ?? "",
              entrance: defaultAddress.entrance ?? "",
            });
        }
      }

      if (deliveryType === "DELIVERY" && !deliveryAddress) {
        await respondAndComplete(400, { error: "Укажите адрес доставки" });
        return;
      }

      if (deliveryType === "DELIVERY" && !pickupPointId) {
        await respondAndComplete(400, {
          error: "Pickup point id is required for delivery",
        });
        return;
      }

      const hasCheckoutDelivery = deliveryType === "DELIVERY";
      const checkoutDeliveryCost = hasCheckoutDelivery ? 500 : 0;

      const preparedOrders = Array.from(groupedBySeller.entries()).map(
        ([sellerId, items], index) => {
          const subtotal = items.reduce(
            (sum: number, item: { price: number; quantity: number }) =>
              sum + item.price * item.quantity,
            0,
          );
          const deliveryCost = hasCheckoutDelivery && index === 0 ? checkoutDeliveryCost : 0;
          const discount = 0;
          const totalPrice = subtotal + deliveryCost - discount;
          const publicId = `ORD-${Date.now()}-${index + 1}`;
          return {
            sellerId,
            items,
            subtotal,
            deliveryCost,
            discount,
            totalPrice,
            publicId,
          };
        },
      );

      const totalAmount = preparedOrders.reduce((sum, order) => sum + order.totalPrice, 0);
      const yookassaPayment = await deps.createYooKassaPayment({
        amountRub: totalAmount,
        description: `РћРїР»Р°С‚Р° Р·Р°РєР°Р·Р° РІ Ecomm (${preparedOrders.length} С€С‚.)`,
        metadata: {
          source: "avito-2",
          buyer_id: String(session.user.id),
          orders_count: String(preparedOrders.length),
        },
        paymentMethod: requestedPaymentMethod,
        idempotenceKey: `${idempotencyKey}:payment`,
      });

      if (!yookassaPayment?.confirmation?.confirmation_url) {
        throw new Error("YooKassa did not return confirmation URL for redirect payment");
      }

      const createdOrders = await deps.prisma.$transaction(async (tx) => {
        const listingIdsToReserve = uniqueNumbers(
          preparedOrders.flatMap((preparedOrder) =>
            preparedOrder.items.map((item) => item.listing_id),
          ),
        );
        const reservedListing = await tx.marketplaceListing.updateMany({
          where: {
            id: { in: listingIdsToReserve },
            status: "ACTIVE",
            moderation_status: "APPROVED",
          },
          data: {
            status: "INACTIVE",
          },
        });

        if (reservedListing.count !== listingIdsToReserve.length) {
          throw new Error(LISTING_RESERVATION_CONFLICT);
        }

        const result: Array<{
          db_id: number;
          order_id: string;
          total_price: number;
        }> = [];

        let sequence = 0;
        for (const preparedOrder of preparedOrders) {
          sequence += 1;
          const initialTrackingProvider =
            deliveryType === "DELIVERY" ? pickupPointProvider : null;
          const initialTrackingNumber = null;
          const initialDeliveryExternalStatus = null;
          const order = await tx.marketOrder.create({
            data: {
              public_id: preparedOrder.publicId,
              buyer_id: session.user.id,
              seller_id: preparedOrder.sellerId,
              status: "CREATED",
              delivery_type: deliveryType,
              delivery_address:
                deliveryType === "DELIVERY" ? deliveryAddress : "РЎР°РјРѕРІС‹РІРѕР·",
              tracking_provider: initialTrackingProvider,
              tracking_number: initialTrackingNumber,
              tracking_url: null,
              delivery_ext_status: initialDeliveryExternalStatus,
              total_price: preparedOrder.totalPrice,
              delivery_cost: preparedOrder.deliveryCost,
              discount: preparedOrder.discount,
              items: {
                create: preparedOrder.items.map((item) => ({
                  listing_id: item.listing_id,
                  name: item.name,
                  image: item.image,
                  price: item.price,
                  quantity: item.quantity,
                })),
              },
            },
          });

          assertOrderStatusTransitionAllowed({
            fromStatus: null,
            toStatus: "CREATED",
            context: "checkout.created",
          });

          await tx.orderStatusHistory.create({
            data: {
              order_id: order.id,
              from_status: null,
              to_status: "CREATED",
              changed_by_id: session.user.id,
              reason: "checkout.created",
            },
          });

          await tx.auditLog.create({
            data: {
              public_id: makeAuditPublicId(),
              actor_user_id: session.user.id,
              action: "order.created",
              entity_type: "order",
              entity_public_id: order.public_id,
              details: serializeForJson({
                status: "CREATED",
                deliveryType,
              }),
              ip_address: requestIp,
            },
          });

          if (deliveryType === "DELIVERY") {
            await tx.marketOrder.update({
              where: { id: order.id },
              data: {
                delivery_address: deps.appendPickupPointMetaToAddress(
                  order.delivery_address ?? deliveryAddress,
                  pickupPointId,
                  pickupPointProvider,
                ),
              },
            });
          }

          const commissionRate = 3.5;
          const commission = Math.round((preparedOrder.totalPrice * commissionRate) / 100);
          const paymentIntentIdBase = yookassaPayment?.id ?? `pay_${Date.now()}`;
          const paymentIntentId = `${paymentIntentIdBase}:${sequence}`;
          await tx.platformTransaction.create({
            data: {
              public_id: `TXN-${Date.now()}-${sequence}`,
              order_id: order.id,
              buyer_id: session.user.id,
              seller_id: preparedOrder.sellerId,
              amount: preparedOrder.totalPrice,
              status: "HELD",
              commission_rate: commissionRate,
              commission,
              payment_provider: "YOOMONEY",
              payment_intent_id: paymentIntentId,
            },
          });

          result.push({
            db_id: order.id,
            order_id: order.public_id,
            total_price: preparedOrder.totalPrice,
          });
        }

        return result;
      });

      const successPayload = {
        success: true,
        orders: createdOrders.map((order) => ({
          order_id: order.order_id,
          total_price: order.total_price,
        })),
        total: createdOrders.reduce(
          (sum: number, order: { total_price: number }) => sum + order.total_price,
          0,
        ),
        payment: {
          provider: "yoomoney",
          paymentId: yookassaPayment?.id ?? null,
          status: yookassaPayment?.status ?? null,
          confirmationUrl: yookassaPayment?.confirmation?.confirmation_url ?? null,
        },
      };
      await respondAndComplete(201, successPayload);
    } catch (error) {
      if (checkoutIdempotencyRecordId !== null) {
        try {
          await abortCheckoutIdempotency({
            prisma: deps.prisma,
            recordId: checkoutIdempotencyRecordId,
          });
        } catch (abortError) {
          console.warn("Unable to cleanup checkout idempotency record:", abortError);
        }
      }

      console.error("Error creating orders:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      if (message.includes(LISTING_RESERVATION_CONFLICT)) {
        res.status(409).json({ error: "Товар уже зарезервирован другим покупателем" });
        return;
      }
      if (message.includes("YooKassa") || message.includes("YooMoney")) {
        res.status(502).json({ error: message });
        return;
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/orders", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const orders = await deps.prisma.marketOrder.findMany({
        where: { buyer_id: session.user.id },
        include: {
          seller: {
            include: {
              addresses: {
                select: {
                  city: true,
                },
                orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                take: 1,
              },
            },
          },
          items: true,
        },
        orderBy: [{ created_at: "desc" }],
      });

      res.json(
        orders.map(
          (
            order: MarketOrder & {
              seller: AppUser & { addresses: Array<{ city: string }> };
              items: MarketOrderItem[];
            },
          ) => ({
            id: String(order.id),
            orderNumber: `#${order.public_id}`,
            date: order.created_at,
            status: deps.toProfileOrderStatus(order.status),
            total: order.total_price,
            deliveryDate: deps.toLocalizedDeliveryDate(order.created_at),
            deliveryAddress:
              deps.stripPickupPointTag(order.delivery_address) ||
              "Адрес не указан",
            deliveryCost: order.delivery_cost,
            discount: order.discount,
            seller: {
              name: order.seller.name,
              avatar: order.seller.avatar,
              phone: order.seller.phone ?? "",
              address: `${deps.extractPrimaryCityFromAddresses(order.seller.addresses) ?? "Город не указан"}`,
              workingHours: "пн — вс: 9:00-21:00",
            },
            items: order.items.map((item: MarketOrderItem) => ({
              id: String(item.id),
              name: item.name,
              image: item.image ?? "",
              price: item.price,
              quantity: item.quantity,
            })),
          }),
        ),
      );
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
