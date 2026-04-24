import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import { getPolicyAcceptanceStatus } from "../policy/policy.shared";

const profileEngagementRouter = Router();

const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";

const PARTNERSHIP_ALLOWED_CATEGORY_KEYS = new Set<string>([
  "smartphones",
  "laptops",
  "tablets",
  "audio",
  "wearables",
  "gaming",
  "components",
  "accessories",
  "home_appliances",
  "kitchen_appliances",
  "electronics_repair",
  "home_appliance_repair",
]);

function parsePartnerSellerType(value: unknown): "COMPANY" | "IP" | "BRAND" | "ADMIN_APPROVED" | null {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "company") return "COMPANY";
  if (raw === "ip") return "IP";
  if (raw === "brand") return "BRAND";
  if (raw === "admin_approved") return "ADMIN_APPROVED";
  return null;
}

function normalizePartnerCategoryKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toNullableTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

profileEngagementRouter.post(
  "/partnership-requests",
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
        sellerType?: unknown;
        name?: unknown;
        email?: unknown;
        contact?: unknown;
        link?: unknown;
        category?: unknown;
        inn?: unknown;
        geography?: unknown;
        socialProfile?: unknown;
        credibility?: unknown;
        whyUs?: unknown;
      };

      const policyStatus = await getPolicyAcceptanceStatus({
        prisma,
        userId: session.user.id,
        scope: "PARTNERSHIP",
      });
      if (!policyStatus.accepted) {
        res.status(412).json({
          error: "Before submitting a partnership request, accept the partnership policy.",
          policy: policyStatus.policy
            ? {
                id: policyStatus.policy.public_id,
                scope: "partnership",
                version: policyStatus.policy.version,
                title: policyStatus.policy.title,
                contentUrl: policyStatus.policy.content_url,
              }
            : null,
        });
        return;
      }

      const sellerType = parsePartnerSellerType(body.sellerType);
      if (!sellerType) {
        res.status(400).json({
          error:
            "Partner type must be one of: company, ip, brand, admin_approved.",
        });
        return;
      }
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const contact =
        typeof body.contact === "string" ? body.contact.trim() : "";
      const link = typeof body.link === "string" ? body.link.trim() : "";
      const category =
        typeof body.category === "string" ? body.category.trim() : "";
      const categoryKey = normalizePartnerCategoryKey(body.category);
      const whyUs = typeof body.whyUs === "string" ? body.whyUs.trim() : "";

      if (!name || !email || !contact || !link || !category || !whyUs) {
        res
          .status(400)
          .json({ error: "Заполните обязательные поля заявки" });
        return;
      }

      if (!PARTNERSHIP_ALLOWED_CATEGORY_KEYS.has(categoryKey)) {
        res.status(400).json({
          error:
            "Only categories related to electronics and home appliances are allowed.",
        });
        return;
      }

      const created = await prisma.partnershipRequest.create({
        data: {
          public_id: `PRQ-${Date.now()}`,
          user_id: session.user.id,
          seller_type: sellerType,
          status: "PENDING",
          name,
          email,
          contact,
          link,
          category,
          inn: toNullableTrimmedString(body.inn),
          geography: toNullableTrimmedString(body.geography),
          social_profile: toNullableTrimmedString(body.socialProfile),
          credibility: toNullableTrimmedString(body.credibility),
          why_us: whyUs,
        },
      });

      res.status(201).json({
        success: true,
        request_id: created.public_id,
      });
    } catch (error) {
      console.error("Error creating partnership request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileEngagementRouter.post(
  "/listings/:listingPublicId/review",
  async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_BUYER]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const { listingPublicId } = req.params;
      const body = (req.body ?? {}) as { rating?: unknown; comment?: unknown };
      const rating = Number(body.rating);
      const comment =
        typeof body.comment === "string" ? body.comment.trim() : "";

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        res
          .status(400)
          .json({ error: "Rating must be an integer from 1 to 5" });
        return;
      }

      if (comment.length < 3) {
        res.status(400).json({ error: "Comment is too short" });
        return;
      }

      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true, seller_id: true },
      });

      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      const orderCount = await prisma.marketOrder.count({
        where: {
          buyer_id: session.user.id,
          status: "COMPLETED",
          items: {
            some: {
              listing_id: listing.id,
            },
          },
        },
      });

      if (orderCount === 0) {
        res
          .status(403)
          .json({ error: "You can only review items you have purchased." });
        return;
      }

      const existingReview = await prisma.listingReview.findUnique({
        where: {
          listing_id_author_id: {
            listing_id: listing.id,
            author_id: session.user.id,
          },
        },
      });

      if (existingReview) {
        res.status(409).json({ error: "You have already reviewed this item." });
        return;
      }

      const newReview = await prisma.listingReview.create({
        data: {
          listing_id: listing.id,
          author_id: session.user.id,
          rating,
          comment,
        },
        include: {
          author: {
            select: {
              display_name: true,
              avatar: true,
            },
          },
        },
      });

      const sellerReviews = await prisma.listingReview.findMany({
        where: {
          listing: {
            seller_id: listing.seller_id,
          },
        },
        select: {
          rating: true,
        },
      });

      const sellerRating =
        sellerReviews.length === 0
          ? 0
          : Number(
              (
                sellerReviews.reduce((sum, item) => sum + item.rating, 0) /
                sellerReviews.length
              ).toFixed(1),
            );

      await prisma.marketplaceListing.updateMany({
        where: { seller_id: listing.seller_id },
        data: {
          rating: sellerRating,
        },
      });

      res.status(201).json({
        id: String(newReview.id),
        author: newReview.author.display_name ?? "Аноним",
        rating: newReview.rating,
        date: newReview.created_at,
        comment: newReview.comment,
        avatar: newReview.author.avatar,
      });
    } catch (error) {
      console.error("Error creating review:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export { profileEngagementRouter };
