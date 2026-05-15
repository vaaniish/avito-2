import type { Router } from "express";
import { partnerDraftsRouter } from "./drafts";

export function registerPartnerDraftRoutes(router: Router): void {
  router.use("/", partnerDraftsRouter);
}
