import type { PrismaClient } from "@prisma/client";
import { makeAuditPublicId } from "../../../../../common/domain/public-id";
import type {
  AdminAuditWriteInput,
  AdminAuditWriterPort,
} from "../../domain/admin-users.types";

export class AdminUsersAuditGateway implements AdminAuditWriterPort {
  constructor(private readonly prisma: PrismaClient) {}

  async write(input: AdminAuditWriteInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: input.actorUserId,
        action: input.action,
        entity_type: "user",
        entity_public_id: input.entityPublicId,
        details: JSON.parse(JSON.stringify(input.details)),
        ip_address: input.requestIp,
      },
    });
  }
}
