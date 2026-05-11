import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL ?? "http://127.0.0.1:3001/api";

export default defineConfig({
  testDir: "./scripts/tests/ui",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: {
      "x-playwright-suite": "avito-2",
    },
  },
  expect: {
    timeout: 10_000,
  },
  webServer: [
    {
      command: "npm run start:dev",
      port: 3001,
      timeout: 120_000,
      reuseExistingServer: !CI,
      env: {
        ...process.env,
        PORT: "3001",
      },
    },
    {
      command: "npm run dev:frontend",
      port: 3000,
      timeout: 120_000,
      reuseExistingServer: !CI,
      env: {
        ...process.env,
        VITE_API_BASE_URL: apiBaseUrl,
      },
    },
  ],
  projects: [
    {
      name: "desktop-smoke",
      grepInvert: /@visual/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1100 },
      },
    },
    {
      name: "mobile-smoke",
      grepInvert: /@visual/,
      use: {
        ...devices["Pixel 5"],
      },
    },
    {
      name: "desktop-visual",
      grep: /@visual/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1400 },
      },
    },
    {
      name: "mobile-visual",
      grep: /@visual/,
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
});
