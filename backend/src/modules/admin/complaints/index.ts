import { prisma } from "../../../lib/prisma";
import { GetComplaintDetailsService } from "./application/services/get-complaint-details.service";
import { GetComplaintStatsService } from "./application/services/get-complaint-stats.service";
import { GetComplaintsLegacyService } from "./application/services/get-complaints-legacy.service";
import { GetRelatedListingComplaintsService } from "./application/services/get-related-listing-complaints.service";
import { GetSellerSummaryService } from "./application/services/get-seller-summary.service";
import { ListComplaintsService } from "./application/services/list-complaints.service";
import { UpdateComplaintLegacyService } from "./application/services/update-complaint-legacy.service";
import { UpdateComplaintStatusService } from "./application/services/update-complaint-status.service";
import { createAdminComplaintsRouter } from "./http/admin-complaints.router";
import { AdminComplaintsNotificationGateway } from "./infrastructure/gateways/admin-complaints-notification.gateway";
import { AdminComplaintsRepository } from "./infrastructure/repositories/admin-complaints.repository";

const repository = new AdminComplaintsRepository(prisma);
const notificationGateway = new AdminComplaintsNotificationGateway();

export const complaintsRouter = createAdminComplaintsRouter({
  services: {
    getComplaintsLegacy: new GetComplaintsLegacyService(repository),
    updateComplaintLegacy: new UpdateComplaintLegacyService(
      repository,
      notificationGateway,
    ),
    getComplaintStats: new GetComplaintStatsService(repository),
    listComplaints: new ListComplaintsService(repository),
    getRelatedListingComplaints: new GetRelatedListingComplaintsService(
      repository,
    ),
    getSellerSummary: new GetSellerSummaryService(repository),
    getComplaintDetails: new GetComplaintDetailsService(repository),
    updateComplaintStatus: new UpdateComplaintStatusService(
      repository,
      notificationGateway,
    ),
  },
});
