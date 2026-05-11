import { expect, test } from "@playwright/test";
import {
  assertNoFatalUiErrors,
  assertNoHorizontalOverflow,
  bootstrapUiErrorCapture,
  createComplaintFixture,
  createModerationNotificationFixture,
  createPartnershipRequestFixture,
  expectAppView,
  fetchFirstProductId,
  installSession,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await bootstrapUiErrorCapture(page);
});

test.afterEach(async ({ page }, testInfo) => {
  await assertNoFatalUiErrors(page, testInfo);
});

test("@critical buyer can jump from product detail to checkout", async ({ page, request }) => {
  await installSession(page, request, "buyer");
  const productId = await fetchFirstProductId(request);

  await page.goto(`/products/${productId}`);
  await expectAppView(page, "product");
  await page.getByRole("button", { name: /купить сейчас/i }).click();
  await expectAppView(page, "checkout");
  await expect(page.locator("body")).toContainText(/оформление заказа/i);
  await assertNoHorizontalOverflow(page);
});

test("@critical partner and admin critical panels open with primary controls", async ({ page, request }) => {
  await installSession(page, request, "seller");
  await page.goto("/profile/partner-listings");
  await expectAppView(page, "profile");
  await expect(page.locator("body")).toContainText(/объявлен|партнер/i);
  await expect(page.getByRole("button", { name: /создать/i }).first()).toBeVisible();

  await installSession(page, request, "admin");
  await page.goto("/admin/complaints");
  await expectAppView(page, "adminPanel");
  await expect(page.locator("body")).toContainText(/жалоб/i);
  await expect(page.getByRole("button", { name: /жалобы|объявления|пользователи/i }).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
});

test("@critical auth and admin login forms keep primary actions usable", async ({ page }) => {
  await page.goto("/auth");
  await expectAppView(page, "auth");
  await page.getByTestId("auth-email").fill("buyer1@ecomm.local");
  await page.getByTestId("auth-password").fill("buyer123");
  await page.getByTestId("auth-submit").click();
  await expectAppView(page, "profile");
  await expect(page.locator("body")).toContainText(/профил|заказ|адрес/i);

  await page.goto("/admin/login");
  await expectAppView(page, "adminLogin");
  await page.getByTestId("admin-login-email").fill("admin@ecomm.local");
  await page.getByTestId("admin-login-password").fill("admin123");
  await page.getByTestId("admin-login-submit").click();
  await expectAppView(page, "adminPanel");
});

test("@critical seller sees moderation notification in the notifications panel", async ({ page, request }, testInfo) => {
  await createModerationNotificationFixture(request);
  await installSession(page, request, "seller");
  const isMobile = testInfo.project.name.includes("mobile");
  const toggleId = isMobile
    ? "header-notifications-toggle-mobile"
    : "header-notifications-toggle-desktop";
  const panelId = isMobile
    ? "header-notifications-panel-mobile"
    : "header-notifications-panel-desktop";

  await page.goto("/");
  await page.getByTestId(toggleId).click();
  await expect(page.getByTestId(panelId)).toBeVisible();
  await expect(page.getByTestId(panelId)).toContainText(/отклонено|дополнительную проверку|одобрено/i);
});

test("@critical admin can review a complaint from the modal flow", async ({ page, request }, testInfo) => {
  const { complaintId } = await createComplaintFixture(request);
  const isMobile = testInfo.project.name.includes("mobile");

  await installSession(page, request, "admin");
  await page.goto("/admin/complaints");
  await expectAppView(page, "adminPanel");
  await page.getByPlaceholder(/поиск по жалобам/i).fill(complaintId);
  await page.getByRole("button", { name: new RegExp(complaintId) }).first().click();
  await expect(page.locator("body")).toContainText(complaintId);
  await page.locator("textarea").fill("Playwright complaint review note");
  await page.getByRole("button", { name: /отклонить/i }).click();
  const confirmDialog = page.getByRole("dialog", { name: /подтвердите действие/i });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: /^подтвердить$/i }).click();
  await page.getByRole("button", { name: /отклоненные/i }).click();
  await expect(page.getByRole("button", { name: new RegExp(complaintId) }).first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  if (isMobile) {
    await expect(page.locator("body")).toContainText(/жалобы/i);
  }
});

test("@critical admin can review a partnership request from the seller modal", async ({ page, request }, testInfo) => {
  const { requestId } = await createPartnershipRequestFixture(request);
  const isMobile = testInfo.project.name.includes("mobile");

  await installSession(page, request, "admin");
  await page.goto("/admin/sellers");
  await expectAppView(page, "adminPanel");
  await page.getByPlaceholder(/поиск по партнёрским заявкам/i).fill(requestId);
  await page.getByRole("button", { name: new RegExp(requestId) }).first().click();
  await expect(page.locator("body")).toContainText(requestId);
  await expect(page.locator("body")).toContainText(/1\. Бизнес/i);

  if (isMobile) {
    await page.getByRole("button", { name: /действия модератора/i }).click();
  }
  await page.getByRole("button", { name: /документы/i }).click();
  await page.locator('textarea[placeholder*="Комментарий модератора"]:visible').fill("Playwright needs more info");
  await page.getByRole("button", { name: /применить/i }).last().click();
  await expect(page.locator("body")).toContainText(/нужны данные/i);
  await assertNoHorizontalOverflow(page);
});
