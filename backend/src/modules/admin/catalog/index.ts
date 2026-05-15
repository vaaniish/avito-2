import { prisma } from "../../../lib/prisma";
import { AdminCatalogService } from "./application/services/admin-catalog.service";
import { createAdminCatalogRouter } from "./http/admin-catalog.router";
import { AdminCatalogReferenceRepository } from "./infrastructure/repositories/admin-catalog-reference.repository";
import { AdminCatalogTreeRepository } from "./infrastructure/repositories/admin-catalog-tree.repository";

const treeRepository = new AdminCatalogTreeRepository(prisma);
const referenceRepository = new AdminCatalogReferenceRepository(prisma);

export const adminCatalogRouter = createAdminCatalogRouter({
  service: new AdminCatalogService(treeRepository, referenceRepository),
});
