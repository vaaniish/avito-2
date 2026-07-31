import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { assertRuntimeConfiguration, boundedPositiveInteger } from "./runtime-config";
import { logger } from "./logger";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; postgresPool?: Pool };
const databaseUrl = process.env.DATABASE_URL;

assertRuntimeConfiguration();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const configuredPoolMax = boundedPositiveInteger("PG_POOL_MAX", 10, 1, 100);
const pool = globalForPrisma.postgresPool ?? new Pool({
  connectionString: databaseUrl,
  max: configuredPoolMax,
  idleTimeoutMillis: boundedPositiveInteger("PG_POOL_IDLE_TIMEOUT_MS", 30_000, 1_000, 600_000),
  connectionTimeoutMillis: boundedPositiveInteger("PG_POOL_CONNECTION_TIMEOUT_MS", 5_000, 250, 60_000),
});

const adapter = new PrismaPg(pool, {
  disposeExternalPool: true,
  onPoolError(error) {
    logger.error("postgres_pool_idle_error", { error });
  },
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

export function getPostgresPoolSnapshot(): {
  configuredMax: number;
  total: number;
  idle: number;
  waiting: number;
} {
  return {
    configuredMax: configuredPoolMax,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.postgresPool = pool;
}
