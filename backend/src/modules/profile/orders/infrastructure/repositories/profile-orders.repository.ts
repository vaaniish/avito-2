import {
  OrderStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import { assertOrderStatusTransitionAllowed } from "../../../../orders/order-status-fsm";
import { recomputeSellerCommissionSnapshot } from "../../../../finance/infrastructure/repositories/commission-program.repository";
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
  const releasableListingIds = listingIds.filter(
    (listingId) => !blockedListingIds.has(listingId),
  );
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
          public_id: `CID-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
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
    });
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

      await releaseReservedListingsByOrderIds(tx, cancellableOrderIds);

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
        images: {
          select: { url: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          take: 1,
        },
      },
    });
  }

  async findUserAddressByIdForUser(params: {
    addressId: number;
    userId: number;
  }) {
    return this.prisma.userAddress.findFirst({
      where: {
        id: params.addressId,
        user_id: params.userId,
      },
    });
  }

  async findDefaultAddressForUser(userId: number) {
    return this.prisma.userAddress.findFirst({
      where: {
        user_id: userId,
        is_default: true,
      },
    });
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
    deliveryAddress: string;
    pickupPointId: string;
    pickupPointProvider: DeliveryProviderCode;
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
      const listingIdsToReserve = uniqueNumbers(
        params.preparedOrders.flatMap((preparedOrder) =>
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
            status: "CREATED",
            delivery_type: params.deliveryType,
            delivery_address:
              params.deliveryType === "DELIVERY"
                ? params.deliveryAddress
                : "РЎР°РјРѕРІС‹РІРѕР·",
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
                order.delivery_address ?? params.deliveryAddress,
                params.pickupPointId,
                params.pickupPointProvider,
              ),
            },
          });
        }

        const commissionRate =
          params.commissionRateBySellerId.get(preparedOrder.sellerId) ?? 3.5;
        const commission = Math.round(
          (preparedOrder.totalPrice * commissionRate) / 100,
        );
        const paymentIntentId = `${params.paymentIntentIdBase}:${sequence}`;
        await tx.platformTransaction.create({
          data: {
            public_id: `TXN-${Date.now()}-${sequence}`,
            order_id: order.id,
            buyer_id: params.buyerId,
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
          seller_id: preparedOrder.sellerId,
        });
      }

      return result;
    });
  }

  async findBuyerOrdersDetailed(buyerId: number): Promise<BuyerOrderWithRelations[]> {
    return this.prisma.marketOrder.findMany({
      where: { buyer_id: buyerId },
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
        items: {
          include: {
            listing: {
              select: {
                public_id: true,
              },
            },
          },
        },
      },
      orderBy: [{ created_at: "desc" }],
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
