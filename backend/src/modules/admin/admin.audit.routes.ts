import type { Router } from "express";
import { adminAuditRouter } from "./audit";

export function registerAdminAuditRoutes(adminRouter: Router) {
  adminRouter.use("/", adminAuditRouter);
}
