import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseLocalDatabaseUrl, runPostgresTool } from "./postgres-cli.mjs";

if (process.env.RESTORE_CONFIRM !== "RECREATE_LOCAL_TEST_DATABASE") {
  throw new Error("Set RESTORE_CONFIRM=RECREATE_LOCAL_TEST_DATABASE");
}
const rawTargetUrl = process.env.RESTORE_DATABASE_URL;
if (!rawTargetUrl) throw new Error("RESTORE_DATABASE_URL is required");
const target = parseLocalDatabaseUrl(rawTargetUrl, "Restore");
if (!/(test|restore)/i.test(target.database)) throw new Error("Restore database name must contain test or restore");
const backupDir = path.resolve(process.env.BACKUP_DIR ?? "artifacts/backups");
let dumpPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!dumpPath) {
  const dumps = (await readdir(backupDir)).filter((name) => name.endsWith(".dump")).sort();
  if (dumps.length === 0) throw new Error("No backup dump found");
  dumpPath = path.join(backupDir, dumps[dumps.length - 1]);
}
const manifest = JSON.parse(await readFile(`${dumpPath}.json`, "utf8"));
const bytes = await readFile(dumpPath);
const checksum = createHash("sha256").update(bytes).digest("hex");
if (checksum !== manifest.sha256) throw new Error("Backup checksum mismatch");

await runPostgresTool(target, "dropdb", ["--if-exists", "--force", target.database]);
await runPostgresTool(target, "createdb", [target.database]);
await runPostgresTool(target, "pg_restore", ["--exit-on-error", "--no-owner", "--no-acl", "-d", target.database], {
  inputFile: dumpPath,
});

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, { stdio: "inherit", env: { ...process.env, DATABASE_URL: rawTargetUrl } });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`npm ${args.join(" ")} failed with code ${code}`)));
  });
}
await runNpm(["run", "db:migrate:deploy"]);
if (process.env.RESTORE_RUN_API_SMOKE !== "0") await runNpm(["run", "test:e2e:smoke"]);
process.stdout.write(`[db-restore] restored ${path.basename(dumpPath)} into ${target.database}; checksum verified\n`);
