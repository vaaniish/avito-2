import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

type HttpMetricsState = {
  startedAt: number;
  totalRequests: number;
  responses2xx: number;
  responses4xx: number;
  responses5xx: number;
  slowRequests: number;
};

type HttpMetricsSnapshot = {
  startedAt: string;
  uptimeSec: number;
  totalRequests: number;
  responses2xx: number;
  responses4xx: number;
  responses5xx: number;
  slowRequests: number;
};

const SLOW_REQUEST_THRESHOLD_MS = parsePositiveInt(
  process.env.HTTP_SLOW_REQUEST_MS,
  1200,
);

const metrics: HttpMetricsState = {
  startedAt: Date.now(),
  totalRequests: 0,
  responses2xx: 0,
  responses4xx: 0,
  responses5xx: 0,
  slowRequests: 0,
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function resolveRequestId(req: Request): string {
  const headerValue = req.header("x-request-id")?.trim();
  if (!headerValue) {
    return randomUUID();
  }
  return headerValue.slice(0, 120);
}

function sanitizeIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}

function reportRequest(params: {
  requestId: string;
  req: Request;
  statusCode: number;
  durationMs: number;
}): void {
  const level =
    params.statusCode >= 500
      ? "error"
      : params.durationMs >= SLOW_REQUEST_THRESHOLD_MS
        ? "warn"
        : "info";

  const payload = {
    level,
    msg: "http_request",
    requestId: params.requestId,
    method: params.req.method,
    path: params.req.originalUrl.split("?")[0] ?? params.req.path,
    statusCode: params.statusCode,
    durationMs: params.durationMs,
    ip: sanitizeIp(params.req),
    userAgent: params.req.header("user-agent") ?? null,
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  console.log(serialized);
}

export function httpObservabilityMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(req);
  res.setHeader("x-request-id", requestId);
  res.locals.requestId = requestId;

  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    metrics.totalRequests += 1;
    if (res.statusCode >= 500) {
      metrics.responses5xx += 1;
    } else if (res.statusCode >= 400) {
      metrics.responses4xx += 1;
    } else if (res.statusCode >= 200) {
      metrics.responses2xx += 1;
    }
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS) {
      metrics.slowRequests += 1;
    }

    reportRequest({
      requestId,
      req,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
    });
  });

  next();
}

export function getHttpMetricsSnapshot(): HttpMetricsSnapshot {
  return {
    startedAt: new Date(metrics.startedAt).toISOString(),
    uptimeSec: Math.floor((Date.now() - metrics.startedAt) / 1000),
    totalRequests: metrics.totalRequests,
    responses2xx: metrics.responses2xx,
    responses4xx: metrics.responses4xx,
    responses5xx: metrics.responses5xx,
    slowRequests: metrics.slowRequests,
  };
}
