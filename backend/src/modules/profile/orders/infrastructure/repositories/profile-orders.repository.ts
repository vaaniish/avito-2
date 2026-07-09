import {
  OrderStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import {
  conflict,
  validationError,
} from "../../../../../common/application-error";
import {
  makeAuditPublicId,
  makeOpaquePublicId,
} from "../../../../../common/domain/public-id";
import { assertOrderStatusTransitionAllowed } from "../../../../orders/order-status-fsm";
import { recomputeSellerCommissionSnapshot } from "../../../../finance/infrastructure/repositories/commission-program.repository";
import { recommendationServices } from "../../../../recommendations";
import type {
  BuyerOrderPaymentStatusRow,
  BuyerOrderWithRelations,
  CheckoutIdempotencyStartResult,
  DeliveryProviderCode,
} from "../../domain/profile-orders.types";
import {
  LISTING_RESERVATION_CONFLICT,
  makeCheckoutIdempotencyHash,
} from "../../domain/profile-orders.helpers";
const CHECKOUT_CREATE_ACTION = "checkout.orders.create";

const APPROVED_PARTNERSHIP_STATUSES = ["APPROVED", "APPROVED_LIMITED"] as const;
const BUYER_ORDER_DETAIL_INCLUDE: Prisma.MarketOrderInclude = {
  seller: {
    select: {
      name: true,
      avatar: true,
      phone: true,
      work_email: true,
      addresses: {
        select: {
          city: true,
        },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        take: 1,
      },
      partnership_requests: {
        where: {
          status: {
            in: [...APPROVED_PARTNERSHIP_STATUSES],
          },
        },
        orderBy: [{ created_at: "desc" }],
        take: 1,
        select: {
          onboarding_profile: {
            select: {
              support_phone: true,
              support_email: true,
              service_hours: true,
            },
          },
        },
      },
    },
  },
  items: {
    include: {
      listing: {
        select: {
          public_id: true,
        },
      },
    },
  },
};

function serializeForJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
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

async function restoreListingStockByOrderIds(
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
      quantity: true,
    },
  });

  const quantityByListingId = new Map<number, number>();
  for (const item of orderItems) {
    if (item.listing_id === null) continue;
    quantityByListingId.set(
      item.listing_id,
      (quantityByListingId.get(item.listing_id) ?? 0) + Math.max(1, item.quantity),
    );
  }

  const listingIds = Array.from(quantityByListingId.keys());

  if (listingIds.length === 0) {
    return;
  }

  for (const [listingId, quantity] of quantityByListingId.entries()) {
    await tx.marketplaceListing.update({
      where: { id: listingId },
      data: {
        available_quantity: {
          increment: quantity,
        },
      },
    });
  }

  await tx.marketplaceListing.updateMany({
    where: {
      id: { in: listingIds },
      status: "INACTIVE",
      moderation_status: "APPROVED",
      available_quantity: {
        gt: 0,
      },
    },
    data: {
      status: "ACTIVE",
    },
  });
}

async function releasePromoActivationsForCheckoutGroups(
  tx: Prisma.TransactionClient,
  checkoutGroupKeys: string[],
): Promise<void> {
  const groups = [...new Set(checkoutGroupKeys.map((value) => value.trim()).filter(Boolean))];
  if (groups.length === 0) {
    return;
  }

  const groupedOrders = await tx.marketOrder.findMany({
    where: {
      checkout_group_key: { in: groups },
    },
    select: {
      checkout_group_key: true,
      status: true,
      transactions: {
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 1,
        select: { status: true },
      },
    },
  });

  const releasableGroups = groups.filter((groupKey) => {
    const orders = groupedOrders.filter((order) => order.checkout_group_key === groupKey);
    if (orders.length === 0) return false;
    return orders.every((order) => {
      const latestTxStatus = order.transactions[0]?.status ?? null;
      return (
        order.status === "CANCELLED" ||
        latestTxStatus === "FAILED" ||
        latestTxStatus === "CANCELLED" ||
        latestTxStatus === "REFUNDED"
      );
    });
  });

  if (releasableGroups.length === 0) {
    return;
  }

  await tx.promoActivation.updateMany({
    where: {
      checkout_group_key: { in: releasableGroups },
      status: { in: ["RESERVED", "CONSUMED"] },
    },
    data: {
      status: "RELEASED",
    },
  });
}

export class ProfileOrdersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async beginCheckoutIdempotency(params: {
    actorUserId: number;
    key: string;
    requestHash: string;
  }): Promise<CheckoutIdempotencyStartResult> {
    const delegate = (
      this.prisma as unknown as {
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
      action: CHECKOUT_CREATE_ACTION,
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
        message:
          "Checkout request with this Idempotency-Key is already in progress.",
      };
    }

    try {
      const created = await delegate.create({
        data: {
          public_id: makeOpaquePublicId("CID", 20),
          actor_user_id: params.actorUserId,
          action: CHECKOUT_CREATE_ACTION,
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
        message:
          "Checkout request with this Idempotency-Key is already in progress.",
      };
    }
  }

  async completeCheckoutIdempotency(params: {
    recordId: number;
    statusCode: number;
    body: unknown;
  }): Promise<void> {
    const delegate = (
      this.prisma as unknown as {
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

  async abortCheckoutIdempotency(recordId: number): Promise<void> {
    const delegate = (
      this.prisma as unknown as {
        checkoutIdempotencyKey?: {
          deleteMany: (args: unknown) => Promise<unknown>;
        };
      }
    ).checkoutIdempotencyKey;
    if (!delegate) {
      return;
    }

    await delegate.deleteMany({
      where: { id: recordId },
    });
  }

  async findOrdersByBuyerAndPublicIds(params: {
    buyerId: number;
    orderPublicIds: string[];
  }): Promise<BuyerOrderPaymentStatusRow[]> {
    return this.prisma.marketOrder.findMany({
      where: {
        buyer_id: params.buyerId,
        public_id: { in: params.orderPublicIds },
      },
      include: {
        transactions: {
          orderBy: [{ created_at: "desc" }],
          take: 1,
        },
      },
    });
  }

  async findOrdersByCheckoutGroupKey(checkoutGroupKey: string) {
    return this.prisma.marketOrder.findMany({
      where: {
        checkout_group_key: checkoutGroupKey,
      },
      include: {
        transactions: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
        status_history: {
          where: { to_status: "PAID" },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  }

  async findOrdersByIds(orderIds: number[]) {
    return this.prisma.marketOrder.findMany({
      where: {
        id: { in: uniqueNumbers(orderIds) },
      },
      include: {
        transactions: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
        status_history: {
          where: { to_status: "PAID" },
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    });
  }

  async findPaymentTransactionRefsByPaymentId(paymentId: string): Promise<
    Array<{ txId: number; orderId: number }>
  > {
    const matched = await this.prisma.platformTransaction.findMany({
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

    return matched.map((row) => ({
      txId: row.id,
      orderId: row.order_id,
    }));
  }

  async applySuccessfulPayment(params: {
    transactionIds: number[];
    orderIds: number[];
    requestIp: string | null;
    reason: string;
  }): Promise<void> {
    const paidSignals: Array<{ buyerId: number; listingIds: number[] }> = [];
    await this.prisma.$transaction(async (tx) => {
      await tx.platformTransaction.updateMany({
        where: {
          id: { in: params.transactionIds },
          status: { in: ["HELD", "PENDING"] },
        },
        data: {
          status: "SUCCESS",
        },
      });

      const payableOrders = await tx.marketOrder.findMany({
        where: {
          id: { in: uniqueNumbers(params.orderIds) },
          status: "CREATED",
        },
        select: {
          id: true,
          public_id: true,
          status: true,
          buyer_id: true,
          items: {
            select: {
              listing_id: true,
            },
          },
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
          reason: params.reason,
          ipAddress: params.requestIp,
        })),
      });

      for (const order of payableOrders) {
        paidSignals.push({
          buyerId: order.buyer_id,
          listingIds: order.items
            .map((item) => item.listing_id)
            .filter((item): item is number => Number.isInteger(item)),
        });
      }

      const paidOrderGroups = await tx.marketOrder.findMany({
        where: {
          id: { in: payableOrders.map((order) => order.id) },
          checkout_group_key: { not: null },
        },
        select: {
          id: true,
          checkout_group_key: true,
        },
      });

      const activationRows = await tx.promoActivation.findMany({
        where: {
          checkout_group_key: {
            in: paidOrderGroups
              .map((order) => order.checkout_group_key)
              .filter((value): value is string => Boolean(value)),
          },
          status: "RESERVED",
        },
        select: {
          id: true,
          checkout_group_key: true,
          order_id: true,
        },
      });

      const firstOrderIdByGroup = new Map<string, number>();
      for (const order of paidOrderGroups) {
        if (!order.checkout_group_key) continue;
        if (!firstOrderIdByGroup.has(order.checkout_group_key)) {
          firstOrderIdByGroup.set(order.checkout_group_key, order.id);
        }
      }

      await Promise.all(
        activationRows.map((activation) =>
          tx.promoActivation.update({
            where: { id: activation.id },
            data: {
              status: "CONSUMED",
              order_id:
                activation.order_id ??
                firstOrderIdByGroup.get(activation.checkout_group_key) ??
                null,
            },
          }),
        ),
      );
    });

    for (const signal of paidSignals) {
      for (const listingId of signal.listingIds) {
        await recommendationServices.recordEvent.execute({
          userId: signal.buyerId,
          listingId,
          eventType: "PURCHASE_PAID",
          sourcePage: "checkout-payment",
        });
      }
    }
  }

  async applyFailedPayment(params: {
    transactionIds: number[];
    orderIds: number[];
    requestIp: string | null;
    reason: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.platformTransaction.updateMany({
        where: {
          id: { in: params.transactionIds },
          status: { in: ["HELD", "PENDING"] },
        },
        data: {
          status: "FAILED",
        },
      });

      const cancellableOrders = await tx.marketOrder.findMany({
        where: {
          id: { in: uniqueNumbers(params.orderIds) },
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

      await restoreListingStockByOrderIds(tx, cancellableOrderIds);

      await writeOrderStatusTransitionRecords({
        tx,
        transitions: cancellableOrders.map((order) => ({
          orderId: order.id,
          orderPublicId: order.public_id,
          fromStatus: order.status,
          toStatus: "CANCELLED",
          changedById: null,
          reason: params.reason,
          ipAddress: params.requestIp,
        })),
      });

      const cancelledGroups = await tx.marketOrder.findMany({
        where: {
          id: { in: cancellableOrderIds },
          checkout_group_key: { not: null },
        },
        select: {
          checkout_group_key: true,
        },
      });

      await releasePromoActivationsForCheckoutGroups(
        tx,
        cancelledGroups
          .map((order) => order.checkout_group_key)
          .filter((value): value is string => Boolean(value)),
      );
    });
  }

  async findApprovedActiveListingsByPublicIds(listingPublicIds: string[]) {
    return this.prisma.marketplaceListing.findMany({
      where: {
        public_id: { in: listingPublicIds },
        moderation_status: "APPROVED",
        status: "ACTIVE",
      },
      include: {
        item: {
          select: {
            id: true,
            public_id: true,
            subcategory_id: true,
            subcategory: {
              select: {
                id: true,
                public_id: true,
                category_id: true,
                category: {
                  select: {
                    id: true,
                    public_id: true,
                  },
                },
              },
            },
          },
        },
        images: {
          select: { url: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          take: 1,
        },
      },
    });
  }

  async findPromoByCode(code: string) {
    return this.prisma.promoCode.findUnique({
      where: { code },
      include: {
        scope_targets: {
          select: {
            target_type: true,
            category_id: true,
            subcategory_id: true,
            item_id: true,
            listing_id: true,
          },
        },
      },
    });
  }

  async countActivePromoActivations(promoId: number): Promise<number> {
    return this.prisma.promoActivation.count({
      where: {
        promo_code_id: promoId,
        status: { in: ["RESERVED", "CONSUMED"] },
      },
    });
  }

  async countActivePromoActivationsForUser(params: {
    promoId: number;
    userId: number;
  }): Promise<number> {
    return this.prisma.promoActivation.count({
      where: {
        promo_code_id: params.promoId,
        user_id: params.userId,
        status: { in: ["RESERVED", "CONSUMED"] },
      },
    });
  }

  async getLaunchPromoSnapshot(userId: number): Promise<{
    hasSuccessfulOrders: boolean;
    hasActiveDiscountedOrder: boolean;
    activeDiscountedBuyerCount: number;
  }> {
    const [successfulOrdersCount, activeDiscountedOrderCount, discountedBuyers] =
      await this.prisma.$transaction([
        this.prisma.marketOrder.count({
          where: {
            buyer_id: userId,
            status: {
              in: ["PAID", "PROCESSING", "PREPARED", "SHIPPED", "DELIVERED", "COMPLETED"],
            },
          },
        }),
        this.prisma.marketOrder.count({
          where: {
            buyer_id: userId,
            discount: { gt: 0 },
            status: { not: "CANCELLED" },
          },
        }),
        this.prisma.marketOrder.findMany({
          where: {
            discount: { gt: 0 },
            status: { not: "CANCELLED" },
          },
          distinct: ["buyer_id"],
          select: { buyer_id: true },
        }),
      ]);

    return {
      hasSuccessfulOrders: successfulOrdersCount > 0,
      hasActiveDiscountedOrder: activeDiscountedOrderCount > 0,
      activeDiscountedBuyerCount: discountedBuyers.length,
    };
  }

  async getCommissionRateForSeller(sellerId: number): Promise<number> {
    const snapshot = await recomputeSellerCommissionSnapshot({
      prismaClient: this.prisma,
      sellerId,
    });
    return snapshot.currentTier.commission_rate;
  }

  async createCheckoutOrders(params: {
    buyerId: number;
    deliveryType: "DELIVERY" | "PICKUP";
    pickupPointAddress: string;
    pickupPointId: string;
    pickupPointProvider: DeliveryProviderCode;
    checkoutGroupKey: string;
    preparedOrders: Array<{
      sellerId: number;
      items: Array<{
        listing_id: number;
        name: string;
        image: string | null;
        price: number;
        quantity: number;
      }>;
      deliveryCost: number;
      discount: number;
      totalPrice: number;
      publicId: string;
    }>;
    requestIp: string | null;
    paymentIntentIdBase: string;
    commissionRateBySellerId: Map<number, number>;
    promoReservation:
      | {
          promoId: number;
          buyerId: number;
          checkoutGroupKey: string;
        }
      | null;
    appendPickupPointMetaToAddress: (
      address: string,
      pickupPointId: string | null,
      pickupProvider: DeliveryProviderCode,
    ) => string;
  }): Promise<
    Array<{
      db_id: number;
      order_id: string;
      total_price: number;
      seller_id: number;
    }>
  > {
    return this.prisma.$transaction(async (tx) => {
      let promoActivationId: number | null = null;
      if (params.promoReservation) {
        const promo = await tx.promoCode.findUnique({
          where: { id: params.promoReservation.promoId },
          select: {
            id: true,
            max_activations: true,
            per_user_limit: true,
            is_enabled: true,
            starts_at: true,
            ends_at: true,
          },
        });

        if (!promo || !promo.is_enabled) {
          throw validationError("Промокод не найден или больше не действует");
        }

        const now = new Date();
        if (promo.starts_at.getTime() > now.getTime() || promo.ends_at.getTime() < now.getTime()) {
          throw validationError("Промокод не найден или больше не действует");
        }

        const [activeCount, userActiveCount] = await Promise.all([
          tx.promoActivation.count({
            where: {
              promo_code_id: promo.id,
              status: { in: ["RESERVED", "CONSUMED"] },
            },
          }),
          tx.promoActivation.count({
            where: {
              promo_code_id: promo.id,
              user_id: params.promoReservation.buyerId,
              status: { in: ["RESERVED", "CONSUMED"] },
            },
          }),
        ]);

        if (activeCount >= promo.max_activations) {
          throw validationError("Лимит активаций этого промокода уже исчерпан");
        }
        if (userActiveCount >= promo.per_user_limit) {
          throw validationError("Вы уже использовали этот промокод");
        }

        const activation = await tx.promoActivation.create({
          data: {
            promo_code_id: promo.id,
            user_id: params.promoReservation.buyerId,
            checkout_group_key: params.checkoutGroupKey,
            status: "RESERVED",
          },
          select: { id: true },
        });
        promoActivationId = activation.id;
      }

      const quantityByListingId = new Map<number, number>();
      for (const preparedOrder of params.preparedOrders) {
        for (const item of preparedOrder.items) {
          quantityByListingId.set(
            item.listing_id,
            (quantityByListingId.get(item.listing_id) ?? 0) + Math.max(1, item.quantity),
          );
        }
      }

      const listingIdsToReserve = Array.from(quantityByListingId.keys());
      for (const [listingId, quantity] of quantityByListingId.entries()) {
        const reservedListing = await tx.marketplaceListing.updateMany({
          where: {
            id: listingId,
            status: "ACTIVE",
            moderation_status: "APPROVED",
            available_quantity: {
              gte: quantity,
            },
          },
          data: {
            available_quantity: {
              decrement: quantity,
            },
          },
        });

        if (reservedListing.count !== 1) {
          throw new Error(LISTING_RESERVATION_CONFLICT);
        }
      }

      await tx.marketplaceListing.updateMany({
        where: {
          id: { in: listingIdsToReserve },
          available_quantity: {
            lte: 0,
          },
        },
        data: {
          status: "INACTIVE",
        },
      });

      const result: Array<{
        db_id: number;
        order_id: string;
        total_price: number;
        seller_id: number;
      }> = [];

      let sequence = 0;
      for (const preparedOrder of params.preparedOrders) {
        sequence += 1;
        const initialTrackingProvider =
          params.deliveryType === "DELIVERY" ? params.pickupPointProvider : null;
        const order = await tx.marketOrder.create({
          data: {
            public_id: preparedOrder.publicId,
            buyer_id: params.buyerId,
            seller_id: preparedOrder.sellerId,
            promo_code_id: params.promoReservation?.promoId ?? null,
            checkout_group_key: params.checkoutGroupKey,
            status: "CREATED",
            delivery_type: params.deliveryType,
            delivery_address:
              params.deliveryType === "DELIVERY"
                ? params.pickupPointAddress
                : "Самовывоз",
            tracking_provider: initialTrackingProvider,
            tracking_number: null,
            tracking_url: null,
            delivery_ext_status: null,
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

        if (promoActivationId !== null) {
          await tx.promoActivation.update({
            where: { id: promoActivationId },
            data: {
              order_id: order.id,
            },
          });
          promoActivationId = null;
        }

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
            changed_by_id: params.buyerId,
            reason: "checkout.created",
          },
        });

        await tx.auditLog.create({
          data: {
            public_id: makeAuditPublicId(),
            actor_user_id: params.buyerId,
            action: "order.created",
            entity_type: "order",
            entity_public_id: order.public_id,
            details: serializeForJson({
              status: "CREATED",
              deliveryType: params.deliveryType,
            }),
            ip_address: params.requestIp,
          },
        });

        if (params.deliveryType === "DELIVERY") {
          await tx.marketOrder.update({
            where: { id: order.id },
            data: {
              delivery_address: params.appendPickupPointMetaToAddress(
                order.delivery_address ?? params.pickupPointAddress,
                params.pickupPointId,
                params.pickupPointProvider,
              ),
            },
          });
        }

        const commissionRate =
          params.commissionRateBySellerId.get(preparedOrder.sellerId) ?? 3.5;
        const partnerSettlementAmount =
          preparedOrder.totalPrice + preparedOrder.discount;
        const commission = Math.round(
          (partnerSettlementAmount * commissionRate) / 100,
        );
        const paymentIntentId = `${params.paymentIntentIdBase}:${sequence}`;
        await tx.platformTransaction.create({
          data: {
            public_id: makeOpaquePublicId("TXN", 20),
            order_id: order.id,
            buyer_id: params.buyerId,
            seller_id: preparedOrder.sellerId,
            amount: partnerSettlementAmount,
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
          seller_id: preparedOrder.sellerId,
        });
      }

      return result;
    });
  }

  async findBuyerOrdersDetailed(buyerId: number): Promise<BuyerOrderWithRelations[]> {
    return this.prisma.marketOrder.findMany({
      where: { buyer_id: buyerId },
      include: BUYER_ORDER_DETAIL_INCLUDE,
      orderBy: [{ created_at: "desc" }],
    }) as unknown as Promise<BuyerOrderWithRelations[]>;
  }

  async findBuyerOrderDetailedByPublicId(params: {
    buyerId: number;
    orderPublicId: string;
  }): Promise<BuyerOrderWithRelations | null> {
    return this.prisma.marketOrder.findFirst({
      where: {
        buyer_id: params.buyerId,
        public_id: params.orderPublicId,
      },
      include: BUYER_ORDER_DETAIL_INCLUDE,
    }) as unknown as Promise<BuyerOrderWithRelations | null>;
  }

  async findBuyerOrderForCancellation(params: {
    buyerId: number;
    orderPublicId: string;
  }): Promise<{
    id: number;
    public_id: string;
    status: OrderStatus;
    transactions: Array<{
      id: number;
      public_id: string;
      amount: number;
      status: string;
      payment_provider: string;
      payment_intent_id: string;
    }>;
  } | null> {
    return this.prisma.marketOrder.findFirst({
      where: {
        buyer_id: params.buyerId,
        public_id: params.orderPublicId,
      },
      select: {
        id: true,
        public_id: true,
        status: true,
        transactions: {
          orderBy: [{ created_at: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            public_id: true,
            amount: true,
            status: true,
            payment_provider: true,
            payment_intent_id: true,
          },
        },
      },
    });
  }

  async cancelBuyerOrder(params: {
    buyerId: number;
    orderId: number;
    currentStatus: OrderStatus;
    transactionId: number | null;
    markRefunded: boolean;
    requestIp: string | null;
    reason: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.marketOrder.findFirst({
        where: {
          id: params.orderId,
          buyer_id: params.buyerId,
        },
        select: {
          id: true,
          public_id: true,
          status: true,
          checkout_group_key: true,
        },
      });

      if (!order) {
        throw conflict("Заказ не найден");
      }

      if (order.status !== params.currentStatus) {
        throw conflict(
          "Статус заказа изменился. Обновите страницу и попробуйте снова",
        );
      }

      await tx.marketOrder.update({
        where: { id: order.id },
        data: {
          status: "CANCELLED",
        },
      });

      if (params.transactionId !== null) {
        await tx.platformTransaction.updateMany({
          where: {
            id: params.transactionId,
            order_id: order.id,
            status: params.markRefunded
              ? "SUCCESS"
              : {
                  in: ["HELD", "PENDING", "FAILED", "CANCELLED"],
                },
          },
          data: {
            status: params.markRefunded ? "REFUNDED" : "CANCELLED",
          },
        });
      }

      await writeOrderStatusTransitionRecords({
        tx,
        transitions: [
          {
            orderId: order.id,
            orderPublicId: order.public_id,
            fromStatus: order.status,
            toStatus: "CANCELLED",
            changedById: params.buyerId,
            reason: params.reason,
            ipAddress: params.requestIp,
          },
        ],
      });

      await restoreListingStockByOrderIds(tx, [order.id]);
      if (order.checkout_group_key) {
        await releasePromoActivationsForCheckoutGroups(tx, [
          order.checkout_group_key,
        ]);
      }
    });
  }

  async updateOrderDeliveryTracking(params: {
    orderId: number;
    currentStatus: OrderStatus;
    nextStatus: OrderStatus | null;
    trackingUrl: string | null;
    rawStatus: string;
  }): Promise<void> {
    const data: {
      tracking_url: string | null;
      delivery_ext_status: string;
      delivery_checked_at: Date;
      status?: OrderStatus;
    } = {
      tracking_url: params.trackingUrl,
      delivery_ext_status: params.rawStatus,
      delivery_checked_at: new Date(),
    };

    if (params.nextStatus && params.nextStatus !== params.currentStatus) {
      data.status = params.nextStatus;
    }

    await this.prisma.marketOrder.update({
      where: { id: params.orderId },
      data,
    });

    if (params.nextStatus === "CANCELLED") {
      const order = await this.prisma.marketOrder.findUnique({
        where: { id: params.orderId },
        select: { checkout_group_key: true },
      });
      if (order?.checkout_group_key) {
        await this.prisma.$transaction(async (tx) => {
          await releasePromoActivationsForCheckoutGroups(tx, [order.checkout_group_key!]);
        });
      }
    }
  }

  async findReviewedListingIds(params: {
    authorId: number;
    listingIds: number[];
  }): Promise<Set<number>> {
    const rows = await this.prisma.listingReview.findMany({
      where: {
        author_id: params.authorId,
        listing_id: {
          in: [...new Set(params.listingIds)],
        },
      },
      select: {
        listing_id: true,
      },
    });

    return new Set(rows.map((review) => review.listing_id));
  }
}

export { CHECKOUT_CREATE_ACTION, LISTING_RESERVATION_CONFLICT };
