import type { PrismaClient } from "@prisma/client";
import type {
  AdminAuditWriterPort,
  AdminAuditWriteInput,
} from "../../domain/admin-partnership.types";

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

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
