import assert from "node:assert/strict";
import test from "node:test";
import { SessionService, hashSessionToken } from "../../../backend/src/modules/auth/application/session.service";

test("auth session: stores only a SHA-256 token hash and validates CSRF", async () => {
  let created: any;
  const repository = {
    prune: async () => undefined,
    create: async (input: any) => {
      created = input;
      return { id: "session-id" };
    },
    findActiveByTokenHash: async (tokenHash: string) => ({
      id: "session-id",
      userId: 7,
      tokenHash,
      csrfToken: created.csrfToken,
      expiresAt: created.expiresAt,
      user: {
        id: 7,
        publicId: "BUY-TEST",
        role: "BUYER",
        status: "ACTIVE",
        blockedUntil: null,
        email: "buyer@example.test",
        name: "Buyer",
      },
    }),
    revokeByTokenHash: async () => undefined,
    revokeAllByUserId: async () => undefined,
    revokeOthersByUserId: async () => undefined,
  };
  const service = new SessionService({} as any, repository as any);
  const session = await service.create(7, false);

  assert.equal(created.userId, 7);
  assert.equal(created.tokenHash, hashSessionToken(session.token));
  assert.notEqual(created.tokenHash, session.token);
  assert.equal(created.tokenHash.length, 64);
  const context = await service.getContext(session.token);
  assert.ok(context);
  assert.equal(service.isCsrfTokenValid(context!, session.csrfToken), true);
  assert.equal(service.isCsrfTokenValid(context!, `${session.csrfToken}x`), false);
});

test("auth session: remembered session lasts longer than ordinary session", async () => {
  const expirations: Date[] = [];
  const repository = {
    prune: async () => undefined,
    create: async (input: any) => {
      expirations.push(input.expiresAt);
      return { id: String(expirations.length) };
    },
  };
  const service = new SessionService({} as any, repository as any);
  await service.create(1, false);
  await service.create(1, true);
  assert.ok(expirations[1].getTime() - expirations[0].getTime() > 20 * 24 * 60 * 60 * 1000);
});

test("auth session: pruning is throttled across concurrent logins", async () => {
  let pruneCalls = 0;
  const repository = {
    prune: async () => {
      pruneCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
    },
    create: async () => ({ id: "session-id" }),
  };
  const service = new SessionService({} as any, repository as any);
  await Promise.all(Array.from({ length: 20 }, () => service.create(1, false)));
  assert.equal(pruneCalls, 1);
});
