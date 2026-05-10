import { ListingModerationDecision, type Prisma } from "@prisma/client";
import { type Request, type Response, type Router } from "express";
import { prisma } from "../../lib/prisma";
import { toAdminListingStatus } from "../../utils/format";
import {
  buildListingPublicUrl,
  extractPrimaryAddressInfo,
  requireAdmin,
  writeAudit,
} from "./admin.shared";
import { createNotification, listingModerationNotification } from "../notifications/notification.service";
import {
  defaultListingModerationReasonCode,
  makeListingModerationEventPublicId,
  parseListingModerationReasonCode,
} from "../moderation/listing-moderation.shared";

type ModerationStatusValue = "PENDING" | "APPROVED" | "REJECTED";
type ListingStatusValue = "ACTIVE" | "INACTIVE" | "MODERATION";

function parseModerationStatus(status: unknown): ModerationStatusValue | null {
  if (status === "approved") return "APPROVED";
  if (status === "rejected") return "REJECTED";
  if (status === "pending") return "PENDING";
  return null;
}

function toModerationDecision(status: ModerationStatusValue): ListingModerationDecision {
  if (status === "APPROVED") return "APPROVED";
  if (status === "REJECTED") return "REJECTED";
  return "QUEUED";
}

function buildAutoFlags(listing: {
  description: string | null;
  seller: { joined_at: Date };
  complaints_count: number;
}): string[] {
  const flags: string[] = [];
  const joinedDays = Math.floor(
    (Date.now() - listing.seller.joined_at.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (joinedDays <= 30) flags.push("new_seller");

  const description = (listing.description ?? "").toLowerCase();
  if (/\b(telegram|whatsapp|prepayment|transfer)\b/.test(description)) {
    flags.push("forbidden_words");
  }
  if (/\+\d|@|\.ru|\.com/.test(description)) {
    flags.push("contacts_in_description");
  }
  if ((listing.description ?? "").length > 200 && /(!!!|\bcheap\b|\burgent\b)/i.test(listing.description ?? "")) {
    flags.push("spam_text");
  }
  if (listing.complaints_count > 0) flags.push("seller_with_complaints");
  if (listing.complaints_count > 1) flags.push("multiple_reports");
  return flags;
}

async function hasBlockingOrderForListing(listingId: number): Promise<boolean> {
  const linkedOrderItem = await prisma.marketOrderItem.findFirst({
    where: {
      listing_id: listingId,
      order: {
        status: {
          not: "CANCELLED",
        },
      },
    },
    select: { id: true },
  });
  return Boolean(linkedOrderItem);
}

async function writeListingModerationEvent(params: {
  listingId: number;
  actorUserId: number;
  decision: ListingModerationDecision;
  reasonCode: string;
  reasonNote?: string | null;
  riskScore?: number | null;
  signals?: string[];
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.listingModerationEvent.create({
    data: {
      public_id: makeListingModerationEventPublicId(),
      listing_id: params.listingId,
      actor_user_id: params.actorUserId,
      actor_type: "ADMIN",
      decision: params.decision,
      reason_code: params.reasonCode,
      reason_note: params.reasonNote ?? null,
      risk_score: params.riskScore ?? null,
      signals:
        params.signals && params.signals.length > 0
          ? Array.from(new Set(params.signals))
          : undefined,
      metadata: params.metadata ?? undefined,
    },
  });
}

export function registerAdminListingRoutes(adminRouter: Router) {
  adminRouter.get("/listings", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const listings = await prisma.marketplaceListing.findMany({
        include: {
          seller: {
            select: {
              public_id: true,
              name: true,
              joined_at: true,
              status: true,
              addresses: {
                select: {
                  city: true,
                  region: true,
                },
                orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                take: 1,
              },
            },
          },
          _count: {
            select: {
              complaints: true,
              order_items: true,
              wishlist_items: true,
              questions: true,
            },
          },
          item: {
            include: {
              subcategory: {
                include: {
                  category: true,
                },
              },
            },
          },
          moderation_events: {
            orderBy: [{ created_at: "desc" }, { id: "desc" }],
            take: 1,
          },
          images: {
            orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
      });

      res.json(
        listings.map((listing) => {
          const latestModeration = listing.moderation_events[0] ?? null;
          const addressInfo = extractPrimaryAddressInfo(listing.seller.addresses);
          return {
            id: listing.public_id,
            listingUrl: buildListingPublicUrl(listing.public_id),
            title: listing.title,
            description: listing.description,
            images: listing.images.map((image) => image.url),
            sellerId: listing.seller.public_id,
            sellerName: listing.seller.name,
            sellerStatus: listing.seller.status.toLowerCase(),
            sellerJoinedAt: listing.seller.joined_at,
            status: toAdminListingStatus(listing.moderation_status),
            listingStatus: listing.status.toLowerCase(),
            createdAt: listing.created_at,
            category: listing.item?.name ?? "No category",
            city: addressInfo.city,
            region: addressInfo.region,
            price: listing.price,
            salePrice: listing.sale_price,
            views: listing.views,
            rating: listing.rating,
            complaintsCount: listing._count.complaints,
            ordersCount: listing._count.order_items,
            wishlistCount: listing._count.wishlist_items,
            questionsCount: listing._count.questions,
            autoFlags: buildAutoFlags({
              description: listing.description,
              seller: listing.seller,
              complaints_count: listing._count.complaints,
            }),
            latestModeration: latestModeration
              ? {
                  id: latestModeration.public_id,
                  decision: latestModeration.decision.toLowerCase(),
                  reasonCode: latestModeration.reason_code,
                  reasonNote: latestModeration.reason_note,
                  riskScore: latestModeration.risk_score,
                  signals: Array.isArray(latestModeration.signals)
                    ? (latestModeration.signals as string[])
                    : [],
                  createdAt: latestModeration.created_at,
                }
              : null,
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching listings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.patch("/listings/:publicId/moderation", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const body = (req.body ?? {}) as {
        status?: unknown;
        reasonCode?: unknown;
        reasonNote?: unknown;
      };
      const parsedStatus = parseModerationStatus(body.status);
      if (!parsedStatus) {
        res.status(400).json({ error: "Invalid moderation status" });
        return;
      }

      const parsedReasonCode = parseListingModerationReasonCode(body.reasonCode);
      const reasonCode =
        parsedReasonCode ?? defaultListingModerationReasonCode({ moderationStatus: parsedStatus });
      const reasonNote =
        typeof body.reasonNote === "string" ? body.reasonNote.trim().slice(0, 2000) : null;

      const existing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(publicId) },
        select: {
          id: true,
          public_id: true,
          seller_id: true,
          title: true,
          moderation_status: true,
          status: true,
        },
      });

      if (!existing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const activationBlockedByOrder =
        parsedStatus === "APPROVED" ? await hasBlockingOrderForListing(existing.id) : false;
      const nextListingStatus: ListingStatusValue =
        parsedStatus === "APPROVED"
          ? activationBlockedByOrder
            ? "INACTIVE"
            : "ACTIVE"
          : parsedStatus === "REJECTED"
            ? "INACTIVE"
            : "MODERATION";

      const updated = await prisma.marketplaceListing.update({
        where: { id: existing.id },
        data: {
          moderation_status: parsedStatus,
          status: nextListingStatus,
        },
      });

      await writeListingModerationEvent({
        listingId: existing.id,
        actorUserId: access.user.id,
        decision: toModerationDecision(parsedStatus),
        reasonCode,
        reasonNote,
        metadata: {
          source: "admin.patch_moderation",
          activationBlockedByOrder,
        },
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "listing.moderation_changed",
        entityType: "listing",
        entityPublicId: String(publicId),
        details: {
          beforeModerationStatus: existing.moderation_status,
          afterModerationStatus: updated.moderation_status,
          beforeListingStatus: existing.status,
          afterListingStatus: updated.status,
          activationBlockedByOrder,
          reasonCode,
          reasonNote,
        },
      });

      await createNotification(
        listingModerationNotification({
          sellerId: existing.seller_id,
          listingPublicId: existing.public_id,
          title: existing.title,
          moderationStatus: parsedStatus,
          reasonNote,
          reasonCode,
        }),
      );

      res.json({
        success: true,
        status: toAdminListingStatus(updated.moderation_status),
        listingStatus: updated.status.toLowerCase(),
        activationBlockedByOrder,
        reasonCode,
        reasonNote,
      });
    } catch (error) {
      console.error("Error moderating listing:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.get("/listings/:publicId/moderation-events", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const { publicId } = req.params;
      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(publicId) },
        select: { id: true },
      });
      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const events = await prisma.listingModerationEvent.findMany({
        where: {
          listing_id: listing.id,
        },
        include: {
          actor: {
            select: {
              public_id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: 200,
      });

      res.json({
        events: events.map((event) => ({
          id: event.public_id,
          actorType: event.actor_type.toLowerCase(),
          actor: event.actor
            ? {
                id: event.actor.public_id,
                name: event.actor.name,
                email: event.actor.email,
              }
            : null,
          decision: event.decision.toLowerCase(),
          reasonCode: event.reason_code,
          reasonNote: event.reason_note,
          riskScore: event.risk_score,
          signals: Array.isArray(event.signals) ? (event.signals as string[]) : [],
          metadata: event.metadata,
          createdAt: event.created_at,
        })),
      });
    } catch (error) {
      console.error("Error fetching listing moderation events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  adminRouter.post("/listings/moderation/batch", async (req: Request, res: Response) => {
    try {
      const access = await requireAdmin(req, res);
      if (!access.ok) return;

      const body = (req.body ?? {}) as {
        listingIds?: unknown;
        status?: unknown;
        reasonCode?: unknown;
        reasonNote?: unknown;
      };
      const listingIds = Array.isArray(body.listingIds)
        ? body.listingIds
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      if (listingIds.length === 0) {
        res.status(400).json({ error: "listingIds are required" });
        return;
      }

      const parsedStatus = parseModerationStatus(body.status);
      if (!parsedStatus || parsedStatus === "PENDING") {
        res.status(400).json({ error: "Batch supports only approved or rejected status" });
        return;
      }

      const parsedReasonCode = parseListingModerationReasonCode(body.reasonCode);
      const reasonCode =
        parsedReasonCode ?? defaultListingModerationReasonCode({ moderationStatus: parsedStatus });
      const reasonNote =
        typeof body.reasonNote === "string" ? body.reasonNote.trim().slice(0, 2000) : null;

      const existing = await prisma.marketplaceListing.findMany({
        where: {
          public_id: {
            in: Array.from(new Set(listingIds)),
          },
        },
        select: {
          id: true,
          public_id: true,
          seller_id: true,
          title: true,
          moderation_status: true,
          status: true,
        },
      });
      if (existing.length === 0) {
        res.status(404).json({ error: "No listings found for provided ids" });
        return;
      }

      const results = await prisma.$transaction(async (tx) => {
        const rows: Array<{
          id: string;
          status: string;
          listingStatus: string;
          activationBlockedByOrder: boolean;
        }> = [];

        for (const listing of existing) {
          const activationBlockedByOrder =
            parsedStatus === "APPROVED"
              ? Boolean(
                  await tx.marketOrderItem.findFirst({
                    where: {
                      listing_id: listing.id,
                      order: {
                        status: {
                          not: "CANCELLED",
                        },
                      },
                    },
                    select: { id: true },
                  }),
                )
              : false;
          const nextListingStatus: ListingStatusValue =
            parsedStatus === "APPROVED"
              ? activationBlockedByOrder
                ? "INACTIVE"
                : "ACTIVE"
              : "INACTIVE";

          const updated = await tx.marketplaceListing.update({
            where: { id: listing.id },
            data: {
              moderation_status: parsedStatus,
              status: nextListingStatus,
            },
          });

          await tx.listingModerationEvent.create({
            data: {
              public_id: makeListingModerationEventPublicId(),
              listing_id: listing.id,
              actor_user_id: access.user.id,
              actor_type: "ADMIN",
              decision: toModerationDecision(parsedStatus),
              reason_code: reasonCode,
              reason_note: reasonNote,
              metadata: {
                source: "admin.batch_moderation",
                activationBlockedByOrder,
              },
            },
          });

          const sellerNotification = listingModerationNotification({
            sellerId: listing.seller_id,
            listingPublicId: listing.public_id,
            title: listing.title,
            moderationStatus: parsedStatus,
            reasonNote,
            reasonCode,
          });
          await tx.notification.create({
            data: {
              user_id: sellerNotification.userId,
              type: sellerNotification.type ?? "SYSTEM",
              message: sellerNotification.message,
              target_url: sellerNotification.targetUrl,
            },
          });

          rows.push({
            id: listing.public_id,
            status: toAdminListingStatus(updated.moderation_status),
            listingStatus: updated.status.toLowerCase(),
            activationBlockedByOrder,
          });
        }
        return rows;
      });

      await writeAudit({
        req,
        actorUserId: access.user.id,
        action: "listing.moderation_changed",
        entityType: "listing",
        entityPublicId: null,
        details: {
          mode: "batch",
          listingIds: existing.map((item) => item.public_id),
          status: parsedStatus,
          reasonCode,
          reasonNote,
        },
      });

      res.json({
        success: true,
        updated: results.length,
        reasonCode,
        reasonNote,
        items: results,
      });
    } catch (error) {
      console.error("Error batch moderating listings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
