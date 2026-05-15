import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import { parseListingType } from "../domain/partner-drafts.helpers";
import type { CreateListingDraftService } from "../application/services/create-listing-draft.service";
import type { DeleteListingDraftService } from "../application/services/delete-listing-draft.service";
import type { ListListingDraftsService } from "../application/services/list-listing-drafts.service";
import type { UpdateListingDraftService } from "../application/services/update-listing-draft.service";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createPartnerDraftsRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  services: {
    listListingDrafts: ListListingDraftsService;
    createListingDraft: CreateListingDraftService;
    updateListingDraft: UpdateListingDraftService;
    deleteListingDraft: DeleteListingDraftService;
  };
}) {
  const router = Router();
  const roles = ["SELLER", "ADMIN"];

  router.get("/listing-drafts", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(
        await deps.services.listListingDrafts.execute({
          sellerId: session.user.id,
          type: parseListingType(req.query.type),
        }),
      );
    } catch (error) {
      console.error("Error fetching listing drafts:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listing-drafts", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.status(201).json(
        await deps.services.createListingDraft.execute({
          sellerId: session.user.id,
          type: parseListingType((req.body ?? {})["type"]),
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error creating listing draft:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/listing-drafts/:publicId", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(
        await deps.services.updateListingDraft.execute({
          sellerId: session.user.id,
          publicId: String(req.params.publicId ?? ""),
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error updating listing draft:", error);
      sendApplicationError(res, error);
    }
  });

  router.delete("/listing-drafts/:publicId", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }
      res.json(
        await deps.services.deleteListingDraft.execute({
          sellerId: session.user.id,
          publicId: String(req.params.publicId ?? ""),
        }),
      );
    } catch (error) {
      console.error("Error deleting listing draft:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
