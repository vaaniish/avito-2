"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const prisma_1 = require("./lib/prisma");
const http_observability_1 = require("./lib/http-observability");
const auth_routes_1 = require("./modules/auth/auth.routes");
const catalog_routes_1 = require("./modules/catalog/catalog.routes");
const profile_routes_1 = require("./modules/profile/profile.routes");
const partner_routes_1 = require("./modules/partner/partner.routes");
const admin_routes_1 = require("./modules/admin/admin.routes");
const public_routes_1 = require("./modules/public/public.routes");
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const app = (0, express_1.default)();
exports.app = app;
const appStartedAt = Date.now();
app.use((0, cors_1.default)({
    origin(origin, callback) {
        if (!origin || localhostOriginPattern.test(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
}));
app.use(express_1.default.json({
    limit: "12mb",
}));
app.use(http_observability_1.httpObservabilityMiddleware);
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
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
        res.json({
            ok: true,
            db: "up",
            dbLatencyMs: Math.round(durationMs * 100) / 100,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
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
        http: (0, http_observability_1.getHttpMetricsSnapshot)(),
        process: {
            pid: process.pid,
            rssBytes: process.memoryUsage().rss,
            heapUsedBytes: process.memoryUsage().heapUsed,
        },
        timestamp: new Date().toISOString(),
    });
});
app.use("/api/auth", auth_routes_1.authRouter);
app.use("/api/public", public_routes_1.publicRouter);
app.use("/api/catalog", catalog_routes_1.catalogRouter);
app.use("/api/profile", profile_routes_1.profileRouter);
app.use("/api/partner", partner_routes_1.partnerRouter);
app.use("/api/admin", admin_routes_1.adminRouter);
//# sourceMappingURL=app.js.map