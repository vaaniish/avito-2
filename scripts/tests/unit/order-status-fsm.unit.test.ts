import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOrderStatusTransitionAllowed,
  isOrderStatusTransitionAllowed,
} from "../../../backend/src/modules/orders/order-status-fsm";

test("order status FSM: allows valid transitions", () => {
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: null, toStatus: "CREATED" }),
    true,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "CREATED", toStatus: "PAID" }),
    true,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "PAID", toStatus: "PREPARED" }),
    true,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "PREPARED", toStatus: "SHIPPED" }),
    true,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "SHIPPED", toStatus: "DELIVERED" }),
    true,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "DELIVERED", toStatus: "COMPLETED" }),
    true,
  );
});

test("order status FSM: forbids invalid transitions", () => {
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: null, toStatus: "PAID" }),
    false,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "CREATED", toStatus: "COMPLETED" }),
    false,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "COMPLETED", toStatus: "PAID" }),
    false,
  );
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "CANCELLED", toStatus: "SHIPPED" }),
    false,
  );
});

test("order status FSM: idempotent transition to same status is allowed", () => {
  assert.equal(
    isOrderStatusTransitionAllowed({ fromStatus: "PAID", toStatus: "PAID" }),
    true,
  );
});

test("order status FSM: assertion throws on invalid transition", () => {
  assert.throws(
    () =>
      assertOrderStatusTransitionAllowed({
        fromStatus: "CREATED",
        toStatus: "COMPLETED",
        context: "unit-test",
      }),
    /ORDER_STATUS_TRANSITION_NOT_ALLOWED/,
  );
});

test("order status FSM: assertion passes on valid transition", () => {
  assert.doesNotThrow(() =>
    assertOrderStatusTransitionAllowed({
      fromStatus: "PAID",
      toStatus: "PREPARED",
      context: "unit-test",
    }),
  );
});
