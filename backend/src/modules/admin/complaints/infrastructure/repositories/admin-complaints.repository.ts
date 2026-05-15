import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  applyApprovedComplaintConsequences,
} from "../repositories/complaint-sanction.repository";
import { toClientSanctionLevel } from "../../domain/complaint-sanction.helpers";
import {
  buildComplaintEvaluation,
  buildListingPublicUrl,
  computeComplaintQueueMetrics,
  extractPrimaryAddressInfo,
  makePublicId,
  toClientComplaintSanctionStatus,
  toClientComplaintStatus,
} from "../../domain/admin-complaints.service";
import type {
  ComplaintListFilters,
  ComplaintDto,
  ComplaintHistoryEventDto,
  ComplaintSellerSummaryDto,
  ComplaintStatusUpdateRequest,
  ComplaintStatusUpdateResult,
  IdempotencyStartResult,
  LegacyComplaintStatusUpdateResult,
} from "../../domain/admin-complaints.types";

const COMPLAINT_LIST_INCLUDE = Prisma.validator<Prisma.ComplaintInclude>()({
  listing: {
    select: {
      public_id: true,
      title: true,
      price: true,
      created_at: true,
      status: true,
      moderation_status: true,
      _count: {
        select: {
          complaints: true,
        },
      },
    },
  },
  seller: {
    select: {
      public_id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      block_reason: true,
      blocked_until: true,
      joined_at: true,
      seller_profile: {
        select: {
          is_verified: true,
          average_response_minutes: true,
        },
      },
      addresses: {
        select: {
          city: true,
          region: true,
        },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
        take: 1,
      },
      _count: {
        select: {
          complaints_against: true,
          listings: true,
          orders_as_seller: true,
        },
      },
    },
  },
  reporter: {
    select: {
      public_id: true,
      name: true,
      email: true,
    },
  },
  checked_by: {
    select: {
      public_id: true,
      name: true,
      email: true,
    },
  },
});

type ComplaintWithRelations = Prisma.ComplaintGetPayload<{
  include: typeof COMPLAINT_LIST_INCLUDE;
}>;

function makeAuditPublicId(): string {
  return `AUD-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function serializeForJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export class AdminComplaintsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private buildComplaintWhere(
    filters: ComplaintListFilters,
  ): Prisma.ComplaintWhereInput {
    const where: Prisma.ComplaintWhereInput = {};

    if (filters.statuses && filters.statuses.length > 0) {
      where.status = { in: filters.statuses };
    }

    if (filters.moderatorPublicId) {
      where.checked_by = {
        public_id: filters.moderatorPublicId,
      };
    }

    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) {
      createdAt.gte = filters.from;
    }
    if (filters.to) {
      createdAt.lte = filters.to;
    }
    if (Object.keys(createdAt).length > 0) {
      where.created_at = createdAt;
    }

    if (filters.query && filters.query.trim()) {
      const query = filters.query.trim();
      where.OR = [
        { public_id: { contains: query, mode: "insensitive" } },
        { complaint_type: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { listing: { title: { contains: query, mode: "insensitive" } } },
        { seller: { name: { contains: query, mode: "insensitive" } } },
        { seller: { email: { contains: query, mode: "insensitive" } } },
        { reporter: { name: { contains: query, mode: "insensitive" } } },
        { reporter: { email: { contains: query, mode: "insensitive" } } },
      ];
    }

    return where;
  }

  private async writeAuditLog(params: {
    actorUserId: number;
    action: string;
    entityType: string;
    entityPublicId?: string | null;
    details?: Prisma.InputJsonValue;
    requestIp: string | null;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        public_id: makeAuditPublicId(),
        actor_user_id: params.actorUserId,
        action: params.action,
        entity_type: params.entityType,
        entity_public_id: params.entityPublicId ?? null,
        details: params.details,
        ip_address: params.requestIp,
      },
    });
  }

  private async mapComplaintsForAdmin(
    complaints: ComplaintWithRelations[],
  ): Promise<ComplaintDto[]> {
    if (complaints.length === 0) return [];

    const sellerIds = Array.from(
      new Set(complaints.map((complaint) => complaint.seller_id)),
    );
    const complaintIds = complaints.map((complaint) => complaint.id);

    const [approvedBySellerRaw, sanctionsByComplaintRaw, activeSanctionsRaw] =
      await Promise.all([
        sellerIds.length > 0
          ? this.prisma.complaint.groupBy({
              by: ["seller_id"],
              where: {
                seller_id: { in: sellerIds },
                status: "APPROVED",
              },
              _count: {
                _all: true,
              },
            })
          : Promise.resolve([]),
        complaintIds.length > 0
          ? this.prisma.complaintSanction.findMany({
              where: {
                complaint_id: { in: complaintIds },
              },
              select: {
                complaint_id: true,
                public_id: true,
                level: true,
                status: true,
                starts_at: true,
                ends_at: true,
                reason: true,
                created_at: true,
              },
            })
          : Promise.resolve([]),
        sellerIds.length > 0
          ? this.prisma.complaintSanction.findMany({
              where: {
                seller_id: { in: sellerIds },
                status: "ACTIVE",
              },
              select: {
                seller_id: true,
                public_id: true,
                level: true,
                status: true,
                starts_at: true,
                ends_at: true,
                reason: true,
                created_at: true,
              },
              orderBy: [{ created_at: "desc" }, { id: "desc" }],
            })
          : Promise.resolve([]),
      ]);

    const approvedBySeller = new Map<number, number>();
    for (const item of approvedBySellerRaw) {
      approvedBySeller.set(item.seller_id, item._count._all);
    }

    const sanctionByComplaint = new Map<number, (typeof sanctionsByComplaintRaw)[number]>();
    for (const sanction of sanctionsByComplaintRaw) {
      sanctionByComplaint.set(sanction.complaint_id, sanction);
    }

    const activeSanctionBySeller = new Map<number, (typeof activeSanctionsRaw)[number]>();
    for (const sanction of activeSanctionsRaw) {
      if (!activeSanctionBySeller.has(sanction.seller_id)) {
        activeSanctionBySeller.set(sanction.seller_id, sanction);
      }
    }

    return complaints.map((complaint) => {
      const evaluation = buildComplaintEvaluation({
        complaintType: complaint.complaint_type,
        listingComplaintCount: complaint.listing._count.complaints,
        sellerComplaintCount: complaint.seller._count.complaints_against,
      });
      const addressInfo = extractPrimaryAddressInfo(complaint.seller.addresses);

      const sellerViolationsCount = approvedBySeller.get(complaint.seller_id) ?? 0;
      const queueMetrics = computeComplaintQueueMetrics({
        createdAt: complaint.created_at,
        riskScore: evaluation.score,
        listingComplaintsCount: complaint.listing._count.complaints,
        sellerViolationsCount,
      });

      return {
        id: complaint.public_id,
        createdAt: complaint.created_at,
        status: toClientComplaintStatus(complaint.status),
        targetType: "listing",
        complaintType: complaint.complaint_type,
        listingId: complaint.listing.public_id,
        listingUrl: buildListingPublicUrl(complaint.listing.public_id),
        listingTitle: complaint.listing.title,
        listingPrice: complaint.listing.price,
        listingCreatedAt: complaint.listing.created_at,
        listingStatus: complaint.listing.status.toLowerCase(),
        listingModerationStatus: complaint.listing.moderation_status.toLowerCase(),
        listingCity: addressInfo.city,
        listingRegion: addressInfo.region,
        listingComplaintsCount: complaint.listing._count.complaints,
        sellerId: complaint.seller.public_id,
        sellerName: complaint.seller.name,
        sellerEmail: complaint.seller.email,
        sellerPhone: complaint.seller.phone,
        sellerStatus: complaint.seller.status.toLowerCase() as "active" | "blocked",
        sellerBlockedUntil: complaint.seller.blocked_until,
        sellerBlockReason: complaint.seller.block_reason,
        sellerJoinedAt: complaint.seller.joined_at,
        sellerVerified: Boolean(complaint.seller.seller_profile?.is_verified),
        sellerResponseMinutes:
          complaint.seller.seller_profile?.average_response_minutes ?? null,
        reporterId: complaint.reporter.public_id,
        reporterName: complaint.reporter.name,
        reporterEmail: complaint.reporter.email,
        sellerComplaintsCount: complaint.seller._count.complaints_against,
        sellerViolationsCount,
        sellerListingsCount: complaint.seller._count.listings,
        sellerOrdersCount: complaint.seller._count.orders_as_seller,
        description: complaint.description,
        checkedAt: complaint.checked_at,
        checkedBy: complaint.checked_by
          ? {
              id: complaint.checked_by.public_id,
              name: complaint.checked_by.name,
              email: complaint.checked_by.email,
            }
          : null,
        actionTaken: complaint.action_taken,
        sanction: sanctionByComplaint.get(complaint.id)
          ? {
              id: sanctionByComplaint.get(complaint.id)?.public_id ?? "",
              level: toClientSanctionLevel(
                sanctionByComplaint.get(complaint.id)?.level ?? "WARNING",
              ),
              status: toClientComplaintSanctionStatus(
                sanctionByComplaint.get(complaint.id)?.status ?? "COMPLETED",
              ),
              startsAt: sanctionByComplaint.get(complaint.id)?.starts_at ?? null,
              endsAt: sanctionByComplaint.get(complaint.id)?.ends_at ?? null,
              reason: sanctionByComplaint.get(complaint.id)?.reason ?? null,
              createdAt: sanctionByComplaint.get(complaint.id)?.created_at ?? null,
            }
          : null,
        activeSellerSanction: activeSanctionBySeller.get(complaint.seller_id)
          ? {
              id: activeSanctionBySeller.get(complaint.seller_id)?.public_id ?? "",
              level: toClientSanctionLevel(
                activeSanctionBySeller.get(complaint.seller_id)?.level ?? "WARNING",
              ),
              status: toClientComplaintSanctionStatus(
                activeSanctionBySeller.get(complaint.seller_id)?.status ?? "ACTIVE",
              ),
              startsAt: activeSanctionBySeller.get(complaint.seller_id)?.starts_at ?? null,
              endsAt: activeSanctionBySeller.get(complaint.seller_id)?.ends_at ?? null,
              reason: activeSanctionBySeller.get(complaint.seller_id)?.reason ?? null,
              createdAt: activeSanctionBySeller.get(complaint.seller_id)?.created_at ?? null,
            }
          : null,
        evaluation,
        riskScore: evaluation.score,
        queueScore: queueMetrics.queueScore,
        priority: queueMetrics.priority,
        ageHours: queueMetrics.ageHours,
      };
    });
  }

  async findLegacyComplaints(): Promise<ComplaintDto[]> {
    const complaints = await this.prisma.complaint.findMany({
      include: COMPLAINT_LIST_INCLUDE,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
    const mapped = await this.mapComplaintsForAdmin(complaints);
    return mapped.map((item) => ({
      ...item,
      sellerComplaintsCount: item.sellerComplaintsCount,
    }));
  }

  async listComplaints(filters: ComplaintListFilters): Promise<ComplaintDto[]> {
    const where = this.buildComplaintWhere(filters);
    const complaints = await this.prisma.complaint.findMany({
      where,
      include: COMPLAINT_LIST_INCLUDE,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
    });
    return this.mapComplaintsForAdmin(complaints);
  }

  async beginAdminIdempotency(params: {
    actorUserId: number;
    action: string;
    key: string;
    requestHash: string;
  }): Promise<IdempotencyStartResult> {
    const lookupWhere = {
      actor_user_id: params.actorUserId,
      action: params.action,
      idempotency_key: params.key,
    };

    const existing = await this.prisma.adminIdempotencyKey.findFirst({
      where: lookupWhere,
      select: {
        id: true,
        request_hash: true,
        response_status: true,
        response_body: true,
      },
    });

    if (existing) {
      if (existing.request_hash !== params.requestHash) {
        return {
          kind: "conflict",
          message:
            "Idempotency-Key reuse with different payload is not allowed for this action.",
        };
      }
      if (existing.response_status && existing.response_body) {
        return {
          kind: "cached",
          statusCode: existing.response_status,
          body: existing.response_body,
        };
      }
      return {
        kind: "conflict",
        message: "Request with this Idempotency-Key is already in progress.",
      };
    }

    try {
      const created = await this.prisma.adminIdempotencyKey.create({
        data: {
          public_id: makePublicId("IDM"),
          actor_user_id: params.actorUserId,
          action: params.action,
          idempotency_key: params.key,
          request_hash: params.requestHash,
        },
        select: {
          id: true,
        },
      });
      return { kind: "created", recordId: created.id };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const resolved = await this.prisma.adminIdempotencyKey.findFirst({
        where: lookupWhere,
        select: {
          id: true,
          request_hash: true,
          response_status: true,
          response_body: true,
        },
      });

      if (!resolved) {
        throw error;
      }

      if (resolved.request_hash !== params.requestHash) {
        return {
          kind: "conflict",
          message:
            "Idempotency-Key reuse with different payload is not allowed for this action.",
        };
      }
      if (resolved.response_status && resolved.response_body) {
        return {
          kind: "cached",
          statusCode: resolved.response_status,
          body: resolved.response_body,
        };
      }
      return {
        kind: "conflict",
        message: "Request with this Idempotency-Key is already in progress.",
      };
    }
  }

  async completeAdminIdempotency(params: {
    recordId: number;
    statusCode: number;
    body: unknown;
  }): Promise<void> {
    await this.prisma.adminIdempotencyKey.update({
      where: { id: params.recordId },
      data: {
        response_status: params.statusCode,
        response_body: serializeForJson(params.body),
      },
    });
  }

  async updateLegacyComplaintStatus(
    input: ComplaintStatusUpdateRequest,
  ): Promise<LegacyComplaintStatusUpdateResult> {
    const existing = await this.prisma.complaint.findUnique({
      where: { public_id: input.complaintPublicId },
      select: {
        id: true,
        public_id: true,
        status: true,
        action_taken: true,
        complaint_type: true,
        seller_id: true,
        reporter_id: true,
        listing_id: true,
        seller: {
          select: {
            public_id: true,
            status: true,
            block_reason: true,
            blocked_until: true,
          },
        },
        listing: {
          select: {
            public_id: true,
            title: true,
            status: true,
            moderation_status: true,
          },
        },
      },
    });

    if (!existing) {
      return { kind: "not_found" };
    }

    if (existing.status === "APPROVED" && input.nextStatus !== "APPROVED") {
      return {
        kind: "invalid_transition",
        message:
          "Approved complaint cannot be moved back. Create a separate compensating admin action.",
      };
    }

    const txResult = await this.prisma.$transaction(async (tx) => {
      let enforcement:
        | ComplaintStatusUpdateResult
        | null = null;

      const next = await tx.complaint.update({
        where: { id: existing.id },
        data: {
          status: input.nextStatus,
          checked_at: new Date(),
          checked_by_id: input.actorUserId,
          action_taken: input.actionTaken,
        },
      });

      let enforcementPayload: ComplaintStatusUpdateResult["kind"] extends never
        ? never
        : {
            applied: true;
            approvedViolationsCount: number;
            level: string;
            sanctionId: string;
            sellerStatus: "active" | "blocked";
            blockedUntil: Date | null;
            listingStatus: "inactive";
            listingModerationStatus: "rejected";
            message: string;
          } | null = null;

      if (input.nextStatus === "APPROVED" && existing.status !== "APPROVED") {
        const enforcementResult = await applyApprovedComplaintConsequences(tx, {
          complaintId: existing.id,
          complaintPublicId: existing.public_id,
          complaintType: existing.complaint_type,
          sellerId: existing.seller_id,
          listingId: existing.listing_id,
          adminUserId: input.actorUserId,
          actionTaken: input.actionTaken,
        });
        enforcementPayload = {
          applied: true,
          approvedViolationsCount: enforcementResult.approvedViolationsCount,
          level: toClientSanctionLevel(enforcementResult.level),
          sanctionId: enforcementResult.sanctionPublicId,
          sellerStatus: enforcementResult.sellerStatus.toLowerCase() as
            | "active"
            | "blocked",
          blockedUntil: enforcementResult.blockedUntil,
          listingStatus: enforcementResult.listingStatus.toLowerCase() as "inactive",
          listingModerationStatus:
            enforcementResult.listingModerationStatus.toLowerCase() as "rejected",
          message: enforcementResult.message,
        };
      }

      return {
        updated: next,
        enforcement: enforcementPayload,
      };
    });

    await this.writeAuditLog({
      actorUserId: input.actorUserId,
      action: "complaint.status_changed",
      entityType: "complaint",
      entityPublicId: input.complaintPublicId,
      details: serializeForJson({
        beforeStatus: existing.status,
        afterStatus: txResult.updated.status,
        beforeActionTaken: existing.action_taken,
        afterActionTaken: txResult.updated.action_taken,
      }),
      requestIp: input.requestIp,
    });

    if (txResult.enforcement) {
      await this.writeAuditLog({
        actorUserId: input.actorUserId,
        action: "listing.moderation_changed",
        entityType: "listing",
        entityPublicId: existing.listing.public_id,
        details: serializeForJson({
          source: "complaint_approved_auto_enforcement",
          complaintId: existing.public_id,
          beforeModerationStatus: existing.listing.moderation_status,
          afterModerationStatus: "REJECTED",
          beforeListingStatus: existing.listing.status,
          afterListingStatus: "INACTIVE",
        }),
        requestIp: input.requestIp,
      });

      await this.writeAuditLog({
        actorUserId: input.actorUserId,
        action: "user.status_changed",
        entityType: "user",
        entityPublicId: existing.seller.public_id,
        details: serializeForJson({
          source: "complaint_approved_auto_enforcement",
          complaintId: existing.public_id,
          sanctionLevel: txResult.enforcement.level,
          beforeStatus: existing.seller.status,
          afterStatus: txResult.enforcement.sellerStatus.toUpperCase(),
          beforeBlockReason: existing.seller.block_reason,
          afterBlockReason:
            input.actionTaken && input.actionTaken.length > 0
              ? input.actionTaken
              : existing.seller.block_reason,
          beforeBlockedUntil: existing.seller.blocked_until,
          afterBlockedUntil: txResult.enforcement.blockedUntil,
        }),
        requestIp: input.requestIp,
      });
    }

    return {
      kind: "updated",
      payload: {
        success: true,
        status: txResult.updated.status.toLowerCase() as any,
        enforcement: txResult.enforcement,
      },
      notifications: {
        reporterId: existing.reporter_id,
        sellerId: existing.seller_id,
        listingPublicId: existing.listing.public_id,
        listingTitle: existing.listing.title,
        status: txResult.updated.status,
        enforcementMessage: txResult.enforcement?.message ?? null,
      },
    };
  }

  async updateComplaintStatus(
    input: ComplaintStatusUpdateRequest,
  ): Promise<ComplaintStatusUpdateResult> {
    const existing = await this.prisma.complaint.findUnique({
      where: { public_id: input.complaintPublicId },
      select: {
        id: true,
        public_id: true,
        status: true,
        action_taken: true,
        complaint_type: true,
        seller_id: true,
        reporter_id: true,
        listing_id: true,
        seller: {
          select: {
            public_id: true,
            status: true,
            block_reason: true,
            blocked_until: true,
          },
        },
        listing: {
          select: {
            public_id: true,
            title: true,
            status: true,
            moderation_status: true,
          },
        },
      },
    });

    if (!existing) {
      return { kind: "not_found" };
    }

    if (existing.status === "APPROVED" || existing.status === "REJECTED") {
      return {
        kind: "locked",
        message:
          "Complaint decision is locked for approved/rejected cases. Use Users tab for unblocking actions.",
      };
    }

    try {
      const txResult = await this.prisma.$transaction(async (tx) => {
        const decisionAt = new Date();
        const primaryComplaint = await tx.complaint.findUnique({
          where: {
            id: existing.id,
          },
          select: {
            id: true,
            public_id: true,
            status: true,
          },
        });

        if (!primaryComplaint || primaryComplaint.status !== existing.status) {
          throw new Error("COMPLAINT_STATUS_CONFLICT");
        }

        const cascadedComplaintIds: string[] = [];
        let cascadeUpdatedCount = 1;
        const primaryUpdate = await tx.complaint.updateMany({
          where: {
            id: primaryComplaint.id,
            status: primaryComplaint.status,
          },
          data: {
            status: input.nextStatus,
            checked_at: decisionAt,
            checked_by_id: input.actorUserId,
            action_taken: input.actionTaken,
          },
        });

        if (primaryUpdate.count !== 1) {
          throw new Error("COMPLAINT_STATUS_CONFLICT");
        }

        await tx.complaintEvent.create({
          data: {
            public_id: makePublicId("CME"),
            complaint_id: primaryComplaint.id,
            actor_user_id: input.actorUserId,
            event_type: "STATUS_CHANGED",
            from_status: primaryComplaint.status,
            to_status: input.nextStatus,
            note: input.actionTaken,
            metadata: {
              source: "admin_panel",
            },
          },
        });

        let enforcement:
          | {
              applied: true;
              approvedViolationsCount: number;
              level: string;
              sanctionId: string;
              sellerStatus: "active" | "blocked";
              blockedUntil: Date | null;
              listingStatus: "inactive";
              listingModerationStatus: "rejected";
              message: string;
            }
          | null = null;

        if (input.nextStatus === "APPROVED" && existing.status !== "APPROVED") {
          const enforcementResult = await applyApprovedComplaintConsequences(tx, {
            complaintId: existing.id,
            complaintPublicId: existing.public_id,
            complaintType: existing.complaint_type,
            sellerId: existing.seller_id,
            listingId: existing.listing_id,
            adminUserId: input.actorUserId,
            actionTaken: input.actionTaken,
          });

          enforcement = {
            applied: true,
            approvedViolationsCount: enforcementResult.approvedViolationsCount,
            level: toClientSanctionLevel(enforcementResult.level),
            sanctionId: enforcementResult.sanctionPublicId,
            sellerStatus: enforcementResult.sellerStatus.toLowerCase() as
              | "active"
              | "blocked",
            blockedUntil: enforcementResult.blockedUntil,
            listingStatus: enforcementResult.listingStatus.toLowerCase() as "inactive",
            listingModerationStatus:
              enforcementResult.listingModerationStatus.toLowerCase() as "rejected",
            message: enforcementResult.message,
          };

          await tx.complaintEvent.create({
            data: {
              public_id: makePublicId("CME"),
              complaint_id: existing.id,
              actor_user_id: input.actorUserId,
              event_type: "SANCTION_APPLIED",
              note: enforcement.message,
              metadata: {
                level: enforcement.level,
                sanctionId: enforcement.sanctionId,
                sellerStatus: enforcement.sellerStatus,
                blockedUntil: enforcement.blockedUntil,
              },
            },
          });
        }

        if (input.nextStatus === "APPROVED" && enforcement?.level === "permanent") {
          const relatedOpenComplaints = await tx.complaint.findMany({
            where: {
              seller_id: existing.seller_id,
              id: {
                not: existing.id,
              },
              status: {
                in: ["NEW", "PENDING"],
              },
            },
            select: {
              id: true,
              public_id: true,
              status: true,
            },
            orderBy: [{ created_at: "asc" }, { id: "asc" }],
          });

          for (const relatedComplaint of relatedOpenComplaints) {
            const nextUpdate = await tx.complaint.updateMany({
              where: {
                id: relatedComplaint.id,
                status: relatedComplaint.status,
              },
              data: {
                status: input.nextStatus,
                checked_at: decisionAt,
                checked_by_id: input.actorUserId,
                action_taken: input.actionTaken,
              },
            });

            if (nextUpdate.count !== 1) {
              throw new Error("COMPLAINT_STATUS_CONFLICT");
            }

            cascadedComplaintIds.push(relatedComplaint.public_id);
            cascadeUpdatedCount += 1;

            await tx.complaintEvent.create({
              data: {
                public_id: makePublicId("CME"),
                complaint_id: relatedComplaint.id,
                actor_user_id: input.actorUserId,
                event_type: "STATUS_CHANGED",
                from_status: relatedComplaint.status,
                to_status: input.nextStatus,
                note: input.actionTaken,
                metadata: {
                  source: "admin_panel_cascade_permanent_ban",
                  triggerComplaintId: existing.public_id,
                  sanctionLevel: enforcement.level,
                },
              },
            });
          }
        }

        const updated = await tx.complaint.findUnique({
          where: { id: existing.id },
          select: {
            status: true,
            action_taken: true,
          },
        });

        if (!updated) {
          throw new Error("COMPLAINT_NOT_FOUND_AFTER_UPDATE");
        }

        return {
          updated,
          enforcement,
          cascade: {
            updatedCount: cascadeUpdatedCount,
            cascadedComplaintIds,
          },
        };
      });

      await this.writeAuditLog({
        actorUserId: input.actorUserId,
        action: "complaint.status_changed",
        entityType: "complaint",
        entityPublicId: input.complaintPublicId,
        details: serializeForJson({
          beforeStatus: existing.status,
          afterStatus: txResult.updated.status,
          beforeActionTaken: existing.action_taken,
          afterActionTaken: txResult.updated.action_taken,
          cascadeUpdatedCount: txResult.cascade.updatedCount,
          cascadedComplaintIds: txResult.cascade.cascadedComplaintIds,
        }),
        requestIp: input.requestIp,
      });

      if (txResult.enforcement) {
        await this.writeAuditLog({
          actorUserId: input.actorUserId,
          action: "listing.moderation_changed",
          entityType: "listing",
          entityPublicId: existing.listing.public_id,
          details: serializeForJson({
            source: "complaint_approved_auto_enforcement",
            complaintId: existing.public_id,
            beforeModerationStatus: existing.listing.moderation_status,
            afterModerationStatus: "REJECTED",
            beforeListingStatus: existing.listing.status,
            afterListingStatus: "INACTIVE",
          }),
          requestIp: input.requestIp,
        });

        await this.writeAuditLog({
          actorUserId: input.actorUserId,
          action: "user.status_changed",
          entityType: "user",
          entityPublicId: existing.seller.public_id,
          details: serializeForJson({
            source: "complaint_approved_auto_enforcement",
            complaintId: existing.public_id,
            sanctionLevel: txResult.enforcement.level,
            beforeStatus: existing.seller.status,
            afterStatus: txResult.enforcement.sellerStatus.toUpperCase(),
            beforeBlockReason: existing.seller.block_reason,
            afterBlockReason:
              input.actionTaken && input.actionTaken.length > 0
                ? input.actionTaken
                : existing.seller.block_reason,
            beforeBlockedUntil: existing.seller.blocked_until,
            afterBlockedUntil: txResult.enforcement.blockedUntil,
          }),
          requestIp: input.requestIp,
        });
      }

      return {
        kind: "updated",
        payload: {
          success: true,
          status: txResult.updated.status.toLowerCase() as any,
          enforcement: txResult.enforcement,
          cascade: {
            updatedCount: txResult.cascade.updatedCount,
            cascadedComplaintIds: txResult.cascade.cascadedComplaintIds,
          },
        },
        notifications: {
          reporterId: existing.reporter_id,
          sellerId: existing.seller_id,
          listingPublicId: existing.listing.public_id,
          listingTitle: existing.listing.title,
          status: txResult.updated.status,
          enforcementMessage: txResult.enforcement?.message ?? null,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message === "COMPLAINT_STATUS_CONFLICT") {
        return {
          kind: "conflict",
          message: "Complaint status changed by another moderator. Reload and retry.",
        };
      }
      throw error;
    }
  }

  private async fetchComplaintHistory(
    complaintId: number,
  ): Promise<ComplaintHistoryEventDto[]> {
    const complaintEventDelegate = (
      this.prisma as unknown as {
        complaintEvent?: {
          findMany?: (args: Prisma.ComplaintEventFindManyArgs) => Promise<
            Array<{
              public_id: string;
              event_type: string;
              from_status: any;
              to_status: any;
              note: string | null;
              metadata: unknown;
              created_at: Date;
              actor: { public_id: string; name: string; email: string } | null;
            }>
          >;
        };
      }
    ).complaintEvent;

    if (!complaintEventDelegate?.findMany) {
      return [];
    }

    const events = await complaintEventDelegate.findMany({
      where: { complaint_id: complaintId },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      include: {
        actor: {
          select: {
            public_id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return events.map((event) => ({
      id: event.public_id,
      type: event.event_type,
      fromStatus: event.from_status ? toClientComplaintStatus(event.from_status) : null,
      toStatus: event.to_status ? toClientComplaintStatus(event.to_status) : null,
      note: event.note,
      metadata: event.metadata,
      createdAt: event.created_at,
      actor: event.actor
        ? {
            id: event.actor.public_id,
            name: event.actor.name,
            email: event.actor.email,
          }
        : null,
    }));
  }

  async fetchComplaintDetails(complaintPublicId: string): Promise<{
    complaint: ComplaintDto;
    history: ComplaintHistoryEventDto[];
  } | null> {
    const complaint = await this.prisma.complaint.findUnique({
      where: { public_id: complaintPublicId },
      include: COMPLAINT_LIST_INCLUDE,
    });

    if (!complaint) {
      return null;
    }

    const [mapped] = await this.mapComplaintsForAdmin([complaint]);
    const history = await this.fetchComplaintHistory(complaint.id);

    return {
      complaint: mapped,
      history,
    };
  }

  async fetchRelatedListingComplaints(
    complaintPublicId: string,
  ): Promise<
    | { kind: "not_found" }
    | {
        kind: "found";
        currentComplaintId: string;
        items: Array<{
          id: string;
          createdAt: Date;
          status: any;
          complaintType: string;
          reporterName: string;
          priority: any;
          queueScore: number;
        }>;
      }
  > {
    const complaint = await this.prisma.complaint.findUnique({
      where: { public_id: complaintPublicId },
      select: {
        id: true,
        listing_id: true,
      },
    });

    if (!complaint) {
      return { kind: "not_found" };
    }

    const related = await this.prisma.complaint.findMany({
      where: {
        listing_id: complaint.listing_id,
      },
      include: COMPLAINT_LIST_INCLUDE,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: 20,
    });

    const mapped = await this.mapComplaintsForAdmin(related);
    return {
      kind: "found",
      currentComplaintId: complaintPublicId,
      items: mapped.map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        status: item.status,
        complaintType: item.complaintType,
        reporterName: item.reporterName,
        priority: item.priority,
        queueScore: item.queueScore,
      })),
    };
  }

  async fetchSellerSummary(
    complaintPublicId: string,
  ): Promise<ComplaintSellerSummaryDto | null> {
    const complaint = await this.prisma.complaint.findUnique({
      where: { public_id: complaintPublicId },
      select: {
        seller_id: true,
        seller: {
          select: {
            public_id: true,
            name: true,
            email: true,
            status: true,
            blocked_until: true,
            block_reason: true,
            seller_profile: {
              select: {
                is_verified: true,
              },
            },
            _count: {
              select: {
                listings: true,
                orders_as_seller: true,
              },
            },
          },
        },
      },
    });

    if (!complaint) {
      return null;
    }

    const [
      countsRaw,
      activeSanctionsCount,
      recentCasesRaw,
      uniqueCasesTotalRaw,
      uniqueCasesApprovedRaw,
      uniqueCasesRejectedRaw,
    ] = await Promise.all([
      this.prisma.complaint.groupBy({
        by: ["status"],
        where: {
          seller_id: complaint.seller_id,
        },
        _count: {
          _all: true,
        },
      }),
      this.prisma.complaintSanction.count({
        where: {
          seller_id: complaint.seller_id,
          status: "ACTIVE",
        },
      }),
      this.prisma.complaint.findMany({
        where: {
          seller_id: complaint.seller_id,
        },
        include: {
          listing: {
            select: {
              public_id: true,
              title: true,
            },
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 8,
      }),
      this.prisma.complaint.groupBy({
        by: ["listing_id"],
        where: {
          seller_id: complaint.seller_id,
        },
      }),
      this.prisma.complaint.groupBy({
        by: ["listing_id"],
        where: {
          seller_id: complaint.seller_id,
          status: "APPROVED",
        },
      }),
      this.prisma.complaint.groupBy({
        by: ["listing_id"],
        where: {
          seller_id: complaint.seller_id,
          status: "REJECTED",
        },
      }),
    ]);

    const counts = {
      total: 0,
      approved: 0,
      pending: 0,
      new: 0,
      rejected: 0,
    };

    for (const item of countsRaw) {
      counts.total += item._count._all;
      if (item.status === "APPROVED") counts.approved = item._count._all;
      if (item.status === "PENDING") counts.pending = item._count._all;
      if (item.status === "NEW") counts.new = item._count._all;
      if (item.status === "REJECTED") counts.rejected = item._count._all;
    }

    return {
      seller: {
        id: complaint.seller.public_id,
        name: complaint.seller.name,
        email: complaint.seller.email,
        status: complaint.seller.status.toLowerCase(),
        blockedUntil: complaint.seller.blocked_until,
        blockReason: complaint.seller.block_reason,
        verified: Boolean(complaint.seller.seller_profile?.is_verified),
        listingsCount: complaint.seller._count.listings,
        ordersCount: complaint.seller._count.orders_as_seller,
      },
      complaints: {
        total: counts.total,
        approved: counts.approved,
        pending: counts.pending,
        new: counts.new,
        rejected: counts.rejected,
      },
      cases: {
        total: uniqueCasesTotalRaw.length,
        approved: uniqueCasesApprovedRaw.length,
        rejected: uniqueCasesRejectedRaw.length,
      },
      activeSanctionsCount,
      recentCases: recentCasesRaw.map((item) => ({
        id: item.public_id,
        status: item.status.toLowerCase(),
        complaintType: item.complaint_type,
        listingId: item.listing.public_id,
        listingTitle: item.listing.title,
        createdAt: item.created_at,
      })),
    };
  }
}
