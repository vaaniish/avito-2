import { performance } from "node:perf_hooks";
import React, { Profiler } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ProfilePage } from "../frontend/src/components/pages/ProfilePage";
import type { Order, ProfilePayload, ProfileTab } from "../frontend/src/components/pages/profile.models";

type RenderMetric = {
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
};

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const normalized = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * normalized.length);
  return normalized[Math.max(0, Math.min(normalized.length - 1, rank - 1))];
}

function createLocalStorageShim(): BrowserStorage {
  const store = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      const value = store.get(key);
      return typeof value === "string" ? value : null;
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value));
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  };
}

function createLargeProfilePayload(): ProfilePayload {
  const addresses = Array.from({ length: 180 }, (_, index) => ({
    id: String(index + 1),
    name: `Address ${index + 1}`,
    label: `address-${index + 1}`,
    fullAddress: `Moscow, Test Street ${index + 1}`,
    region: "Moscow",
    city: "Moscow",
    street: "Test Street",
    house: String((index % 150) + 1),
    apartment: String((index % 300) + 1),
    entrance: String((index % 8) + 1),
    building: String((index % 150) + 1),
    postalCode: "101000",
    lat: 55.75 + index * 0.00001,
    lon: 37.61 + index * 0.00001,
    isDefault: index === 0,
  }));

  const statuses: Order["status"][] = ["processing", "shipped", "completed", "cancelled"];
  const orders = Array.from({ length: 320 }, (_, index) => ({
    id: `ORD-STRESS-${index + 1}`,
    orderNumber: `A-${10_000 + index}`,
    date: "2026-04-20",
    status: statuses[index % statuses.length],
    total: 3000 + index * 10,
    deliveryDate: "2026-04-24",
    deliveryAddress: `Moscow, Delivery Street ${index + 1}`,
    deliveryCost: 0,
    discount: index % 3 === 0 ? 200 : 0,
    seller: {
      name: `Seller ${index % 40}`,
      avatar: null,
      phone: "+79990000000",
      address: "Moscow",
      workingHours: "09:00-20:00",
    },
    items: Array.from({ length: 4 }, (_, itemIndex) => ({
      id: `ITEM-${index + 1}-${itemIndex + 1}`,
      listingPublicId: `LST-${index + 1}-${itemIndex + 1}`,
      name: `Item ${index + 1}-${itemIndex + 1}`,
      image: "https://example.com/item.jpg",
      price: 1200 + itemIndex * 350,
      quantity: 1 + (itemIndex % 2),
    })),
  }));

  const wishlist = Array.from({ length: 900 }, (_, index) => ({
    id: `WISH-${index + 1}`,
    name: `Wishlist Item ${index + 1}`,
    price: 1000 + (index % 500) * 5,
    image: "https://example.com/wishlist.jpg",
    location: "Moscow",
    condition: index % 2 === 0 ? ("new" as const) : ("used" as const),
    seller: `Seller ${index % 60}`,
    addedDate: "2026-04-20",
  }));

  return {
    user: {
      id: 2,
      public_id: "USR-STRESS-2",
      role: "regular",
      firstName: "Stress",
      lastName: "User",
      displayName: "Stress User",
      name: "Stress User",
      email: "stress.user@example.local",
      avatar: null,
      city: "Moscow",
      joinDate: "2024",
    },
    addresses,
    orders,
    wishlist,
  };
}

async function waitForProfileLoaded(renderer: ReactTestRenderer, timeoutMs: number): Promise<void> {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const snapshot = JSON.stringify(renderer.toJSON());
    if (snapshot.includes("page-container")) {
      return;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("ProfilePage did not finish loading in time");
}

async function main(): Promise<void> {
  const mockPayload = createLargeProfilePayload();
  const localStorageShim = createLocalStorageShim();

  const windowLike = globalThis as typeof globalThis & {
    localStorage?: BrowserStorage;
    location?: { assign: (url: string) => void };
    window?: unknown;
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };

  windowLike.localStorage = localStorageShim;
  windowLike.location = {
    assign: () => {
      // no-op in stress harness
    },
  };
  windowLike.window = windowLike;
  windowLike.IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as typeof globalThis & { localStorage?: BrowserStorage }).localStorage =
    localStorageShim;

  const originalFetch = globalThis.fetch;
  let profileMeCalls = 0;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (method === "GET" && url.endsWith("/api/profile/me")) {
      profileMeCalls += 1;
      return new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }

    return new Response(JSON.stringify({ error: `Unhandled request in stress harness: ${method} ${url}` }), {
      status: 404,
      headers: {
        "content-type": "application/json",
      },
    });
  };

  const renderMetrics: RenderMetric[] = [];
  const tabEvents: ProfileTab[] = [];
  const baseProps = {
    onBack: () => {},
    onLogout: () => {},
    userType: "regular" as const,
    onTabChange: (tab: ProfileTab) => {
      tabEvents.push(tab);
    },
    onWishlistUpdate: () => {},
    onOpenListing: () => {},
  };

  const makeTree = (initialTab: ProfileTab) =>
    React.createElement(
      Profiler,
      {
        id: "profile-render-stress",
        onRender: (
          _id: string,
          phase: "mount" | "update" | "nested-update",
          actualDuration: number,
        ) => {
          renderMetrics.push({ phase, actualDuration });
        },
      },
      React.createElement(ProfilePage, {
        ...baseProps,
        initialTab,
      }),
    );

  let renderer: ReactTestRenderer;
  const mountStartedAt = performance.now();
  try {
    await act(async () => {
      renderer = create(makeTree("profile"));
    });

    await waitForProfileLoaded(renderer!, 4000);
    const loadElapsedMs = performance.now() - mountStartedAt;
    const commitsAfterLoad = renderMetrics.length;

    const safeTabs: ProfileTab[] = ["profile", "orders", "wishlist", "partnership"];
    const switches = 160;
    const switchesStartedAt = performance.now();
    for (let index = 0; index < switches; index += 1) {
      const nextTab = safeTabs[index % safeTabs.length];
      await act(async () => {
        renderer!.update(makeTree(nextTab));
      });
    }
    const switchesElapsedMs = performance.now() - switchesStartedAt;
    const totalElapsedMs = performance.now() - mountStartedAt;

    const commitDurations = renderMetrics.map((item) => item.actualDuration);
    const maxCommitMs = Math.max(...commitDurations, 0);
    const p95CommitMs = percentile(commitDurations, 95);
    const avgCommitMs =
      commitDurations.length > 0
        ? commitDurations.reduce((sum, value) => sum + value, 0) / commitDurations.length
        : 0;
    const switchCommitCount = renderMetrics.length - commitsAfterLoad;
    const commitsPerSwitch = switchCommitCount / switches;

    invariant(profileMeCalls === 1, `expected exactly one /profile/me call, got ${profileMeCalls}`);
    invariant(
      loadElapsedMs <= maxLoadMs,
      `profile load exceeded threshold: ${loadElapsedMs.toFixed(2)}ms`,
    );
    invariant(
      switchesElapsedMs <= maxSwitchesMs,
      `tab switching exceeded threshold: ${switchesElapsedMs.toFixed(2)}ms`,
    );
    invariant(
      maxCommitMs <= maxCommitMsThreshold,
      `max commit duration too high: ${maxCommitMs.toFixed(2)}ms`,
    );
    invariant(
      p95CommitMs <= maxP95CommitMsThreshold,
      `p95 commit duration too high: ${p95CommitMs.toFixed(2)}ms`,
    );
    invariant(
      commitsPerSwitch <= maxCommitsPerSwitchThreshold,
      `too many commits per switch: ${commitsPerSwitch.toFixed(2)}`,
    );
    invariant(tabEvents.length > 0, "expected onTabChange events during stress run");

    const report = {
      scenario: "SCN-048",
      result: "PASS",
      payloadScale: {
        addresses: mockPayload.addresses.length,
        orders: mockPayload.orders.length,
        orderItems: mockPayload.orders.reduce((sum, order) => sum + order.items.length, 0),
        wishlist: mockPayload.wishlist.length,
      },
      timingsMs: {
        loadElapsedMs: Number(loadElapsedMs.toFixed(3)),
        switchesElapsedMs: Number(switchesElapsedMs.toFixed(3)),
        totalElapsedMs: Number(totalElapsedMs.toFixed(3)),
      },
      render: {
        commitCount: renderMetrics.length,
        commitCountAfterLoad: commitsAfterLoad,
        switchCommitCount,
        commitsPerSwitch: Number(commitsPerSwitch.toFixed(3)),
        maxCommitMs: Number(maxCommitMs.toFixed(3)),
        p95CommitMs: Number(p95CommitMs.toFixed(3)),
        avgCommitMs: Number(avgCommitMs.toFixed(3)),
      },
      requests: {
        profileMeCalls,
      },
      tabEvents: {
        total: tabEvents.length,
      },
      thresholds: {
        maxLoadMs,
        maxSwitchesMs,
        maxCommitMs: maxCommitMsThreshold,
        maxP95CommitMs: maxP95CommitMsThreshold,
        maxCommitsPerSwitch: maxCommitsPerSwitchThreshold,
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
  const maxLoadMs = Number(process.env.SCENARIO_048_MAX_LOAD_MS ?? "4000");
  const maxSwitchesMs = Number(process.env.SCENARIO_048_MAX_SWITCHES_MS ?? "6500");
  const maxCommitMsThreshold = Number(process.env.SCENARIO_048_MAX_COMMIT_MS ?? "180");
  const maxP95CommitMsThreshold = Number(process.env.SCENARIO_048_MAX_P95_COMMIT_MS ?? "35");
  const maxCommitsPerSwitchThreshold = Number(
    process.env.SCENARIO_048_MAX_COMMITS_PER_SWITCH ?? "2.2",
  );
