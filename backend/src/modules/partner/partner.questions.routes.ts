import type { Router } from "express";
import { partnerQuestionsRouter } from "./questions";

export function registerPartnerQuestionsRoutes(router: Router): void {
  router.use("/", partnerQuestionsRouter);
}
