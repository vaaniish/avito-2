import type { Router } from "express";
import { adminListingsRouter } from "./listings";

export function registerAdminListingRoutes(adminRouter: Router) {
  adminRouter.use("/", adminListingsRouter);
}
