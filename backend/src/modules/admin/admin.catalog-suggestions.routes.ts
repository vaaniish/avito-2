import type { Router } from "express";
import { adminCatalogSuggestionsRouter } from "./catalog-suggestions";

export function registerAdminCatalogSuggestionRoutes(adminRouter: Router) {
  adminRouter.use("/", adminCatalogSuggestionsRouter);
}
