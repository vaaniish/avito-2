import { expect, test } from "@playwright/test";
import {
  assertNoFatalUiErrors,
  assertNoHorizontalOverflow,
  bootstrapUiErrorCapture,
  expectAppView,
  fetchFirstProductContext,
  installSession,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await bootstrapUiErrorCapture(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await assertNoFatalUiErrors(page, testInfo);
});

test("@visual key screens render and produce smoke artifacts", async ({ page, request }, testInfo) => {
  const { productId, sellerId } = await fetchFirstProductContext(request);

  const screens: Array<{
    name: string;
    path: string;
    view: string;
    role?: "buyer" | "seller" | "admin";
    anchor: RegExp;
  }> = [
    { name: "catalog", path: "/", view: "home", anchor: /каталог|ecomm/i },
    { name: "product-detail", path: `/products/${productId}`, view: "product", anchor: /купить сейчас|добавить в корзину/i },
    { name: "seller-store", path: `/sellers/${sellerId}`, view: "sellerStore", anchor: /магазин|отзывы|объявлен/i },
    { name: "checkout", path: "/checkout", view: "checkout", role: "buyer", anchor: /оформление заказа/i },
    { name: "profile-orders", path: "/profile/orders", view: "profile", role: "buyer", anchor: /заказ|профил/i },
    { name: "profile-addresses", path: "/profile/addresses", view: "profile", role: "buyer", anchor: /адрес|профил/i },
    { name: "profile-notifications", path: "/profile/notifications", view: "profile", role: "buyer", anchor: /уведомлен|профил/i },
    { name: "profile-partner-orders", path: "/profile/partner-orders", view: "profile", role: "seller", anchor: /заказ|партнер/i },
    { name: "partner-listings", path: "/profile/partner-listings", view: "profile", role: "seller", anchor: /объявлен|партнер/i },
    { name: "admin-listings", path: "/admin/listings", view: "adminPanel", role: "admin", anchor: /панель администратора|объявления/i },
    { name: "admin-complaints", path: "/admin/complaints", view: "adminPanel", role: "admin", anchor: /жалоб/i },
    { name: "admin-catalog", path: "/admin/catalog", view: "adminPanel", role: "admin", anchor: /редактор каталога|заявок каталога|дерево товарного каталога/i },
  ];

  for (const screen of screens) {
    if (screen.role) {
      await installSession(page, request, screen.role);
    }
    await page.goto(screen.path);
    await expectAppView(page, screen.view);
    await expect(page.locator("body")).toContainText(screen.anchor);
    await assertNoHorizontalOverflow(page);

    const image = await page.screenshot({ fullPage: true });
    await testInfo.attach(`${screen.name}.png`, {
      body: image,
      contentType: "image/png",
    });
  }
});
