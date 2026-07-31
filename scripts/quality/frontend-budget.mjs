import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const assetsDir = path.resolve("dist/frontend/assets");
const entries = await readdir(assetsDir);
const failures = [];
for (const name of entries) {
  const size = (await stat(path.join(assetsDir, name))).size;
  if (name.startsWith("index-") && name.endsWith(".js") && size > 500 * 1024) {
    failures.push(`${name} exceeds the 500 KiB entry budget (${size} bytes)`);
  }
  if (name.startsWith("slide-") && /\.(png|webp)$/.test(name) && size > 500 * 1024) {
    failures.push(`${name} exceeds the 500 KiB hero budget (${size} bytes)`);
  }
}
if (failures.length > 0) throw new Error(failures.join("\n"));
process.stdout.write("[frontend-budget] PASS\n");
