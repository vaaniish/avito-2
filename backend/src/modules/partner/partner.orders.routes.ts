import type { Router } from "express";
import { partnerOrdersRouter } from "./orders";

export function registerPartnerOrdersRoutes(router: Router): void {
  router.use("/", partnerOrdersRouter);
}
