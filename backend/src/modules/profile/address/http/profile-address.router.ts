import { Router, type Request, type Response } from "express";
import { sendApplicationError } from "../../../../common/http/map-application-error";
import type { DeliveryProviderFilter } from "../domain/profile-address.types";
import type { CreateProfileAddressService } from "../application/services/create-profile-address.service";
import type { DeleteProfileAddressService } from "../application/services/delete-profile-address.service";
import type { GetDeliveryPointsService } from "../application/services/get-delivery-points.service";
import type { GetLocationSuggestionsService } from "../application/services/get-location-suggestions.service";
import type { ListProfileAddressesService } from "../application/services/list-profile-addresses.service";
import type { SetDefaultProfileAddressService } from "../application/services/set-default-profile-address.service";
import type { UpdateProfileAddressService } from "../application/services/update-profile-address.service";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

export function createProfileAddressHttpRouter(deps: {
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  parseDeliveryProviderFilter: (value: unknown) => DeliveryProviderFilter;
  services: {
    listProfileAddresses: ListProfileAddressesService;
    createProfileAddress: CreateProfileAddressService;
    updateProfileAddress: UpdateProfileAddressService;
    deleteProfileAddress: DeleteProfileAddressService;
    setDefaultProfileAddress: SetDefaultProfileAddressService;
    getLocationSuggestions: GetLocationSuggestionsService;
    getDeliveryPoints: GetDeliveryPointsService;
  };
}) {
  const router = Router();
  const roles = ["BUYER", "SELLER", "ADMIN"];

  router.get("/addresses", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(await deps.services.listProfileAddresses.execute(session.user.id));
    } catch (error) {
      console.error("Error fetching addresses:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/addresses", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.status(201).json(
        await deps.services.createProfileAddress.execute({
          userId: session.user.id,
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error creating address:", error);
      sendApplicationError(res, error);
    }
  });

  router.patch("/addresses/:id", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(
        await deps.services.updateProfileAddress.execute({
          id: Number(req.params.id),
          userId: session.user.id,
          body: (req.body ?? {}) as Record<string, unknown>,
        }),
      );
    } catch (error) {
      console.error("Error updating address:", error);
      sendApplicationError(res, error);
    }
  });

  router.delete("/addresses/:id", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(
        await deps.services.deleteProfileAddress.execute({
          id: Number(req.params.id),
          userId: session.user.id,
        }),
      );
    } catch (error) {
      console.error("Error deleting address:", error);
      sendApplicationError(res, error);
    }
  });

  router.post("/addresses/:id/default", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      res.json(
        await deps.services.setDefaultProfileAddress.execute({
          id: Number(req.params.id),
          userId: session.user.id,
        }),
      );
    } catch (error) {
      console.error("Error changing default address:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/location/suggest", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const limitRaw =
        typeof req.query.limit === "string" ? Number(req.query.limit) : 8;
      const limit =
        Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 10) : 8;

      res.json(
        await deps.services.getLocationSuggestions.execute({
          query,
          limit,
        }),
      );
    } catch (error) {
      console.error("Error loading location suggestions:", error);
      sendApplicationError(res, error);
    }
  });

  router.get("/delivery-points", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, roles);
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const locationQuery =
        typeof req.query.city === "string" ? req.query.city.trim() : "";
      const providerFilter = deps.parseDeliveryProviderFilter(req.query.provider);
      const cursorRaw =
        typeof req.query.cursor === "string" ? Number(req.query.cursor) : 0;
      const limitRaw =
        typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
      const cursor =
        Number.isFinite(cursorRaw) && cursorRaw > 0 ? Math.floor(cursorRaw) : 0;
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.floor(limitRaw)
          : undefined;

      res.json(
        await deps.services.getDeliveryPoints.execute({
          city: locationQuery,
          providerFilter,
          cursor,
          limit,
        }),
      );
    } catch (error) {
      if (error instanceof Error && error.message === "Location not found") {
        res.status(404).json({ error: "Location not found" });
        return;
      }
      if (
        error instanceof Error &&
        error.message === "Delivery points not available"
      ) {
        res
          .status(503)
          .json({ error: "Delivery points are temporarily unavailable" });
        return;
      }
      console.error("Error loading delivery points:", error);
      sendApplicationError(res, error);
    }
  });

  return router;
}
