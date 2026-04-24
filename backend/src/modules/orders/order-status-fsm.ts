import type { OrderStatus } from "@prisma/client";

const ORDER_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  CREATED: new Set(["PAID", "CANCELLED"]),
  PAID: new Set(["PREPARED", "SHIPPED", "CANCELLED"]),
  PROCESSING: new Set(["PREPARED", "SHIPPED", "CANCELLED"]),
  PREPARED: new Set(["SHIPPED", "CANCELLED"]),
  SHIPPED: new Set(["DELIVERED", "COMPLETED", "CANCELLED"]),
  DELIVERED: new Set(["COMPLETED", "CANCELLED"]),
  COMPLETED: new Set([]),
  CANCELLED: new Set([]),
};

export function isOrderStatusTransitionAllowed(params: {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
}): boolean {
  if (params.fromStatus === null) {
    return params.toStatus === "CREATED";
  }

  if (params.fromStatus === params.toStatus) {
    return true;
  }

  return ORDER_TRANSITIONS[params.fromStatus]?.has(params.toStatus) ?? false;
}

export function assertOrderStatusTransitionAllowed(params: {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  context: string;
}): void {
  if (
    !isOrderStatusTransitionAllowed({
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
    })
  ) {
    const from = params.fromStatus ?? "NONE";
    throw new Error(
      `ORDER_STATUS_TRANSITION_NOT_ALLOWED: ${from} -> ${params.toStatus} (${params.context})`,
    );
  }
}
