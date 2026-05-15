import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { CreateLegacyPartnershipRequestService } from "../application/services/create-legacy-partnership-request.service";
import type { CreateListingReviewService } from "../application/services/create-listing-review.service";
import type { CreatePartnershipDraftService } from "../application/services/create-partnership-draft.service";
import type { LookupPartnershipLegalEntityService } from "../application/services/lookup-partnership-legal-entity.service";
import type { SubmitPartnershipDraftService } from "../application/services/submit-partnership-draft.service";
import type { UpdatePartnershipDraftService } from "../application/services/update-partnership-draft.service";

type SessionResult =
  | { ok: true; user: { id: number; role: string; email: string } }
  | { ok: false; status: number; message: string };

export function createProfileEngagementRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  services: {
    lookupPartnershipLegalEntity: LookupPartnershipLegalEntityService;
    createPartnershipDraft: CreatePartnershipDraftService;
    updatePartnershipDraft: UpdatePartnershipDraftService;
    submitPartnershipDraft: SubmitPartnershipDraftService;
    createLegacyPartnershipRequest: CreateLegacyPartnershipRequestService;
    createListingReview: CreateListingReviewService;
  };
}) {
  const router = Router();
  const profileRoles = ["BUYER", "SELLER", "ADMIN"];

  router.post(
    "/partnership-requests/legal-lookup",
    async (req: Request, res: Response) => {
      try {
        const session = await deps.requireAnyRole(req, profileRoles);
        if (!session.ok) {
          res.status(session.status).json({ error: session.message });
          return;
        }

        res.json(
          await deps.services.lookupPartnershipLegalEntity.execute(
            (req.body ?? {}) as { inn: unknown; legalType: unknown },
          ),
        );
      } catch (error) {
        console.error("Error looking up partnership legal entity:", error);
        sendApplicationError(res, error);
      }
    },
  );

  router.post(
    "/partnership-requests/draft",
    async (req: Request, res: Response) => {
      try {
        const session = await deps.requireAnyRole(req, profileRoles);
        if (!session.ok) {
          res.status(session.status).json({ error: session.message });
          return;
        }

        res.status(201).json(
          await deps.services.createPartnershipDraft.execute({
            userId: session.user.id,
            userEmail: session.user.email,
            payload: (req.body ?? {}) as any,
          }),
        );
      } catch (error) {
        console.error("Error creating partnership draft:", error);
        sendApplicationError(res, error);
      }
    },
  );

  router.patch(
    "/partnership-requests/:publicId",
    async (req: Request, res: Response) => {
      try {
        const session = await deps.requireAnyRole(req, profileRoles);
        if (!session.ok) {
          res.status(session.status).json({ error: session.message });
          return;
        }

        res.json(
          await deps.services.updatePartnershipDraft.execute({
            publicId: String(req.params.publicId ?? ""),
            userId: session.user.id,
            payload: (req.body ?? {}) as any,
          }),
        );
      } catch (error) {
        console.error("Error updating partnership draft:", error);
        sendApplicationError(res, error);
      }
    },
  );

  router.post(
    "/partnership-requests/:publicId/submit",
    async (req: Request, res: Response) => {
      try {
        const session = await deps.requireAnyRole(req, profileRoles);
        if (!session.ok) {
          res.status(session.status).json({ error: session.message });
          return;
        }

        res.json(
          await deps.services.submitPartnershipDraft.execute({
            publicId: String(req.params.publicId ?? ""),
            userId: session.user.id,
          }),
        );
      } catch (error) {
        console.error("Error submitting partnership request:", error);
        sendApplicationError(res, error);
      }
    },
  );

  router.post("/partnership-requests", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.status(201).json(
        await deps.services.createLegacyPartnershipRequest.execute({
          userId: session.user.id,
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error creating partnership request:", error);
      sendApplicationError(res, error);
    }
  });

  router.post(
    "/listings/:listingPublicId/review",
    async (req: Request, res: Response) => {
      try {
        const session = await deps.requireAnyRole(req, ["BUYER"]);
        if (!session.ok) {
          res.status(session.status).json({ error: session.message });
          return;
        }

        const body = (req.body ?? {}) as { rating?: unknown; comment?: unknown };
        res.status(201).json(
          await deps.services.createListingReview.execute({
            listingPublicId: String(req.params.listingPublicId ?? ""),
            buyerUserId: session.user.id,
            rating: body.rating,
            comment: body.comment,
          }),
        );
      } catch (error) {
        console.error("Error creating review:", error);
        sendApplicationError(res, error);
      }
    },
  );

  return router;
}
