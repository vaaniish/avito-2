import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateListingModeration,
  type SellerModerationContext,
} from "../../../backend/src/modules/partner/listing-moderation";

const TRUSTED_SELLER: SellerModerationContext = {
  joinedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000),
  isVerified: true,
  complaintsCount: 0,
  sellerOrdersCount: 12,
  listingsCount: 8,
};

const NEW_SELLER: SellerModerationContext = {
  joinedAt: new Date(),
  isVerified: false,
  complaintsCount: 0,
  sellerOrdersCount: 0,
  listingsCount: 0,
};

test("listing moderation: auto-approves clean listing from trusted seller", async () => {
  const decision = await evaluateListingModeration({
    title: "iPhone 13 128GB в отличном состоянии",
    description: "Полный комплект, аккуратное использование, готов к проверке при получении.",
    category: "Смартфоны",
    price: 42000,
    imageUrl: "https://images.example/iphone.jpg",
    seller: TRUSTED_SELLER,
  });

  assert.equal(decision.moderationStatus, "APPROVED");
  assert.equal(decision.listingStatus, "ACTIVE");
  assert.ok(decision.riskScore < 30);
});

test("listing moderation: routes standalone contact marker to manual review", async () => {
  const decision = await evaluateListingModeration({
    title: "Ноутбук Lenovo IdeaPad",
    description: "Хорошее состояние, детали можно обсудить в telegram @sellername.",
    category: "Ноутбуки",
    price: 35000,
    imageUrl: "https://images.example/laptop.jpg",
    seller: TRUSTED_SELLER,
  });

  assert.equal(decision.moderationStatus, "PENDING");
  assert.equal(decision.listingStatus, "MODERATION");
  assert.ok(decision.signals.includes("contact_details_detected"));
});

test("listing moderation: auto-rejects contact plus off-platform payment", async () => {
  const decision = await evaluateListingModeration({
    title: "Видеокарта RTX",
    description: "Пишите в telegram, оплата переводом на карту без оформления на сайте.",
    category: "Видеокарты",
    price: 52000,
    imageUrl: "https://images.example/gpu.jpg",
    seller: TRUSTED_SELLER,
  });

  assert.equal(decision.moderationStatus, "REJECTED");
  assert.equal(decision.listingStatus, "INACTIVE");
  assert.ok(decision.riskScore >= 70);
});

test("listing moderation: new seller and short copy raises risk without auto-reject", async () => {
  const decision = await evaluateListingModeration({
    title: "Монитор",
    description: "Работает.",
    category: "Мониторы",
    price: 9000,
    imageUrl: "https://images.example/monitor.jpg",
    seller: NEW_SELLER,
  });

  assert.equal(decision.moderationStatus, "PENDING");
  assert.equal(decision.listingStatus, "MODERATION");
  assert.ok(decision.riskScore >= 30);
  assert.ok(decision.riskScore < 70);
});

test("listing moderation: image signals affect gray-zone risk but do not auto-reject alone", async () => {
  const decision = await evaluateListingModeration({
    title: "Apple Watch Series 8",
    description: "Оригинальные часы, комплект, без скрытых дефектов.",
    category: "Носимая электроника",
    price: 21000,
    imageUrl: "https://images.example/watch.jpg",
    imageModerationSignals: [
      "image_near_duplicate",
      "image_low_resolution",
      "image_low_contrast",
    ],
    seller: TRUSTED_SELLER,
  });

  assert.notEqual(decision.moderationStatus, "REJECTED");
  assert.ok(decision.signals.includes("image_near_duplicate"));
});
