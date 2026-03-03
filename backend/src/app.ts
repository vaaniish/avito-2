import cors from "cors";
import express from "express";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogRouter } from "./modules/catalog/catalog.routes";
import { profileRouter } from "./modules/profile/profile.routes";
import { partnerRouter } from "./modules/partner/partner.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { gamificationRouter } from "./modules/gamification/gamification.routes";

const localhostOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || localhostOriginPattern.test(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/catalog", catalogRouter);
app.use("/api/profile", profileRouter);
app.use("/api/partner", partnerRouter);
app.use("/api/admin", adminRouter);
app.use("/api/gamification", gamificationRouter);

// Backward compatibility for old frontend paths
app.use("/api", gamificationRouter);

export { app };
