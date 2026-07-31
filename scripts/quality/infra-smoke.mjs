import "dotenv/config";
import { spawnSync } from "node:child_process";

const project = "avito-release-smoke";
const composeFile = "compose.production.local.yml";
const httpPort = process.env.INFRA_SMOKE_HTTP_PORT ?? "18080";
const env = {
  ...process.env,
  LOCAL_POSTGRES_USER: "avito_release_local",
  LOCAL_POSTGRES_PASSWORD: "local-release-smoke-password-2026",
  LOCAL_POSTGRES_DB: "avito_release_infra_test",
  LOCAL_HTTP_PORT: httpPort,
};
const compose = ["compose", "-p", project, "-f", composeFile];

function run(args, options = {}) {
  const result = spawnSync("docker", args, {
    env,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(" ")} failed with code ${result.status}: ${result.stderr?.trim() ?? ""}`);
  }
  return result.stdout?.trim() ?? "";
}

let failure;
try {
  if (process.env.INFRA_SMOKE_SKIP_BUILD !== "1") run([...compose, "build"]);
  run([...compose, "up", "-d"]);

  const response = await fetch(`http://127.0.0.1:${httpPort}/health/ready`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Nginx readiness returned HTTP ${response.status}`);
  const ready = await response.json();
  if (ready?.ok !== true) throw new Error("Nginx readiness payload is not healthy");

  const uid = run([...compose, "exec", "-T", "backend", "id", "-u"], { capture: true });
  if (uid === "0") throw new Error("Backend container is running as root");

  const dbContainer = run([...compose, "ps", "-q", "db"], { capture: true });
  if (!dbContainer) throw new Error("Database container was not created");
  const bindings = run(["inspect", dbContainer, "--format", "{{json .HostConfig.PortBindings}}"], { capture: true });
  if (bindings !== "{}") throw new Error(`PostgreSQL has published ports: ${bindings}`);

  process.stdout.write(`[infra-smoke] PASS; backend uid=${uid}, PostgreSQL has no host port\n`);
} catch (error) {
  failure = error;
  try { run([...compose, "logs", "--no-color"]); } catch { /* retain original failure */ }
} finally {
  try { run([...compose, "down", "--volumes", "--remove-orphans"]); } catch (error) {
    failure ??= error;
  }
}

if (failure) throw failure;
