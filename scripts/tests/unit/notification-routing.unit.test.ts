import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTargetUrl,
  humanizeReasonCode,
  listingModerationNotification,
} from "../../../backend/src/modules/notifications/notification.shared";

test("notification routes: buildTargetUrl maps critical targets correctly", () => {
  assert.equal(buildTargetUrl("listing", "abc-123"), "/products/abc-123");
  assert.equal(buildTargetUrl("orders"), "/profile?tab=orders");
  assert.equal(buildTargetUrl("questions"), "/profile?tab=partner-questions");
  assert.equal(buildTargetUrl("partner"), "/profile?tab=partner");
  assert.equal(buildTargetUrl("admin", "complaints"), "/admin/complaints");
  assert.equal(buildTargetUrl("admin"), "/admin");
});

test("notification routes: moderation notification uses readable reject reason", () => {
  const notification = listingModerationNotification({
    sellerId: 42,
    listingPublicId: "lst-1",
    title: "RTX 4090",
    moderationStatus: "REJECTED",
    reasonCode: "CONTACTS_IN_DESCRIPTION",
  });

  assert.equal(notification.userId, 42);
  assert.equal(notification.type, "SYSTEM");
  assert.equal(notification.targetUrl, "/profile?tab=partner");
  assert.match(notification.message, /RTX 4090/);
  assert.match(notification.message, /contacts in description/);
});

test("notification routes: approved and pending moderation copy stays deterministic", () => {
  const approved = listingModerationNotification({
    sellerId: 1,
    listingPublicId: "lst-2",
    title: "MacBook Pro",
    moderationStatus: "APPROVED",
  });
  const pending = listingModerationNotification({
    sellerId: 1,
    listingPublicId: "lst-3",
    title: "MacBook Pro",
    moderationStatus: "PENDING",
  });

  assert.equal(approved.type, "INFO");
  assert.match(approved.message, /одобрено/i);
  assert.equal(pending.type, "INFO");
  assert.match(pending.message, /дополнительную проверку/i);
});

test("notification routes: reason humanizer normalizes separators and casing", () => {
  assert.equal(humanizeReasonCode(" CONTACTS_IN_DESCRIPTION "), "contacts in description");
  assert.equal(humanizeReasonCode("spam-text"), "spam text");
});
