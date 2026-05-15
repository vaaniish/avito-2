import type { Router } from "express";
import { adminCommissionsRouter } from "./commissions";

export function registerAdminCommissionRoutes(adminRouter: Router) {
  adminRouter.use("/", adminCommissionsRouter);
}
