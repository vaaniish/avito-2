import {
  AppUser,
  ListingImage,
  MarketplaceListing,
  WishlistItem,
} from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import { toClientCondition } from "../../utils/format";
import { extractPrimaryCityFromAddresses } from "./profile.shared";
import {
  acceptPolicyForUser,
  getRequestMetaFromExpressLike,
  normalizePolicyScope,
  toClientPolicyScope,
} from "../policy/policy.shared";

const profileAccountRouter = Router();

const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";

const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

profileAccountRouter.get("/wishlist", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return;
    }

    const wishlist = await prisma.wishlistItem.findMany({
      where: { user_id: session.user.id },
      include: {
        listing: {
          include: {
            seller: {
              include: {
                addresses: {
                  select: {
                    city: true,
                  },
                  orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
                  take: 1,
                },
              },
            },
            images: {
              orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            },
          },
        },
      },
      orderBy: [{ added_at: "desc" }],
    });

    res.json(
      wishlist.map(
        (
          item: WishlistItem & {
            listing: MarketplaceListing & {
              seller: AppUser & { addresses: Array<{ city: string }> };
              images: ListingImage[];
            };
          },
        ) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location:
            extractPrimaryCityFromAddresses(item.listing.seller.addresses) ?? "",
          condition: toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileAccountRouter.post(
  "/wishlist/:listingPublicId",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { listingPublicId } = req.params;
      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true, seller_id: true },
      });
      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      await prisma.wishlistItem.upsert({
        where: {
          user_id_listing_id: {
            user_id: session.user.id,
            listing_id: listing.id,
          },
        },
        create: {
          user_id: session.user.id,
          listing_id: listing.id,
        },
        update: {},
      });

      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error adding wishlist item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileAccountRouter.delete(
  "/wishlist/:listingPublicId",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { listingPublicId } = req.params;
      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true, seller_id: true },
      });
      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      await prisma.wishlistItem.deleteMany({
        where: {
          user_id: session.user.id,
          listing_id: listing.id,
        },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting wishlist item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileAccountRouter.get(
  "/notifications",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        return res.status(session.status).json({ error: session.message });
      }

      const notifications = await prisma.notification.findMany({
        where: { user_id: session.user.id },
        orderBy: { created_at: "desc" },
      });

      const unreadCount = await prisma.notification.count({
        where: { user_id: session.user.id, is_read: false },
      });

      return res.json({
        notifications: notifications.map((n) => ({
          id: n.id,
          type: n.type,
          message: n.message,
          url: n.target_url,
          isRead: n.is_read,
          date: n.created_at,
        })),
        unreadCount,
      });
    } catch (error) {
      console.error("Error fetching notifications:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileAccountRouter.patch(
  "/notifications/mark-as-read",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        return res.status(session.status).json({ error: session.message });
      }

      await prisma.notification.updateMany({
        where: { user_id: session.user.id, is_read: false },
        data: { is_read: true },
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Error marking notifications as read:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileAccountRouter.post(
  "/policy-acceptance",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [
        ROLE_BUYER,
        ROLE_SELLER,
        ROLE_ADMIN,
      ]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        scope?: unknown;
        policyId?: unknown;
      };

      const scope = normalizePolicyScope(body.scope);
      if (!scope) {
        res.status(400).json({ error: "Invalid policy scope. Use checkout or partnership." });
        return;
      }

      const requestPolicyPublicId =
        typeof body.policyId === "string" ? body.policyId.trim() : null;
      const requestMeta = getRequestMetaFromExpressLike(req);
      const accepted = await acceptPolicyForUser({
        prisma,
        userId: session.user.id,
        scope,
        requestPolicyPublicId,
        requestIp: requestMeta.ipAddress,
        requestUserAgent: requestMeta.userAgent,
      });

      if (!accepted.ok) {
        const statusCode =
          accepted.code === "POLICY_VERSION_MISMATCH"
            ? 409
            : accepted.code === "POLICY_NOT_FOUND"
              ? 404
              : 400;
        res.status(statusCode).json({
          error: accepted.message,
          policy: "policy" in accepted && accepted.policy
            ? {
                id: accepted.policy.public_id,
                scope: toClientPolicyScope(accepted.policy.scope),
                version: accepted.policy.version,
                title: accepted.policy.title,
                contentUrl: accepted.policy.content_url,
              }
            : null,
        });
        return;
      }

      res.status(201).json({
        success: true,
        policy: {
          id: accepted.policy.public_id,
          scope: toClientPolicyScope(accepted.policy.scope),
          version: accepted.policy.version,
          title: accepted.policy.title,
          contentUrl: accepted.policy.content_url,
        },
      });
    } catch (error) {
      console.error("Error accepting policy:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export { profileAccountRouter };
