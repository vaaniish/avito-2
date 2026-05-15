import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AuditAction,
  AuditEntityType,
} from "../../domain/admin-common.helpers";

type AuditClient = PrismaClient | Prisma.TransactionClient;

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function serializeDetails(value: Prisma.InputJsonValue | undefined) {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export class AdminAuditWriterGateway {
  constructor(private readonly client: AuditClient) {}

  async write(input: {
    actorUserId: number;
    action: AuditAction;
    entityType: AuditEntityType;
    entityPublicId?: string | null;
    details?: Prisma.InputJsonValue;
    requestIp?: string | null;
  }): Promise<void> {
    try {
      await this.client.auditLog.create({
        data: {
          public_id: makeAuditPublicId(),
          actor_user_id: input.actorUserId,
          action: input.action,
          entity_type: input.entityType,
          entity_public_id: input.entityPublicId ?? null,
          details: serializeDetails(input.details),
          ip_address: input.requestIp ?? null,
        },
      });
    } catch (error) {
      console.error("Failed to write audit log:", error);
    }
  }
}
