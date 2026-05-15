import type { Router } from "express";
import { adminUsersRouter } from "./users";

export function registerAdminUserRoutes(adminRouter: Router) {
  adminRouter.use("/", adminUsersRouter);
}
