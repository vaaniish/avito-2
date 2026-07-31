import "dotenv/config";
import { spawn } from "node:child_process";
import { parseLocalDatabaseUrl, runPostgresTool } from "./postgres-cli.mjs";

const sourceUrl = new URL(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/avito-db-dev");
const database = process.env.CLEAN_MIGRATION_DATABASE ?? "avito_migration_test";

if (!/(test|migration)/i.test(database)) {
  throw new Error("Clean migration database name must contain test or migration");
}

sourceUrl.pathname = `/${database}`;
const targetUrl = sourceUrl.toString();
const target = parseLocalDatabaseUrl(targetUrl, "Clean migration test");

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("npm", args, {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: targetUrl },
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve()
      : reject(new Error(`npm ${args.join(" ")} failed with code ${code}`)));
  });
}

await runPostgresTool(target, "dropdb", ["--if-exists", "--force", database]);
await runPostgresTool(target, "createdb", [database]);
await runNpm(["run", "db:migrate:deploy"]);
await runNpm(["exec", "--", "prisma", "migrate", "status", "--schema", "backend/prisma/schema.prisma"]);

process.stdout.write(`[db-migration-test] all migrations applied to ${database}\n`);
