import type { Router } from "express";
import { adminPromosRouter } from "./promos";

export function registerAdminPromoRoutes(adminRouter: Router) {
  adminRouter.use("/", adminPromosRouter);
}
