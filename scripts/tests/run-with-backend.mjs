import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3001";
const READY_TIMEOUT_MS = Number(process.env.BACKEND_READY_TIMEOUT_MS ?? "60000");

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createCommandError(command, code) {
  return new Error(`Command failed (${code}): ${command}`);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(createCommandError(`${command} ${args.join(" ")}`, code ?? "null"));
    });
  });
}

async function isBackendReady() {
  try {
    const response = await fetch(`${BASE_URL}/health/ready`);
    if (response.status !== 200) {
      return false;
    }
    const payload = await response.json();
    return payload?.ok === true;
  } catch {
    return false;
  }
}

async function waitForBackend() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    if (await isBackendReady()) {
      return;
    }
    await delay(1000);
  }
  throw new Error(`Backend did not become ready within ${READY_TIMEOUT_MS}ms (${BASE_URL})`);
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
  const separatorIndex = process.argv.indexOf("--");
  const commandArgs = separatorIndex >= 0 ? process.argv.slice(separatorIndex + 1) : process.argv.slice(2);
  invariant(commandArgs.length > 0, "Usage: node scripts/tests/run-with-backend.mjs -- <command> [args...]");

  const [command, ...args] = commandArgs;
  const backendAlreadyUp = await isBackendReady();
  let backendProcess = null;

  try {
    if (!backendAlreadyUp) {
      backendProcess = spawn("npm", ["run", "start:dev"], {
        stdio: "inherit",
        env: process.env,
      });
      await waitForBackend();
    }

    await runCommand(command, args);
  } finally {
    if (backendProcess) {
      await stopBackend(backendProcess);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
