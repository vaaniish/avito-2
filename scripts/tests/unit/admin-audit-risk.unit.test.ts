import assert from "node:assert/strict";
import test from "node:test";
import { ListAdminAuditLogsService } from "../../../backend/src/modules/admin/audit/application/services/list-admin-audit-logs.service";
import type { AdminAuditRepository } from "../../../backend/src/modules/admin/audit/infrastructure/repositories/admin-audit.repository";

const createdAt = new Date("2026-06-01T10:00:00.000Z");

function makeActor(id = "ADM-001") {
  return {
    public_id: id,
    name: "Мария Контроль",
    email: "owner-admin@example.test",
  };
}

function makeLog(overrides: Record<string, unknown>) {
  return {
    public_id: "AUD-001",
    created_at: createdAt,
    action: "user.status_changed",
    entity_type: "user",
    entity_public_id: "USR-001",
    ip_address: "127.0.0.1",
    details: {
      beforeStatus: "ACTIVE",
      afterStatus: "BLOCKED",
      afterBlockReason: "Ручная проверка владельца",
    },
    actor: makeActor(),
    ...overrides,
  };
}

function createService(logs: Array<ReturnType<typeof makeLog>>) {
  const repository = {
    async listLogs() {
      return logs;
    },
    async listTargetUsersByPublicIds(publicIds: string[]) {
      return publicIds.map((publicId) => ({
        public_id: publicId,
        name: publicId === "USR-001" ? "Иван Покупатель" : "Партнёр Комиссий",
        email:
          publicId === "USR-001"
            ? "buyer-risk@example.test"
            : "seller-risk@example.test",
      }));
    },
  } as unknown as AdminAuditRepository;

  return new ListAdminAuditLogsService(repository);
}

test("admin audit: exposes only risky admin actions", async () => {
  const service = createService([
    makeLog({ public_id: "AUD-BLOCK" }),
    makeLog({
      public_id: "AUD-ROLE",
      action: "user.role_changed",
      details: { beforeRole: "BUYER", afterRole: "SELLER" },
    }),
    makeLog({
      public_id: "AUD-COMMISSION",
      action: "commission_tier.rate_changed",
      entity_type: "commission_tier",
      entity_public_id: "TIER-001",
      details: { beforeCommissionRate: 5, afterCommissionRate: 4.5 },
    }),
    makeLog({
      public_id: "AUD-ORDER",
      action: "order.status_changed",
      entity_type: "order",
      entity_public_id: "ORD-001",
    }),
    makeLog({
      public_id: "AUD-AUTO",
      action: "anti_circumvention.sanction_applied",
      actor: makeActor("SYSTEM-001"),
    }),
    makeLog({
      public_id: "AUD-NO-ACTOR",
      actor: null,
    }),
  ]);

  const result = await service.execute({ limit: "50" });

  assert.deepEqual(
    result.logs.map((log) => log.id),
    ["AUD-BLOCK", "AUD-ROLE", "AUD-COMMISSION"],
  );
  assert.deepEqual(
    result.logs.map((log) => log.riskType),
    ["user_blocked", "role_changed", "commission_changed"],
  );
  assert.equal(result.logs[0].summary, "Заблокировал пользователя");
  assert.equal(result.logs[0].target?.email, "buyer-risk@example.test");
  assert.equal(result.logs[0].reason, "Ручная проверка владельца");
});

test("admin audit: searches normalized risk fields", async () => {
  const service = createService([
    makeLog({
      public_id: "AUD-BLOCK",
      ip_address: "10.10.10.5",
    }),
    makeLog({
      public_id: "AUD-UNBLOCK",
      entity_public_id: "USR-002",
      details: {
        beforeStatus: "BLOCKED",
        afterStatus: "ACTIVE",
        beforeBlockReason: "Ошибочная блокировка",
      },
    }),
  ]);

  const byTarget = await service.execute({ q: "seller-risk@example.test" });
  assert.deepEqual(
    byTarget.logs.map((log) => log.id),
    ["AUD-UNBLOCK"],
  );

  const byIp = await service.execute({ q: "10.10.10.5" });
  assert.deepEqual(
    byIp.logs.map((log) => log.id),
    ["AUD-BLOCK"],
  );

  const byRiskType = await service.execute({ riskType: "user_unblocked" });
  assert.equal(byRiskType.logs.length, 1);
  assert.equal(byRiskType.logs[0].summary, "Разблокировал пользователя");
});
