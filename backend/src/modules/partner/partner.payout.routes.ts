import type { Router } from "express";
import { partnerPayoutRouter } from "./payout";

export function registerPartnerPayoutRoutes(router: Router): void {
  router.use("/", partnerPayoutRouter);
}
