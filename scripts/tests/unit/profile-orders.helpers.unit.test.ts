import assert from "node:assert/strict";
import test from "node:test";
import {
  canBuyerCancelOrder,
  mapBuyerOrder,
} from "../../../backend/src/modules/profile/orders/domain/profile-orders.helpers";
import type { BuyerOrderWithRelations } from "../../../backend/src/modules/profile/orders/domain/profile-orders.types";

const baseOrder: BuyerOrderWithRelations = {
  id: 10,
  public_id: "ORD-TEST",
  created_at: new Date("2026-05-25T10:00:00.000Z"),
  status: "SHIPPED",
  total_price: 15000,
  delivery_address: "Москва, ПВЗ 1",
  delivery_cost: 0,
  discount: 0,
  tracking_provider: "yandex_pvz",
  tracking_number: "TRACK-1",
  tracking_url: null,
  delivery_ext_status: "IN_TRANSIT",
  delivery_type: "DELIVERY",
  delivery_checked_at: null,
  seller: {
    name: "Seller test",
    avatar: null,
    phone: "+79990000000",
    work_email: "support@example.com",
    addresses: [{ city: "Москва" }],
    partnership_requests: [
      {
        onboarding_profile: {
          support_phone: "+78005553535",
          support_email: "support@example.com",
          service_hours: "пн-пт 10:00-19:00",
        },
      },
    ],
  },
  items: [
    {
      id: 1,
      listing_id: 100,
      name: "Test item",
      image: "https://example.com/item.jpg",
      price: 15000,
      quantity: 1,
      listing: { public_id: "LST-1" },
    },
  ],
};

test("profile order helpers: buyer cancel flag is true only before PREPARED", () => {
  assert.equal(canBuyerCancelOrder("CREATED"), true);
  assert.equal(canBuyerCancelOrder("PAID"), true);
  assert.equal(canBuyerCancelOrder("PROCESSING"), true);
  assert.equal(canBuyerCancelOrder("PREPARED"), false);
  assert.equal(canBuyerCancelOrder("SHIPPED"), false);
});

test("profile order helpers: mapBuyerOrder exposes seller support only for post-purchase statuses", () => {
  const shippedOrder = mapBuyerOrder(baseOrder, new Set<number>(), {
    stripPickupPointTag: (value) => value ?? "",
    toLocalizedDeliveryDate: () => "25 мая",
    extractPrimaryCityFromAddresses: (addresses) => addresses[0]?.city ?? null,
    toProfileOrderStatus: () => "shipped",
  });

  assert.equal(shippedOrder.publicId, "ORD-TEST");
  assert.equal(shippedOrder.canCancel, false);
  assert.equal(shippedOrder.sellerSupportPhone, "+78005553535");
  assert.equal(shippedOrder.sellerSupportEmail, "support@example.com");
  assert.equal(shippedOrder.sellerWorkingHours, "пн-пт 10:00-19:00");

  const preparedOrder = mapBuyerOrder(
    {
      ...baseOrder,
      status: "PREPARED",
    },
    new Set<number>(),
    {
      stripPickupPointTag: (value) => value ?? "",
      toLocalizedDeliveryDate: () => "25 мая",
      extractPrimaryCityFromAddresses: (addresses) => addresses[0]?.city ?? null,
      toProfileOrderStatus: () => "prepared",
    },
  );

  assert.equal(preparedOrder.canCancel, false);
  assert.equal(preparedOrder.sellerSupportPhone, null);
  assert.equal(preparedOrder.sellerSupportEmail, null);
  assert.equal(preparedOrder.sellerWorkingHours, null);
});
