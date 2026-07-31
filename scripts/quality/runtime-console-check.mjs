import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("backend/src");
const loggerFile = path.join(root, "lib/logger.ts");
const write = process.argv.includes("--write");

async function listTypeScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(target);
    return entry.isFile() && target.endsWith(".ts") ? [target] : [];
  }));
  return nested.flat();
}

function eventName(node, sourceFile, level) {
  const first = node.arguments[0];
  if (first && ts.isStringLiteralLike(first)) {
    const normalized = first.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 100);
    if (normalized) return normalized;
  }
  return `runtime_${level}`;
}

function replacementFor(node, sourceFile, level) {
  const event = eventName(node, sourceFile, level);
  const firstIsMessage = node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]);
  const details = node.arguments.slice(firstIsMessage ? 1 : 0).map((argument) => argument.getText(sourceFile));
  if (details.length === 0) return `logger.${level}(${JSON.stringify(event)})`;
  if (details.length === 1 && /^[A-Za-z_$][\w$]*$/.test(details[0])) {
    return `logger.${level}(${JSON.stringify(event)}, { ${details[0]} })`;
  }
  return `logger.${level}(${JSON.stringify(event)}, { details: [${details.join(", ")}] })`;
}

function loggerImport(file) {
  let relative = path.relative(path.dirname(file), loggerFile).replaceAll(path.sep, "/").replace(/\.ts$/, "");
  if (!relative.startsWith(".")) relative = `./${relative}`;
  return `import { logger } from ${JSON.stringify(relative)};\n`;
}

async function inspectFile(file) {
  if (file === loggerFile) return { file, calls: [], next: null };
  const source = await fs.readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "console" &&
        ["log", "warn", "error"].includes(node.expression.name.text)) {
      calls.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        replacement: replacementFor(node, sourceFile, node.expression.name.text === "log" ? "info" : node.expression.name.text),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (calls.length === 0) return { file, calls, next: null };
  let next = source;
  for (const call of calls.sort((left, right) => right.start - left.start)) {
    next = `${next.slice(0, call.start)}${call.replacement}${next.slice(call.end)}`;
  }
  if (!/import\s*\{[^}]*\blogger\b[^}]*\}\s*from\s*["'][^"']*lib\/logger["']/.test(next)) {
    next = `${loggerImport(file)}${next}`;
  }
  return { file, calls, next };
}

const files = await listTypeScriptFiles(root);
const results = await Promise.all(files.map(inspectFile));
const violations = results.filter((result) => result.calls.length > 0);

if (write) {
  await Promise.all(violations.map((result) => fs.writeFile(result.file, result.next, "utf8")));
  process.stdout.write(`[runtime-console] replaced ${violations.reduce((sum, result) => sum + result.calls.length, 0)} calls in ${violations.length} files\n`);
} else if (violations.length > 0) {
  process.stderr.write(`[runtime-console] direct console calls remain in:\n${violations.map((result) => `- ${path.relative(process.cwd(), result.file)}`).join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("[runtime-console] PASS\n");
}
