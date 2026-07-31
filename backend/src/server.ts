import "dotenv/config";
import type { Server } from "node:http";
import { app } from "./app";
import { getActiveHttpRequestCount } from "./lib/http-observability";
import { installStructuredConsoleBridge, logger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { assertRuntimeConfiguration, boundedPositiveInteger } from "./lib/runtime-config";
import { startRecommendationsWorker, stopRecommendationsWorker } from "./modules/recommendations";
import { stopPartnerListingModerationWorker } from "./modules/partner/listings";

const PORT = Number(process.env.PORT ?? 3001);
let server: Server | null = null;
let shutdownPromise: Promise<void> | null = null;

async function assertNoProductionDemoData(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  const demo = await prisma.appUser.findFirst({
    where: {
      OR: [
        { public_id: { in: ["ADM-001", "BUY-001", "SLR-001"] } },
        { email: { endsWith: "@ecomm.local", mode: "insensitive" } },
      ],
    },
    select: { public_id: true },
  });
  if (demo) throw new Error("Production database contains known demo accounts");
}

function closeHttpServer(): Promise<void> {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
}

function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    const timeoutMs = boundedPositiveInteger("SHUTDOWN_TIMEOUT_MS", 10_000, 1_000, 60_000);
    logger.warn("shutdown_started", {
      reason,
      activeRequests: getActiveHttpRequestCount(),
      timeoutMs,
    });
    let timeout: NodeJS.Timeout | undefined;
    const deadline = new Promise<{ kind: "timeout" }>((resolve) => {
      timeout = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
    });
    const graceful = Promise.all([
      closeHttpServer(),
      stopRecommendationsWorker(),
      stopPartnerListingModerationWorker(),
    ]).then(async () => {
      await prisma.$disconnect();
      return { kind: "complete" as const };
    }).catch((error) => ({ kind: "error" as const, error }));
    const result = await Promise.race([graceful, deadline]);
    if (timeout) clearTimeout(timeout);
    if (result.kind === "timeout") {
      logger.error("shutdown_timeout", { activeRequests: getActiveHttpRequestCount() });
      server?.closeAllConnections();
      exitCode = 1;
    } else if (result.kind === "error") {
      logger.error("shutdown_failed", { error: result.error });
      server?.closeAllConnections();
      exitCode = 1;
    } else {
      logger.info("shutdown_complete");
    }
    process.exit(exitCode);
  })();
  return shutdownPromise;
}

async function main(): Promise<void> {
  assertRuntimeConfiguration();
  installStructuredConsoleBridge();
  await assertNoProductionDemoData();
  startRecommendationsWorker();
  server = app.listen(PORT, () => {
    logger.info("backend_started", { port: PORT });
  });
}

process.on("SIGINT", () => void shutdown("SIGINT", 0));
process.on("SIGTERM", () => void shutdown("SIGTERM", 0));
process.on("uncaughtException", (error) => {
  logger.error("uncaught_exception", { error });
  void shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (error) => {
  logger.error("unhandled_rejection", { error });
  void shutdown("unhandledRejection", 1);
});

void main().catch((error) => {
  logger.error("startup_failed", { error });
  void shutdown("startupFailure", 1);
});
