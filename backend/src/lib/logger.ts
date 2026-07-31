import { AsyncLocalStorage } from "node:async_hooks";

type LogLevel = "info" | "warn" | "error";
type Context = { requestId: string };
const context = new AsyncLocalStorage<Context>();
const REDACT_KEY = /(authorization|cookie|token|secret|password|api.?key|database.?url|connection.?string|bank|bic|correspondent|settlement.?account|tax.?id|recipient)/i;

export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    const databaseUrl = process.env.DATABASE_URL;
    return databaseUrl ? value.split(databaseUrl).join("[REDACTED_DATABASE_URL]") : value;
  }
  if (value instanceof Error) return { name: value.name, message: sanitizeLogValue(value.message) };
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => sanitizeLogValue(entry, seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      REDACT_KEY.test(key) ? "[REDACTED]" : sanitizeLogValue(entry, seen),
    ]),
  );
}

function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const payload = sanitizeLogValue({
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: context.getStore()?.requestId,
    ...fields,
  });
  const line = `${JSON.stringify(payload)}\n`;
  (level === "error" ? process.stderr : process.stdout).write(line);
}

export const logger = {
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};

export function runWithRequestContext<T>(requestId: string, callback: () => T): T {
  return context.run({ requestId }, callback);
}

export function installStructuredConsoleBridge(): void {
  const map = (level: LogLevel) => (...args: unknown[]) => {
    write(level, "legacy_console", { arguments: args });
  };
  console.log = map("info");
  console.warn = map("warn");
  console.error = map("error");
}
