import type { OrderStatus } from "@prisma/client";

export type DeliveryProviderCode =
  | "russian_post"
  | "yandex_pvz"
  | "ozon"
  | "wildberries"
  | "cdek";

export type YooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
};

export type YooKassaWebhookPayload = {
  event?: unknown;
  object?: {
    id?: unknown;
    status?: unknown;
  } | null;
};

export type CheckoutRequestItem = {
  listingId: string;
  quantity: number;
};

export type CheckoutRequestInput = {
  actorUserId: number;
  actorRole: string;
  idempotencyKey: string;
  items: CheckoutRequestItem[];
  addressId: number;
  customAddress: string;
  pickupPointId: string;
  pickupPointProvider: DeliveryProviderCode;
  deliveryType: "DELIVERY" | "PICKUP";
  paymentMethod: "card" | "sbp" | string;
  promoCode: string;
  requestIp: string | null;
};

export type CheckoutPromoPreviewInput = {
  actorUserId: number;
  items: CheckoutRequestItem[];
  promoCode: string;
};

export type BuyerProfileOrderStatus =
  | "processing"
  | "prepared"
  | "completed"
  | "cancelled"
  | "shipped";

export type CheckoutPolicyStatus = {
  accepted: boolean;
  policy: {
    public_id: string;
    version: string;
    title: string;
    content_url: string;
  } | null;
};

export type CheckoutIdempotencyStartResult =
  | { kind: "created"; recordId: number }
  | { kind: "cached"; statusCode: number; body: unknown }
  | { kind: "conflict"; message: string };

export type PaymentTransactionRef = {
  txId: number;
  orderId: number;
};

export type OrderPaymentStatusTransaction = {
  id: number;
  order_id: number;
  status: string;
  payment_provider: string;
  payment_intent_id: string;
  created_at: Date;
};

export type BuyerOrderPaymentStatusRow = {
  id: number;
  public_id: string;
  status: string;
  transactions: OrderPaymentStatusTransaction[];
};

export type ApprovedListingRecord = {
  id: number;
  public_id: string;
  seller_id: number;
  title: string;
  price: number;
  item_id: number | null;
  item: null | {
    id: number;
    public_id: string;
    subcategory_id: number;
    subcategory: {
      id: number;
      public_id: string;
      category_id: number;
      category: {
        id: number;
        public_id: string;
      };
    };
  };
  images: Array<{ url: string }>;
};

export type UserAddressRecord = {
  region: string | null;
  city: string | null;
  street: string | null;
  house: string | null;
};

export type PreparedCheckoutOrder = {
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
};

export type CreatedCheckoutOrder = {
  db_id: number;
  order_id: string;
  total_price: number;
  seller_id: number;
};

export type BuyerOrderWithRelations = {
  id: number;
  public_id: string;
  created_at: Date;
  status: OrderStatus;
  total_price: number;
  delivery_address: string | null;
  delivery_cost: number;
  discount: number;
  tracking_provider: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  delivery_ext_status: string | null;
  delivery_type: string;
  delivery_checked_at: Date | null;
  seller: {
    name: string;
    avatar: string | null;
    phone: string | null;
    addresses: Array<{ city: string }>;
  };
  items: Array<{
    id: number;
    listing_id: number | null;
    name: string;
    image: string | null;
    price: number;
    quantity: number;
    listing: { public_id: string } | null;
  }>;
};

export type BuyerPaymentStatusDto = {
  orderId: string;
  orderStatus: string;
  paymentStatus: string | null;
  paymentProvider: string | null;
  paymentIntentId: string | null;
};

export type OrderPaymentStatusDto = {
  summary: "failed" | "paid" | "pending";
  orders: BuyerPaymentStatusDto[];
};

export type CheckoutPolicyDto = {
  id: string;
  scope: "checkout";
  version: string;
  title: string;
  contentUrl: string;
} | null;

export type CreateOrderCheckoutDto = {
  success: true;
  orders: Array<{
    order_id: string;
    total_price: number;
  }>;
  total: number;
  discount: number;
  promoCode: string | null;
  payment: {
    provider: "yoomoney";
    paymentId: string | null;
    status: string | null;
    confirmationUrl: string | null;
  };
};

export type CheckoutPromoPreviewDto = {
  success: true;
  code: string;
  discountPercent: number | null;
  discountAmount: number;
  subtotal: number;
  remainingActivations: number;
  message: string;
};

export type PromoScopeTargetsInput = {
  allCatalog: boolean;
  categoryPublicIds: string[];
  subcategoryPublicIds: string[];
  itemPublicIds: string[];
  listingPublicIds: string[];
};

export type PromoEligibilityResult = {
  promo: {
    id: number;
    public_id: string;
    code: string;
    discount_type: "PERCENT" | "FIXED_AMOUNT";
    discount_value: number;
    min_subtotal: number;
    max_activations: number;
    per_user_limit: number;
    starts_at: Date;
    ends_at: Date;
    is_enabled: boolean;
    all_catalog: boolean;
    is_system: boolean;
    legacy_rule: string | null;
  };
  subtotal: number;
  eligibleSubtotal: number;
  discountAmount: number;
  discountPercent: number | null;
  remainingActivations: number;
  eligibleListingPublicIds: Set<string>;
  message: string;
};

export type BuyerProfileOrderDto = {
  id: string;
  orderNumber: string;
  date: Date;
  status: BuyerProfileOrderStatus;
  total: number;
  deliveryDate: string;
  deliveryAddress: string;
  deliveryCost: number;
  discount: number;
  trackingProvider: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  deliveryExternalStatus: string | null;
  seller: {
    name: string;
    avatar: string | null;
    phone: string;
    address: string;
    workingHours: string;
  };
  items: Array<{
    id: string;
    listingPublicId: string;
    name: string;
    image: string;
    price: number;
    quantity: number;
    reviewed: boolean;
    canReview: boolean;
  }>;
};

export type ProfileOrdersServiceHelpers = {
  roleAdmin: string;
  fallbackListingImage: string;
  normalizeTextField: (value: unknown) => string;
  buildAddressFullAddress: (parts: {
    region?: string;
    city?: string;
    street?: string;
    house?: string;
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
  toProfileOrderStatus: (status: string) => BuyerProfileOrderStatus;
};

export interface ProfileOrdersRepositoryPort {
  beginCheckoutIdempotency(params: {
    actorUserId: number;
    key: string;
    requestHash: string;
  }): Promise<CheckoutIdempotencyStartResult>;
  completeCheckoutIdempotency(params: {
    recordId: number;
    statusCode: number;
    body: unknown;
  }): Promise<void>;
  abortCheckoutIdempotency(recordId: number): Promise<void>;
  findOrdersByBuyerAndPublicIds(params: {
    buyerId: number;
    orderPublicIds: string[];
  }): Promise<BuyerOrderPaymentStatusRow[]>;
  findPaymentTransactionRefsByPaymentId(
    paymentId: string,
  ): Promise<PaymentTransactionRef[]>;
  applySuccessfulPayment(params: {
    transactionIds: number[];
    orderIds: number[];
    requestIp: string | null;
    reason: string;
  }): Promise<void>;
  applyFailedPayment(params: {
    transactionIds: number[];
    orderIds: number[];
    requestIp: string | null;
    reason: string;
  }): Promise<void>;
  findApprovedActiveListingsByPublicIds(
    listingPublicIds: string[],
  ): Promise<ApprovedListingRecord[]>;
  findPromoByCode(code: string): Promise<{
    id: number;
    public_id: string;
    code: string;
    discount_type: "PERCENT" | "FIXED_AMOUNT";
    discount_value: number;
    min_subtotal: number;
    max_activations: number;
    per_user_limit: number;
    starts_at: Date;
    ends_at: Date;
    is_enabled: boolean;
    all_catalog: boolean;
    is_system: boolean;
    legacy_rule: string | null;
    scope_targets: Array<{
      target_type: "CATEGORY" | "SUBCATEGORY" | "ITEM" | "LISTING";
      category_id: number | null;
      subcategory_id: number | null;
      item_id: number | null;
      listing_id: number | null;
    }>;
  } | null>;
  countActivePromoActivations(promoId: number): Promise<number>;
  countActivePromoActivationsForUser(params: {
    promoId: number;
    userId: number;
  }): Promise<number>;
  getLaunchPromoSnapshot(userId: number): Promise<{
    hasSuccessfulOrders: boolean;
    hasActiveDiscountedOrder: boolean;
    activeDiscountedBuyerCount: number;
  }>;
  findUserAddressByIdForUser(params: {
    addressId: number;
    userId: number;
  }): Promise<UserAddressRecord | null>;
  findDefaultAddressForUser(userId: number): Promise<UserAddressRecord | null>;
  getCommissionRateForSeller(sellerId: number): Promise<number>;
  createCheckoutOrders(params: {
    buyerId: number;
    deliveryType: "DELIVERY" | "PICKUP";
    deliveryAddress: string;
    pickupPointId: string;
    pickupPointProvider: DeliveryProviderCode;
    preparedOrders: PreparedCheckoutOrder[];
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
  }): Promise<CreatedCheckoutOrder[]>;
  findBuyerOrdersDetailed(buyerId: number): Promise<BuyerOrderWithRelations[]>;
  updateOrderDeliveryTracking(params: {
    orderId: number;
    currentStatus: OrderStatus;
    nextStatus: OrderStatus | null;
    trackingUrl: string | null;
    rawStatus: string;
  }): Promise<void>;
  findReviewedListingIds(params: {
    authorId: number;
    listingIds: number[];
  }): Promise<Set<number>>;
}

export interface ProfileOrdersPaymentGatewayPort {
  createPayment(params: {
    amountRub: number;
    description: string;
    metadata: Record<string, string>;
    paymentMethod: "card" | "sbp";
    idempotenceKey?: string;
  }): Promise<YooKassaPayment>;
  fetchPaymentById(paymentId: string): Promise<YooKassaPayment | null>;
  extractBasePaymentId(paymentIntentId: string): string;
}

export interface ProfileOrdersDeliveryGatewayPort {
  fetchTracking(params: {
    provider: string;
    trackingNumber: string;
  }): Promise<{
    status: string;
    trackingUrl: string | null;
    rawStatus: string;
  } | null>;
}

export interface ProfileOrdersNotificationPort {
  notifySellersAboutNewOrders(
    orders: Array<{
      seller_id: number;
      order_id: string;
      total_price: number;
    }>,
  ): Promise<void>;
}

export interface ProfileOrdersPolicyPort {
  getCheckoutPolicyStatus(userId: number): Promise<CheckoutPolicyStatus>;
}
