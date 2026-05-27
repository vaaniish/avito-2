import type { PrismaClient } from "@prisma/client";
import { makeAuditPublicId } from "../../../../../common/domain/public-id";
import type {
  AdminAuditWriterPort,
  AdminAuditWriteInput,
} from "../../domain/admin-partnership.types";

export class AdminAuditWriterRepository implements AdminAuditWriterPort {
  constructor(private readonly prisma: PrismaClient) {}

  async write(input: AdminAuditWriteInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: input.actorUserId,
        action: input.action,
        entity_type: input.entityType,
        entity_public_id: input.entityPublicId ?? null,
        details: JSON.parse(JSON.stringify(input.details ?? null)),
        ip_address: input.requestIp,
      },
    });
  }
}
