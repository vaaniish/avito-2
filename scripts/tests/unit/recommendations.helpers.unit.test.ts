import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketPrice,
  buildReasonLabel,
  computeTimeDecay,
  dedupeCandidates,
  limitCandidates,
  RECOMMENDATION_EVENT_WEIGHTS,
  resolveRecommendationEventWeight,
} from "../../../backend/src/modules/recommendations/domain/recommendations.helpers";

test("recommendations helpers: default event weights are stable", () => {
  assert.equal(RECOMMENDATION_EVENT_WEIGHTS.VIEW, 1);
  assert.equal(RECOMMENDATION_EVENT_WEIGHTS.WISHLIST, 3);
  assert.equal(RECOMMENDATION_EVENT_WEIGHTS.ADD_TO_CART, 4);
  assert.equal(RECOMMENDATION_EVENT_WEIGHTS.PURCHASE_PAID, 6);
  assert.equal(RECOMMENDATION_EVENT_WEIGHTS.PURCHASE_COMPLETED, 8);
  assert.equal(RECOMMENDATION_EVENT_WEIGHTS.REVIEW, 5);
});

test("recommendations helpers: explicit event weight overrides defaults", () => {
  assert.equal(resolveRecommendationEventWeight("VIEW", 7), 7);
  assert.equal(resolveRecommendationEventWeight("VIEW"), 1);
});

test("recommendations helpers: purchase decays slower than view", () => {
  const now = new Date("2026-05-21T12:00:00.000Z");
  const occurredAt = new Date("2026-04-21T12:00:00.000Z");
  const purchaseDecay = computeTimeDecay({
    occurredAt,
    now,
    eventType: "PURCHASE_COMPLETED",
  });
  const viewDecay = computeTimeDecay({
    occurredAt,
    now,
    eventType: "VIEW",
  });

  assert.ok(purchaseDecay > viewDecay);
  assert.ok(purchaseDecay > 0);
});

test("recommendations helpers: buckets prices into stable ranges", () => {
  assert.equal(bucketPrice(1_500), "budget");
  assert.equal(bucketPrice(12_000), "value");
  assert.equal(bucketPrice(45_000), "mid");
  assert.equal(bucketPrice(120_000), "premium");
  assert.equal(bucketPrice(280_000), "luxury");
});

test("recommendations helpers: maps recommendation source to explain label", () => {
  assert.equal(buildReasonLabel("CO_VIEW"), "Похоже на то, что вы смотрели");
  assert.equal(buildReasonLabel("CO_PURCHASE"), "Покупают вместе");
  assert.equal(buildReasonLabel("CONTENT"), "Похожие товары");
  assert.equal(buildReasonLabel("CROSS_SELL"), "Сопутствующие товары");
});

test("recommendations helpers: dedupe and limit candidates by highest score", () => {
  const candidates = [
    { listingId: 1, score: 2.1, source: "POPULAR", reason: "a", debug: {} },
    { listingId: 2, score: 3.2, source: "POPULAR", reason: "b", debug: {} },
    { listingId: 1, score: 4.5, source: "CO_VIEW", reason: "c", debug: {} },
  ];

  const deduped = dedupeCandidates(candidates);
  assert.equal(deduped.length, 2);

  const limited = limitCandidates(candidates, 1);
  assert.equal(limited.length, 1);
  assert.equal(limited[0]?.listingId, 1);
  assert.equal(limited[0]?.score, 4.5);
});
