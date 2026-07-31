import "dotenv/config";
import { spawn } from "node:child_process";

const scenarios = ["catalog", "login", "listing", "checkout", "moderation"];
const sourceUrl = new URL(process.env.PERF_DATABASE_URL ?? process.env.DATABASE_URL);
if (!process.env.PERF_DATABASE_URL) sourceUrl.pathname = "/avito-perf";
const perfDatabaseUrl = sourceUrl.toString();
for (const scenario of scenarios) {
  process.stdout.write(`[perf-diagnose] starting ${scenario}\n`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "perf:1000vu"], {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: perfDatabaseUrl,
        PERF_DATABASE_URL: perfDatabaseUrl,
        PERF_TEST_CONFIRM: "RUN_LOCAL_1000_VU",
        PERF_ONLY_SCENARIO: scenario,
        PERF_DURATION_SCALE: process.env.PERF_DIAGNOSTIC_SCALE ?? "0.05",
        PERF_MAX_ERROR_RATE: "1",
        PERF_MAX_TIMEOUT_RATE: "1",
        PERF_CATALOG_P95_MS: "60000",
        PERF_LOGIN_P95_MS: "60000",
        PERF_LISTING_P95_MS: "60000",
        PERF_CHECKOUT_P95_MS: "60000",
        PERF_MODERATION_P95_MS: "60000",
      },
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (code !== 0) throw new Error(`Diagnostic scenario ${scenario} failed with code ${code}`);
}
