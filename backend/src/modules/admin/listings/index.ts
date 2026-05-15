import { prisma } from "../../../lib/prisma";
import {
  BatchModerateAdminListingsService,
  ListAdminListingModerationEventsService,
  ListAdminListingsService,
  UpdateAdminListingModerationService,
} from "./application/services/admin-listings.service";
import { createAdminListingsRouter } from "./http/admin-listings.router";
import { AdminListingsAuditGateway } from "./infrastructure/gateways/admin-listings-audit.gateway";
import { AdminListingsNotificationGateway } from "./infrastructure/gateways/admin-listings-notification.gateway";
import { AdminListingsRepository } from "./infrastructure/repositories/admin-listings.repository";

const repository = new AdminListingsRepository(prisma);
const auditGateway = new AdminListingsAuditGateway(prisma);
const notificationGateway = new AdminListingsNotificationGateway();

export const adminListingsRouter = createAdminListingsRouter({
  services: {
    listAdminListings: new ListAdminListingsService(repository),
    updateAdminListingModeration: new UpdateAdminListingModerationService(
      repository,
      auditGateway,
      notificationGateway,
    ),
    listAdminListingModerationEvents:
      new ListAdminListingModerationEventsService(repository),
    batchModerateAdminListings: new BatchModerateAdminListingsService(
      repository,
      auditGateway,
      notificationGateway,
    ),
  },
});
