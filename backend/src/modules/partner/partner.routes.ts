import { Router } from "express";
import { registerPartnerDraftRoutes } from "./partner.drafts.routes";
import { registerPartnerFinanceRoutes } from "./partner.finance.routes";
import { partnerListingsRouter } from "./partner.listings.routes";
import { registerPartnerOrdersRoutes } from "./partner.orders.routes";
import { registerPartnerPayoutRoutes } from "./partner.payout.routes";
import { registerPartnerQuestionsRoutes } from "./partner.questions.routes";

const partnerRouter = Router();

partnerRouter.use("/", partnerListingsRouter);
registerPartnerDraftRoutes(partnerRouter);
registerPartnerPayoutRoutes(partnerRouter);
registerPartnerFinanceRoutes(partnerRouter);
registerPartnerOrdersRoutes(partnerRouter);
registerPartnerQuestionsRoutes(partnerRouter);

export { partnerRouter };
