import { expect, type APIRequestContext, type Page, type TestInfo } from "@playwright/test";

type SessionRole = "buyer" | "seller" | "admin";

const API_BASE = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:3001/api";
const SESSION_STORAGE_KEY = "ecomm_session_user";
const SESSION_TOKEN_STORAGE_KEY = "ecomm_session_token";

const credentials: Record<SessionRole, { email: string; password: string }> = {
  buyer: { email: "buyer1@ecomm.local", password: "buyer123" },
  seller: { email: "seller1@ecomm.local", password: "seller123" },
  admin: { email: "admin@ecomm.local", password: "admin123" },
};

export async function installSession(
  page: Page,
  request: APIRequestContext,
  role: SessionRole,
): Promise<void> {
  const payload = await loginViaApi(request, role);

  await page.addInitScript(
    ({ sessionToken, user, sessionStorageKey, sessionTokenStorageKey }) => {
      window.localStorage.setItem(sessionTokenStorageKey, String(sessionToken));
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(user));
    },
    {
      sessionToken: payload.sessionToken,
      user: payload.user,
      sessionStorageKey: SESSION_STORAGE_KEY,
      sessionTokenStorageKey: SESSION_TOKEN_STORAGE_KEY,
    },
  );
}

export async function loginViaApi(
  request: APIRequestContext,
  role: SessionRole,
): Promise<{ sessionToken: string; user: Record<string, unknown> }> {
  return loginWithCredentials(request, credentials[role].email, credentials[role].password);
}

export async function loginWithCredentials(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<{ sessionToken: string; user: Record<string, unknown> }> {
  const response = await request.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as {
    sessionToken?: string;
    user?: Record<string, unknown>;
  };
  expect(typeof payload.sessionToken).toBe("string");
  expect(typeof payload.user).toBe("object");
  return {
    sessionToken: payload.sessionToken as string,
    user: payload.user as Record<string, unknown>,
  };
}

export async function fetchFirstProductId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_BASE}/catalog/listings?type=products&limit=1&offset=0`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as Array<{ id?: string }>;
  const productId = payload[0]?.id?.trim();
  expect(productId).toBeTruthy();
  return productId as string;
}

export async function fetchFirstProductContext(request: APIRequestContext): Promise<{
  productId: string;
  sellerId: string;
}> {
  const response = await request.get(`${API_BASE}/catalog/listings?type=products&limit=1&offset=0`);
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as Array<{
    id?: string;
  }>;
  const productId = payload[0]?.id?.trim();
  expect(productId).toBeTruthy();
  const detailResponse = await request.get(`${API_BASE}/catalog/listings/${productId}`);
  expect(detailResponse.ok()).toBeTruthy();
  const detail = (await detailResponse.json()) as {
    sellerId?: string;
  };
  const sellerId = detail.sellerId?.trim();
  expect(sellerId).toBeTruthy();
  return {
    productId: productId as string,
    sellerId: sellerId as string,
  };
}

export async function createModerationNotificationFixture(request: APIRequestContext): Promise<{
  listingId: string;
  sellerToken: string;
}> {
  const seller = await loginViaApi(request, "seller");
  const admin = await loginViaApi(request, "admin");

  const createResponse = await request.post(`${API_BASE}/partner/listings`, {
    headers: {
      authorization: `Bearer ${seller.sessionToken}`,
      "content-type": "application/json",
    },
    data: {
      type: "products",
      title: `playwright moderation fixture ${Date.now()}`,
      price: 15000,
      condition: "used",
      description: "clean listing for playwright notification coverage",
      category: "CI тестовый товар",
      images: [
        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
        "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
        "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
      ],
      attributes: [
        { key: "__catalog_category", value: "Комплектующие для ПК" },
        { key: "__catalog_subcategory", value: "Основные комплектующие для ПК" },
        { key: "__catalog_item", value: "CI тестовый товар" },
        { key: "__catalog_item_custom", value: "CI тестовый товар" },
      ],
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = (await createResponse.json()) as { id?: string };
  expect(created.id).toBeTruthy();

  const moderateResponse = await request.patch(`${API_BASE}/admin/listings/${created.id}/moderation`, {
    headers: {
      authorization: `Bearer ${admin.sessionToken}`,
      "content-type": "application/json",
    },
    data: {
      status: "rejected",
      reasonNote: `playwright reject ${Date.now()}`,
    },
  });
  expect(moderateResponse.ok()).toBeTruthy();

  return {
    listingId: created.id as string,
    sellerToken: seller.sessionToken,
  };
}

export async function createComplaintFixture(request: APIRequestContext): Promise<{ complaintId: string }> {
  const buyer = await loginWithCredentials(request, "buyer2@ecomm.local", "buyer123");
  const seller = await loginViaApi(request, "seller");
  const admin = await loginViaApi(request, "admin");

  const createResponse = await request.post(`${API_BASE}/partner/listings`, {
    headers: {
      authorization: `Bearer ${seller.sessionToken}`,
      "content-type": "application/json",
    },
    data: {
      type: "products",
      title: `playwright complaint fixture ${Date.now()}`,
      price: 15000,
      condition: "used",
      description: "clean listing for playwright complaint coverage",
      category: "CI тестовый товар",
      images: [
        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1200&q=80",
        "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=1200&q=80",
        "https://images.unsplash.com/photo-1517336714739-489689fd1ca8?w=1200&q=80",
        "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=1200&q=80",
      ],
      attributes: [
        { key: "__catalog_category", value: "Комплектующие для ПК" },
        { key: "__catalog_subcategory", value: "Основные комплектующие для ПК" },
        { key: "__catalog_item", value: "CI тестовый товар" },
        { key: "__catalog_item_custom", value: "CI тестовый товар" },
      ],
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = (await createResponse.json()) as { id?: string };
  expect(created.id).toBeTruthy();

  const moderateResponse = await request.patch(`${API_BASE}/admin/listings/${created.id}/moderation`, {
    headers: {
      authorization: `Bearer ${admin.sessionToken}`,
      "content-type": "application/json",
    },
    data: {
      status: "approved",
      reasonNote: `playwright approve ${Date.now()}`,
    },
  });
  expect(moderateResponse.ok()).toBeTruthy();

  const response = await request.post(`${API_BASE}/catalog/listings/${created.id}/complaints`, {
    headers: {
      authorization: `Bearer ${buyer.sessionToken}`,
      "content-type": "application/json",
    },
    data: {
      complaintType: `playwright_ui_${Date.now()}`,
      description: "Playwright complaint flow fixture",
    },
  });
  const payload = (await response.json()) as { id?: string };
  expect(response.ok(), `complaint creation failed: ${response.status()} ${JSON.stringify(payload)}`).toBeTruthy();
  expect(payload.id).toBeTruthy();
  return {
    complaintId: payload.id as string,
  };
}

export async function createPartnershipRequestFixture(request: APIRequestContext): Promise<{
  requestId: string;
}> {
  const buyer = await loginWithCredentials(request, "buyer2@ecomm.local", "buyer123");

  const policyResponse = await request.get(`${API_BASE}/public/policy/current?scope=partnership`);
  expect(policyResponse.ok()).toBeTruthy();
  const policy = (await policyResponse.json()) as { id?: string };
  expect(policy.id).toBeTruthy();

  const acceptResponse = await request.post(`${API_BASE}/profile/policy-acceptance`, {
    headers: {
      authorization: `Bearer ${buyer.sessionToken}`,
      "content-type": "application/json",
    },
    data: {
      scope: "partnership",
      policyId: policy.id,
    },
  });
  expect([200, 201].includes(acceptResponse.status())).toBeTruthy();

  const createResponse = await request.post(`${API_BASE}/profile/partnership-requests`, {
    headers: {
      authorization: `Bearer ${buyer.sessionToken}`,
      "content-type": "application/json",
    },
    data: {
      sellerType: "company",
      name: `Playwright Partner ${Date.now()}`,
      email: "buyer2@ecomm.local",
      contact: "+7 999 000 11 22",
      link: "https://partner-playwright.example",
      category: "laptops",
      inn: "7707083893",
      geography: "Москва",
      socialProfile: "https://t.me/playwright_partner",
      credibility:
        "Действующий магазин, документы поставщиков доступны, сервисный процесс описан подробно.",
      whyUs:
        "Планируем размещать ассортимент ноутбуков и аксессуаров, поддерживать SLA и качественную коммуникацию с покупателями.",
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const payload = (await createResponse.json()) as { request_id?: string };
  expect(payload.request_id).toBeTruthy();
  return {
    requestId: payload.request_id as string,
  };
}

export async function bootstrapUiErrorCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const storage: Array<{ type: string; message: string }> = [];
    (window as Window & { __PW_ERRORS__?: typeof storage }).__PW_ERRORS__ = storage;

    window.addEventListener("error", (event) => {
      storage.push({
        type: "error",
        message: event.message || "Unknown window error",
      });
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason =
        typeof event.reason === "string"
          ? event.reason
          : event.reason && typeof event.reason.message === "string"
            ? event.reason.message
            : JSON.stringify(event.reason);
      storage.push({
        type: "unhandledrejection",
        message: reason || "Unknown promise rejection",
      });
    });
  });
}

export async function assertNoFatalUiErrors(page: Page, testInfo: TestInfo): Promise<void> {
  const errors = ((await page.evaluate(() => {
    const captured = (window as Window & {
      __PW_ERRORS__?: Array<{ type?: string; message?: string }>;
    }).__PW_ERRORS__;
    return Array.isArray(captured) ? captured : [];
  })) as Array<{ type?: string; message?: string }>).filter((entry) => {
    const message = String(entry?.message ?? "");
    if (!message.trim()) return false;
    return !/favicon|non-passive event listener|ResizeObserver loop limit exceeded/i.test(message);
  });

  if (errors.length > 0) {
    await testInfo.attach("ui-errors", {
      body: JSON.stringify(errors, null, 2),
      contentType: "application/json",
    });
  }
  expect(errors, "unexpected runtime or console errors").toEqual([]);
}

export async function expectAppView(page: Page, view: string): Promise<void> {
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-view", view);
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const hasOverflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 1;
  });
  expect(hasOverflow).toBe(false);
}
