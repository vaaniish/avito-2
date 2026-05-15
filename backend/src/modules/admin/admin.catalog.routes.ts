import type { Router } from "express";
import { adminCatalogRouter } from "./catalog";

export function registerAdminCatalogRoutes(adminRouter: Router) {
  adminRouter.use("/", adminCatalogRouter);
}
