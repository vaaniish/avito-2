import {
  AppUser,
  ListingImage,
  MarketOrder,
  MarketOrderItem,
  MarketplaceListing,
  PrismaClient,
  UserAddress,
  WishlistItem,
} from "@prisma/client";
import { Router, type Request, type Response } from "express";
import bcrypt from "bcrypt";
import { type ProfileAddressDto } from "./profile.shared";

type SessionResult =
  | { ok: true; user: { id: number } }
  | { ok: false; status: number; message: string };

type ProfileUserRouterDeps = {
  prisma: PrismaClient;
  requireAnyRole: (req: Request, roles: string[]) => Promise<SessionResult>;
  roleBuyer: string;
  roleSeller: string;
  roleAdmin: string;
  fallbackListingImage: string;
  toClientRole: (role: string) => "regular" | "partner" | "admin";
  toProfileOrderStatus: (
    status: string,
  ) => "processing" | "completed" | "cancelled" | "shipped";
  toClientCondition: (condition: string) => "new" | "used";
  toLocalizedDeliveryDate: (date: Date) => string;
  stripPickupPointTag: (address: string | null) => string;
  extractPrimaryCityFromAddresses: (
    addresses: Array<{ city: string | null | undefined }>,
  ) => string | null;
  mapUserAddressToDto: (address: UserAddress) => ProfileAddressDto;
};

function profileRoles(deps: ProfileUserRouterDeps): string[] {
  return [deps.roleBuyer, deps.roleSeller, deps.roleAdmin];
}

export function createProfileUserRouter(deps: ProfileUserRouterDeps): Router {
  const router = Router();

  router.get("/me", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const user = await deps.prisma.appUser.findUnique({
        where: { id: session.user.id },
        include: {
          addresses: {
            orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
          },
          wishlist_items: {
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
          },
          orders_as_buyer: {
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
              items: {
                include: {
                  listing: {
                    select: {
                      public_id: true,
                    },
                  },
                },
              },
            },
            orderBy: [{ created_at: "desc" }],
          },
        },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      type UserWithRelations = AppUser & {
        addresses: UserAddress[];
        orders_as_buyer: (MarketOrder & {
          seller: AppUser & { addresses: Array<{ city: string }> };
          items: (MarketOrderItem & { listing: { public_id: string } | null })[];
        })[];
        wishlist_items: (WishlistItem & {
          listing: MarketplaceListing & {
            seller: AppUser & { addresses: Array<{ city: string }> };
            images: ListingImage[];
          };
        })[];
      };

      const userWithRelations = user as UserWithRelations;

      res.json({
        user: {
          id: userWithRelations.id,
          public_id: userWithRelations.public_id,
          role: deps.toClientRole(userWithRelations.role),
          firstName: userWithRelations.first_name ?? "",
          lastName: userWithRelations.last_name ?? "",
          displayName: userWithRelations.display_name ?? userWithRelations.name,
          name: userWithRelations.name,
          email: userWithRelations.email,
          avatar: userWithRelations.avatar,
          city: deps.extractPrimaryCityFromAddresses(userWithRelations.addresses),
          joinDate: userWithRelations.joined_at.getFullYear().toString(),
        },
        addresses: userWithRelations.addresses.map((address) =>
          deps.mapUserAddressToDto(address),
        ),
        orders: userWithRelations.orders_as_buyer.map((order) => ({
          id: String(order.id),
          orderNumber: `#${order.public_id}`,
          date: order.created_at,
          status: deps.toProfileOrderStatus(order.status),
          total: order.total_price,
          deliveryDate: deps.toLocalizedDeliveryDate(order.created_at),
          deliveryAddress:
            deps.stripPickupPointTag(order.delivery_address) ||
            "Адрес не указан",
          deliveryCost: order.delivery_cost,
          discount: order.discount,
          seller: {
            name: order.seller.name,
            avatar: order.seller.avatar,
            phone: order.seller.phone ?? "",
            address: `${deps.extractPrimaryCityFromAddresses(order.seller.addresses) ?? "Город не указан"}`,
            workingHours: "пн — вс: 9:00-21:00",
          },
          items: order.items.map((item) => ({
            id: String(item.id),
            listingPublicId: item.listing?.public_id ?? "",
            name: item.name,
            image: item.image ?? "",
            price: item.price,
            quantity: item.quantity,
          })),
        })),
        wishlist: userWithRelations.wishlist_items.map((item) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? deps.fallbackListingImage,
          location:
            deps.extractPrimaryCityFromAddresses(item.listing.seller.addresses) ??
            "",
          condition: deps.toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        })),
      });
    } catch (error) {
      console.error("Error fetching profile data:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.patch("/me", async (req: Request, res: Response) => {
    try {
      const session = await deps.requireAnyRole(req, profileRoles(deps));
      if (!session.ok) {
        res.status(session.status).json({ error: session.message });
        return;
      }

      const body = (req.body ?? {}) as {
        firstName?: unknown;
        lastName?: unknown;
        displayName?: unknown;
        email?: unknown;
        oldPassword?: unknown;
        newPassword?: unknown;
      };

      const user = await deps.prisma.appUser.findUnique({
        where: { id: session.user.id },
        select: { id: true, password: true },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const firstName =
        typeof body.firstName === "string" ? body.firstName.trim() : undefined;
      const lastName =
        typeof body.lastName === "string" ? body.lastName.trim() : undefined;
      const displayName =
        typeof body.displayName === "string"
          ? body.displayName.trim()
          : undefined;
      const email =
        typeof body.email === "string"
          ? body.email.trim().toLowerCase()
          : undefined;
      const oldPassword = typeof body.oldPassword === "string" ? body.oldPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      let nextPasswordHash: string | undefined;

      if (newPassword) {
        if (!oldPassword) {
          res.status(400).json({ error: "Укажите текущий пароль" });
          return;
        }

        let isOldPasswordValid = false;
        try {
          isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
        } catch {
          isOldPasswordValid = oldPassword === user.password;
        }

        if (!isOldPasswordValid) {
          res
            .status(400)
            .json({ error: "Старый пароль указан неверно" });
          return;
        }

        nextPasswordHash = await bcrypt.hash(newPassword, 10);
      }

      const updated = await deps.prisma.appUser.update({
        where: { id: session.user.id },
        data: {
          first_name: firstName ?? undefined,
          last_name: lastName ?? undefined,
          display_name: displayName ?? undefined,
          email: email ?? undefined,
          name:
            displayName ||
            [firstName, lastName].filter(Boolean).join(" ") ||
            undefined,
          password: nextPasswordHash ?? undefined,
        },
        select: {
          id: true,
          public_id: true,
          role: true,
          first_name: true,
          last_name: true,
          display_name: true,
          email: true,
          name: true,
        },
      });

      res.json({
        success: true,
        user: {
          id: updated.id,
          public_id: updated.public_id,
          role: deps.toClientRole(updated.role),
          firstName: updated.first_name ?? "",
          lastName: updated.last_name ?? "",
          displayName: updated.display_name ?? updated.name,
          email: updated.email,
        },
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
