import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import {
  parseFinanceDateRangeInput,
  parseFinanceOrderStatus,
  parseFinanceReportLimit,
  parseFinanceReportOffset,
  parseFinanceTransactionStatus,
} from "../../../finance/domain/finance.helpers";
import type { GetPartnerFinanceAnalyticsService } from "../application/services/get-partner-finance-analytics.service";
import type { GetPartnerFinanceQuartersService } from "../application/services/get-partner-finance-quarters.service";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createPartnerFinanceRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  services: {
    getPartnerFinanceAnalytics: GetPartnerFinanceAnalyticsService;
    getPartnerFinanceQuarters: GetPartnerFinanceQuartersService;
  };
}) {
  const router = Router();
  const roles = ["SELLER", "ADMIN"];

  router.get("/finance/analytics", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { from, to, groupBy } = parseFinanceDateRangeInput({
        from: req.query.from,
        to: req.query.to,
        groupBy: req.query.groupBy,
      });
      const transactionStatus = parseFinanceTransactionStatus(
        req.query.transactionStatus,
      );
      const orderStatus = parseFinanceOrderStatus(req.query.orderStatus);
      const search =
        typeof req.query.search === "string"
          ? req.query.search.trim().toLowerCase()
          : "";
      const requestedQuarterKey =
        typeof req.query.quarterKey === "string" ? req.query.quarterKey.trim() : "";
      const reportLimit = parseFinanceReportLimit(req.query.reportLimit);
      const reportOffset = parseFinanceReportOffset(req.query.reportOffset);

      res.json(
        await deps.services.getPartnerFinanceAnalytics.execute({
          sellerId: session.user.id,
          from,
          to,
          groupBy,
          transactionStatus,
          orderStatus,
          search,
          requestedQuarterKey,
          reportLimit,
          reportOffset,
        }),
      );
    } catch (error) {
      console.error("Error fetching partner finance analytics:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/finance/quarters", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const requestedYear = Number(req.query.year);
      const currentYear = new Date().getUTCFullYear();
      const selectedYear =
        Number.isInteger(requestedYear) &&
        requestedYear >= 2020 &&
        requestedYear <= currentYear + 1
          ? requestedYear
          : currentYear;
      const requestedQuarterKey =
        typeof req.query.quarterKey === "string" ? req.query.quarterKey.trim() : "";

      res.json(
        await deps.services.getPartnerFinanceQuarters.execute({
          sellerId: session.user.id,
          selectedYear,
          requestedQuarterKey,
          currentYear,
        }),
      );
    } catch (error) {
      console.error("Error fetching partner finance quarters:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
