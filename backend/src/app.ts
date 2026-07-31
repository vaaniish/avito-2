import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import path from "path";
import { timingSafeEqual } from "node:crypto";
import { getPostgresPoolSnapshot, prisma } from "./lib/prisma";
import { logger } from "./lib/logger";
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
  isRequestOriginAllowed,
  parseCorsAllowedOrigins,
  parseTrustProxySetting,
} from "./lib/http-security";
import { getAuthSessionContext } from "./lib/session";
import { authSessionService } from "./modules/auth/composition";
import { validateMutationRequest } from "./lib/api-validation";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { recommendationsRouter } from "./modules/recommendations";
import { profileRouter } from "./modules/profile/profile.routes";
import { partnerRouter } from "./modules/partner/partner.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { publicRouter } from "./modules/public/public.routes";
import { invalidateCatalogRuntimeCaches } from "./modules/catalog/catalog-runtime-cache";
import { getPartnerListingModerationSnapshot } from "./modules/partner/listings";

const app = express();
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
    credentials: true,
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
    limit: "42mb",
  }),
);
app.use(cookieParser());
app.use(httpObservabilityMiddleware);
app.use(validateMutationRequest);
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.path === "/api/profile/payments/yookassa/webhook") return next();
  void getAuthSessionContext(req)
    .then((context) => {
      if (!context) return next();
      if (!isRequestOriginAllowed(req, allowedCorsOrigins)) {
        res.status(403).json({ error: "Недоверенный источник запроса" });
        return;
      }
      if (!authSessionService.isCsrfTokenValid(context, req.header("x-csrf-token") ?? null)) {
        res.status(403).json({ error: "Invalid CSRF token" });
        return;
      }
      next();
    })
    .catch(next);
});
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
app.use((req, res, next) => {
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(req.method);
  const affectsCatalog = req.path.startsWith("/api/admin/catalog") ||
    req.path.startsWith("/api/partner/listings") ||
    /^\/api\/profile\/listings\/[^/]+\/review\/?$/.test(req.path);
  if (mutation && affectsCatalog) {
    res.once("finish", () => {
      if (res.statusCode < 400) invalidateCatalogRuntimeCaches();
    });
  }
  next();
});
app.use(
  "/media/seed",
  express.static(path.resolve(process.cwd(), "backend/data/seed-media")),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
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
    });
  } catch (error) {
    logger.error("readiness_probe_failed", { error });
    res.status(503).json({
      ok: false,
      db: "down",
    });
  }
});

app.get("/health/metrics", (req, res) => {
  const configured = process.env.METRICS_ACCESS_TOKEN?.trim();
  if (!configured) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const provided = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const left = Buffer.from(configured);
  const right = Buffer.from(provided);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.json({
    ok: true,
    http: getHttpMetricsSnapshot(),
    process: {
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
    },
    postgresPool: getPostgresPoolSnapshot(),
    backgroundModeration: getPartnerListingModerationSnapshot(),
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
