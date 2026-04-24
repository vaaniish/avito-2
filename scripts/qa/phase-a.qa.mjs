import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";

function createCommandError(command, code) {
  return new Error(`Command failed (${code}): ${command}`);
}

function runCommand(command, args, envOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: {
        ...process.env,
        ...envOverrides,
      },
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(createCommandError(`${command} ${args.join(" ")}`, code ?? "null"));
    });
  });
}

async function isBackendHealthy() {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    if (response.status !== 200) {
      return false;
    }
    const body = await response.json();
    return body?.ok === true;
  } catch {
    return false;
  }
}

async function waitForBackend(timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isBackendHealthy()) {
      return;
    }
    await delay(1000);
  }
  throw new Error(`Backend did not become healthy within ${timeoutMs}ms (${BASE_URL})`);
}

function stopBackend(child) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    child.once("close", finish);
    child.kill("SIGINT");

    setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      finish();
    }, 6000);
  });
}

async function main() {
  const backendAlreadyUp = await isBackendHealthy();
  let backendProcess = null;

  try {
    console.log("\n[Phase A QA] db:migrate:deploy");
    await runCommand("npm", ["run", "db:migrate:deploy"]);

    console.log("\n[Phase A QA] db:seed");
    await runCommand("npm", ["run", "db:seed"]);

    console.log("\n[Phase A QA] unit tests");
    await runCommand("npm", ["run", "test:unit"]);

    console.log("\n[Phase A QA] integration tests");
    await runCommand("npm", ["run", "test:integration"]);

    console.log("\n[Phase A QA] ci:preflight:prod-auth");
    await runCommand("npm", ["run", "ci:preflight:prod-auth"], {
      SESSION_TOKEN_SECRET:
        process.env.SESSION_TOKEN_SECRET ?? "abcdefghijklmnopqrstuvwxyz012345",
    });

    console.log("\n[Phase A QA] build");
    await runCommand("npm", ["run", "build"]);

    if (!backendAlreadyUp) {
      console.log("\n[Phase A QA] start backend");
      backendProcess = spawn("npm", ["run", "start:dev"], {
        stdio: "inherit",
        env: process.env,
      });
      await waitForBackend(60_000);
    } else {
      console.log("\n[Phase A QA] backend already running, reusing existing process");
    }

    console.log("\n[Phase A QA] phase-a e2e");
    await runCommand("npm", ["run", "test:phasea:e2e"]);

    console.log("\n[Phase A QA] PASSED");
  } finally {
    if (backendProcess) {
      console.log("\n[Phase A QA] stop backend");
      await stopBackend(backendProcess);
    }
  }
}

main().catch((error) => {
  console.error("\n[Phase A QA] FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
