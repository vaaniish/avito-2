import { Router } from "express";
import { registerAdminAuditRoutes } from "./admin.audit.routes";
import { registerAdminCatalogRoutes } from "./admin.catalog.routes";
import { registerAdminCatalogSuggestionRoutes } from "./admin.catalog-suggestions.routes";
import { registerAdminCommissionRoutes } from "./admin.commissions.routes";
import { complaintsRouter } from "./admin.complaints.routes";
import { registerAdminFinanceRoutes } from "./admin.finance.routes";
import { registerAdminListingRoutes } from "./admin.listings.routes";
import { registerAdminPartnershipRoutes } from "./admin.partnership.routes";
import { registerAdminUserRoutes } from "./admin.users.routes";

const adminRouter = Router();
[
  registerAdminFinanceRoutes,
  registerAdminAuditRoutes,
  registerAdminCatalogRoutes,
  registerAdminCatalogSuggestionRoutes,
  registerAdminCommissionRoutes,
  registerAdminListingRoutes,
  registerAdminPartnershipRoutes,
  registerAdminUserRoutes,
].forEach((register) => register(adminRouter));

adminRouter.use("/", complaintsRouter);

export { adminRouter };
