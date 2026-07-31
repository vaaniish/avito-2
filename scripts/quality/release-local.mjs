import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const startedAt = Date.now();
const sourceUrl = new URL(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/avito-db-dev");
const restoreUrl = new URL(sourceUrl);
restoreUrl.pathname = "/avito_release_restore_test";
const perfUrl = new URL(sourceUrl);
perfUrl.pathname = "/avito-perf";
const results = [];

async function runStep(name, command, args, env = process.env) {
  const stepStarted = Date.now();
  process.stdout.write(`\n[release] ${name}\n`);
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
  results.push({
    name,
    status: exitCode === 0 ? "PASS" : "FAIL",
    exitCode,
    durationSec: Number(((Date.now() - stepStarted) / 1000).toFixed(2)),
  });
}

function skipStep(name, reason) {
  results.push({ name, status: "SKIP", reason, durationSec: 0 });
}

async function useArtifactStep(name, artifactPath) {
  const stepStarted = Date.now();
  try {
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    const status = artifact.result === "PASS" ? "PASS" : "FAIL";
    results.push({
      name,
      status,
      artifactPath,
      artifactResult: artifact.result ?? "UNKNOWN",
      failures: Array.isArray(artifact.failures) ? artifact.failures : [],
      durationSec: Number(((Date.now() - stepStarted) / 1000).toFixed(2)),
    });
  } catch (error) {
    results.push({
      name,
      status: "FAIL",
      artifactPath,
      error: error instanceof Error ? error.message : String(error),
      durationSec: Number(((Date.now() - stepStarted) / 1000).toFixed(2)),
    });
  }
}

await runStep("git diff", "git", ["diff", "--check"]);
await runStep("static/build/security", "npm", ["run", "ci:verify"]);
await runStep("unit", "npm", ["run", "test:unit"]);
await runStep("integration", "npm", ["run", "test:integration"]);
await runStep("API smoke", "npm", ["run", "test:e2e:api:smoke"]);
await runStep("API critical + phase-A", "npm", ["run", "test:e2e:api:critical"]);
await runStep("clean migrations", "npm", ["run", "db:migrate:test-clean"]);
await runStep("storage dry-run audit", "npm", ["run", "storage:audit-images"]);
await runStep("database backup", "npm", ["run", "db:backup"]);
await runStep("database restore + smoke", "npm", ["run", "db:restore:test"], {
  ...process.env,
  RESTORE_CONFIRM: "RECREATE_LOCAL_TEST_DATABASE",
  RESTORE_DATABASE_URL: restoreUrl.toString(),
  RESTORE_RUN_API_SMOKE: "1",
});

if (process.env.RELEASE_SKIP_DOCKER === "1") skipStep("Docker production-like smoke", "RELEASE_SKIP_DOCKER=1");
else await runStep("Docker production-like smoke", "npm", ["run", "infra:smoke"]);

if (process.env.RELEASE_SKIP_UI === "1") {
  const reason = process.env.RELEASE_UI_SKIP_REASON ?? "RELEASE_SKIP_UI=1";
  skipStep("Playwright desktop/mobile smoke", reason);
  skipStep("Playwright desktop/mobile critical", reason);
  skipStep("Playwright desktop/mobile visual", reason);
} else {
  await runStep("Playwright desktop/mobile smoke", "npm", ["run", "test:e2e:ui:smoke"]);
  await runStep("Playwright desktop/mobile critical", "npm", ["run", "test:e2e:ui:critical"]);
  await runStep("Playwright desktop/mobile visual", "npm", ["run", "test:visual:smoke"]);
}

const perfEnv = {
  ...process.env,
  DATABASE_URL: perfUrl.toString(),
  PERF_DATABASE_URL: perfUrl.toString(),
  PERF_TEST_CONFIRM: "RUN_LOCAL_1000_VU",
  PG_POOL_MAX: process.env.PERF_RELEASE_POOL_MAX ?? process.env.PG_POOL_MAX ?? "10",
};
if (process.env.RELEASE_PERF_REPORT_PATH) {
  skipStep("perf diagnostic profiles", "Full local profile supplied through RELEASE_PERF_REPORT_PATH");
  await useArtifactStep("full 1000 VU", process.env.RELEASE_PERF_REPORT_PATH);
} else if (process.env.RELEASE_SKIP_PERF === "1") {
  skipStep("perf diagnostic profiles", "RELEASE_SKIP_PERF=1");
  skipStep("full 1000 VU", "RELEASE_SKIP_PERF=1");
} else {
  await runStep("perf diagnostic profiles", "npm", ["run", "perf:diagnose"], perfEnv);
  await runStep("full 1000 VU", "npm", ["run", "perf:1000vu"], perfEnv);
}

const report = {
  result: results.some((item) => item.status === "FAIL") ? "FAIL" : "PASS",
  startedAt: new Date(startedAt).toISOString(),
  durationSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
  results,
};
await mkdir("artifacts/release", { recursive: true });
const reportPath = "artifacts/release/local-release-report.json";
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.table(results.map(({ name, status, durationSec }) => ({ name, status, durationSec })));
process.stdout.write(`[release] ${report.result}: ${reportPath}\n`);
if (report.result !== "PASS") process.exitCode = 1;
