import { Prisma } from "@prisma/client";
import type { Request, Response, Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import { makePublicId } from "./partner.shared";

const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
type ListingTypeValue = "PRODUCT";

function parseListingType(_value: unknown): ListingTypeValue {
  return "PRODUCT";
}

function formatDraftPublicId(id: number): string {
  return `DRF-${String(id).padStart(4, "0")}`;
}

function safeJsonPayload(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

function draftToClient(draft: {
  public_id: string;
  title: string | null;
  type: ListingTypeValue;
  category_id: number | null;
  subcategory_id: number | null;
  item_id: number | null;
  payload: Prisma.JsonValue;
  current_screen: string;
  updated_at: Date;
  created_at: Date;
}) {
  return {
    id: draft.public_id,
    title: draft.title ?? "",
    type: "products",
    categoryId: draft.category_id,
    subcategoryId: draft.subcategory_id,
    itemId: draft.item_id,
    payload: draft.payload,
    currentScreen: draft.current_screen,
    updatedAt: draft.updated_at,
    createdAt: draft.created_at,
  };
}

export function registerPartnerDraftRoutes(router: Router): void {
  router.get("/listing-drafts", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      const type = parseListingType(req.query.type);
      const drafts = await prisma.listingDraft.findMany({
        where: {
          seller_id: session.user.id,
          type,
        },
        orderBy: [{ updated_at: "desc" }, { id: "desc" }],
        take: 3,
      });
      res.json(drafts.map(draftToClient));
    } catch (error) {
      console.error("Error fetching listing drafts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/listing-drafts", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        type?: unknown;
        title?: unknown;
        categoryId?: unknown;
        subcategoryId?: unknown;
        itemId?: unknown;
        payload?: unknown;
        currentScreen?: unknown;
      };
      const draftType = parseListingType(body.type);
      const created = await prisma.$transaction(async (tx) => {
        const draft = await tx.listingDraft.create({
          data: {
            public_id: makePublicId("DRFTMP"),
            seller_id: session.user.id,
            type: draftType,
            title: typeof body.title === "string" ? body.title.trim().slice(0, 160) : null,
            category_id: Number.isInteger(Number(body.categoryId)) ? Number(body.categoryId) : null,
            subcategory_id: Number.isInteger(Number(body.subcategoryId)) ? Number(body.subcategoryId) : null,
            item_id: Number.isInteger(Number(body.itemId)) ? Number(body.itemId) : null,
            payload: safeJsonPayload(body.payload),
            current_screen:
              typeof body.currentScreen === "string"
                ? body.currentScreen.trim().slice(0, 40) || "start"
                : "start",
          },
        });
        const updated = await tx.listingDraft.update({
          where: { id: draft.id },
          data: {
            public_id: formatDraftPublicId(draft.id),
          },
        });
        const staleDrafts = await tx.listingDraft.findMany({
          where: {
            seller_id: session.user.id,
            type: draftType,
            id: { not: updated.id },
          },
          orderBy: [{ updated_at: "desc" }, { id: "desc" }],
          skip: 2,
          select: { id: true },
        });
        if (staleDrafts.length > 0) {
          await tx.listingDraft.deleteMany({
            where: { id: { in: staleDrafts.map((draft) => draft.id) } },
          });
        }
        return updated;
      });
      res.status(201).json(draftToClient(created));
    } catch (error) {
      console.error("Error creating listing draft:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/listing-drafts/:publicId", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        type?: unknown;
        title?: unknown;
        categoryId?: unknown;
        subcategoryId?: unknown;
        itemId?: unknown;
        payload?: unknown;
        currentScreen?: unknown;
      };
      const publicId = String(req.params.publicId);
      const existing = await prisma.listingDraft.findFirst({
        where: {
          public_id: publicId,
          seller_id: session.user.id,
        },
      });
      if (!existing) {
        res.status(404).json({ error: "Draft not found" });
        return;
      }
      const updated = await prisma.listingDraft.update({
        where: { id: existing.id },
        data: {
          type: body.type === undefined ? undefined : parseListingType(body.type),
          title:
            body.title === undefined
              ? undefined
              : typeof body.title === "string"
                ? body.title.trim().slice(0, 160)
                : null,
          category_id:
            body.categoryId === undefined
              ? undefined
              : Number.isInteger(Number(body.categoryId))
                ? Number(body.categoryId)
                : null,
          subcategory_id:
            body.subcategoryId === undefined
              ? undefined
              : Number.isInteger(Number(body.subcategoryId))
                ? Number(body.subcategoryId)
                : null,
          item_id:
            body.itemId === undefined
              ? undefined
              : Number.isInteger(Number(body.itemId))
                ? Number(body.itemId)
                : null,
          payload: body.payload === undefined ? undefined : safeJsonPayload(body.payload),
          current_screen:
            body.currentScreen === undefined
              ? undefined
              : typeof body.currentScreen === "string"
                ? body.currentScreen.trim().slice(0, 40) || "start"
                : "start",
        },
      });
      res.json(draftToClient(updated));
    } catch (error) {
      console.error("Error updating listing draft:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.delete("/listing-drafts/:publicId", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, [ROLE_SELLER, ROLE_ADMIN]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      const publicId = String(req.params.publicId);
      const existing = await prisma.listingDraft.findFirst({
        where: {
          public_id: publicId,
          seller_id: session.user.id,
        },
      });
      if (!existing) {
        res.status(404).json({ error: "Draft not found" });
        return;
      }
      await prisma.listingDraft.delete({ where: { id: existing.id } });
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting listing draft:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
