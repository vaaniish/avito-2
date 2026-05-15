import type { PrismaClient } from "@prisma/client";
import { makeAuditPublicId } from "../../../common/domain/ids";
import type { PartnerPayoutAuditPort } from "../../domain/partner-payout.types";

export class PartnerPayoutAuditGateway implements PartnerPayoutAuditPort {
  constructor(private readonly prisma: PrismaClient) {}

  async write(input: {
    actorUserId: number;
    requestIp: string | null;
    payoutProfileId: string;
    status: string;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: input.actorUserId,
        action: "seller.payout_profile.updated",
        entity_type: "user",
        entity_public_id: null,
        details: {
          payoutProfileId: input.payoutProfileId,
          status: input.status,
        },
        ip_address: input.requestIp,
      },
    });
  }
}
