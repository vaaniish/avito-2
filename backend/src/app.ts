import cors from "cors";
import express from "express";
import helmet from "helmet";
import path from "path";
import { prisma } from "./lib/prisma";
import {
  getHttpMetricsSnapshot,
  httpObservabilityMiddleware,
} from "./lib/http-observability";
import {
  applyToMutationMethods,
  getAdminWriteRateLimit,
  getAuthLoginRateLimit,
  getAuthSignupRateLimit,
  getCheckoutRateLimit,
  getPartnerWriteRateLimit,
  isCorsOriginAllowed,
  parseCorsAllowedOrigins,
  parseTrustProxySetting,
} from "./lib/http-security";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { recommendationsRouter } from "./modules/recommendations";
import { profileRouter } from "./modules/profile/profile.routes";
import { partnerRouter } from "./modules/partner/partner.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { publicRouter } from "./modules/public/public.routes";

const app = express();
const appStartedAt = Date.now();
const allowedCorsOrigins = parseCorsAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

app.set("trust proxy", parseTrustProxySetting(process.env.TRUST_PROXY));

app.use(
  cors({
    origin(origin, callback) {
      if (isCorsOriginAllowed(origin, allowedCorsOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  }),
);
app.use(
  express.json({
    // Listing images can be sent as data URLs from the partner form.
    limit: "12mb",
  }),
);
app.use(httpObservabilityMiddleware);
app.use("/api/auth/login", getAuthLoginRateLimit());
app.use("/api/auth/signup", getAuthSignupRateLimit());
app.use("/api/profile/orders", applyToMutationMethods(getCheckoutRateLimit()));
app.use("/api/partner/orders", applyToMutationMethods(getPartnerWriteRateLimit()));
app.use("/api/partner/questions", applyToMutationMethods(getPartnerWriteRateLimit()));
app.use(
  "/api/partner/payout-profile",
  applyToMutationMethods(getPartnerWriteRateLimit()),
);
app.use("/api/admin/users", applyToMutationMethods(getAdminWriteRateLimit()));
app.use("/api/admin/complaints", applyToMutationMethods(getAdminWriteRateLimit()));
app.use(
  "/api/admin/partnership-requests",
  applyToMutationMethods(getAdminWriteRateLimit()),
);
app.use(
  "/api/admin/kyc-requests",
  applyToMutationMethods(getAdminWriteRateLimit()),
);
app.use(
  "/media/seed",
  express.static(path.resolve(process.cwd(), "backend/data/seed-media")),
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    uptimeSec: Math.floor((Date.now() - appStartedAt) / 1000),
    timestamp: new Date().toISOString(),
  });
});

app.get("/health/ready", async (_req, res) => {
  const startedAt = process.hrtime.bigint();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    res.json({
      ok: true,
      db: "up",
      dbLatencyMs: Math.round(durationMs * 100) / 100,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Readiness probe failed:", error);
    res.status(503).json({
      ok: false,
      db: "down",
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/health/metrics", (_req, res) => {
  res.json({
    ok: true,
    http: getHttpMetricsSnapshot(),
    process: {
      pid: process.pid,
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
    },
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/public", publicRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/partner", partnerRouter);
app.use("/api/admin", adminRouter);

export { app };
