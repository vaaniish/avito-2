import type { PrismaClient } from "@prisma/client";
import { makeAuditPublicId } from "../../../common/domain/ids";
import type { PartnerOrdersRepositoryPort } from "../../domain/partner-orders.types";

export class PartnerOrdersRepository implements PartnerOrdersRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  listOrdersForSeller(sellerId: number) {
    return this.prisma.marketOrder.findMany({
      where: { seller_id: sellerId },
      include: {
        buyer: { select: { public_id: true, name: true } },
        items: { include: { listing: { select: { public_id: true } } } },
        transactions: { orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 1 },
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    }) as any;
  }

  findOrderForStatusUpdate(params: { sellerId: number; publicId: string }) {
    return this.prisma.marketOrder.findFirst({
      where: { public_id: params.publicId, seller_id: params.sellerId },
      include: {
        buyer: { select: { public_id: true, name: true, email: true, phone: true } },
        items: { select: { id: true, name: true, price: true, quantity: true, listing: { select: { public_id: true } } } },
        transactions: { orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 1 },
      },
    }) as any;
  }

  async setPreparedIfPaid(orderId: number): Promise<boolean> {
    const updatedCount = await this.prisma.marketOrder.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "PREPARED" },
    });
    return updatedCount.count > 0;
  }

  findOrderForTrackingUpdate(params: { sellerId: number; publicId: string }) {
    return this.prisma.marketOrder.findFirst({
      where: { public_id: params.publicId, seller_id: params.sellerId },
      include: {
        buyer: { select: { public_id: true, name: true, email: true, phone: true } },
        items: { select: { id: true, name: true, price: true, quantity: true, listing: { select: { public_id: true } } } },
        transactions: { orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 1 },
      },
    }) as any;
  }

  async updateOrderDeliverySync(params: {
    orderId: number;
    data: {
      status?: string;
      tracking_url?: string | null;
      delivery_checked_at: Date;
      delivery_ext_status: string | null;
      delivered_at?: Date;
      issued_at?: Date;
    };
  }): Promise<void> {
    await this.prisma.marketOrder.update({
      where: { id: params.orderId },
      data: {
        ...params.data,
        status: params.data.status as any,
      },
    });
  }

  async updateTrackingAssignment(params: {
    orderId: number;
    provider: "russian_post" | "yandex_pvz";
    trackingNumber: string;
    trackingUrl: string | null;
  }): Promise<void> {
    await this.prisma.marketOrder.update({
      where: { id: params.orderId },
      data: {
        status: "SHIPPED",
        tracking_provider: params.provider,
        tracking_number: params.trackingNumber,
        tracking_url: params.trackingUrl,
        delivery_checked_at: new Date(),
        delivery_ext_status: null,
        delivered_at: null,
        issued_at: null,
      },
    });
  }

  findOrderDeliveryState(orderId: number) {
    return this.prisma.marketOrder.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { public_id: true, name: true } },
        items: { include: { listing: { select: { public_id: true } } } },
        transactions: { orderBy: [{ created_at: "desc" }, { id: "desc" }], take: 1 },
      },
    }) as any;
  }

  async writeOrderStatusTransition(params: {
    orderId: number;
    orderPublicId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: number | null;
    reason: string;
    ipAddress: string | null;
  }): Promise<void> {
    await this.prisma.orderStatusHistory.create({
      data: {
        order_id: params.orderId,
        from_status: params.fromStatus as any,
        to_status: params.toStatus as any,
        changed_by_id: params.actorUserId,
        reason: params.reason,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
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
}
