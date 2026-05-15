import { Router } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { requireAdmin } from "../../common/http/admin-session";
import type {
  GetAdminFinanceAnalyticsService,
  ListAdminTransactionsService,
} from "../application/services/admin-finance.service";

export function createAdminFinanceRouter(deps: {
  services: {
    listAdminTransactions: ListAdminTransactionsService;
    getAdminFinanceAnalytics: GetAdminFinanceAnalyticsService;
  };
}) {
  const router = Router();

  router.get("/transactions", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(await deps.services.listAdminTransactions.execute());
    } catch (error) {
      console.error("Error fetching transactions:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/finance/analytics", async (req, res) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;
      res.json(
        await deps.services.getAdminFinanceAnalytics.execute(
          (req.query ?? {}) as Record<string, unknown>,
        ),
      );
    } catch (error) {
      console.error("Error fetching admin finance analytics:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
