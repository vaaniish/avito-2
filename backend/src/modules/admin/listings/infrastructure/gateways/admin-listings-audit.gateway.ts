import type { PrismaClient } from "@prisma/client";
import { AdminAuditWriterGateway } from "../../../common/infrastructure/gateways/admin-audit-writer.gateway";

export class AdminListingsAuditGateway extends AdminAuditWriterGateway {
  constructor(prisma: PrismaClient) {
    super(prisma);
  }
}
