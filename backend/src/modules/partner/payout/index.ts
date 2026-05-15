import { prisma } from "../../../lib/prisma";
import { requireAnyRole } from "../../../lib/session";
import { GetPartnerPayoutProfileService } from "./application/services/get-partner-payout-profile.service";
import { UpsertPartnerPayoutProfileService } from "./application/services/upsert-partner-payout-profile.service";
import { createPartnerPayoutRouter } from "./http/partner-payout.router";
import { PartnerPayoutAuditGateway } from "./infrastructure/gateways/partner-payout-audit.gateway";
import { PartnerPayoutRepository } from "./infrastructure/repositories/partner-payout.repository";

const repository = new PartnerPayoutRepository(prisma);
const auditGateway = new PartnerPayoutAuditGateway(prisma);

export const partnerPayoutRouter = createPartnerPayoutRouter({
  requireAnyRole,
  services: {
    getPartnerPayoutProfile: new GetPartnerPayoutProfileService(repository),
    upsertPartnerPayoutProfile: new UpsertPartnerPayoutProfileService(
      repository,
      auditGateway,
    ),
  },
});
