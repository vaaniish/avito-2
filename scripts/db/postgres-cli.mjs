import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";

export function parseLocalDatabaseUrl(raw, purpose) {
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error(`${purpose} is restricted to a local PostgreSQL server`);
  }
  return {
    host: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.port || "5432",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
  };
}

function hasNativeTool(name) {
  return spawnSync("sh", ["-c", `command -v ${name}`], { stdio: "ignore" }).status === 0;
}

export function postgresCommand(target, tool, args) {
  if (hasNativeTool(tool)) {
    return {
      command: tool,
      args: ["-h", target.host, "-p", target.port, "-U", target.user, ...args],
      env: { ...process.env, PGPASSWORD: target.password },
    };
  }
  return {
    command: "docker",
    args: ["compose", "exec", "-T", "db", tool, "-U", target.user, ...args],
    env: process.env,
  };
}

export function runPostgresTool(target, tool, args, options = {}) {
  const invocation = postgresCommand(target, tool, args);
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      env: invocation.env,
      stdio: [options.inputFile ? "pipe" : "ignore", options.outputFile ? "pipe" : "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    if (options.outputFile) child.stdout.pipe(createWriteStream(options.outputFile));
    if (options.inputFile) {
      import("node:fs").then(({ createReadStream }) => createReadStream(options.inputFile).pipe(child.stdin));
    }
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${tool} failed with code ${code}: ${stderr.trim()}`));
    });
  });
}
