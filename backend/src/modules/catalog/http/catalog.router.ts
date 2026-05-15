import { Router, type Request, type Response } from "express";
import { getSessionUser, requireAnyRole } from "../../../lib/session";
import { sendApplicationError } from "../../../common/http/map-application-error";
import type { CreateListingComplaintService } from "../application/services/create-listing-complaint.service";
import type { CreateListingQuestionService } from "../application/services/create-listing-question.service";
import type { GetCategoriesService } from "../application/services/get-categories.service";
import type { GetListingDetailsService } from "../application/services/get-listing-details.service";
import type { GetListingQuestionsService } from "../application/services/get-listing-questions.service";
import type { GetListingsService } from "../application/services/get-listings.service";
import type { GetSellerListingsService } from "../application/services/get-seller-listings.service";
import type { GetSuggestionsService } from "../application/services/get-suggestions.service";
import type { RecordListingViewService } from "../application/services/record-listing-view.service";

function getRequestIp(req: Request): string | null {
  const forwarded = req.header("x-forwarded-for");
  if (forwarded && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim() ?? null;
  }
  return req.ip || null;
}

export function createCatalogRouter(deps: {
  services: {
    getCategories: GetCategoriesService;
    getListings: GetListingsService;
    getListingDetails: GetListingDetailsService;
    recordListingView: RecordListingViewService;
    getSellerListings: GetSellerListingsService;
    getSuggestions: GetSuggestionsService;
    getListingQuestions: GetListingQuestionsService;
    createListingQuestion: CreateListingQuestionService;
    createListingComplaint: CreateListingComplaintService;
  };
}) {
  const router = Router();

  router.get("/categories", async (req: Request, res: Response) => {
    try {
      res.json(await deps.services.getCategories.execute({ type: req.query.type }));
    } catch (error) {
      console.error("Error fetching categories:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings", async (req: Request, res: Response) => {
    try {
      res.json(await deps.services.getListings.execute(req.query as Record<string, unknown>));
    } catch (error) {
      console.error("Error fetching listings:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/:publicId", async (req: Request, res: Response) => {
    try {
      const sessionUser = await getSessionUser(req);
      res.json(
        await deps.services.getListingDetails.execute({
          publicId: String(req.params.publicId ?? ""),
          sessionUser,
        }),
      );
    } catch (error) {
      console.error("Error fetching listing by id:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listings/:publicId/view", async (req: Request, res: Response) => {
    try {
      res.json(
        await deps.services.recordListingView.execute({
          publicId: String(req.params.publicId ?? ""),
        }),
      );
    } catch (error) {
      console.error("Error incrementing listing views:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/sellers/:publicId/listings", async (req: Request, res: Response) => {
    try {
      res.json(
        await deps.services.getSellerListings.execute({
          sellerPublicId: String(req.params.publicId ?? ""),
          query: req.query as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error fetching seller listings:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/suggestions", async (req: Request, res: Response) => {
    try {
      res.json(
        await deps.services.getSuggestions.execute({
          query: String(req.query.q ?? ""),
        }),
      );
    } catch (error) {
      console.error("Error fetching suggestions:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/:publicId/questions", async (req: Request, res: Response) => {
    try {
      res.json(
        await deps.services.getListingQuestions.execute({
          publicId: String(req.params.publicId ?? ""),
          query: req.query as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error fetching listing questions:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listings/:publicId/questions", async (req: Request, res: Response) => {
    try {
      const session = await requireAnyRole(req, ["BUYER", "SELLER"]);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as { question?: unknown };
      const result = await deps.services.createListingQuestion.execute({
        publicId: String(req.params.publicId ?? ""),
        actorUserId: session.user.id,
        actorRole: session.user.role,
        requestIp: getRequestIp(req),
        question: typeof body.question === "string" ? body.question : "",
      });
      res.status(201).json(result);
    } catch (error) {
      console.error("Error creating listing question:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listings/:publicId/complaints", async (req: Request, res: Response) => {
    try {
      const access = await requireAnyRole(req, ["BUYER", "SELLER", "ADMIN"]);
      if (!access.ok) {
        res.status(access.status).json({ error: access.message });
        return;
      }

      const body = (req.body ?? {}) as {
        complaintType?: unknown;
        description?: unknown;
      };
      const result = await deps.services.createListingComplaint.execute({
        publicId: String(req.params.publicId ?? ""),
        actorUserId: access.user.id,
        complaintType:
          typeof body.complaintType === "string" ? body.complaintType : "",
        description: typeof body.description === "string" ? body.description : "",
      });
      res.status(result.deduplicated ? 200 : 201).json(result);
    } catch (error) {
      console.error("Error creating listing complaint:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
