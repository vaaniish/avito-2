import assert from "node:assert/strict";
import test from "node:test";
import {
  financePeriodKey,
  getFinanceSettlementBucket,
  isFinanceActiveOrder,
  isFinanceEarnedStatus,
  isFinancePayableStatus,
  parseFinanceOrderStatus,
  parseFinanceReportLimit,
  parseFinanceReportOffset,
  parseFinanceTransactionStatus,
} from "../../../backend/src/modules/finance/finance.shared";

test("finance shared: parses report filters defensively", () => {
  assert.equal(parseFinanceTransactionStatus("success"), "SUCCESS");
  assert.equal(parseFinanceTransactionStatus("all"), null);
  assert.equal(parseFinanceTransactionStatus("unknown"), null);

  assert.equal(parseFinanceOrderStatus("completed"), "COMPLETED");
  assert.equal(parseFinanceOrderStatus("all"), null);
  assert.equal(parseFinanceOrderStatus("unknown"), null);

  assert.equal(parseFinanceReportLimit("10"), 10);
  assert.equal(parseFinanceReportLimit("0"), 40);
  assert.equal(parseFinanceReportLimit("999"), 200);
  assert.equal(parseFinanceReportOffset("5"), 5);
  assert.equal(parseFinanceReportOffset("-1"), 0);
});

test("finance shared: derives period keys and settlement buckets", () => {
  const date = new Date("2026-05-10T12:30:00.000Z");
  assert.equal(financePeriodKey(date, "day"), "2026-05-10");
  assert.equal(financePeriodKey(date, "month"), "2026-05");
  assert.equal(financePeriodKey(date, "week"), "2026-05-04");

  assert.equal(isFinanceEarnedStatus("SUCCESS"), true);
  assert.equal(isFinanceEarnedStatus("HELD"), false);
  assert.equal(isFinancePayableStatus("SUCCESS", "COMPLETED"), true);
  assert.equal(isFinancePayableStatus("SUCCESS", "SHIPPED"), false);
  assert.equal(isFinanceActiveOrder("SHIPPED"), true);
  assert.equal(isFinanceActiveOrder("COMPLETED"), false);

  assert.equal(getFinanceSettlementBucket("FAILED", "PROCESSING"), "problem");
  assert.equal(getFinanceSettlementBucket("HELD", "PROCESSING"), "pendingPayment");
  assert.equal(getFinanceSettlementBucket("SUCCESS", "COMPLETED"), "readyToPayout");
  assert.equal(getFinanceSettlementBucket("SUCCESS", "SHIPPED"), "inProgress");
});
