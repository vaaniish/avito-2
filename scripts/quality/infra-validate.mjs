import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const dockerfile = await readFile("Dockerfile", "utf8");
const compose = await readFile("compose.production.local.yml", "utf8");
const nginx = await readFile("infra/nginx/default.conf.template", "utf8");
const databaseService = compose.split("\n  migrate:")[0] ?? compose;

const checks = [
  [dockerfile.includes("USER node"), "backend image must run as node"],
  [dockerfile.includes("AS migrate"), "migration target is required"],
  [!databaseService.includes("\n    ports:"), "database must not publish ports"],
  [compose.includes("read_only: true"), "backend filesystem must be read-only"],
  [nginx.includes("proxy_buffering off"), "SSE-compatible proxy buffering setting is required"],
  [nginx.includes("try_files $uri $uri/ /index.html"), "SPA fallback is required"],
];
for (const [ok, message] of checks) {
  if (!ok) throw new Error(message);
}

const result = spawnSync("docker", ["compose", "-f", "compose.production.local.yml", "config"], {
  encoding: "utf8",
  env: {
    ...process.env,
    LOCAL_POSTGRES_USER: "infra_test_user",
    LOCAL_POSTGRES_PASSWORD: "infra-unique-test-password",
    LOCAL_POSTGRES_DB: "avito_infra_test",
  },
});
if (result.error?.code === "ENOENT") {
  process.stdout.write("[infra] static PASS; Docker CLI unavailable, compose config skipped\n");
} else if (result.status !== 0) {
  throw new Error(`docker compose config failed: ${result.stderr.trim()}`);
} else {
  process.stdout.write("[infra] PASS\n");
}
