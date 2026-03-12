"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const auth_routes_1 = require("./modules/auth/auth.routes");
const catalog_routes_1 = require("./modules/catalog/catalog.routes");
const profile_routes_1 = require("./modules/profile/profile.routes");
const partner_routes_1 = require("./modules/partner/partner.routes");
const admin_routes_1 = require("./modules/admin/admin.routes");
const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const app = (0, express_1.default)();
exports.app = app;
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
app.get("/health", (_req, res) => {
    res.json({ ok: true });
});
app.use("/api/auth", auth_routes_1.authRouter);
app.use("/api/catalog", catalog_routes_1.catalogRouter);
app.use("/api/profile", profile_routes_1.profileRouter);
app.use("/api/partner", partner_routes_1.partnerRouter);
app.use("/api/admin", admin_routes_1.adminRouter);
//# sourceMappingURL=app.js.map