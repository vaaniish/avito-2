import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after } from "node:test";
import test from "node:test";
import "dotenv/config";
import { prisma } from "../../../backend/src/lib/prisma";
import { app } from "../../../backend/src/app";

type JsonObject = Record<string, unknown>;

const SUPPORT_EMAIL = "support@ecom.ru";
const SUPPORT_PHONE = "8-800-123-45-67";

function isSafeDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  const normalized = url.toLowerCase();
  return (
    normalized.includes("localhost") ||
    normalized.includes("127.0.0.1") ||
    normalized.includes("postgres")
  );
}

const safeDb = isSafeDatabaseUrl(process.env.DATABASE_URL);
let server: Server | null = null;

function listenOnEphemeralPort(): Promise<string> {
  return new Promise((resolve, reject) => {
    const nextServer = app.listen(0, "127.0.0.1");
    server = nextServer;
    nextServer.once("error", reject);
    nextServer.once("listening", () => {
      const address = nextServer.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to resolve test server address"));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function apiRequest(params: {
  baseUrl: string;
  method: "POST" | "PATCH";
  path: string;
  body?: unknown;
  token?: string;
  expectedStatus: number;
}): Promise<JsonObject> {
  const response = await fetch(`${params.baseUrl}/api${params.path}`, {
    method: params.method,
    headers: {
      "content-type": "application/json",
      ...(params.token ? { authorization: `Bearer ${params.token}` } : {}),
    },
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const payload = (await response.json()) as JsonObject;
  assert.equal(
    response.status,
    params.expectedStatus,
    `${params.method} ${params.path} returned ${response.status}: ${JSON.stringify(payload)}`,
  );
  return payload;
}

async function login(baseUrl: string, email: string, password: string): Promise<JsonObject> {
  return apiRequest({
    baseUrl,
    method: "POST",
    path: "/auth/login",
    body: { email, password },
    expectedStatus: 200,
  });
}

after(async () => {
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve();
      return;
    }
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
  await prisma.$disconnect();
});

test(
  "integration: admin block reason is persisted and shown on blocked login",
  { skip: !safeDb },
  async () => {
    const baseUrl = await listenOnEphemeralPort();
    const target = await prisma.appUser.findUnique({
      where: { email: "seller4@ecomm.local" },
      select: {
        id: true,
        public_id: true,
        status: true,
        block_reason: true,
        blocked_until: true,
      },
    });
    assert.ok(target, "Test user seller4@ecomm.local was not found");

    const adminLogin = await login(baseUrl, "admin@ecomm.local", "admin123");
    const adminToken = adminLogin.sessionToken;
    assert.equal(typeof adminToken, "string", "Admin login did not return sessionToken");

    const blockReason =
      "Подозрение на обход безопасной сделки и просьбы об оплате вне платформы";

    try {
      await apiRequest({
        baseUrl,
        method: "PATCH",
        path: `/admin/users/${target.public_id}/status`,
        token: adminToken,
        body: {
          status: "blocked",
          blockReason,
        },
        expectedStatus: 200,
      });

      const blockedUser = await prisma.appUser.findUnique({
        where: { id: target.id },
        select: {
          status: true,
          block_reason: true,
          blocked_until: true,
        },
      });
      assert.equal(blockedUser?.status, "BLOCKED");
      assert.equal(blockedUser?.block_reason, blockReason);
      assert.equal(blockedUser?.blocked_until, null);

      const blockedLogin = await apiRequest({
        baseUrl,
        method: "POST",
        path: "/auth/login",
        body: {
          email: "seller4@ecomm.local",
          password: "seller123",
        },
        expectedStatus: 403,
      });
      assert.equal(typeof blockedLogin.error, "string");
      const message = blockedLogin.error;
      assert.match(message, /Аккаунт заблокирован/);
      assert.match(message, new RegExp(blockReason));
      assert.match(message, new RegExp(SUPPORT_EMAIL));
      assert.match(message, new RegExp(SUPPORT_PHONE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      await prisma.appUser.update({
        where: { id: target.id },
        data: {
          status: target.status,
          block_reason: target.block_reason,
          blocked_until: target.blocked_until,
        },
      });
    }
  },
);
