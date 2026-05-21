import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect, request, type APIRequestContext, type Page } from "@playwright/test";
import "dotenv/config";

import {
  assertNoHorizontalOverflow,
  bootstrapUiErrorCapture,
  expectAppView,
  fetchFirstProductContext,
  installSession,
} from "../tests/ui/helpers.ts";

type SessionRole = "buyer" | "seller" | "admin";
type CollageGroup = "public" | "private";
type Stage = "capture" | "wireframes" | "compose" | "all";

type ScreenConfig = {
  id: string;
  outputName: string;
  collage: CollageGroup;
  view: string;
  role?: SessionRole;
  anchor: RegExp;
  focusHeight: number;
  resolvePath: (params: { productId: string; sellerId: string }) => string;
};

type ScreenManifest = {
  id: string;
  outputName: string;
  collage: CollageGroup;
  focusHeight: number;
  rawPath: string;
  wireframePath: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "../..");
const OUTPUT_DIR = join(ROOT_DIR, "docs", "wireframes", "a4");
const RAW_DIR = join(OUTPUT_DIR, "raw");
const WIREFRAME_DIR = join(OUTPUT_DIR, "wireframes");
const FINAL_DIR = join(OUTPUT_DIR, "final");
const MANIFEST_PATH = join(OUTPUT_DIR, "manifest.json");
const COMPOSER_SCRIPT = join(__dirname, "compose_wireframe_collages.py");

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const API_BASE_URL = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:3001/api";
const FRONTEND_READY_TIMEOUT_MS = Number(process.env.FRONTEND_READY_TIMEOUT_MS ?? "120000");
const BACKEND_READY_TIMEOUT_MS = Number(process.env.BACKEND_READY_TIMEOUT_MS ?? "120000");
const VIEWPORT = { width: 1440, height: 1400 };

const SCREENS: ScreenConfig[] = [
  {
    id: "catalog",
    outputName: "01-catalog",
    collage: "public",
    view: "home",
    anchor: /каталог|ecomm/i,
    focusHeight: 820,
    resolvePath: () => "/",
  },
  {
    id: "product-detail",
    outputName: "02-product-detail",
    collage: "public",
    view: "product",
    anchor: /купить сейчас|добавить в корзину/i,
    focusHeight: 900,
    resolvePath: ({ productId }) => `/products/${productId}`,
  },
  {
    id: "seller-store",
    outputName: "03-seller-store",
    collage: "public",
    view: "sellerStore",
    anchor: /магазин|отзывы|объявлен/i,
    focusHeight: 860,
    resolvePath: ({ sellerId }) => `/sellers/${sellerId}`,
  },
  {
    id: "checkout",
    outputName: "04-checkout",
    collage: "private",
    view: "checkout",
    role: "buyer",
    anchor: /оформление заказа/i,
    focusHeight: 920,
    resolvePath: () => "/checkout",
  },
  {
    id: "profile-orders",
    outputName: "05-profile-orders",
    collage: "private",
    view: "profile",
    role: "buyer",
    anchor: /заказ|профил/i,
    focusHeight: 860,
    resolvePath: () => "/profile/orders",
  },
  {
    id: "admin-listings",
    outputName: "06-admin-listings",
    collage: "private",
    view: "adminPanel",
    role: "admin",
    anchor: /панель администратора|объявления/i,
    focusHeight: 900,
    resolvePath: () => "/admin/listings",
  },
];

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function createCommandError(command: string, code: number | string) {
  return new Error(`Command failed (${code}): ${command}`);
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
      cwd: ROOT_DIR,
    });

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(createCommandError(`${command} ${args.join(" ")}`, code ?? "null"));
    });
  });
}

function getOutputPath(baseDir: string, outputName: string, suffix = ".png") {
  return join(baseDir, `${outputName}${suffix}`);
}

function makePlaceholderSvg(width: number, height: number) {
  const safeWidth = Math.max(64, Math.round(width));
  const safeHeight = Math.max(64, Math.round(height));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">`,
    `<rect width="${safeWidth}" height="${safeHeight}" fill="#f3f4f6" stroke="#111111" stroke-width="2"/>`,
    `<path d="M0 0 L${safeWidth} ${safeHeight}" stroke="#111111" stroke-width="2" opacity="0.45"/>`,
    `<path d="M${safeWidth} 0 L0 ${safeHeight}" stroke="#111111" stroke-width="2" opacity="0.45"/>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

async function isFrontendReady() {
  try {
    const response = await fetch(BASE_URL, { redirect: "manual" });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function isBackendReady() {
  try {
    const response = await fetch(`${API_BASE_URL.replace(/\/api$/, "")}/health/ready`);
    if (response.status !== 200) {
      return false;
    }
    const payload = await response.json();
    return payload?.ok === true;
  } catch {
    return false;
  }
}

async function waitForReadiness(check: () => Promise<boolean>, timeoutMs: number, label: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) {
      return;
    }
    await delay(1000);
  }
  throw new Error(`${label} did not become ready within ${timeoutMs}ms`);
}

function stopProcess(child: ReturnType<typeof spawn>) {
  return new Promise<void>((resolvePromise) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise();
    };

    child.once("close", finish);
    child.kill("SIGINT");

    setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill("SIGKILL");
      finish();
    }, 6000);
  });
}

async function ensureServers() {
  const frontendAlreadyUp = await isFrontendReady();
  const backendAlreadyUp = await isBackendReady();
  let frontendProcess: ReturnType<typeof spawn> | null = null;
  let backendProcess: ReturnType<typeof spawn> | null = null;

  if (!backendAlreadyUp) {
    backendProcess = spawn("npm", ["run", "start:dev"], {
      stdio: "inherit",
      env: process.env,
      cwd: ROOT_DIR,
    });
    await waitForReadiness(isBackendReady, BACKEND_READY_TIMEOUT_MS, "Backend");
  }

  if (!frontendAlreadyUp) {
    frontendProcess = spawn("npm", ["run", "dev:frontend"], {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_API_BASE_URL: API_BASE_URL,
      },
      cwd: ROOT_DIR,
    });
    await waitForReadiness(isFrontendReady, FRONTEND_READY_TIMEOUT_MS, "Frontend");
  }

  return async () => {
    if (frontendProcess) {
      await stopProcess(frontendProcess);
    }
    if (backendProcess) {
      await stopProcess(backendProcess);
    }
  };
}

async function collectUiErrors(page: Page) {
  const captured = await page.evaluate(() => {
    const storage = (window as Window & {
      __PW_ERRORS__?: Array<{ type?: string; message?: string }>;
    }).__PW_ERRORS__;
    if (!Array.isArray(storage)) {
      return [];
    }
    return storage
      .map((entry) => String(entry?.message ?? "").trim())
      .filter(
        (message) =>
          message.length > 0 &&
          !/favicon|non-passive event listener|ResizeObserver loop limit exceeded/i.test(
            message,
          ),
      );
  });
  return captured;
}

async function applyWireframeMode(page: Page) {
  const placeholderFactory = makePlaceholderSvg.toString();
  await page.addStyleTag({
    content: `
      html {
        filter: grayscale(1) contrast(1.06) brightness(1.02);
        background: #ffffff !important;
      }
      body {
        background: #ffffff !important;
      }
      *, *::before, *::after {
        box-shadow: none !important;
        text-shadow: none !important;
        caret-color: #111111 !important;
      }
      img, video, canvas, picture {
        background: #f3f4f6 !important;
      }
      button, [role="button"], input, textarea, select, [class*="btn"], [class*="button"] {
        box-shadow: none !important;
      }
    `,
  });

  await page.evaluate(async ({ placeholderFactorySource }) => {
    const buildPlaceholder = new Function(
      `return (${placeholderFactorySource});`,
    )() as (width: number, height: number) => string;

    const mediaThreshold = 20;
    const backgroundThreshold = 40;

    for (const image of Array.from(document.images)) {
      const rect = image.getBoundingClientRect();
      if (rect.width >= mediaThreshold && rect.height >= mediaThreshold) {
        const placeholder = buildPlaceholder(rect.width, rect.height);
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
        image.src = placeholder;
        image.alt = "";
        image.style.objectFit = "cover";
        image.style.border = "1px solid rgba(17,17,17,0.85)";
        image.style.background = "#f3f4f6";
      } else {
        image.style.filter = "grayscale(1) contrast(1.1)";
      }
    }

    for (const canvas of Array.from(document.querySelectorAll<HTMLCanvasElement>("canvas"))) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < mediaThreshold || rect.height < mediaThreshold) {
        continue;
      }
      canvas.style.backgroundImage = "none";
      canvas.style.backgroundColor = "#f3f4f6";
      canvas.style.opacity = "1";
      canvas.style.border = "1px solid rgba(17,17,17,0.85)";
    }

    const nodes = Array.from(document.querySelectorAll<HTMLElement>("*"));
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const identity = `${node.id} ${node.className}`.toLowerCase();

      if (
        style.backgroundImage !== "none" &&
        rect.width >= backgroundThreshold &&
        rect.height >= backgroundThreshold
      ) {
        node.style.backgroundImage = "none";
        node.style.backgroundColor = "#f3f4f6";
        node.style.border = node.style.border || "1px solid rgba(17,17,17,0.72)";
        node.style.opacity = "1";
      }

      if (
        (identity.includes("ymaps") || identity.includes("yandex") || identity.includes("map")) &&
        rect.width >= 180 &&
        rect.height >= 120
      ) {
        node.style.backgroundImage = "none";
        node.style.backgroundColor = "#f3f4f6";
        node.style.border = "1px solid rgba(17,17,17,0.72)";
        node.style.opacity = "1";
      }

      if (
        style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        style.backgroundColor !== "transparent"
      ) {
        const isInteractive =
          node.tagName === "BUTTON" ||
          node.tagName === "INPUT" ||
          node.tagName === "TEXTAREA" ||
          node.tagName === "SELECT" ||
          node.getAttribute("role") === "button";
        node.style.backgroundColor = isInteractive ? "#ffffff" : "#fafafa";
      }

      if (style.borderStyle !== "none" || style.outlineStyle !== "none") {
        node.style.borderColor = "rgba(17,17,17,0.72)";
        node.style.outlineColor = "rgba(17,17,17,0.72)";
      }
    }

    await document.fonts.ready;
  }, { placeholderFactorySource: placeholderFactory });

  await page.waitForTimeout(200);
}

async function captureScreenshots(stage: Stage): Promise<ScreenManifest[]> {
  await mkdir(RAW_DIR, { recursive: true });
  await mkdir(WIREFRAME_DIR, { recursive: true });
  await mkdir(FINAL_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const apiContext = await request.newContext({
    baseURL: API_BASE_URL,
    extraHTTPHeaders: {
      "x-playwright-suite": "wireframe-prototype",
    },
  });

  try {
    const { productId, sellerId } = await fetchFirstProductContext(apiContext);
    const manifests: ScreenManifest[] = [];

    for (const screen of SCREENS) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        screen: VIEWPORT,
        colorScheme: "light",
      });
      const page = await context.newPage();
      await bootstrapUiErrorCapture(page);

      if (screen.role) {
        await installSession(page, apiContext, screen.role);
      }

      const relativePath = screen.resolvePath({ productId, sellerId });
      const rawPath = getOutputPath(RAW_DIR, screen.outputName);
      const wireframePath = getOutputPath(WIREFRAME_DIR, `${screen.outputName}-wireframe`);

      await page.goto(new URL(relativePath, BASE_URL).toString(), {
        waitUntil: "domcontentloaded",
      });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      await expectAppView(page, screen.view);
      await expect(page.locator("body")).toContainText(screen.anchor);
      await assertNoHorizontalOverflow(page);

      if (stage === "capture" || stage === "all") {
        await page.screenshot({
          path: rawPath,
          fullPage: true,
        });
      }

      if (stage === "wireframes" || stage === "all") {
        await applyWireframeMode(page);
        await page.screenshot({
          path: wireframePath,
          fullPage: true,
        });
      }

      const errors = await collectUiErrors(page);
      invariant(
        errors.length === 0,
        `UI errors detected on ${screen.id}: ${errors.join(" | ")}`,
      );

      manifests.push({
        id: screen.id,
        outputName: screen.outputName,
        collage: screen.collage,
        focusHeight: screen.focusHeight,
        rawPath,
        wireframePath,
      });

      await context.close();
    }

    return manifests;
  } finally {
    await apiContext.dispose();
    await browser.close();
  }
}

async function writeManifest(screens: ScreenManifest[]) {
  const manifest = {
    generatedAt: new Date().toISOString(),
    canvas: {
      width: 2480,
      height: 3508,
    },
    collages: [
      {
        id: "public",
        outputPath: join(FINAL_DIR, "01-wireframe-collage-a4-public.png"),
      },
      {
        id: "private",
        outputPath: join(FINAL_DIR, "02-wireframe-collage-a4-private.png"),
      },
    ],
    screens,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

async function composeCollages() {
  await runCommand("python3", [COMPOSER_SCRIPT, "--manifest", MANIFEST_PATH]);
}

function parseStage(argv: string[]): Stage {
  const requested = argv[2] as Stage | undefined;
  if (!requested) {
    return "all";
  }
  if (requested === "capture" || requested === "wireframes" || requested === "compose" || requested === "all") {
    return requested;
  }
  throw new Error(`Unsupported stage "${requested}". Use capture, wireframes, compose, or all.`);
}

async function main() {
  const stage = parseStage(process.argv);
  const stopServers = await ensureServers();

  try {
    if (stage === "compose") {
      await composeCollages();
      return;
    }

    const screens = await captureScreenshots(stage);
    await writeManifest(screens);

    if (stage === "all" || stage === "wireframes") {
      await composeCollages();
    }
  } finally {
    await stopServers();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
