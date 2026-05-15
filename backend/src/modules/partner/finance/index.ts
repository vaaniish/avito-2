import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import { GetPartnerFinanceAnalyticsService } from "./application/services/get-partner-finance-analytics.service";
import { GetPartnerFinanceQuartersService } from "./application/services/get-partner-finance-quarters.service";
import { createPartnerFinanceRouter } from "./http/partner-finance.router";
import { PartnerFinanceCommissionRepository } from "./infrastructure/repositories/partner-finance-commission.repository";
import { PartnerFinanceTransactionsRepository } from "./infrastructure/repositories/partner-finance-transactions.repository";

const transactionsRepository = new PartnerFinanceTransactionsRepository(prisma);
const commissionRepository = new PartnerFinanceCommissionRepository(prisma);

export const partnerFinanceRouter = createPartnerFinanceRouter({
  requireAnyRole,
  services: {
    getPartnerFinanceAnalytics: new GetPartnerFinanceAnalyticsService(
      transactionsRepository,
      commissionRepository,
    ),
    getPartnerFinanceQuarters: new GetPartnerFinanceQuartersService(
      transactionsRepository,
      commissionRepository,
    ),
  },
});
