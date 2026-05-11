import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, test } from "node:test";
import express from "express";
import { createProfileAddressRouter } from "../../../backend/src/modules/profile/profile.address.routes";

const servers = new Set<Server>();

after(async () => {
  await Promise.all(
    Array.from(servers).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
    ),
  );
  servers.clear();
});

async function startAddressRouterServer(params: {
  prisma?: {
    userAddress?: {
      findFirst?: (args: unknown) => Promise<unknown>;
      delete?: (args: unknown) => Promise<unknown>;
      updateMany?: (args: unknown) => Promise<unknown>;
      update?: (args: unknown) => Promise<unknown>;
    };
    $transaction?: (args: unknown) => Promise<unknown>;
  };
  loadLocationSuggestionsByYandex?: (query: string, limit: number) => Promise<unknown[]>;
  getDeliveryPoints: (
    query: string,
    providerFilter: "all" | "russian_post" | "yandex_pvz",
    options?: { cursor?: number; limit?: number },
  ) => Promise<{
    location: { city: string; label: string; lat: number; lng: number };
    points: Array<Record<string, unknown>>;
    pagination?: { total: number; cursor: number; nextCursor: number | null; hasMore: boolean };
  }>;
}) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/profile",
    createProfileAddressRouter({
      prisma:
        ({
          userAddress: {
            findFirst: async () => null,
            delete: async () => ({}),
            updateMany: async () => ({ count: 0 }),
            update: async () => ({}),
            ...params.prisma?.userAddress,
          },
          $transaction:
            params.prisma?.$transaction ??
            (async (operations: unknown) => operations),
        } as never),
      requireAnyRole: async () => ({ ok: true as const, user: { id: 1 } }),
      roleBuyer: "BUYER",
      roleSeller: "SELLER",
      roleAdmin: "ADMIN",
      mapUserAddressToDto: (() => {
        throw new Error("mapUserAddressToDto should not be called in delivery-points tests");
      }) as never,
      normalizeTextField: (value: unknown) => (typeof value === "string" ? value.trim() : ""),
      parseLegacyBuilding: () => ({ house: "", apartment: "", entrance: "" }),
      buildAddressFullAddress: () => "",
      loadLocationSuggestionsByYandex:
        params.loadLocationSuggestionsByYandex ?? (async () => []),
      parseDeliveryProviderFilter: (value: unknown) => {
        const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
        if (normalized === "russian_post") return "russian_post";
        if (normalized === "yandex_pvz") return "yandex_pvz";
        return "all";
      },
      getDeliveryPoints: params.getDeliveryPoints,
      deliveryProviders: [
        { code: "yandex_pvz", label: "Яндекс ПВЗ" },
        { code: "russian_post", label: "Почта России" },
      ],
    }),
  );

  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  servers.add(server);
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

test("integration: delivery points route returns 503 when providers are unavailable", async () => {
  const baseUrl = await startAddressRouterServer({
    getDeliveryPoints: async () => {
      throw new Error("Delivery points not available");
    },
  });

  const response = await fetch(`${baseUrl}/api/profile/delivery-points?city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0`);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 503);
  assert.equal(payload.error, "Delivery points are temporarily unavailable");
});

test("integration: delivery points route returns 404 for unknown city", async () => {
  const baseUrl = await startAddressRouterServer({
    getDeliveryPoints: async () => {
      throw new Error("Location not found");
    },
  });

  const response = await fetch(`${baseUrl}/api/profile/delivery-points?city=%D0%9C%D0%B5%D0%B3%D0%B0%D0%BF%D0%BE%D0%BB%D0%B8%D1%81`);
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 404);
  assert.equal(payload.error, "Location not found");
});

test("integration: delivery points route keeps russian_post as active fallback provider", async () => {
  const baseUrl = await startAddressRouterServer({
    getDeliveryPoints: async (query, providerFilter, options) => {
      assert.equal(query, "Москва");
      assert.equal(providerFilter, "all");
      assert.deepEqual(options, { cursor: 0, limit: undefined });
      return {
        location: {
          city: "Москва",
          label: "Москва",
          lat: 55.751574,
          lng: 37.573856,
        },
        points: [
          {
            id: "RP-TEST-1",
            provider: "russian_post",
            providerLabel: "Почта России",
            name: "ОПС Москва",
            address: "Москва, ул. Тестовая, 1",
            city: "Москва",
            lat: 55.75,
            lng: 37.57,
            workHours: "пн-пт 09:00-18:00",
            etaDays: 2,
            cost: 250,
          },
        ],
      };
    },
  });

  const response = await fetch(`${baseUrl}/api/profile/delivery-points?city=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0`);
  const payload = (await response.json()) as {
    city?: string;
    activeProvider?: string;
    points?: Array<{ provider?: string; id?: string }>;
  };

  assert.equal(response.status, 200);
  assert.equal(payload.city, "Москва");
  assert.equal(payload.activeProvider, "russian_post");
  assert.equal(payload.points?.[0]?.provider, "russian_post");
  assert.equal(payload.points?.[0]?.id, "RP-TEST-1");
});

test("integration: location suggest degrades to empty list when Yandex suggest fails", async () => {
  const baseUrl = await startAddressRouterServer({
    loadLocationSuggestionsByYandex: async () => {
      throw new Error("Yandex suggest timeout");
    },
    getDeliveryPoints: async () => ({
      location: {
        city: "Москва",
        label: "Москва",
        lat: 55.751574,
        lng: 37.573856,
      },
      points: [],
    }),
  });

  const response = await fetch(
    `${baseUrl}/api/profile/location/suggest?q=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0&limit=5`,
  );
  const payload = (await response.json()) as {
    query?: string;
    suggestions?: unknown[];
  };

  assert.equal(response.status, 200);
  assert.equal(payload.query, "Москва");
  assert.deepEqual(payload.suggestions, []);
});

test("integration: deleting unknown address returns 404", async () => {
  const baseUrl = await startAddressRouterServer({
    getDeliveryPoints: async () => ({
      location: {
        city: "Москва",
        label: "Москва",
        lat: 55.751574,
        lng: 37.573856,
      },
      points: [],
    }),
  });

  const response = await fetch(`${baseUrl}/api/profile/addresses/999999`, {
    method: "DELETE",
  });
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 404);
  assert.equal(payload.error, "Address not found");
});

test("integration: setting default for unknown address returns 404", async () => {
  const baseUrl = await startAddressRouterServer({
    getDeliveryPoints: async () => ({
      location: {
        city: "Москва",
        label: "Москва",
        lat: 55.751574,
        lng: 37.573856,
      },
      points: [],
    }),
  });

  const response = await fetch(`${baseUrl}/api/profile/addresses/999999/default`, {
    method: "POST",
  });
  const payload = (await response.json()) as { error?: string };

  assert.equal(response.status, 404);
  assert.equal(payload.error, "Address not found");
});
