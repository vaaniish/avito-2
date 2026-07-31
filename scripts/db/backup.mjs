import "dotenv/config";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseLocalDatabaseUrl, runPostgresTool } from "./postgres-cli.mjs";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) throw new Error("DATABASE_URL is required");
const target = parseLocalDatabaseUrl(rawUrl, "Backup");
const backupDir = path.resolve(process.env.BACKUP_DIR ?? "artifacts/backups");
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 7);
if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
  throw new Error("BACKUP_RETENTION_DAYS must be an integer between 1 and 3650");
}

await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dumpPath = path.join(backupDir, `${target.database}_${stamp}.dump`);
await runPostgresTool(target, "pg_dump", ["-d", target.database, "--format=custom", "--no-owner", "--no-acl"], {
  outputFile: dumpPath,
});
const bytes = await readFile(dumpPath);
const manifest = {
  version: 1,
  database: target.database,
  createdAt: new Date().toISOString(),
  file: path.basename(dumpPath),
  byteSize: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
await writeFile(`${dumpPath}.json`, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
for (const name of await readdir(backupDir)) {
  if (!name.endsWith(".dump")) continue;
  const candidate = path.join(backupDir, name);
  if ((await stat(candidate)).mtimeMs >= cutoff) continue;
  await unlink(candidate);
  await unlink(`${candidate}.json`).catch(() => undefined);
}
process.stdout.write(`[db-backup] created ${path.relative(process.cwd(), dumpPath)} (${manifest.byteSize} bytes, sha256 ${manifest.sha256})\n`);
