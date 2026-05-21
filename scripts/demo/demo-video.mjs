#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline";
import { chromium } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const OUTPUT_DIR = path.resolve(ROOT_DIR, "artifacts", "demo-video");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const META_PATH = path.join(OUTPUT_DIR, "manifest.json");
const FINAL_PATH = path.join(OUTPUT_DIR, "demo-final.mov");
const NATIVE_MOUSE_SCRIPT = path.join(ROOT_DIR, "scripts/demo/native-mouse.swift");
const API_BASE = "http://127.0.0.1:3001/api";
const APP_BASE = "http://127.0.0.1:3000";
const SESSION_STORAGE_KEY = "ecomm_session_user";
const SESSION_TOKEN_STORAGE_KEY = "ecomm_session_token";
const WINDOW_BOUNDS = { width: 1500, height: 1220 };
const VIEWPORT = { width: 1440, height: 1100 };
const RECORDING_PADDING_MS = 800;
const END_PAUSE_MS = 900;

const SCENE_NAMES = ["seller", "admin", "buyer"];

const SELLER_IMAGES = [
  path.join(
    process.env.HOME ?? "/Users/vanish",
    "Downloads/palit-geforce-rtx-5060-dual-photo-01.jpg.webp",
  ),
  path.join(
    process.env.HOME ?? "/Users/vanish",
    "Downloads/palit-geforce-rtx-5060-dual-photo-02.jpg.webp",
  ),
  path.join(
    process.env.HOME ?? "/Users/vanish",
    "Downloads/palit-geforce-rtx-5060-dual-photo-03.jpg.webp",
  ),
  path.join(
    process.env.HOME ?? "/Users/vanish",
    "Downloads/palit-geforce-rtx-5060-dual-photo-04.jpg.webp",
  ),
  path.join(
    process.env.HOME ?? "/Users/vanish",
    "Downloads/palit-geforce-rtx-5060-dual-photo-05.jpg.webp",
  ),
];

const OPEN_DIALOG_RELATIVE_RECT = {
  x: 276,
  y: 366,
  width: 890,
  height: 448,
};

const FINDER_PICKER_POINTS = {
  downloadsSidebar: { x: 88, y: 140 },
  selectionDragStart: { x: 430, y: 228 },
  selectionDragEnd: { x: 223, y: 66 },
  openButton: { x: 822, y: 412 },
};

const credentials = {
  buyer: { email: "buyer1@ecomm.local", password: "buyer123" },
  seller: { email: "seller1@ecomm.local", password: "seller123" },
  admin: { email: "admin@ecomm.local", password: "admin123" },
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function login(role) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials[role]),
  });
  if (!response.ok) {
    throw new Error(`Unable to login as ${role}: ${response.status}`);
  }
  const payload = await response.json();
  if (!payload?.sessionToken || !payload?.user) {
    throw new Error(`Malformed login payload for ${role}`);
  }
  return payload;
}

class NativeMouseController {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.process = null;
    this.readline = null;
    this.pending = [];
    this.last = null;
  }

  async start() {
    if (this.process) return;
    this.process = spawn("swift", [NATIVE_MOUSE_SCRIPT], {
      cwd: this.rootDir,
      stdio: ["pipe", "pipe", "inherit"],
    });
    this.readline = readline.createInterface({ input: this.process.stdout });
    this.readline.on("line", (line) => {
      const next = this.pending.shift();
      if (!next) return;
      try {
        const payload = JSON.parse(line);
        if (payload.ok) {
          next.resolve(payload);
          return;
        }
        next.reject(new Error(payload.error ?? "Native mouse helper failed"));
      } catch (error) {
        next.reject(error);
      }
    });
    this.process.once("exit", (code) => {
      const error = new Error(`Native mouse helper exited with code ${code}`);
      while (this.pending.length > 0) {
        this.pending.shift().reject(error);
      }
      this.process = null;
      this.readline = null;
    });
    await this.send({ cmd: "ping" });
  }

  send(payload) {
    if (!this.process?.stdin) {
      throw new Error("Native mouse helper is not running");
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.process.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  async setAssociated(value) {
    await this.send({ cmd: "associate", value });
  }

  async moveTo(x, y, options = {}) {
    const steps = options.steps ?? 28;
    const delayMs = options.delayMs ?? 18;
    const start = this.last ?? { x, y };
    await this.send({
      cmd: "move",
      fromX: start.x,
      fromY: start.y,
      toX: x,
      toY: y,
      steps,
      delayMs,
    });
    this.last = { x, y };
  }

  async clickAt(x, y, options = {}) {
    await this.send({
      cmd: "click",
      x,
      y,
      count: options.count ?? 1,
      delayMs: options.delayMs ?? 60,
      modifiers: options.modifiers ?? [],
    });
    this.last = { x, y };
  }

  async dragTo(from, to, options = {}) {
    await this.send({
      cmd: "drag",
      fromX: from.x,
      fromY: from.y,
      toX: to.x,
      toY: to.y,
      steps: options.steps ?? 32,
      delayMs: options.delayMs ?? 22,
      modifiers: options.modifiers ?? [],
    });
    this.last = { x: to.x, y: to.y };
  }

  async pressKey(key, options = {}) {
    await this.send({
      cmd: "press",
      key,
      delayMs: options.delayMs ?? 60,
      modifiers: options.modifiers ?? [],
    });
  }

  async typeText(text, options = {}) {
    await this.send({
      cmd: "type",
      text,
      delayMs: options.delayMs ?? 34,
    });
  }

  reset() {
    this.last = null;
  }

  async stop() {
    if (!this.process) return;
    try {
      await this.setAssociated(true);
    } catch {}
    await this.send({ cmd: "exit" }).catch(() => {});
    this.readline?.close();
    this.process.stdin?.end();
    this.process = null;
    this.readline = null;
    this.last = null;
  }
}

const nativeMouse = new NativeMouseController(ROOT_DIR);

async function viewportPointToScreen(page, point) {
  const metrics = await page.evaluate(() => ({
    screenX: window.screenX,
    screenY: window.screenY,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  }));
  const horizontalInset = Math.max(0, Math.round((metrics.outerWidth - metrics.innerWidth) / 2));
  const bottomInset = horizontalInset;
  const topInset = Math.max(0, Math.round(metrics.outerHeight - metrics.innerHeight - bottomInset));
  return {
    x: Math.round(metrics.screenX + horizontalInset + point.x),
    y: Math.round(metrics.screenY + topInset + point.y),
  };
}

function windowPointToScreen(rect, point) {
  return {
    x: Math.round(rect.x + point.x),
    y: Math.round(rect.y + point.y),
  };
}

function addPoint(rect, point) {
  return {
    x: Math.round(rect.x + point.x),
    y: Math.round(rect.y + point.y),
  };
}

function getOpenDialogRect(windowRect) {
  return {
    x: windowRect.x + OPEN_DIALOG_RELATIVE_RECT.x,
    y: windowRect.y + OPEN_DIALOG_RELATIVE_RECT.y,
    width: OPEN_DIALOG_RELATIVE_RECT.width,
    height: OPEN_DIALOG_RELATIVE_RECT.height,
  };
}

async function setSession(page, role) {
  const payload = await login(role);
  await page.addInitScript(
    ({ token, user, sessionStorageKey, sessionTokenStorageKey }) => {
      window.localStorage.setItem(sessionTokenStorageKey, String(token));
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(user));
    },
    {
      token: payload.sessionToken,
      user: payload.user,
      sessionStorageKey: SESSION_STORAGE_KEY,
      sessionTokenStorageKey: SESSION_TOKEN_STORAGE_KEY,
    },
  );
  if (!page.url().startsWith(APP_BASE)) {
    await page.goto(APP_BASE, { waitUntil: "domcontentloaded" });
  }
  await page.evaluate(
    ({ token, user, sessionStorageKey, sessionTokenStorageKey }) => {
      window.localStorage.setItem(sessionTokenStorageKey, String(token));
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(user));
    },
    {
      token: payload.sessionToken,
      user: payload.user,
      sessionStorageKey: SESSION_STORAGE_KEY,
      sessionTokenStorageKey: SESSION_TOKEN_STORAGE_KEY,
    },
  );
}

async function clearSession(page) {
  await page.addInitScript(
    ({ sessionStorageKey, sessionTokenStorageKey }) => {
      window.localStorage.removeItem(sessionTokenStorageKey);
      window.localStorage.removeItem(sessionStorageKey);
    },
    {
      sessionStorageKey: SESSION_STORAGE_KEY,
      sessionTokenStorageKey: SESSION_TOKEN_STORAGE_KEY,
    },
  );
  if (!page.url().startsWith(APP_BASE)) {
    await page.goto(APP_BASE, { waitUntil: "domcontentloaded" });
  }
  await page.evaluate(
    ({ sessionStorageKey, sessionTokenStorageKey }) => {
      window.localStorage.removeItem(sessionTokenStorageKey);
      window.localStorage.removeItem(sessionStorageKey);
    },
    {
      sessionStorageKey: SESSION_STORAGE_KEY,
      sessionTokenStorageKey: SESSION_TOKEN_STORAGE_KEY,
    },
  );
}

async function clearCartStorage(page) {
  await page.evaluate(() => {
    const keys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("ecomm_cart")) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  });
}

async function getWindowRect(page) {
  const metrics = await page.evaluate(() => ({
    x: Math.round(window.screenX),
    y: Math.round(window.screenY),
    width: Math.round(window.outerWidth),
    height: Math.round(window.outerHeight),
  }));
  return metrics;
}

async function centerOf(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Unable to calculate element bounds");
  }
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

async function moveCursor(page, x, y, options = {}) {
  const absolute = await viewportPointToScreen(page, { x, y });
  await nativeMouse.moveTo(absolute.x, absolute.y, {
    steps: options.steps ?? options.moveSteps ?? 32,
    delayMs: options.delayMs ?? options.moveDelayMs ?? 22,
  });
  await page.mouse.move(x, y);
}

async function moveSystemCursorToWindowPoint(windowRect, point, options = {}) {
  const absolute = windowPointToScreen(windowRect, point);
  await nativeMouse.moveTo(absolute.x, absolute.y, {
    steps: options.steps ?? 30,
    delayMs: options.delayMs ?? 24,
  });
  return absolute;
}

async function clickSystemPoint(windowRect, point, options = {}) {
  const absolute = await moveSystemCursorToWindowPoint(windowRect, point, {
    steps: options.moveSteps ?? 30,
    delayMs: options.moveDelayMs ?? 24,
  });
  await sleep(options.hoverPauseMs ?? 320);
  await nativeMouse.clickAt(absolute.x, absolute.y, {
    count: options.count ?? 1,
    delayMs: options.clickDelayMs ?? 60,
    modifiers: options.modifiers ?? [],
  });
  await sleep(options.afterClickMs ?? 260);
}

async function dragSystemSelection(windowRect, fromPoint, toPoint, options = {}) {
  const from = addPoint(windowRect, fromPoint);
  const to = addPoint(windowRect, toPoint);
  await nativeMouse.moveTo(from.x, from.y, {
    steps: options.moveSteps ?? 28,
    delayMs: options.moveDelayMs ?? 22,
  });
  await sleep(options.hoverPauseMs ?? 260);
  await nativeMouse.dragTo(from, to, {
    steps: options.dragSteps ?? 34,
    delayMs: options.dragDelayMs ?? 22,
    modifiers: options.modifiers ?? [],
  });
  await sleep(options.afterDragMs ?? 420);
}

async function clickLocator(page, locator, options = {}) {
  const point = await centerOf(locator);
  await moveCursor(page, point.x, point.y, {
    steps: options.moveSteps ?? 32,
    delayMs: options.moveDelayMs ?? 22,
  });
  await sleep(options.hoverPauseMs ?? 320);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await sleep(options.downPauseMs ?? 90);
  await page.mouse.up();
  await sleep(options.afterClickMs ?? 260);
}

async function clickPagePoint(page, point, options = {}) {
  await moveCursor(page, point.x, point.y, {
    steps: options.moveSteps ?? 30,
    delayMs: options.moveDelayMs ?? 22,
  });
  await sleep(options.hoverPauseMs ?? 280);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await sleep(options.downPauseMs ?? 90);
  await page.mouse.up();
  await sleep(options.afterClickMs ?? 260);
}

async function typeInto(page, locator, text, options = {}) {
  await clickLocator(page, locator, {
    moveSteps: options.moveSteps ?? 28,
    hoverPauseMs: options.hoverPauseMs ?? 280,
    afterClickMs: 220,
  });
  if (options.clear) {
    await page.keyboard.press("Meta+A");
    await sleep(120);
    await page.keyboard.press("Backspace");
    await sleep(160);
  }
  await page.keyboard.type(text, { delay: options.delay ?? 40 });
  await sleep(options.afterTypeMs ?? 260);
}

async function smoothScroll(page, deltaY, options = {}) {
  const steps = options.steps ?? Math.max(8, Math.ceil(Math.abs(deltaY) / 95));
  const delayMs = options.delayMs ?? 125;
  for (let index = 0; index < steps; index += 1) {
    const progress = (index + 1) / steps;
    const previousProgress = index / steps;
    const easedProgress = progress * progress * (3 - 2 * progress);
    const easedPrevious = previousProgress * previousProgress * (3 - 2 * previousProgress);
    const stepValue = deltaY * (easedProgress - easedPrevious);
    await page.mouse.wheel(0, stepValue);
    await sleep(delayMs);
  }
}

async function uploadSellerPhotosWithFinder(page, windowRect) {
  await sleep(900);
  const openDialogRect = getOpenDialogRect(windowRect);
  await clickSystemPoint(openDialogRect, FINDER_PICKER_POINTS.downloadsSidebar, {
    moveSteps: 32,
    hoverPauseMs: 520,
    afterClickMs: 480,
  });
  await sleep(500);
  await dragSystemSelection(
    openDialogRect,
    FINDER_PICKER_POINTS.selectionDragStart,
    FINDER_PICKER_POINTS.selectionDragEnd,
    {
      moveSteps: 32,
      hoverPauseMs: 420,
      dragSteps: 36,
      dragDelayMs: 20,
      afterDragMs: 620,
    },
  );
  await clickSystemPoint(openDialogRect, FINDER_PICKER_POINTS.openButton, {
    moveSteps: 34,
    hoverPauseMs: 420,
    afterClickMs: 520,
  });
  await page.waitForFunction(
    () => document.querySelectorAll(".listing-create-photo-item").length >= 5,
    undefined,
    { timeout: 10000 },
  );
  await sleep(900);
}

async function waitForRecordLead() {
  await sleep(RECORDING_PADDING_MS);
}

function startScreenRecording(sceneName, rect, maxSeconds) {
  const outputFile = path.join(RAW_DIR, `${sceneName}.mov`);
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }
  const region = `${rect.x},${rect.y},${rect.width},${rect.height}`;
  const recorder = spawn(
    "screencapture",
    ["-x", "-v", "-R", region, outputFile],
    {
      cwd: ROOT_DIR,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  console.log(`[demo] recording ${sceneName}: ${outputFile} (${rect.x},${rect.y},${rect.width},${rect.height}) max=${maxSeconds}s`);
  recorder.stderr.on("data", () => {});
  recorder.stdout.on("data", () => {});
  return {
    process: recorder,
    outputFile,
    finished: new Promise((resolve, reject) => {
      recorder.once("error", reject);
      recorder.once("exit", (code) => {
        if (code === 0 && fs.existsSync(outputFile)) {
          resolve(outputFile);
          return;
        }
        reject(new Error(`screencapture failed for ${sceneName} with code ${code}`));
      });
    }),
  };
}

async function fetchJsonAsRole(role, pathName, options = {}) {
  const auth = await login(role);
  const response = await fetch(`${API_BASE}${pathName}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth.sessionToken}`,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `API request failed for ${role} ${pathName}: ${response.status}`,
    );
  }
  return response.json();
}

async function fetchLatestSellerListingByTitle(title) {
  const listings = await fetchJsonAsRole("seller", "/partner/listings?type=products");
  if (!Array.isArray(listings)) {
    throw new Error("Unexpected seller listings payload");
  }
  const normalizedExpected = String(title ?? "").trim().toLowerCase();
  const match = listings.find((listing) => {
    const currentTitle = String(listing.title ?? "").trim().toLowerCase();
    return (
      currentTitle === normalizedExpected ||
      currentTitle.endsWith(normalizedExpected) ||
      currentTitle.includes("видеокарта palit geforce rtx 5060 dual")
    );
  });
  if (!match?.id) {
    throw new Error(`Seller listing "${title}" not found after creation`);
  }
  return match;
}

async function fetchSellerListingIds() {
  const listings = await fetchJsonAsRole("seller", "/partner/listings?type=products");
  if (!Array.isArray(listings)) {
    throw new Error("Unexpected seller listings payload");
  }
  return listings
    .map((listing) => String(listing.id ?? "").trim())
    .filter(Boolean);
}

async function fetchCreatedSellerListing(title, existingIds = []) {
  const listings = await fetchJsonAsRole("seller", "/partner/listings?type=products");
  if (!Array.isArray(listings)) {
    throw new Error("Unexpected seller listings payload");
  }

  const knownIds = new Set(existingIds.map((id) => String(id).trim()).filter(Boolean));
  const normalizedExpected = String(title ?? "").trim().toLowerCase();
  const newListing = listings.find((listing) => {
    const id = String(listing.id ?? "").trim();
    const currentTitle = String(listing.title ?? "").trim().toLowerCase();
    if (!id || knownIds.has(id)) return false;
    return (
      currentTitle === normalizedExpected ||
      currentTitle.endsWith(normalizedExpected) ||
      currentTitle.includes("видеокарта palit geforce rtx 5060 dual")
    );
  });

  if (newListing?.id) {
    return newListing;
  }

  return fetchLatestSellerListingByTitle(title);
}

async function moveListingToPending(publicId) {
  return fetchJsonAsRole(
    "admin",
    `/admin/listings/${encodeURIComponent(publicId)}/moderation`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "pending",
        reasonCode: "QUEUED_FOR_BACKGROUND_MODERATION",
        reasonNote: "Подготовлено к ручной модерации для демонстрации",
      }),
    },
  );
}

async function waitForListingInAdmin(publicId, expectedStatus = "pending") {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const listings = await fetchJsonAsRole("admin", "/admin/listings");
    const match = Array.isArray(listings)
      ? listings.find(
          (listing) =>
            String(listing.id ?? "").trim() === publicId.trim() &&
            String(listing.status ?? "").trim() === expectedStatus,
        )
      : null;
    if (match) {
      return match;
    }
    await sleep(500);
  }
  throw new Error(
    `Listing "${publicId}" did not appear in admin moderation with status "${expectedStatus}"`,
  );
}

async function prepareBuyer(page) {
  nativeMouse.reset();
  await setSession(page, "buyer");
  await page.goto(APP_BASE, { waitUntil: "domcontentloaded" });
  await clearCartStorage(page);
  await page.goto(APP_BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="catalog-card"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
}

async function prepareSeller(page) {
  nativeMouse.reset();
  await setSession(page, "seller");
  await page.goto(`${APP_BASE}/profile/partner-listings`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Мои объявления");
  await page.getByRole("button", { name: "Создать" }).first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(350);
}

async function prepareAdmin(page) {
  nativeMouse.reset();
  await setSession(page, "admin");
  await page.goto(`${APP_BASE}/admin/listings`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Модерация объявлений");
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(350);
}

async function runSellerScene(page, listingTitle, description) {
  const windowRect = await getWindowRect(page);
  const createButton = page.getByRole("button", { name: "Создать" }).first();
  await clickLocator(page, createButton, {
    moveSteps: 34,
    hoverPauseMs: 420,
  });

  const categoryButton = page.getByRole("button", { name: "Комплектующие для ПК" }).first();
  await clickLocator(page, categoryButton, {
    moveSteps: 32,
    hoverPauseMs: 340,
  });

  const titleInput = page.locator('input[placeholder*="ASUS RTX"]').first();
  await typeInto(page, titleInput, "Palit GeForce RTX 5060", {
    delay: 32,
    afterTypeMs: 420,
  });

  const suggestionButton = page
    .getByRole("button", {
      name: /Видеокарты .* Основные комплектующие для ПК .* Комплектующие для ПК/i,
    })
    .first();
  await clickLocator(page, suggestionButton, { moveSteps: 32, hoverPauseMs: 420, afterClickMs: 320 });

  const detailsTitle = page.locator('input[placeholder="Видеокарта"]').first();
  await typeInto(page, detailsTitle, listingTitle, { delay: 24, afterTypeMs: 180 });

  const usedButton = page.getByRole("button", { name: "Б/у" }).first();
  await clickLocator(page, usedButton, { moveSteps: 28, hoverPauseMs: 320 });

  const photoAdd = page.locator(".listing-create-photo-add").first();
  await clickLocator(page, photoAdd, { moveSteps: 28, hoverPauseMs: 320, afterClickMs: 180 });
  await uploadSellerPhotosWithFinder(page, windowRect);

  const brandInput = page.locator('input[placeholder="Например, ASUS"]').first();
  await typeInto(page, brandInput, "Palit", { delay: 24, afterTypeMs: 340 });
  const brandOption = page.getByRole("button", { name: "Palit" }).last();
  await clickLocator(page, brandOption, { moveSteps: 26, hoverPauseMs: 320 });

  const modelInput = page
    .locator('input[placeholder*="Начните вводить цифры из названия модели"]')
    .first();
  await typeInto(page, modelInput, "GeForce RTX 5060 Dual", {
    delay: 24,
    afterTypeMs: 340,
  });
  const modelOption = page.getByRole("button", { name: "GeForce RTX 5060 Dual" }).last();
  await clickLocator(page, modelOption, { moveSteps: 26, hoverPauseMs: 320 });
  await sleep(420);

  // Показываем, что после выбора бренда и модели подтянулись характеристики.
  await smoothScroll(page, 260, { steps: 10, delayMs: 120 });
  await sleep(520);
  await smoothScroll(page, 220, { steps: 9, delayMs: 120 });
  await sleep(420);

  const descriptionField = page.locator("textarea").first();
  await typeInto(page, descriptionField, description, {
    delay: 18,
    afterTypeMs: 200,
  });

  const priceField = page.locator('input[type="number"]').first();
  await typeInto(page, priceField, "29990", { delay: 26, afterTypeMs: 160 });

  const submitButton = page.getByRole("button", { name: /Разместить объявление/i }).first();
  await clickLocator(page, submitButton, {
    moveSteps: 34,
    hoverPauseMs: 460,
    afterClickMs: 320,
  });

  await page.waitForURL(/\/profile\/partner-listings$/);
  await page.waitForSelector(`text=${listingTitle}`);
  await sleep(850);

  const listingCard = page
    .locator("article.dashboard-card")
    .filter({ hasText: "Palit GeForce RTX 5060 Dual" })
    .first();

  const editButton = listingCard.locator("button").nth(4);
  await clickLocator(page, editButton, {
    moveSteps: 28,
    hoverPauseMs: 340,
    afterClickMs: 320,
  });
  await page.waitForSelector("text=Редактирование объявления", { timeout: 12000 });
  await sleep(420);

  const editTitleField = page.locator('.listing-create-details input[placeholder="Видеокарта"]').first();
  await typeInto(page, editTitleField, listingTitle, {
    clear: true,
    moveSteps: 28,
    hoverPauseMs: 320,
    delay: 28,
    afterTypeMs: 280,
  });

  const saveButton = page.getByRole("button", { name: /Сохранить изменения/i }).first();
  await clickLocator(page, saveButton, {
    moveSteps: 32,
    hoverPauseMs: 440,
    afterClickMs: 340,
  });
  await page.waitForSelector("text=Изменения сохранены", { timeout: 12000 });
  await sleep(1400);
}

async function runAdminScene(page, listingPublicId, listingTitle) {
  const searchInput = page.locator('input[placeholder*="Поиск по объявлению"]').first();
  await typeInto(page, searchInput, listingPublicId, {
    moveSteps: 24,
    hoverPauseMs: 240,
    delay: 34,
    afterTypeMs: 380,
  });
  await page.waitForSelector(`text=${listingPublicId}`);
  await sleep(320);

  const listingCard = page
    .locator(".dashboard-card", { hasText: listingPublicId })
    .filter({ hasText: listingTitle })
    .first();
  const riskTrigger = listingCard.locator(".score-explanation__trigger").first();
  await clickLocator(page, riskTrigger, {
    moveSteps: 22,
    hoverPauseMs: 280,
    afterClickMs: 180,
  });
  await sleep(650);

  const signalsRow = listingCard.locator(".flex.flex-wrap.gap-1\\.5").first();
  await signalsRow.scrollIntoViewIfNeeded();
  const signalsPoint = await centerOf(signalsRow);
  await moveCursor(page, signalsPoint.x, signalsPoint.y, { steps: 20, delayMs: 18 });
  await sleep(520);

  const sellerLine = listingCard.locator("text=Продавец:").first();
  await sellerLine.scrollIntoViewIfNeeded();
  const sellerPoint = await centerOf(sellerLine);
  await moveCursor(page, sellerPoint.x, sellerPoint.y, { steps: 18, delayMs: 18 });
  await sleep(460);

  const openListingLink = listingCard.getByRole("link", { name: /Перейти к объявлению/i }).first();
  await clickLocator(page, openListingLink, {
    moveSteps: 22,
    hoverPauseMs: 240,
    afterClickMs: 220,
  });
  await page.waitForURL(/\/products\//);
  await sleep(620);

  await smoothScroll(page, 620, { steps: 10, delayMs: 110 });
  await sleep(520);
  await smoothScroll(page, -620, { steps: 10, delayMs: 110 });
  await sleep(620);

  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(`text=${listingPublicId}`);
  await sleep(520);

  const refreshedCard = page
    .locator(".dashboard-card", { hasText: listingPublicId })
    .filter({ hasText: listingTitle })
    .first();
  const approveButton = refreshedCard.getByRole("button", { name: /Одобрить объявление/i }).first();
  await clickLocator(page, approveButton, {
    moveSteps: 24,
    hoverPauseMs: 260,
  });
  await page.waitForSelector("text=Объявление одобрено.");
  await page.waitForSelector("text=Опубликовано");
  await sleep(1100);
}

async function getFirstVisibleMapMarkerPoint(page) {
  const point = await page.evaluate(() => {
    const markers = Array.from(document.querySelectorAll(".ymaps-2-1-79-svg-icon"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        };
      })
      .filter(
        (marker) =>
          marker.width > 0 &&
          marker.height > 0 &&
          marker.x >= 0 &&
          marker.y >= 0 &&
          marker.right <= window.innerWidth &&
          marker.bottom <= window.innerHeight,
      );

    if (markers.length === 0) {
      return null;
    }

    const first = markers[0];
    return {
      x: first.x + first.width / 2,
      y: first.y + first.height / 2,
    };
  });

  if (!point) {
    throw new Error("No visible map marker found on checkout page");
  }

  return point;
}

async function runBuyerScene(page, listingPublicId, listingTitle) {
  await page.goto(APP_BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="catalog-card"]', { timeout: 12000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(420);

  const catalogSearchInput = page.getByPlaceholder("Поиск товаров...").first();
  await typeInto(page, catalogSearchInput, listingTitle, {
    clear: true,
    moveSteps: 26,
    hoverPauseMs: 260,
    delay: 24,
    afterTypeMs: 260,
  });
  await page.keyboard.press("Enter");
  await sleep(920);

  const targetCard = page
    .locator('[data-testid="catalog-card"]')
    .filter({ hasText: /Palit GeForce RTX 5060 Dual/i })
    .first();
  await targetCard.waitFor({ timeout: 12000 });
  await clickLocator(page, targetCard, {
    moveSteps: 30,
    hoverPauseMs: 360,
    afterClickMs: 320,
  });
  await page.waitForURL(new RegExp(`/products/${listingPublicId}|/products/`), {
    timeout: 12000,
  });
  await sleep(820);

  await smoothScroll(page, 420, { steps: 9, delayMs: 115 });
  const specsHeading = page.getByRole("heading", { name: "Характеристики" }).first();
  await specsHeading.waitFor({ timeout: 12000 });
  const specsPoint = await centerOf(specsHeading);
  await moveCursor(page, specsPoint.x, specsPoint.y, { steps: 22, delayMs: 18 });
  await sleep(540);

  await smoothScroll(page, 300, { steps: 7, delayMs: 115 });
  const descriptionHeading = page.getByRole("heading", { name: "Описание" }).first();
  await descriptionHeading.waitFor({ timeout: 12000 });
  const descriptionPoint = await centerOf(descriptionHeading);
  await moveCursor(page, descriptionPoint.x, descriptionPoint.y, { steps: 20, delayMs: 18 });
  await sleep(520);

  const addToCartButton = page.getByRole("button", { name: "Добавить в корзину" }).first();
  await clickLocator(page, addToCartButton, {
    moveSteps: 28,
    hoverPauseMs: 300,
    afterClickMs: 280,
  });
  await sleep(720);

  const cartButton = page
    .locator("button")
    .filter({ has: page.locator("svg.lucide-shopping-cart") })
    .first();
  await clickLocator(page, cartButton, {
    moveSteps: 26,
    hoverPauseMs: 280,
    afterClickMs: 280,
  });
  await page.waitForURL(/\/cart/, { timeout: 12000 });
  await page.waitForSelector("text=Корзина", { timeout: 8000 });
  await sleep(720);

  const checkoutButton = page.getByRole("button", { name: /Оформить заказ/i }).first();
  await clickLocator(page, checkoutButton, {
    moveSteps: 26,
    hoverPauseMs: 280,
    afterClickMs: 280,
  });
  await page.waitForURL(/\/checkout/, { timeout: 12000 });
  await sleep(3600);

  const markerPoint = await getFirstVisibleMapMarkerPoint(page);
  await clickPagePoint(page, markerPoint, {
    moveSteps: 28,
    hoverPauseMs: 360,
    afterClickMs: 360,
  });
  await sleep(1320);

  const popupPromise = page.context().waitForEvent("page");
  const payButton = page.getByRole("button", { name: /Оплатить/ }).first();
  await clickLocator(page, payButton, {
    moveSteps: 28,
    hoverPauseMs: 300,
    afterClickMs: 260,
  });
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  await popup.bringToFront();
  await sleep(1900);

  await typeInto(popup, popup.locator('input[name="card-number"]').first(), "5555555555554444", {
    delay: 36,
    afterTypeMs: 220,
  });
  await typeInto(popup, popup.locator('input[name="expiry-month"]').first(), "11", {
    delay: 42,
    afterTypeMs: 160,
  });
  await typeInto(popup, popup.locator('input[name="expiry-year"]').first(), "11", {
    delay: 42,
    afterTypeMs: 160,
  });
  await typeInto(popup, popup.locator('input[name="security-code"]').first(), "111", {
    delay: 42,
    afterTypeMs: 260,
  });

  const submitPaymentButton = popup.getByRole("button", { name: /Заплатить/i }).first();
  await clickLocator(popup, submitPaymentButton, {
    moveSteps: 28,
    hoverPauseMs: 320,
    afterClickMs: 280,
  });
  await popup.waitForURL(/\/success/, { timeout: 40000 });
  await sleep(1800);

  await page.waitForURL(/\/order-complete/, { timeout: 60000 });
  await page.bringToFront();
  await sleep(1100);

  const historyButton = page.getByRole("button", { name: /История покупок/i }).first();
  await clickLocator(page, historyButton, {
    moveSteps: 28,
    hoverPauseMs: 320,
    afterClickMs: 320,
  });
  await page.waitForURL(/\/profile\/orders/, { timeout: 12000 });
  await page.waitForSelector("text=История заказов", { timeout: 12000 });
  await sleep(1600);
}

async function recordScene(page, sceneName, prepare, action, maxSeconds) {
  console.log(`[demo] prepare ${sceneName}`);
  await prepare(page);
  const rect = await getWindowRect(page);
  await nativeMouse.setAssociated(false);
  const recording = startScreenRecording(sceneName, rect, maxSeconds);
  const recordingStartedAt = Date.now();
  let actionStartedAt = recordingStartedAt;
  let actionEndedAt = recordingStartedAt;
  let recordingEndedAt = recordingStartedAt;
  try {
    await waitForRecordLead();
    console.log(`[demo] action ${sceneName} started`);
    actionStartedAt = Date.now();
    await action();
    await sleep(END_PAUSE_MS);
    actionEndedAt = Date.now();
  } finally {
    if (actionEndedAt === recordingStartedAt) {
      actionEndedAt = Date.now();
    }
    await nativeMouse.setAssociated(true).catch(() => {});
    recording.process.kill("SIGINT");
    await recording.finished;
    recordingEndedAt = Date.now();
  }

  const actionDuration = (actionEndedAt - actionStartedAt) / 1000;
  const rawDuration = (recordingEndedAt - recordingStartedAt) / 1000;
  const trimStart = Number((RECORDING_PADDING_MS / 1000 - 0.15).toFixed(3));
  const trimEnd = Number(Math.max(0.05, rawDuration - (trimStart + actionDuration + END_PAUSE_MS / 1000)).toFixed(3));

  const result = {
    name: sceneName,
    file: recording.outputFile,
    maxSeconds,
    rawDuration: Number(rawDuration.toFixed(3)),
    actionDuration: Number(actionDuration.toFixed(3)),
    trimStart,
    trimEnd,
  };
  console.log(`[demo] action ${sceneName} done in ${result.actionDuration}s; trims ${trimStart}s/${trimEnd}s`);
  return result;
}

async function composeVideo() {
  const swiftScript = path.join(ROOT_DIR, "scripts/demo/compose-demo.swift");
  await new Promise((resolve, reject) => {
    const child = spawn("swift", [swiftScript, META_PATH, FINAL_PATH], {
      cwd: ROOT_DIR,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`swift compose failed with code ${code}`));
    });
  });
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(RAW_DIR);
  console.log("[demo] output dir:", OUTPUT_DIR);

  const listingTitle = "Видеокарта Palit GeForce RTX 5060 Dual [NE75060019P1-GB2063D]";
  const listingDescription = [
    "Видеокарта Palit GeForce RTX 5060 Dual, состояние хорошее.",
    "Работает стабильно, без ремонта и перегрева.",
    "Код / артикул NE75060019P1-GB2063D, интерфейс PCIe 5.0.",
    "Память 8 ГБ GDDR7, частота GPU 2280 МГц, видеовыходы 3 x DisplayPort и HDMI.",
    "В комплекте сама видеокарта и коробка.",
  ].join(" ");

  const browser = await chromium.launch({
    headless: false,
    args: [
      `--window-size=${WINDOW_BOUNDS.width},${WINDOW_BOUNDS.height}`,
      "--disable-infobars",
      "--force-device-scale-factor=1",
    ],
  });

  try {
    await nativeMouse.start();
    const page = await browser.newPage({
      viewport: VIEWPORT,
    });
    await page.bringToFront();
    console.log("[demo] browser ready");

    const scenes = [];
    const sellerListingIdsBefore = await fetchSellerListingIds();

    scenes.push(
      await recordScene(
        page,
        "seller",
        prepareSeller,
        () => runSellerScene(page, listingTitle, listingDescription),
        72,
      ),
    );

    const latestSellerListing = await fetchCreatedSellerListing(
      listingTitle,
      sellerListingIdsBefore,
    );
    await moveListingToPending(latestSellerListing.id);
    await waitForListingInAdmin(latestSellerListing.id, "pending");

    scenes.push(
      await recordScene(
        page,
        "admin",
        prepareAdmin,
        () => runAdminScene(page, latestSellerListing.id, listingTitle),
        70,
      ),
    );

    scenes.push(
      await recordScene(
        page,
        "buyer",
        prepareBuyer,
        () => runBuyerScene(page, latestSellerListing.id, listingTitle),
        90,
      ),
    );

    const manifest = {
      createdAt: new Date().toISOString(),
      appBase: APP_BASE,
      finalOutput: FINAL_PATH,
      listingPublicId: latestSellerListing.id,
      listingTitle,
      scenes,
      speed: 1.9,
    };

    fs.writeFileSync(META_PATH, JSON.stringify(manifest, null, 2));
    console.log("[demo] composing final video");
    await browser.close();
    await nativeMouse.stop();
    await composeVideo();

    console.log(`Demo video created: ${FINAL_PATH}`);
    console.log(`Manifest created: ${META_PATH}`);
  } catch (error) {
    await browser.close();
    await nativeMouse.stop().catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
