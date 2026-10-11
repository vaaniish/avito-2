import { spawn } from "node:child_process";

const REQUIRED_PASSES = 3;

function runPass(index) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`[perf-triple] starting pass ${index}/${REQUIRED_PASSES}\n`);
    const child = spawn("npm", ["run", "perf:1000vu"], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

for (let index = 1; index <= REQUIRED_PASSES; index += 1) {
  const exitCode = await runPass(index);
  if (exitCode !== 0) {
    throw new Error(`1000 VU acceptance failed on pass ${index}/${REQUIRED_PASSES}`);
  }
}

process.stdout.write(`[perf-triple] ${REQUIRED_PASSES}/${REQUIRED_PASSES} consecutive passes completed\n`);
