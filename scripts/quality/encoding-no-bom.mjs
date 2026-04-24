import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const mode = process.argv.includes("--fix") ? "fix" : "check";
const cwd = process.cwd();

const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".json",
  ".css",
  ".scss",
  ".html",
  ".md",
  ".txt",
  ".yml",
  ".yaml",
  ".env",
  ".sql",
  ".prisma",
  ".py",
  ".sh",
  ".ps1",
  ".bat",
  ".cmd",
  ".xml",
  ".svg",
]);

const textBasenames = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  "Dockerfile",
  "LICENSE",
  "README",
  "README.md",
]);

function isTextFile(filePath) {
  const base = path.basename(filePath);
  if (textBasenames.has(base)) return true;
  return textExtensions.has(path.extname(filePath).toLowerCase());
}

function listTrackedFiles() {
  const raw = execFileSync("git", ["ls-files", "-z"], {
    cwd,
    encoding: "buffer",
  });
  return raw
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((relative) => path.join(cwd, relative));
}

function hasUtf8Bom(buffer) {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xef &&
    buffer[1] === 0xbb &&
    buffer[2] === 0xbf
  );
}

const filesWithBom = [];

for (const absolutePath of listTrackedFiles()) {
  if (!isTextFile(absolutePath)) continue;
  const data = fs.readFileSync(absolutePath);
  if (!hasUtf8Bom(data)) continue;
  filesWithBom.push(absolutePath);

  if (mode === "fix") {
    fs.writeFileSync(absolutePath, data.subarray(3));
  }
}

if (filesWithBom.length === 0) {
  console.log("OK: no UTF-8 BOM found in tracked text files.");
  process.exit(0);
}

for (const file of filesWithBom) {
  console.log(path.relative(cwd, file));
}

if (mode === "fix") {
  console.log(`Removed UTF-8 BOM from ${filesWithBom.length} file(s).`);
  process.exit(0);
}

console.error(`Found UTF-8 BOM in ${filesWithBom.length} file(s).`);
process.exit(1);
