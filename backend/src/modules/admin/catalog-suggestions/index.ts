import { prisma } from "../../../lib/prisma";
import { AdminCatalogSuggestionsService } from "./application/services/admin-catalog-suggestions.service";
import { createAdminCatalogSuggestionsRouter } from "./http/admin-catalog-suggestions.router";
import { AdminCatalogSuggestionsRepository } from "./infrastructure/repositories/admin-catalog-suggestions.repository";

const repository = new AdminCatalogSuggestionsRepository(prisma);

export const adminCatalogSuggestionsRouter = createAdminCatalogSuggestionsRouter({
  service: new AdminCatalogSuggestionsService(repository),
});
