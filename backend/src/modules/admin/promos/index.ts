import { prisma } from "../../../lib/prisma";
import { AdminPromosService } from "./application/services/admin-promos.service";
import { createAdminPromosRouter } from "./http/admin-promos.router";

export const adminPromosRouter = createAdminPromosRouter({
  service: new AdminPromosService(prisma),
});
