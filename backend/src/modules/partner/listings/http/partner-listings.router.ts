import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { CreateCatalogRequestService } from "../application/services/create-catalog-request.service";
import type { CreatePartnerListingService } from "../application/services/create-partner-listing.service";
import type { DeletePartnerListingService } from "../application/services/delete-partner-listing.service";
import type { GetCatalogReferenceService } from "../application/services/get-catalog-reference.service";
import type { GetListingCreateSuggestionsService } from "../application/services/get-listing-create-suggestions.service";
import type { GetListingTitleSuggestionsService } from "../application/services/get-listing-title-suggestions.service";
import type { GuessListingCategoryService } from "../application/services/guess-listing-category.service";
import type { ListPartnerListingsService } from "../application/services/list-partner-listings.service";
import type { SetPartnerListingStatusService } from "../application/services/set-partner-listing-status.service";
import type { TogglePartnerListingStatusService } from "../application/services/toggle-partner-listing-status.service";
import type { UpdatePartnerListingService } from "../application/services/update-partner-listing.service";

type SessionResult =
  | { ok: true; user: { id: number; role: string } }
  | { ok: false; status: number; message: string };

export function createPartnerListingsRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  services: {
    listPartnerListings: ListPartnerListingsService;
    getListingTitleSuggestions: GetListingTitleSuggestionsService;
    getListingCreateSuggestions: GetListingCreateSuggestionsService;
    createCatalogRequest: CreateCatalogRequestService;
    getCatalogReference: GetCatalogReferenceService;
    guessListingCategory: GuessListingCategoryService;
    createPartnerListing: CreatePartnerListingService;
    updatePartnerListing: UpdatePartnerListingService;
    togglePartnerListingStatus: TogglePartnerListingStatusService;
    setPartnerListingStatus: SetPartnerListingStatusService;
    deletePartnerListing: DeletePartnerListingService;
  };
}) {
  const router = Router();
  const roles = ["SELLER", "ADMIN"];

  async function requireSession(req: Request, res: Response) {
    const session = await deps.requireAnyRole(req, roles);
    if (!session.ok) {
      res.status(session.status).json({ error: session.message });
      return null;
    }
    return session.user;
  }

  router.get("/listings", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.listPartnerListings.execute({
          sellerId: user.id,
          type: req.query.type,
        }),
      );
    } catch (error) {
      console.error("Error fetching partner listings:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/title-suggestions", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.getListingTitleSuggestions.execute({
          query: typeof req.query.q === "string" ? req.query.q : "",
          type: req.query.type,
        }),
      );
    } catch (error) {
      console.error("Error getting title suggestions:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/create-suggestions", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.getListingCreateSuggestions.execute({
          query: typeof req.query.q === "string" ? req.query.q : "",
          type: req.query.type,
        }),
      );
    } catch (error) {
      console.error("Error getting create suggestions:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listings/catalog-requests", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.status(201).json(
        await deps.services.createCatalogRequest.execute({
          sellerId: user.id,
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error creating catalog request:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/catalog-reference", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.getCatalogReference.execute({
          itemName: typeof req.query.item === "string" ? req.query.item.trim() : "",
          brand: typeof req.query.brand === "string" ? req.query.brand.trim() : "",
          model: typeof req.query.model === "string" ? req.query.model.trim() : "",
        }),
      );
    } catch (error) {
      console.error("Error getting catalog reference:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/listings/category-guess", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.guessListingCategory.execute({
          title: typeof req.query.title === "string" ? req.query.title : "",
          type: req.query.type,
        }),
      );
    } catch (error) {
      console.error("Error guessing listing category:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listings", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.status(201).json(
        await deps.services.createPartnerListing.execute({
          sellerId: user.id,
          sellerRole: user.role,
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error creating listing:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/listings/:publicId", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.updatePartnerListing.execute({
          sellerId: user.id,
          sellerRole: user.role,
          publicId: String(req.params.publicId ?? ""),
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error updating listing:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/listings/:publicId/toggle-status", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.togglePartnerListingStatus.execute({
          sellerId: user.id,
          publicId: String(req.params.publicId ?? ""),
        }),
      );
    } catch (error) {
      console.error("Error toggling listing status:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/listings/:publicId/status", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      const body = (req.body ?? {}) as { status?: unknown };
      res.json(
        await deps.services.setPartnerListingStatus.execute({
          sellerId: user.id,
          publicId: String(req.params.publicId ?? ""),
          status: body.status,
        }),
      );
    } catch (error) {
      console.error("Error setting listing status:", error);
      sendApplicationError(res, error);
    }
  });

  router.delete("/listings/:publicId", async (req, res) => {
    try {
      const user = await requireSession(req, res);
      if (!user) return;
      res.json(
        await deps.services.deletePartnerListing.execute({
          sellerId: user.id,
          publicId: String(req.params.publicId ?? ""),
        }),
      );
    } catch (error) {
      console.error("Error deleting listing:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
