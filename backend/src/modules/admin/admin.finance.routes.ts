import type { Router } from "express";
import { adminFinanceRouter } from "./finance";

export function registerAdminFinanceRoutes(adminRouter: Router) {
  adminRouter.use("/", adminFinanceRouter);
}
