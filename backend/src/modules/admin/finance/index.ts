import { prisma } from "../../../lib/prisma";
import {
  GetAdminFinanceAnalyticsService,
  ListAdminTransactionsService,
} from "./application/services/admin-finance.service";
import { createAdminFinanceRouter } from "./http/admin-finance.router";
import { AdminFinanceRepository } from "./infrastructure/repositories/admin-finance.repository";

const repository = new AdminFinanceRepository(prisma);

export const adminFinanceRouter = createAdminFinanceRouter({
  services: {
    listAdminTransactions: new ListAdminTransactionsService(repository),
    getAdminFinanceAnalytics: new GetAdminFinanceAnalyticsService(repository),
  },
});
