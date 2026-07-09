#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import readline from "node:readline";
import { chromium } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const OUTPUT_DIR = path.resolve(ROOT_DIR, "artifacts", "demo-video");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const META_PATH = path.join(OUTPUT_DIR, "manifest.json");
const FINAL_PATH = path.join(OUTPUT_DIR, "demo-final.mov");
const MANIFEST_1X_PATH = path.join(OUTPUT_DIR, "manifest-1x.json");
const MANIFEST_15X_PATH = path.join(OUTPUT_DIR, "manifest-1.5x.json");
const MANIFEST_2X_PATH = path.join(OUTPUT_DIR, "manifest-2x.json");
const FINAL_1X_PATH = path.join(OUTPUT_DIR, "demo-final-1x.mov");
const FINAL_15X_PATH = path.join(OUTPUT_DIR, "demo-final-1.5x.mov");
const FINAL_2X_PATH = path.join(OUTPUT_DIR, "demo-final-2x.mov");
const NATIVE_MOUSE_SCRIPT = path.join(ROOT_DIR, "scripts/demo/native-mouse.swift");
const API_BASE = "http://127.0.0.1:3001/api";
const APP_BASE = "http://127.0.0.1:3000";
const SESSION_STORAGE_KEY = "ecomm_session_user";
const SESSION_TOKEN_STORAGE_KEY = "ecomm_session_token";
const WINDOW_BOUNDS = { width: 1500, height: 1220 };
const VIEWPORT = { width: 1440, height: 1100 };
const RECORDING_PADDING_MS = 800;
const END_PAUSE_MS = 900;
const CURSOR_SCREEN_OFFSET = { x: 0, y: 80 };

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

const OPEN_PANEL_PROCESS_NAME = "Google Chrome for Testing";
const authSessionCache = new Map();
const SPEED_VARIANTS = [
  { speed: 1, manifestPath: META_PATH, outputPath: FINAL_PATH },
  { speed: 1, manifestPath: MANIFEST_1X_PATH, outputPath: FINAL_1X_PATH },
  { speed: 1.5, manifestPath: MANIFEST_15X_PATH, outputPath: FINAL_15X_PATH },
  { speed: 2, manifestPath: MANIFEST_2X_PATH, outputPath: FINAL_2X_PATH },
];

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

function escapeAppleScriptString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function focusBrowserAppWindow() {
  try {
    execFileSync("osascript", [
      "-e",
      `tell application "System Events" to set frontmost of process "${escapeAppleScriptString(OPEN_PANEL_PROCESS_NAME)}" to true`,
    ], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {}
}

async function login(role) {
  const cached = authSessionCache.get(role);
  if (cached?.sessionToken && cached?.user) {
    return cached;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentials[role]),
    });
    if (response.ok) {
      const payload = await response.json();
      if (!payload?.sessionToken || !payload?.user) {
        throw new Error(`Malformed login payload for ${role}`);
      }
      authSessionCache.set(role, payload);
      return payload;
    }
    if (response.status === 429 && attempt < 4) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    throw new Error(`Unable to login as ${role}: ${response.status}`);
  }
  throw new Error(`Unable to login as ${role}: retry limit exceeded`);
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
    x: Math.round(metrics.screenX + horizontalInset + point.x + CURSOR_SCREEN_OFFSET.x),
    y: Math.round(metrics.screenY + topInset + point.y + CURSOR_SCREEN_OFFSET.y),
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

async function getCaptureRect(page) {
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
    x: Math.round(metrics.screenX + horizontalInset),
    y: Math.round(metrics.screenY + topInset),
    width: Math.round(metrics.innerWidth),
    height: Math.round(metrics.innerHeight),
  };
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
  if (!page.isClosed()) {
    await page.mouse.move(x, y).catch(() => {});
  }
  return absolute;
}

async function clickLocator(page, locator, options = {}) {
  const point = await centerOf(locator);
  await moveCursor(page, point.x, point.y, {
    steps: options.moveSteps ?? 32,
    delayMs: options.moveDelayMs ?? 22,
  });
  await sleep(options.hoverPauseMs ?? 320);
  await locator.click();
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

async function visibleTypeInto(page, locator, text, options = {}) {
  await typeInto(page, locator, text, options);
}

async function clickComboboxOption(page, inputLocator, optionText, options = {}) {
  const option = inputLocator
    .locator("xpath=ancestor::label[1]")
    .locator(".listing-create-suggest__menu button")
    .filter({ hasText: optionText })
    .first();
  await clickLocator(page, option, options);
}

async function revealLocatorInViewport(page, locator, options = {}) {
  const topPadding = options.topPadding ?? 120;
  const bottomPadding = options.bottomPadding ?? 180;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rect = await locator.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        height: bounds.height,
      };
    });

    const viewportHeight = await page.evaluate(() => window.innerHeight);
    let deltaY = 0;

    if (rect.bottom > viewportHeight - bottomPadding) {
      deltaY = rect.bottom - (viewportHeight - bottomPadding);
    } else if (rect.top < topPadding) {
      deltaY = rect.top - topPadding;
    }

    if (Math.abs(deltaY) < 6) {
      return;
    }

    await smoothScroll(page, deltaY, {
      steps: Math.max(6, Math.ceil(Math.abs(deltaY) / 70)),
      delayMs: options.delayMs ?? 90,
    });
    await sleep(options.afterScrollMs ?? 260);
  }
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
  void windowRect;
  const fileInput = page.locator('.listing-create-photo-add input[type="file"]').first();
  await fileInput.setInputFiles(SELLER_IMAGES);
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
  focusBrowserAppWindow();
  await page.bringToFront();
  await page.waitForSelector('[data-testid="catalog-card"]');
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
}

async function prepareSeller(page) {
  nativeMouse.reset();
  await setSession(page, "seller");
  await page.goto(`${APP_BASE}/profile/partner-listings`, { waitUntil: "domcontentloaded" });
  focusBrowserAppWindow();
  await page.bringToFront();
  await page.waitForSelector("text=Мои объявления");
  await page.getByRole("button", { name: "Создать" }).first().waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(350);
}

async function prepareAdmin(page) {
  nativeMouse.reset();
  await setSession(page, "admin");
  await page.goto(`${APP_BASE}/admin/listings`, { waitUntil: "domcontentloaded" });
  focusBrowserAppWindow();
  await page.bringToFront();
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
    delay: 24,
    afterTypeMs: 260,
  });

  const suggestionButton = page
    .getByRole("button", {
      name: /Видеокарты .* Основные комплектующие для ПК .* Комплектующие для ПК/i,
    })
    .first();
  await clickLocator(page, suggestionButton, { moveSteps: 32, hoverPauseMs: 420, afterClickMs: 320 });

  const detailsTitle = page.locator('input[placeholder="Видеокарта"]').first();
  await typeInto(page, detailsTitle, listingTitle, { delay: 18, afterTypeMs: 140 });

  const usedButton = page.getByRole("button", { name: "Б/у" }).first();
  await clickLocator(page, usedButton, { moveSteps: 28, hoverPauseMs: 320 });

  const photoAdd = page.locator(".listing-create-photo-add").first();
  const photoAddPoint = await centerOf(photoAdd);
  await moveCursor(page, photoAddPoint.x, photoAddPoint.y, {
    steps: 28,
    delayMs: 22,
  });
  await sleep(420);
  await uploadSellerPhotosWithFinder(page, windowRect);

  const brandInput = page.locator('input[placeholder="Например, ASUS"]').first();
  await typeInto(page, brandInput, "Palit", { delay: 18, afterTypeMs: 200 });
  await clickComboboxOption(page, brandInput, "Palit", {
    moveSteps: 26,
    hoverPauseMs: 220,
    afterClickMs: 220,
  });

  const modelInput = page
    .locator('input[placeholder*="Начните вводить цифры из названия модели"]')
    .first();
  await typeInto(page, modelInput, "GeForce RTX 5060 Dual", {
    delay: 18,
    afterTypeMs: 220,
  });
  await clickComboboxOption(page, modelInput, "GeForce RTX 5060 Dual", {
    moveSteps: 26,
    hoverPauseMs: 220,
    afterClickMs: 220,
  });
  await sleep(420);

  // Показываем, что после выбора бренда и модели подтянулись характеристики.
  await smoothScroll(page, 260, { steps: 10, delayMs: 120 });
  await sleep(520);
  await smoothScroll(page, 220, { steps: 9, delayMs: 120 });
  await sleep(420);

  const descriptionField = page.locator("textarea").first();
  await typeInto(page, descriptionField, description, {
    delay: 12,
    afterTypeMs: 140,
  });
  await smoothScroll(page, 260, { steps: 8, delayMs: 90 });
  await sleep(220);

  const priceField = page.locator('input[type="number"]').first();
  await typeInto(page, priceField, "29990", { delay: 18, afterTypeMs: 120 });
  await sleep(240);

  const sellerWarrantyCheckbox = page.getByLabel("Даю гарантию продавца на этот товар").first();
  await clickLocator(page, sellerWarrantyCheckbox, {
    moveSteps: 26,
    hoverPauseMs: 320,
    afterClickMs: 260,
  });
  await sleep(520);

  const sellerWarrantyDaysField = page.getByPlaceholder("Например, 30").first();
  await visibleTypeInto(page, sellerWarrantyDaysField, "30", {
    moveSteps: 28,
    hoverPauseMs: 320,
    afterClickMs: 180,
    delay: 18,
    afterTypeMs: 140,
  });
  await sleep(280);

  const multipleStockCheckbox = page.getByLabel("Несколько штук в наличии").first();
  await clickLocator(page, multipleStockCheckbox, {
    moveSteps: 26,
    hoverPauseMs: 320,
    afterClickMs: 260,
  });
  await sleep(520);

  const availableQuantityField = page.getByPlaceholder("Например, 5").first();
  await visibleTypeInto(page, availableQuantityField, "5", {
    moveSteps: 28,
    hoverPauseMs: 320,
    afterClickMs: 180,
    delay: 18,
    afterTypeMs: 140,
  });
  await sleep(140);

  const submitButton = page.getByRole("button", { name: /Разместить объявление/i }).first();
  await revealLocatorInViewport(page, submitButton, {
    topPadding: 140,
    bottomPadding: 220,
    delayMs: 60,
    afterScrollMs: 120,
  });
  await sleep(140);
  await clickLocator(page, submitButton, {
    moveSteps: 26,
    hoverPauseMs: 220,
    afterClickMs: 240,
  });

  try {
    await page.waitForURL(/\/profile\/partner-listings$/, { timeout: 30000 });
  } catch (error) {
    const inlineIssues = await page.locator(".text-red-800").allInnerTexts().catch(() => []);
    const issue = inlineIssues.map((item) => item.trim()).filter(Boolean).join(" | ");
    throw new Error(
      `Seller publish did not navigate from ${page.url()}. ${issue ? `Issue: ${issue}` : "No inline issue text found."}`,
      { cause: error },
    );
  }
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
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const point = await page.evaluate(() => {
      const selector = [
        ".ymaps-2-1-79-svg-icon",
        ".ymaps-2-1-79-image",
        ".ymaps-2-1-79-image-with-content",
        '[class*="ymaps-2-1-79"][class*="icon"]',
        '[class*="ymaps-2-1-79"][class*="image"]',
        '[class*="ymaps-2-1-79"][class*="placemark"]',
      ].join(", ");

      const markers = Array.from(document.querySelectorAll(selector))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return {
            element,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
            visibility: style.visibility,
            display: style.display,
            opacity: Number(style.opacity || "1"),
            className: element.className?.toString?.() ?? "",
            insideControls: Boolean(
              element.closest('[class*="controls"], [class*="control"], [class*="zoom"], [class*="toolbar"]'),
            ),
          };
        })
        .filter(
          (marker) =>
            marker.width >= 8 &&
            marker.height >= 8 &&
            marker.width <= 80 &&
            marker.height <= 80 &&
            marker.x >= 0 &&
            marker.y >= 0 &&
            marker.right <= window.innerWidth &&
            marker.bottom <= window.innerHeight &&
            marker.visibility !== "hidden" &&
            marker.display !== "none" &&
            marker.opacity > 0 &&
            !marker.insideControls,
        )
        .sort((left, right) => left.y - right.y || left.x - right.x);

      if (markers.length === 0) {
        return null;
      }

      const first = markers[0];
      return {
        x: first.x + first.width / 2,
        y: first.y + first.height / 2,
      };
    });

    if (point) {
      return point;
    }

    await sleep(500);
  }

  throw new Error("No visible map marker found on checkout page");
}

async function markVisiblePickupMarker(page) {
  return page.evaluate(() => {
    document
      .querySelectorAll('[data-demo-pickup-marker="true"]')
      .forEach((element) => element.removeAttribute("data-demo-pickup-marker"));

    const selector = [
      ".ymaps-2-1-79-image",
      ".ymaps-2-1-79-image-with-content",
      ".ymaps-2-1-79-svg-icon",
      '[class*="ymaps-2-1-79"][class*="placemark"]',
      '[class*="ymaps-2-1-79"][class*="image"]',
    ].join(", ");

    const rawMarkers = Array.from(document.querySelectorAll(selector))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          element,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom,
          visibility: style.visibility,
          display: style.display,
          opacity: Number(style.opacity || "1"),
          text: element.textContent?.trim() ?? "",
          className: element.className?.toString?.() ?? "",
          insideControls: Boolean(
            element.closest('[class*="controls"], [class*="control"], [class*="zoom"], [class*="toolbar"]'),
          ),
        };
      })
      .filter(
        (marker) =>
          marker.width >= 8 &&
          marker.height >= 8 &&
          marker.width <= 48 &&
          marker.height <= 56 &&
          marker.x >= 0 &&
          marker.y >= 0 &&
          marker.right <= window.innerWidth &&
          marker.bottom <= window.innerHeight &&
          marker.visibility !== "hidden" &&
          marker.display !== "none" &&
          marker.opacity > 0 &&
          marker.text.length === 0 &&
          !marker.insideControls,
      );

    const preferredMarkers = rawMarkers.filter(
      (marker) =>
        marker.width <= 36 &&
        marker.height <= 48 &&
        !marker.className.includes("circleIcon___1E98FF_40x40"),
    );

    const markers = (preferredMarkers.length > 0 ? preferredMarkers : rawMarkers)
      .sort((left, right) => left.y - right.y || left.x - right.x);

    const first = markers[0];
    if (!first) {
      return false;
    }

    first.element.setAttribute("data-demo-pickup-marker", "true");
    return true;
  });
}

async function ensurePickupPointSelected(page) {
  const selectedPointSummary = page
    .locator("div.rounded-xl.border.border-gray-200.bg-gray-50")
    .filter({ hasText: /ПВЗ|Выбранная точка/i })
    .first();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const markerWasTagged = await markVisiblePickupMarker(page).catch(() => false);
    if (markerWasTagged) {
      const markerLocator = page.locator('[data-demo-pickup-marker="true"]').first();
      const box = await markerLocator.boundingBox();
      if (box) {
        await clickPagePoint(
          page,
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          {
            moveSteps: 24,
            hoverPauseMs: 220,
            afterClickMs: 200,
          },
        );
      } else {
        const markerPoint = await getFirstVisibleMapMarkerPoint(page).catch(() => null);
        if (markerPoint) {
          await clickPagePoint(page, markerPoint, {
            moveSteps: 24,
            hoverPauseMs: 220,
            afterClickMs: 200,
          });
        }
      }
    } else {
      const markerPoint = await getFirstVisibleMapMarkerPoint(page).catch(() => null);
      if (markerPoint) {
        await clickPagePoint(page, markerPoint, {
          moveSteps: 24,
          hoverPauseMs: 220,
          afterClickMs: 200,
        });
      }
    }

    try {
      await selectedPointSummary.filter({ hasText: /Выбранная точка/i }).waitFor({
        timeout: 1400,
      });
      await sleep(260);
      return;
    } catch {
      await sleep(180);
    }
  }

  await page
    .waitForFunction(
      () =>
        Array.isArray(window.__ecommDemoCheckout?.visiblePointKeys) &&
        window.__ecommDemoCheckout.visiblePointKeys.length > 0,
      undefined,
      { timeout: 5000 },
    )
    .catch(() => {});

  const selectedViaDemoHook = await page.evaluate(() => {
    const demoApi = window.__ecommDemoCheckout;
    if (!demoApi || typeof demoApi.selectVisiblePoint !== "function") {
      return false;
    }
    return demoApi.selectVisiblePoint(0);
  }).catch(() => false);

  if (selectedViaDemoHook) {
    await selectedPointSummary.filter({ hasText: /Выбранная точка/i }).waitFor({
      timeout: 1500,
    });
    await sleep(260);
    return;
  }

  const summaryText = (await selectedPointSummary.textContent().catch(() => ""))?.trim() ?? "";
  throw new Error(
    `Pickup point was not selected after clicking map markers. Summary: ${summaryText || "not found"}`,
  );
}

async function showCheckoutPaymentMethod(page) {
  const paymentHeading = page.getByRole("heading", { name: "Способ оплаты" }).first();
  const cardButton = page.getByRole("button", { name: /Банковская карта/i }).first();

  await revealLocatorInViewport(page, paymentHeading, {
    topPadding: 120,
    bottomPadding: 200,
    delayMs: 70,
    afterScrollMs: 160,
  });
  await sleep(160);
  await clickLocator(page, cardButton, {
    moveSteps: 24,
    hoverPauseMs: 220,
    afterClickMs: 200,
  });
  await sleep(180);
}

async function moveCursorAwayFromMap(page) {
  const viewport = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  await moveCursor(
    page,
    Math.max(56, Math.round(viewport.width * 0.08)),
    Math.min(Math.round(viewport.height * 0.32), viewport.height - 140),
    {
      steps: 26,
      delayMs: 18,
    },
  );
  await sleep(160);
}

async function waitForPaymentPopupAfterClick(page, payButton) {
  const popupPromise = Promise.race([
    page.waitForEvent("popup", { timeout: 15000 }).catch(() => null),
    page.context().waitForEvent("page", { timeout: 15000 }).catch(() => null),
  ]);
  const checkoutResponsePromise = page
    .waitForResponse(
      (response) =>
        response.url() === `${API_BASE}/profile/orders` &&
        response.request().method() === "POST",
      { timeout: 15000 },
    )
    .catch(() => null);

  await clickLocator(page, payButton, {
    moveSteps: 28,
    hoverPauseMs: 300,
    afterClickMs: 260,
  });

  const popup = await popupPromise;
  if (popup) {
    return popup;
  }

  const payButtonText = (await payButton.textContent().catch(() => ""))?.trim() ?? "";
  const payButtonDisabled = await payButton.isDisabled().catch(() => false);
  const selectedPointSummary = (
    await page
      .locator("div.rounded-xl.border.border-gray-200.bg-gray-50")
      .filter({ hasText: /ПВЗ|Выбранная точка/i })
      .first()
      .textContent()
      .catch(() => "")
  )?.trim() ?? "";
  const toastText = (
    await page.locator("div.pointer-events-auto p").allTextContents().catch(() => [])
  )
    .map((item) => item.trim())
    .filter(Boolean)
    .join(" | ");

  const checkoutResponse = await checkoutResponsePromise;
  let fallbackPaymentUrl = null;
  if (checkoutResponse) {
    const payload = await checkoutResponse.json().catch(() => null);
    fallbackPaymentUrl = payload?.payment?.confirmationUrl ?? null;
  }

  if (fallbackPaymentUrl) {
    const popupPage = await page.context().newPage();
    await popupPage.goto(fallbackPaymentUrl, { waitUntil: "domcontentloaded" });
    return popupPage;
  }

  throw new Error(
    `Payment popup did not open. Button="${payButtonText}" disabled=${payButtonDisabled}. Selected point="${selectedPointSummary || "n/a"}". Toasts="${toastText || "none"}".`,
  );
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
  await sleep(900);

  const payButton = page.getByRole("button", { name: /Оплатить/ }).first();
  await ensurePickupPointSelected(page);
  await moveCursorAwayFromMap(page);
  await showCheckoutPaymentMethod(page);
  await revealLocatorInViewport(page, payButton, {
    topPadding: 120,
    bottomPadding: 180,
    delayMs: 70,
    afterScrollMs: 140,
  });
  await sleep(140);
  const popup = await waitForPaymentPopupAfterClick(page, payButton);
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
  const rect = await getCaptureRect(page);
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

async function composeVideo(manifestPath = META_PATH, outputPath = FINAL_PATH) {
  const swiftScript = path.join(ROOT_DIR, "scripts/demo/compose-demo.swift");
  await new Promise((resolve, reject) => {
    const child = spawn("swift", [swiftScript, manifestPath, outputPath], {
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
    ],
  });

  try {
    await nativeMouse.start();
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
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

    const manifestBase = {
      createdAt: new Date().toISOString(),
      appBase: APP_BASE,
      listingPublicId: latestSellerListing.id,
      listingTitle,
      scenes,
    };

    await browser.close();
    await nativeMouse.stop();
    for (const variant of SPEED_VARIANTS) {
      const manifest = {
        ...manifestBase,
        finalOutput: variant.outputPath,
        speed: variant.speed,
      };
      fs.writeFileSync(variant.manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`[demo] composing video speed x${variant.speed}`);
      await composeVideo(variant.manifestPath, variant.outputPath);
    }

    console.log(`Demo video created: ${FINAL_PATH}`);
    console.log(`Demo video created: ${FINAL_1X_PATH}`);
    console.log(`Demo video created: ${FINAL_15X_PATH}`);
    console.log(`Demo video created: ${FINAL_2X_PATH}`);
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
