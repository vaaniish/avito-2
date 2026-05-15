import type { Router } from "express";
import { prisma } from "../../../lib/prisma";
import { ListKycRequestsService } from "./application/services/list-kyc-requests.service";
import { ListPartnershipRequestsService } from "./application/services/list-partnership-requests.service";
import { ListPayoutProfilesService } from "./application/services/list-payout-profiles.service";
import { UpdateKycStatusService } from "./application/services/update-kyc-status.service";
import { UpdatePartnershipRequestStatusService } from "./application/services/update-partnership-request-status.service";
import { UpdatePayoutProfileStatusService } from "./application/services/update-payout-profile-status.service";
import { createAdminPartnershipRouter } from "./http/admin-partnership.router";
import { AdminPartnershipNotificationGateway } from "./infrastructure/gateways/admin-partnership-notification.gateway";
import { AdminAuditWriterRepository } from "./infrastructure/repositories/admin-audit-writer.repository";
import { AdminKycRepository } from "./infrastructure/repositories/admin-kyc.repository";
import { AdminPartnershipRequestRepository } from "./infrastructure/repositories/admin-partnership-request.repository";
import { AdminPayoutRepository } from "./infrastructure/repositories/admin-payout.repository";

export function registerAdminPartnershipRoutes(adminRouter: Router) {
  const partnershipRepository = new AdminPartnershipRequestRepository(prisma);
  const kycRepository = new AdminKycRepository(prisma);
  const payoutRepository = new AdminPayoutRepository(prisma);
  const notificationGateway = new AdminPartnershipNotificationGateway();
  const auditWriter = new AdminAuditWriterRepository(prisma);

  adminRouter.use(
    "/",
    createAdminPartnershipRouter({
      services: {
        listPartnershipRequests: new ListPartnershipRequestsService(
          partnershipRepository,
        ),
        updatePartnershipRequestStatus: new UpdatePartnershipRequestStatusService(
          partnershipRepository,
          notificationGateway,
          auditWriter,
        ),
        listKycRequests: new ListKycRequestsService(kycRepository),
        updateKycStatus: new UpdateKycStatusService(
          kycRepository,
          notificationGateway,
          auditWriter,
        ),
        listPayoutProfiles: new ListPayoutProfilesService(payoutRepository),
        updatePayoutProfileStatus: new UpdatePayoutProfileStatusService(
          payoutRepository,
          notificationGateway,
          auditWriter,
        ),
      },
    }),
  );
}
