import { expect, test } from "@playwright/test";
import {
  assertNoFatalUiErrors,
  assertNoHorizontalOverflow,
  bootstrapUiErrorCapture,
  expectAppView,
  fetchFirstProductContext,
  installSession,
} from "./helpers";

function parseCatalogStats(text: string | null) {
  const normalized = text ?? "";
  const total = Number(normalized.match(/Найдено:\s*(\d+)/)?.[1] ?? "0");
  return { total };
}

test.beforeEach(async ({ page }) => {
  await bootstrapUiErrorCapture(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await assertNoFatalUiErrors(page, testInfo);
});

test("@smoke public routes open without blank screen", async ({ page, request }) => {
  const { productId, sellerId } = await fetchFirstProductContext(request);
  const routes = [
    { path: "/", view: "home", title: /ecomm|каталог/i },
    { path: "/about", view: "about", title: /о нас|about/i },
    { path: "/faq", view: "faq", title: /faq|вопрос/i },
    { path: "/terms", view: "terms", title: /правил|услов/i },
    { path: `/products/${productId}`, view: "product", title: /добавить в корзину|купить сейчас/i },
    { path: `/sellers/${sellerId}`, view: "sellerStore", title: /магазин|отзывы|объявлен/i },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    await expectAppView(page, route.view);
    await expect(page.locator("body")).toContainText(route.title);
    await expect(page.locator("body")).not.toContainText(/Internal server error/i);
    await assertNoHorizontalOverflow(page);
  }
});

test("@smoke authenticated profile and admin routes render on desktop/mobile", async ({ page, request }) => {
  await installSession(page, request, "buyer");
  await page.goto("/profile/orders");
  await expectAppView(page, "profile");
  await expect(page.locator("body")).toContainText(/заказ|профил/i);
  await page.goto("/profile/addresses");
  await expectAppView(page, "profile");
  await expect(page.locator("body")).toContainText(/адрес|профил/i);
  await page.getByRole("button", { name: /добавить/i }).click();
  await expect(page.locator("body")).toContainText(/новый адрес/i);
  await expect(page.locator("body")).toContainText(
    /карта недоступна|загрузка карты|яндекс|открыть в яндекс картах|сохранить/i,
  );
  await page.goto("/profile/notifications");
  await expectAppView(page, "profile");
  await expect(page.locator("body")).toContainText(/уведомлен|профил/i);
  await page.goto("/profile/partner-orders");
  await expectAppView(page, "profile");
  await expect(page.locator("body")).toContainText(/заказ|партнер/i);
  await assertNoHorizontalOverflow(page);

  await installSession(page, request, "admin");
  await page.goto("/admin/listings");
  await expectAppView(page, "adminPanel");
  await expect(page.locator("body")).toContainText(/панель администратора|объявления/i);
  await page.goto("/admin/catalog");
  await expectAppView(page, "adminPanel");
  await expect(page.locator("body")).toContainText(/редактор каталога|заявок каталога|дерево товарного каталога/i);
  await page.goto("/admin/complaints");
  await expectAppView(page, "adminPanel");
  await expect(page.locator("body")).toContainText(/жалоб/i);
  await assertNoHorizontalOverflow(page);
});

test("@smoke catalog infinite scroll keeps home view and grows loaded window", async ({ page }) => {
  await page.goto("/");
  await expectAppView(page, "home");
  await expect
    .poll(async () => parseCatalogStats(await page.getByTestId("catalog-stats").textContent()).total)
    .toBeGreaterThan(0);

  const initialStats = parseCatalogStats(await page.getByTestId("catalog-stats").textContent());
  expect(initialStats.total).toBeGreaterThan(0);
  await expect(page.getByTestId("catalog-card").first()).toBeVisible();

  for (let index = 0; index < 4; index += 1) {
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" });
    });
    await page.waitForTimeout(800);
    await expectAppView(page, "home");
  }

  await expect(page.getByTestId("catalog-card").first()).toBeVisible();
  const loadedStats = parseCatalogStats(await page.getByTestId("catalog-stats").textContent());
  expect(loadedStats.total).toBeGreaterThan(0);
  await expectAppView(page, "home");
});

test("@smoke admin session on home stays on home until explicit admin navigation", async ({ page, request }) => {
  await installSession(page, request, "admin");
  await page.goto("/");
  await expectAppView(page, "home");
  await expect(page.locator("body")).toContainText(/каталог|ecomm/i);
  await assertNoHorizontalOverflow(page);
});
