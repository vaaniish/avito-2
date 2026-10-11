import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8080";
process.env.PLAYWRIGHT_API_BASE_URL ??= `${baseURL}/api`;

export default defineConfig({
  ...base,
  webServer: undefined,
  workers: 2,
  use: { ...base.use, baseURL },
});
