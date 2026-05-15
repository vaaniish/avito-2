import type {
  DeliveryExternalStatus,
  DeliveryProviderCode,
} from "../../order-delivery";

export type PartnerOrderRow = {
  id: number;
  public_id: string;
  total_price: number;
  status: string;
  delivery_type: string;
  tracking_provider: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  delivery_ext_status: string | null;
  delivery_address: string | null;
  delivery_checked_at: Date | null;
  delivered_at: Date | null;
  issued_at: Date | null;
  created_at: Date;
  buyer_id: number;
  buyer: {
    public_id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  items: Array<{
    id: number;
    name: string;
    quantity: number;
    price: number;
    listing: { public_id: string } | null;
  }>;
  transactions: Array<{
    amount: number;
    commission: number;
    commission_rate: number;
    status: string;
    payment_provider: string | null;
    payment_intent_id: string | null;
  }>;
};

export interface PartnerOrdersRepositoryPort {
  listOrdersForSeller(sellerId: number): Promise<PartnerOrderRow[]>;
  findOrderForStatusUpdate(params: {
    sellerId: number;
    publicId: string;
  }): Promise<PartnerOrderRow | null>;
  setPreparedIfPaid(orderId: number): Promise<boolean>;
  findOrderForTrackingUpdate(params: {
    sellerId: number;
    publicId: string;
  }): Promise<PartnerOrderRow | null>;
  updateOrderDeliverySync(params: {
    orderId: number;
    data: {
      status?: string;
      tracking_url?: string | null;
      delivery_checked_at: Date;
      delivery_ext_status: string | null;
      delivered_at?: Date;
      issued_at?: Date;
    };
  }): Promise<void>;
  updateTrackingAssignment(params: {
    orderId: number;
    provider: DeliveryProviderCode;
    trackingNumber: string;
    trackingUrl: string | null;
  }): Promise<void>;
  findOrderDeliveryState(orderId: number): Promise<PartnerOrderRow | null>;
  writeOrderStatusTransition(params: {
    orderId: number;
    orderPublicId: string;
    fromStatus: string | null;
    toStatus: string;
    actorUserId: number | null;
    reason: string;
    ipAddress: string | null;
  }): Promise<void>;
}

export interface PartnerOrdersDeliveryGatewayPort {
  ensureYandexTracking(orderIds: number[]): Promise<void>;
  fetchTrackingStatus(params: {
    provider: DeliveryProviderCode;
    trackingNumber: string;
  }): Promise<{
    status: DeliveryExternalStatus;
    trackingUrl?: string;
    rawStatus?: string;
  } | null>;
  validateTrackingNumber(params: {
    provider: DeliveryProviderCode;
    trackingNumber: string;
  }): Promise<{
    valid: boolean;
    normalizedTrackingNumber: string;
    trackingUrl: string;
    source: "api" | "fallback";
  }>;
}

export interface PartnerOrdersNotificationPort {
  notifyBuyerOrderPrepared(orderPublicId: string, buyerId: number): Promise<void>;
  notifyBuyerOrderShipped(params: {
    orderPublicId: string;
    buyerId: number;
    trackingNumber: string;
  }): Promise<void>;
}
