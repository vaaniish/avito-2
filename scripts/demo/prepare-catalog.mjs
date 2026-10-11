import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("../../", import.meta.url));
const archiveDir = path.join(root, "data/archive");
const manifest = JSON.parse(await readFile(path.join(archiveDir, "catalog-reference.manifest.json"), "utf8"));
const compressed = await readFile(path.join(archiveDir, "catalog-reference.json.gz"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (sha256(compressed) !== manifest.compressedSha256) throw new Error("Catalog archive checksum mismatch");
const bytes = gunzipSync(compressed);
if (bytes.length !== manifest.byteSize || sha256(bytes) !== manifest.sha256) {
  throw new Error("Unpacked catalog checksum mismatch");
}
const destination = path.join(root, "data/catalog-reference/generated/catalog-reference.json");
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, bytes);
const reportCompressed = await readFile(path.join(archiveDir, "catalog-reference-report.json.gz"));
if (sha256(reportCompressed) !== manifest.report.compressedSha256) throw new Error("Catalog report archive checksum mismatch");
const report = gunzipSync(reportCompressed);
if (report.length !== manifest.report.byteSize || sha256(report) !== manifest.report.sha256) {
  throw new Error("Catalog report checksum mismatch");
}
await writeFile(path.join(path.dirname(destination), "catalog-reference-report.json"), report);
console.log(`[demo] catalog restored: ${manifest.items} branches; SHA-256 verified`);
