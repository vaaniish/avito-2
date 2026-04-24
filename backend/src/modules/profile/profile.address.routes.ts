import { PrismaClient, UserAddress } from "@prisma/client";
import { Router, type Request, type Response } from "express";
import { type ProfileAddressDto } from "./profile.shared";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

type DeliveryProviderFilter = "all" | "russian_post" | "yandex_pvz";

type LocationPayload = {
  city: string;
  label: string;
  lat: number;
  lng: number;
};

type DeliveryPointPayload = Record<string, unknown>;

type DeliveryPaginationPayload = {
  total: number;
  cursor: number;
  nextCursor: number | null;
  hasMore: boolean;
};

type ProfileAddressRouterDeps = {
  prisma: PrismaClient;
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  roleBuyer: string;
  roleSeller: string;
  roleAdmin: string;
  mapUserAddressToDto: (address: UserAddress) => ProfileAddressDto;
  normalizeTextField: (value: unknown) => string;
  parseLegacyBuilding: (value: string) => {
    house: string;
    apartment: string;
    entrance: string;
  };
  buildAddressFullAddress: (parts: {
    region?: string;
    city?: string;
    street?: string;
    house?: string;
    apartment?: string;
    entrance?: string;
  }) => string;
  loadLocationSuggestionsByYandex: (
    query: string,
    limit: number,
  ) => Promise<unknown[]>;
  parseDeliveryProviderFilter: (value: unknown) => DeliveryProviderFilter;
  getDeliveryPoints: (
    query: string,
    providerFilter: DeliveryProviderFilter,
    options?: { cursor?: number; limit?: number },
  ) => Promise<{
    location: LocationPayload;
    points: DeliveryPointPayload[];
    pagination?: DeliveryPaginationPayload;
  }>;
  deliveryProviders: Array<{ code: string; label: string }>;
};

function profileRoles(deps: ProfileAddressRouterDeps): string[] {
  return [deps.roleBuyer, deps.roleSeller, deps.roleAdmin];
}

export function createProfileAddressRouter(
  deps: ProfileAddressRouterDeps,
): Router {
  const router = Router();

  router.get("/addresses", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const addresses = await deps.prisma.userAddress.findMany({
        where: { user_id: session.user.id },
        orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
      });

      res.json(addresses.map((address) => deps.mapUserAddressToDto(address)));
    } catch (error) {
      console.error("Error fetching addresses:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/addresses", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        name?: unknown;
        label?: unknown;
        fullAddress?: unknown;
        region?: unknown;
        city?: unknown;
        street?: unknown;
        house?: unknown;
        apartment?: unknown;
        entrance?: unknown;
        postalCode?: unknown;
        lat?: unknown;
        lon?: unknown;
        isDefault?: unknown;
        cityName?: unknown;
        regionName?: unknown;
        building?: unknown;
      };

      const label = deps.normalizeTextField(body.name ?? body.label);
      const fullAddress = deps.normalizeTextField(body.fullAddress);
      const region = deps.normalizeTextField(body.region ?? body.regionName);
      const city = deps.normalizeTextField(body.city ?? body.cityName);
      const street = deps.normalizeTextField(body.street);
      const postalCode = deps.normalizeTextField(body.postalCode);
      const legacyBuilding = deps.normalizeTextField(body.building);

      const parsedLegacyBuilding = deps.parseLegacyBuilding(legacyBuilding);
      const house = deps.normalizeTextField(body.house) || parsedLegacyBuilding.house;
      const apartment =
        deps.normalizeTextField(body.apartment) || parsedLegacyBuilding.apartment;
      const entrance =
        deps.normalizeTextField(body.entrance) || parsedLegacyBuilding.entrance;

      const lat =
        typeof body.lat === "number" && Number.isFinite(body.lat) ? body.lat : null;
      const lon =
        typeof body.lon === "number" && Number.isFinite(body.lon) ? body.lon : null;
      const isDefault = Boolean(body.isDefault);
      const existingAddressCount = await deps.prisma.userAddress.count({
        where: { user_id: session.user.id },
      });
      const effectiveIsDefault = isDefault || existingAddressCount === 0;

      const normalizedFullAddress =
        fullAddress ||
        deps.buildAddressFullAddress({
          region,
          city,
          street,
          house,
          apartment,
          entrance,
        }) ||
        [region, city, street, house].filter(Boolean).join(", ");

      if (!label) {
        res.status(400).json({ error: "Address label is required" });
        return;
      }

      if (!normalizedFullAddress) {
        res.status(400).json({ error: "Address text is required" });
        return;
      }

      if (lat === null || lon === null) {
        res.status(400).json({ error: "Address coordinates are required" });
        return;
      }

      if (effectiveIsDefault) {
        await deps.prisma.userAddress.updateMany({
          where: { user_id: session.user.id },
          data: { is_default: false },
        });
      }

      const created = await deps.prisma.userAddress.create({
        data: {
          user_id: session.user.id,
          label,
          full_address: normalizedFullAddress,
          region: region || "",
          city: city || "",
          street: street || "",
          house: house || "",
          apartment,
          entrance,
          postal_code: postalCode || "",
          lat,
          lon,
          is_default: effectiveIsDefault,
        },
      });

      res.status(201).json(deps.mapUserAddressToDto(created));
    } catch (error) {
      console.error("Error creating address:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/addresses/:id", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid address id" });
        return;
      }

      const existing = await deps.prisma.userAddress.findFirst({
        where: { id, user_id: session.user.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      const body = (req.body ?? {}) as {
        name?: unknown;
        label?: unknown;
        fullAddress?: unknown;
        region?: unknown;
        city?: unknown;
        street?: unknown;
        house?: unknown;
        apartment?: unknown;
        entrance?: unknown;
        postalCode?: unknown;
        lat?: unknown;
        lon?: unknown;
        isDefault?: unknown;
        building?: unknown;
      };

      const hasIsDefault = typeof body.isDefault === "boolean";
      const isDefault = hasIsDefault ? Boolean(body.isDefault) : undefined;
      if (isDefault) {
        await deps.prisma.userAddress.updateMany({
          where: { user_id: session.user.id },
          data: { is_default: false },
        });
      }

      const legacyBuilding = deps.normalizeTextField(body.building);
      const parsedLegacyBuilding = deps.parseLegacyBuilding(legacyBuilding);

      const updated = await deps.prisma.userAddress.update({
        where: { id: existing.id },
        data: {
          label: deps.normalizeTextField(body.name ?? body.label) || undefined,
          full_address: deps.normalizeTextField(body.fullAddress) || undefined,
          region: deps.normalizeTextField(body.region) || undefined,
          city: deps.normalizeTextField(body.city) || undefined,
          street: typeof body.street === "string" ? body.street.trim() : undefined,
          house:
            deps.normalizeTextField(body.house) ||
            parsedLegacyBuilding.house ||
            undefined,
          apartment:
            deps.normalizeTextField(body.apartment) ||
            parsedLegacyBuilding.apartment ||
            undefined,
          entrance:
            deps.normalizeTextField(body.entrance) ||
            parsedLegacyBuilding.entrance ||
            undefined,
          postal_code:
            typeof body.postalCode === "string" ? body.postalCode.trim() : undefined,
          lat:
            typeof body.lat === "number" && Number.isFinite(body.lat)
              ? body.lat
              : undefined,
          lon:
            typeof body.lon === "number" && Number.isFinite(body.lon)
              ? body.lon
              : undefined,
          is_default: isDefault,
        },
      });

      res.json(deps.mapUserAddressToDto(updated));
    } catch (error) {
      console.error("Error updating address:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.delete("/addresses/:id", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid address id" });
        return;
      }

      const existing = await deps.prisma.userAddress.findFirst({
        where: { id, user_id: session.user.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      if (existing.is_default) {
        res.status(400).json({ error: "Default address cannot be deleted" });
        return;
      }

      await deps.prisma.userAddress.delete({
        where: { id: existing.id },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting address:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.post("/addresses/:id/default", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid address id" });
        return;
      }

      const existing = await deps.prisma.userAddress.findFirst({
        where: { id, user_id: session.user.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      await deps.prisma.$transaction([
        deps.prisma.userAddress.updateMany({
          where: { user_id: session.user.id },
          data: { is_default: false },
        }),
        deps.prisma.userAddress.update({
          where: { id: existing.id },
          data: { is_default: true },
        }),
      ]);

      res.json({ success: true });
    } catch (error) {
      console.error("Error changing default address:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/location/suggest", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 8;
      const limit =
        Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 10) : 8;

      if (!rawQuery) {
        res.json({ query: "", suggestions: [] });
        return;
      }

      const suggestions = await deps.loadLocationSuggestionsByYandex(rawQuery, limit);
      res.json({
        query: rawQuery,
        suggestions,
      });
    } catch (error) {
      console.error("Error loading location suggestions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/delivery-points", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const locationQuery =
        typeof req.query.city === "string" ? req.query.city.trim() : "";
      if (!locationQuery) {
        res.status(400).json({ error: "City query is required" });
        return;
      }

      const providerFilter = deps.parseDeliveryProviderFilter(req.query.provider);
      const cursorRaw = typeof req.query.cursor === "string" ? Number(req.query.cursor) : 0;
      const limitRaw =
        typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
      const cursor =
        Number.isFinite(cursorRaw) && cursorRaw > 0 ? Math.floor(cursorRaw) : 0;
      const limit =
        typeof limitRaw === "number" && Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.floor(limitRaw)
          : undefined;

      const { location, points, pagination } = await deps.getDeliveryPoints(
        locationQuery,
        providerFilter,
        { cursor, limit },
      );

      res.json({
        city: location.city,
        location: {
          label: location.label,
          lat: location.lat,
          lng: location.lng,
        },
        providers: deps.deliveryProviders,
        activeProvider: providerFilter === "all" ? "yandex_pvz" : providerFilter,
        points,
        pagination: pagination ?? null,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Location not found") {
        res.status(404).json({ error: "Location not found" });
        return;
      }
      if (
        error instanceof Error &&
        error.message === "Delivery points not available"
      ) {
        res.status(503).json({ error: "Delivery points are temporarily unavailable" });
        return;
      }
      console.error("Error loading delivery points:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
