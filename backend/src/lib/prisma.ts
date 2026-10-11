import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { assertRuntimeConfiguration, boundedPositiveInteger } from "./runtime-config";
import { logger } from "./logger";

const POOL_WAIT_SAMPLE_LIMIT = 4_096;
const poolWaitSamplesMs: number[] = [];

function recordPoolWait(durationMs: number): void {
  poolWaitSamplesMs.push(durationMs);
  if (poolWaitSamplesMs.length > POOL_WAIT_SAMPLE_LIMIT) {
    poolWaitSamplesMs.splice(0, poolWaitSamplesMs.length - POOL_WAIT_SAMPLE_LIMIT);
  }
}

function percentile(values: number[], value: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1));
  return sorted[index] ?? 0;
}

function instrumentPoolConnect(pool: Pool): void {
  const marker = pool as Pool & { __waitInstrumented?: boolean };
  if (marker.__waitInstrumented) return;
  marker.__waitInstrumented = true;
  const originalConnect = pool.connect.bind(pool) as any;
  (pool as any).connect = (callback?: (...args: any[]) => void) => {
    const startedAt = process.hrtime.bigint();
    const finish = () => {
      recordPoolWait(Number(process.hrtime.bigint() - startedAt) / 1_000_000);
    };
    if (typeof callback === "function") {
      return originalConnect((error: unknown, client: unknown, done: unknown) => {
        finish();
        callback(error, client, done);
      });
    }
    return originalConnect().then((client: unknown) => {
      finish();
      return client;
    });
  };
}

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
instrumentPoolConnect(pool);

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
  acquireWaitMs: { p50: number; p95: number; p99: number; max: number; samples: number };
} {
  const rounded = (value: number) => Math.round(value * 100) / 100;
  return {
    configuredMax: configuredPoolMax,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    acquireWaitMs: {
      p50: rounded(percentile(poolWaitSamplesMs, 50)),
      p95: rounded(percentile(poolWaitSamplesMs, 95)),
      p99: rounded(percentile(poolWaitSamplesMs, 99)),
      max: rounded(Math.max(0, ...poolWaitSamplesMs)),
      samples: poolWaitSamplesMs.length,
    },
  };
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.postgresPool = pool;
}
