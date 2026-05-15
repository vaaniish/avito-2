import type { Router } from "express";
import { partnerFinanceRouter } from "./finance";

export function registerPartnerFinanceRoutes(router: Router): void {
  router.use("/", partnerFinanceRouter);
}
