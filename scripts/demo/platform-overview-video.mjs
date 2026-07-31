#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import readline from "node:readline";
import { chromium } from "playwright";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const OUTPUT_DIR = path.resolve(ROOT_DIR, "artifacts", "demo-video-platform-overview");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const MANIFEST_1X_PATH = path.join(OUTPUT_DIR, "manifest-1x.json");
const MANIFEST_2X_PATH = path.join(OUTPUT_DIR, "manifest-2x.json");
const FINAL_1X_PATH = path.join(OUTPUT_DIR, "platform-overview-1x.mov");
const FINAL_2X_PATH = path.join(OUTPUT_DIR, "platform-overview-2x.mov");
const NATIVE_MOUSE_SCRIPT = path.join(ROOT_DIR, "scripts", "demo", "native-mouse.swift");
const COMPOSE_SCRIPT = path.join(ROOT_DIR, "scripts", "demo", "compose-demo.swift");
const APP_BASE = "http://127.0.0.1:3000";
const API_BASE = "http://127.0.0.1:3001/api";
const WINDOW_BOUNDS = { width: 1500, height: 1220 };
const VIEWPORT = { width: 1440, height: 1100 };
const RECORDING_PADDING_MS = 800;
const END_PAUSE_MS = 900;
const CURSOR_SCREEN_OFFSET = { x: 0, y: 80 };
const CURSOR_STEP_MULTIPLIER = 2.8;
const CURSOR_DELAY_MULTIPLIER = 2;
const CURSOR_MOVE_TIMEOUT_BUFFER_MS = 900;
const DEFAULT_HOVER_PAUSE_MS = 90;
const DEFAULT_AFTER_MOVE_MS = 90;
const DEFAULT_AFTER_CLICK_MS = 260;
const MAX_AFTER_CLICK_MS = 440;

if (OUTPUT_DIR.endsWith("artifacts/demo-video")) {
  throw new Error("Refusing to write platform overview into the existing main demo folder");
}

const credentials = {
  buyer: { email: "buyer1@ecomm.local", password: "DemoBuyer2026!" },
  seller: { email: "seller1@ecomm.local", password: "DemoSeller2026!" },
  admin: { email: "admin@ecomm.local", password: "DemoAdmin2026!" },
};

const authSessionCache = new Map();
const SPEED_VARIANTS = [
  { speed: 1, manifestPath: MANIFEST_1X_PATH, outputPath: FINAL_1X_PATH },
  { speed: 2, manifestPath: MANIFEST_2X_PATH, outputPath: FINAL_2X_PATH },
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function cleanGeneratedOverviewFiles() {
  for (const filePath of [MANIFEST_1X_PATH, MANIFEST_2X_PATH, FINAL_1X_PATH, FINAL_2X_PATH]) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
  if (!fs.existsSync(RAW_DIR)) return;
  for (const entry of fs.readdirSync(RAW_DIR)) {
    if (entry.endsWith(".mov")) {
      fs.unlinkSync(path.join(RAW_DIR, entry));
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeCursorSteps(value) {
  return Math.max(8, Math.ceil(value * CURSOR_STEP_MULTIPLIER));
}

function normalizeCursorDelay(value) {
  return Math.max(8, Math.ceil(value * CURSOR_DELAY_MULTIPLIER));
}

function boundedClickPause(value) {
  return Math.min(value ?? DEFAULT_AFTER_CLICK_MS, MAX_AFTER_CLICK_MS);
}

function escapeAppleScriptString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function focusBrowserAppWindow() {
  try {
    execFileSync("osascript", [
      "-e",
      `tell application "System Events" to set frontmost of process "${escapeAppleScriptString("Google Chrome for Testing")}" to true`,
    ], {
      cwd: ROOT_DIR,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {}
}

async function login(role) {
  const cached = authSessionCache.get(role);
  if (cached?.cookie && cached?.csrfToken && cached?.user) {
    return cached;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: APP_BASE },
      body: JSON.stringify(credentials[role]),
    });
    if (response.ok) {
      const payload = await response.json();
      const cookie = /ecomm_session=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1];
      if (!cookie || !payload?.csrfToken || !payload?.user) {
        throw new Error(`Malformed login payload for ${role}`);
      }
      const session = { ...payload, cookie: decodeURIComponent(cookie) };
      authSessionCache.set(role, session);
      return session;
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
    const start = this.last ?? { x, y };
    await this.send({
      cmd: "move",
      fromX: start.x,
      fromY: start.y,
      toX: x,
      toY: y,
      steps: options.steps ?? 18,
      delayMs: options.delayMs ?? 8,
    });
    this.last = { x, y };
  }

  reset() {
    this.last = null;
  }

  async stop() {
    if (!this.process) return;
    await Promise.race([
      this.setAssociated(true),
      sleep(500).then(() => {
        throw new Error("Native mouse associate timeout");
      }),
    ]).catch(() => {});
    await Promise.race([
      this.send({ cmd: "exit" }),
      sleep(700).then(() => {
        throw new Error("Native mouse helper exit timeout");
      }),
    ]).catch(() => {
      this.process?.kill("SIGKILL");
    });
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
  const box = await locator.boundingBox({ timeout: 7000 });
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
  const steps = normalizeCursorSteps(options.steps ?? options.moveSteps ?? 18);
  const delayMs = normalizeCursorDelay(options.delayMs ?? options.moveDelayMs ?? 8);
  await Promise.race([
    nativeMouse.moveTo(absolute.x, absolute.y, { steps, delayMs }),
    sleep(steps * delayMs + CURSOR_MOVE_TIMEOUT_BUFFER_MS).then(() => {
      throw new Error("Native mouse move timeout");
    }),
  ]).catch(() => {});
  if (!page.isClosed()) {
    await page.mouse.move(x, y).catch(() => {});
  }
  return absolute;
}

async function moveToLocator(page, locator, options = {}) {
  const point = await centerOf(locator);
  await moveCursor(page, point.x, point.y, options);
  await sleep(options.afterMoveMs ?? DEFAULT_AFTER_MOVE_MS);
}

async function clickLocator(page, locator, options = {}) {
  await moveToLocator(page, locator, {
    steps: options.moveSteps ?? 18,
    delayMs: options.moveDelayMs ?? 8,
    afterMoveMs: options.hoverPauseMs ?? DEFAULT_HOVER_PAUSE_MS,
  });
  await locator.click();
  await sleep(boundedClickPause(options.afterClickMs));
}

async function smoothScroll(page, deltaY, options = {}) {
  const steps = options.steps ?? Math.max(8, Math.ceil(Math.abs(deltaY) / 100));
  const delayMs = options.delayMs ?? 80;
  for (let index = 0; index < steps; index += 1) {
    const progress = (index + 1) / steps;
    const previousProgress = index / steps;
    const easedProgress = progress * progress * (3 - 2 * progress);
    const easedPrevious = previousProgress * previousProgress * (3 - 2 * previousProgress);
    await page.mouse.wheel(0, deltaY * (easedProgress - easedPrevious));
    await sleep(delayMs);
  }
}

async function smoothScrollToTop(page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scrollY = await page.evaluate(() => window.scrollY).catch(() => 0);
    if (scrollY <= 8) return;
    await smoothScroll(page, -Math.min(scrollY, 520), { steps: 12, delayMs: 65 });
  }
}

async function smoothScrollInside(locator, deltaY, options = {}) {
  const steps = options.steps ?? Math.max(8, Math.ceil(Math.abs(deltaY) / 80));
  const delayMs = options.delayMs ?? 75;
  let previousTop = await locator.evaluate((element) => element.scrollTop).catch(() => null);
  if (previousTop === null) return;

  for (let index = 0; index < steps; index += 1) {
    const progress = (index + 1) / steps;
    const previousProgress = index / steps;
    const easedProgress = progress * progress * (3 - 2 * progress);
    const easedPrevious = previousProgress * previousProgress * (3 - 2 * previousProgress);
    const stepDelta = deltaY * (easedProgress - easedPrevious);
    const nextTop = await locator
      .evaluate((element, value) => {
        element.scrollTop += value;
        return element.scrollTop;
      }, stepDelta)
      .catch(() => previousTop);
    await sleep(delayMs);
    if (Math.abs(nextTop - previousTop) < 0.5) break;
    previousTop = nextTop;
  }
}

async function setSession(page, role) {
  const payload = await login(role);
  await page.context().clearCookies();
  await page.context().addCookies([{
    name: "ecomm_session", value: payload.cookie, domain: "127.0.0.1", path: "/",
    httpOnly: true, secure: false, sameSite: "Lax",
  }]);
  await page.goto(APP_BASE, { waitUntil: "domcontentloaded" });
}

async function waitForAppReady(page, patterns) {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  await Promise.race(
    patternList.map((pattern) =>
      page.waitForSelector(`text=${pattern}`, { timeout: 15000 }),
    ),
  );
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
}

async function gotoRole(page, role, pathName, readyText) {
  nativeMouse.reset();
  await setSession(page, role);
  await page.goto(`${APP_BASE}${pathName}`, { waitUntil: "domcontentloaded" });
  focusBrowserAppWindow();
  await page.bringToFront();
  await waitForAppReady(page, readyText);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(260);
}

function startScreenRecording(sceneName, rect) {
  const outputFile = path.join(RAW_DIR, `${sceneName}.mov`);
  if (fs.existsSync(outputFile)) {
    fs.unlinkSync(outputFile);
  }
  const region = `${rect.x},${rect.y},${rect.width},${rect.height}`;
  const recorder = spawn("screencapture", ["-x", "-v", "-R", region, outputFile], {
    cwd: ROOT_DIR,
    stdio: ["ignore", "pipe", "pipe"],
  });
  console.log(`[overview] recording ${sceneName}: ${outputFile}`);
  recorder.stderr.on("data", () => {});
  recorder.stdout.on("data", () => {});
  return {
    outputFile,
    process: recorder,
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

async function recordScene(page, sceneName, prepare, action) {
  console.log(`[overview] prepare ${sceneName}`);
  await prepare(page);
  const rect = await getCaptureRect(page);
  await nativeMouse.setAssociated(true).catch(() => {});
  const recording = startScreenRecording(sceneName, rect);
  const recordingStartedAt = Date.now();
  let actionStartedAt = recordingStartedAt;
  let actionEndedAt = recordingStartedAt;
  let recordingEndedAt = recordingStartedAt;
  try {
    await sleep(RECORDING_PADDING_MS);
    console.log(`[overview] action ${sceneName} started`);
    actionStartedAt = Date.now();
    await action(page);
    await sleep(END_PAUSE_MS);
    actionEndedAt = Date.now();
  } finally {
    if (actionEndedAt === recordingStartedAt) {
      actionEndedAt = Date.now();
    }
    await Promise.race([
      nativeMouse.setAssociated(true),
      sleep(500).then(() => {
        throw new Error("Native mouse associate timeout");
      }),
    ]).catch(() => {});
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
    rawDuration: Number(rawDuration.toFixed(3)),
    actionDuration: Number(actionDuration.toFixed(3)),
    trimStart,
    trimEnd,
  };
  console.log(`[overview] action ${sceneName} done in ${result.actionDuration}s`);
  return result;
}

async function composeVideo(manifestPath, outputPath) {
  await new Promise((resolve, reject) => {
    const child = spawn("swift", [COMPOSE_SCRIPT, manifestPath, outputPath], {
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

function firstVisibleByText(page, text) {
  return page.getByText(text, { exact: false }).first();
}

function navButton(page, name) {
  return page.getByRole("button", { name }).first();
}

async function prepareBuyerProfile(page) {
  await gotoRole(page, "buyer", "/profile", "Профиль");
  await navButton(page, "Адреса").waitFor({ state: "visible", timeout: 7000 });
}

async function runBuyerProfile(page) {
  await sleep(500);
  await clickLocator(page, navButton(page, "Адреса"), {
    moveSteps: 28,
    afterClickMs: 1000,
  });
  await waitForAppReady(page, "Адреса доставки");
  await moveToLocator(page, navButton(page, "Адреса"), { steps: 24 });
  await sleep(260);
  await clickLocator(page, navButton(page, "История заказов"), {
    moveSteps: 28,
    afterClickMs: 1000,
  });
  await waitForAppReady(page, "История заказов");
  await smoothScroll(page, 260, { steps: 6, delayMs: 80 }).catch(() => {});
  await sleep(260);
  await clickLocator(page, navButton(page, "Избранное"), {
    moveSteps: 28,
    afterClickMs: 1000,
  });
  await waitForAppReady(page, ["Избранное", "Избранное пусто"]);
  await moveToLocator(page, navButton(page, "Избранное"), { steps: 24 });
  await sleep(260);
  await clickLocator(page, navButton(page, "Партнерство"), {
    moveSteps: 28,
    afterClickMs: 1000,
  });
  await waitForAppReady(page, ["Партнерская проверка", "Минимум ручной бюрократии"]);
  await moveToLocator(page, firstVisibleByText(page, "Партнерская проверка"), { steps: 24 });
  await sleep(1200);
}

async function prepareSellerDashboard(page) {
  await gotoRole(page, "seller", "/profile/partner-listings", "Мои объявления");
}

async function runSellerDashboard(page) {
  await moveToLocator(page, firstVisibleByText(page, "Мои объявления"), { steps: 26 });
  await sleep(350);
  await smoothScroll(page, 360, { steps: 8, delayMs: 85 });
  await sleep(260);
  await smoothScroll(page, -300, { steps: 7, delayMs: 75 });
  await sleep(240);
  for (const label of ["Финансы", "Вопросы", "Заказы"]) {
    await clickLocator(page, navButton(page, label), { moveSteps: 22, afterClickMs: 900 });
    await waitForAppReady(page, label).catch(() => {});
    if (label === "Финансы") {
      await smoothScroll(page, 760, { steps: 12, delayMs: 75 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, -360, { steps: 8, delayMs: 65 }).catch(() => {});
    }
    if (label === "Заказы") {
      await smoothScroll(page, 620, { steps: 10, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 520, { steps: 9, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, -300, { steps: 7, delayMs: 60 }).catch(() => {});
    }
    await sleep(300);
  }
  await sleep(800);
}

async function prepareAdminComplaints(page) {
  await gotoRole(page, "admin", "/admin/complaints", "Жалобы");
}

async function runAdminComplaints(page) {
  await moveToLocator(page, firstVisibleByText(page, "Новые"), { steps: 24 });
  await sleep(260);
  const firstComplaint = page.locator(".dashboard-card").filter({ hasText: /CMP-/ }).first();
  if (await firstComplaint.isVisible().catch(() => false)) {
    await clickLocator(page, firstComplaint, { moveSteps: 24, afterClickMs: 700 });
    await waitForAppReady(page, ["Суть жалобы", "Связанные жалобы"]).catch(() => {});
    await sleep(260);
    await smoothScroll(page, 340, { steps: 7, delayMs: 70 });
    await sleep(260);
    await clickLocator(page, firstVisibleByText(page, "Заявитель и санкции"), {
      moveSteps: 20,
      afterClickMs: 650,
    }).catch(() => {});
    await sleep(700);
    const closeButton = page.getByRole("button", { name: /закрыть/i }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await clickLocator(page, closeButton, { moveSteps: 16, afterClickMs: 500 });
    } else {
      await page.keyboard.press("Escape");
      await sleep(260);
    }
  } else {
    await sleep(600);
  }
}

async function prepareAdminListings(page) {
  await gotoRole(page, "admin", "/admin/listings", "Объявления");
}

async function runAdminListings(page) {
  await moveToLocator(page, firstVisibleByText(page, "Объявления"), { steps: 22 });
  await sleep(1100);
}

async function prepareAdminCatalog(page) {
  await gotoRole(page, "admin", "/admin/catalog", "Каталог товаров");
}

async function runAdminCatalog(page) {
  await moveToLocator(page, firstVisibleByText(page, "Каталог"), { steps: 24 });
  await sleep(260);
  await clickLocator(page, page.getByRole("button", { name: "Редактор каталога" }).first(), {
    moveSteps: 22,
    afterClickMs: 850,
  });
  await waitForAppReady(page, "Дерево товарного каталога").catch(() => {});
  await moveToLocator(page, firstVisibleByText(page, "Дерево товарного каталога"), { steps: 20 });
  const treeList = page.locator(".catalog-tree-list").first();
  if (await treeList.isVisible().catch(() => false)) {
    await moveToLocator(page, treeList, { steps: 18, afterMoveMs: 220 });
    await treeList.hover().catch(() => {});
    const firstToggle = treeList.locator("button").filter({ hasText: /подкатегор/i }).first();
    if (await firstToggle.isVisible().catch(() => false)) {
      await clickLocator(page, firstToggle, { moveSteps: 16, afterClickMs: 900 });
      await sleep(260);
      const subcategoryToggle = treeList.locator("button").filter({ hasText: /видов товар/i }).first();
      if (await subcategoryToggle.isVisible().catch(() => false)) {
        await clickLocator(page, subcategoryToggle, { moveSteps: 16, afterClickMs: 800 });
        await sleep(240);
      }
    }
    await treeList.hover().catch(() => {});
    await smoothScroll(page, 420, { steps: 12, delayMs: 80 });
    await sleep(260);
    await smoothScroll(page, 300, { steps: 10, delayMs: 80 });
    await sleep(260);
    await smoothScroll(page, 360, { steps: 11, delayMs: 80 });
    await sleep(260);
    await smoothScroll(page, -260, { steps: 9, delayMs: 75 });
  }
  await sleep(900);
}

async function prepareAdminOperations(page) {
  await gotoRole(page, "admin", "/admin/promos", "Промокоды");
}

async function runAdminOperations(page) {
  await moveToLocator(page, firstVisibleByText(page, "Промокоды"), { steps: 22 });
  await sleep(350);
  for (const label of ["Партнёры", "Пользователи", "Комиссии", "Риски"]) {
    await clickLocator(page, navButton(page, label), { moveSteps: 22, afterClickMs: 900 });
    if (label === "Партнёры") {
      await waitForAppReady(page, ["Заявки партнёров", "Партнёры"]).catch(() => {});
      const firstPartnerRequest = page.locator(".dashboard-card").filter({ hasText: /Score:|ИНН:|Заявитель:/ }).first();
      if (await firstPartnerRequest.isVisible().catch(() => false)) {
        await clickLocator(page, firstPartnerRequest, { moveSteps: 18, afterClickMs: 800 });
        await waitForAppReady(page, ["Score:", "ИНН:", "Тип:"]).catch(() => {});
        await sleep(260);
        for (const tab of ["2. Контакты", "3. Продажи", "1. Бизнес"]) {
          const tabButton = page.getByRole("button", { name: tab }).first();
          if (await tabButton.isVisible().catch(() => false)) {
            await clickLocator(page, tabButton, { moveSteps: 14, afterClickMs: 650 });
            await sleep(240);
          }
        }
        const closeButton = page.getByRole("button", { name: /закрыть/i }).first();
        if (await closeButton.isVisible().catch(() => false)) {
          await clickLocator(page, closeButton, { moveSteps: 14, afterClickMs: 400 });
        } else {
          await page.keyboard.press("Escape");
          await sleep(240);
        }
      }
    } else if (label === "Пользователи") {
      await waitForAppReady(page, "Пользователи").catch(() => {});
      await smoothScroll(page, 620, { steps: 10, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 520, { steps: 9, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 420, { steps: 8, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, -520, { steps: 9, delayMs: 60 }).catch(() => {});
    } else if (label === "Комиссии") {
      await waitForAppReady(page, "Комиссии и уровни").catch(() => {});
      await smoothScroll(page, 680, { steps: 11, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 520, { steps: 9, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 460, { steps: 8, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, -620, { steps: 10, delayMs: 60 }).catch(() => {});
    } else {
      await waitForAppReady(page, ["Рискованные действия", "Контроль администраторов", "Риски"]).catch(() => {});
      await smoothScroll(page, 620, { steps: 10, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 520, { steps: 9, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 460, { steps: 8, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, 420, { steps: 8, delayMs: 70 }).catch(() => {});
      await sleep(260);
      await smoothScroll(page, -620, { steps: 10, delayMs: 60 }).catch(() => {});
    }
    await sleep(650);
  }
  await sleep(1300);
}

async function prepareAdminDashboard(page) {
  await gotoRole(page, "admin", "/admin/complaints", "Жалобы");
}

async function openAdminSection(page, label, readyText) {
  await clickLocator(page, navButton(page, label), { moveSteps: 24, afterClickMs: 520 });
  await waitForAppReady(page, readyText).catch(() => {});
  await smoothScrollToTop(page).catch(() => {});
}

async function runAdminDashboard(page) {
  await moveToLocator(page, firstVisibleByText(page, "Новые"), { steps: 24 });
  await sleep(260);

  const firstComplaint = page.locator(".dashboard-card").filter({ hasText: /CMP-/ }).first();
  if (await firstComplaint.isVisible().catch(() => false)) {
    await clickLocator(page, firstComplaint, { moveSteps: 24, afterClickMs: 520 });
    await waitForAppReady(page, ["Суть жалобы", "Связанные жалобы"]).catch(() => {});
    await sleep(260);
    await smoothScroll(page, 260, { steps: 8, delayMs: 70 }).catch(() => {});
    await sleep(220);
    await clickLocator(page, firstVisibleByText(page, "Заявитель и санкции"), {
      moveSteps: 20,
      afterClickMs: 520,
    }).catch(() => {});
    await sleep(520);
    const closeButton = page.getByRole("button", { name: /закрыть/i }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await clickLocator(page, closeButton, { moveSteps: 18, afterClickMs: 360 });
    } else {
      await page.keyboard.press("Escape");
      await sleep(240);
    }
  }

  await openAdminSection(page, "Объявления", "Объявления");
  await moveToLocator(page, firstVisibleByText(page, "Объявления"), { steps: 22 });
  await sleep(850);

  await openAdminSection(page, "Каталог", "Каталог товаров");
  await moveToLocator(page, firstVisibleByText(page, "Каталог"), { steps: 24 });
  await sleep(220);

  const polishedCatalogRequest = page
    .locator(".catalog-suggestion-card")
    .filter({ hasText: /Смарт-часы и браслеты|Amazfit GTR 4/i })
    .first();
  const firstCatalogRequest = (await polishedCatalogRequest.isVisible().catch(() => false))
    ? polishedCatalogRequest
    : page.locator(".catalog-suggestion-card").first();
  if (await firstCatalogRequest.isVisible().catch(() => false)) {
    await clickLocator(page, firstCatalogRequest, { moveSteps: 22, afterClickMs: 520 });
    await waitForAppReady(page, ["Параметры заявки", "Важные характеристики"]).catch(() => {});
    await sleep(650);
    const closeCatalogRequestButton = page.getByRole("button", { name: /закрыть/i }).first();
    if (await closeCatalogRequestButton.isVisible().catch(() => false)) {
      await clickLocator(page, closeCatalogRequestButton, { moveSteps: 16, afterClickMs: 320 });
    } else {
      await page.keyboard.press("Escape");
      await sleep(220);
    }
    await sleep(260);
  }

  await clickLocator(page, page.getByRole("button", { name: "Редактор каталога" }).first(), {
    moveSteps: 22,
    afterClickMs: 520,
  });
  await waitForAppReady(page, "Дерево товарного каталога").catch(() => {});
  await moveToLocator(page, firstVisibleByText(page, "Дерево товарного каталога"), { steps: 20 });
  const treeList = page.locator(".catalog-tree-list").first();
  if (await treeList.isVisible().catch(() => false)) {
    await moveToLocator(page, treeList, { steps: 18, afterMoveMs: 180 });
    const firstToggle = treeList.locator("button").filter({ hasText: /подкатегор/i }).first();
    if (await firstToggle.isVisible().catch(() => false)) {
      await clickLocator(page, firstToggle, { moveSteps: 18, afterClickMs: 520 });
      await sleep(220);
      const subcategoryToggle = treeList.locator("button").filter({ hasText: /видов товар/i }).first();
      if (await subcategoryToggle.isVisible().catch(() => false)) {
        await clickLocator(page, subcategoryToggle, { moveSteps: 18, afterClickMs: 480 });
        await sleep(220);
      }
    }
    await moveToLocator(page, treeList, { steps: 16, afterMoveMs: 160 });
    await smoothScrollInside(treeList, 180, { steps: 12, delayMs: 70 });
  }
  await sleep(600);

  await openAdminSection(page, "Промокоды", "Промокоды");
  await moveToLocator(page, firstVisibleByText(page, "Промокоды"), { steps: 22 });
  await sleep(260);
  const firstPromoEditButton = page.getByRole("button", { name: "Редактировать" }).first();
  if (await firstPromoEditButton.isVisible().catch(() => false)) {
    await clickLocator(page, firstPromoEditButton, { moveSteps: 20, afterClickMs: 520 });
    await waitForAppReady(page, ["Редактирование промокода", "Код промокода"]).catch(() => {});
    await sleep(850);
    const cancelPromoButton = page.getByRole("button", { name: "Отмена" }).first();
    if (await cancelPromoButton.isVisible().catch(() => false)) {
      await clickLocator(page, cancelPromoButton, { moveSteps: 16, afterClickMs: 320 });
    } else {
      await page.keyboard.press("Escape");
      await sleep(220);
    }
  } else {
    await sleep(650);
  }

  await openAdminSection(page, "Партнёры", ["Заявки партнёров", "Партнёры"]);
  const firstPartnerRequest = page.locator(".dashboard-card").filter({ hasText: /Score:|ИНН:|Заявитель:/ }).first();
  if (await firstPartnerRequest.isVisible().catch(() => false)) {
    await clickLocator(page, firstPartnerRequest, { moveSteps: 20, afterClickMs: 520 });
    await waitForAppReady(page, ["Score:", "ИНН:", "Тип:"]).catch(() => {});
    await sleep(240);
    for (const tab of ["2. Контакты", "3. Продажи", "1. Бизнес"]) {
      const tabButton = page.getByRole("button", { name: tab }).first();
      if (await tabButton.isVisible().catch(() => false)) {
        await clickLocator(page, tabButton, { moveSteps: 16, afterClickMs: 440 });
        await sleep(180);
      }
    }
    const closeButton = page.getByRole("button", { name: /закрыть/i }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await clickLocator(page, closeButton, { moveSteps: 16, afterClickMs: 320 });
    } else {
      await page.keyboard.press("Escape");
      await sleep(220);
    }
  }
  await sleep(420);

  await openAdminSection(page, "Пользователи", "Пользователи");
  await smoothScroll(page, 360, { steps: 10, delayMs: 75 }).catch(() => {});
  await sleep(320);
  await smoothScroll(page, -260, { steps: 8, delayMs: 70 }).catch(() => {});
  await sleep(420);

  await openAdminSection(page, "Комиссии", "Комиссии и уровни");
  await smoothScroll(page, 360, { steps: 10, delayMs: 75 }).catch(() => {});
  await sleep(420);
  await smoothScroll(page, -240, { steps: 8, delayMs: 70 }).catch(() => {});
  await sleep(420);

  await openAdminSection(page, "Риски", ["Рискованные действия", "Контроль администраторов", "Риски"]);
  await smoothScroll(page, 380, { steps: 10, delayMs: 75 }).catch(() => {});
  await sleep(1000);
}

async function main() {
  ensureDir(OUTPUT_DIR);
  ensureDir(RAW_DIR);
  cleanGeneratedOverviewFiles();
  console.log("[overview] output dir:", OUTPUT_DIR);
  console.log("[overview] existing main demo folder is untouched:", path.join(ROOT_DIR, "artifacts", "demo-video"));

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

    const sceneSpecs = [
      ["buyer-profile", prepareBuyerProfile, runBuyerProfile],
      ["seller-dashboard", prepareSellerDashboard, runSellerDashboard],
      ["admin-dashboard", prepareAdminDashboard, runAdminDashboard],
    ];

    const scenes = [];
    for (const [name, prepare, action] of sceneSpecs) {
      scenes.push(await recordScene(page, name, prepare, action));
    }

    await browser.close();
    await nativeMouse.stop();

    for (const variant of SPEED_VARIANTS) {
      const manifest = {
        createdAt: new Date().toISOString(),
        appBase: APP_BASE,
        purpose: "platform-overview-secondary-demo",
        speed: variant.speed,
        finalOutput: variant.outputPath,
        scenes,
      };
      fs.writeFileSync(variant.manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`[overview] composing speed x${variant.speed}`);
      await composeVideo(variant.manifestPath, variant.outputPath);
    }

    console.log(`[overview] created: ${FINAL_1X_PATH}`);
    console.log(`[overview] created: ${FINAL_2X_PATH}`);
  } catch (error) {
    await browser.close().catch(() => {});
    await nativeMouse.stop().catch(() => {});
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
