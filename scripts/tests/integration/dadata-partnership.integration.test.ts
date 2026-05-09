import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { AddressInfo } from "node:net";
import "dotenv/config";
import { app } from "../../../backend/src/app";
import { prisma } from "../../../backend/src/lib/prisma";

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

let baseUrl = "";
let server: ReturnType<typeof app.listen> | null = null;

before(async () => {
  if (!safeDb) return;

  server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
  await prisma.$disconnect();
});

async function apiRequest(params: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  token?: string;
  body?: unknown;
  expected: number[];
}) {
  const headers: Record<string, string> = {};
  if (params.body !== undefined) headers["content-type"] = "application/json";
  if (params.token) headers.authorization = `Bearer ${params.token}`;

  const response = await fetch(`${baseUrl}${params.path}`, {
    method: params.method,
    headers,
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;

  if (!params.expected.includes(response.status)) {
    throw new Error(
      `${params.method} ${params.path} -> ${response.status}\n${JSON.stringify(data, null, 2)}`,
    );
  }

  return { status: response.status, data };
}

async function login(email: string, password: string): Promise<string> {
  const response = await apiRequest({
    method: "POST",
    path: "/api/auth/login",
    expected: [200],
    body: { email, password },
  });
  assert.equal(typeof response.data?.sessionToken, "string");
  return response.data.sessionToken;
}

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const snapshot: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    snapshot[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return fn().finally(() => {
    for (const [key, value] of Object.entries(snapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test(
  "integration: legal lookup rejects invalid inn before DaData request",
  { skip: !safeDb },
  async () => {
    const sellerToken = await login("seller1@ecomm.local", "seller123");

    const response = await withEnv({ DADATA_API_KEY: "test-token" }, () =>
      apiRequest({
        method: "POST",
        path: "/api/profile/partnership-requests/legal-lookup",
        token: sellerToken,
        expected: [400],
        body: { inn: "123", legalType: "COMPANY" },
      }),
    );

    assert.match(String(response.data?.error), /ИНН/u);
  },
);

test(
  "integration: legal lookup returns 503 when DaData key is missing",
  { skip: !safeDb },
  async () => {
    const sellerToken = await login("seller1@ecomm.local", "seller123");

    const response = await withEnv({ DADATA_API_KEY: undefined }, () =>
      apiRequest({
        method: "POST",
        path: "/api/profile/partnership-requests/legal-lookup",
        token: sellerToken,
        expected: [503],
        body: { inn: "7707083893", legalType: "COMPANY" },
      }),
    );

    assert.equal(response.data?.error, "DaData is not configured.");
  },
);
