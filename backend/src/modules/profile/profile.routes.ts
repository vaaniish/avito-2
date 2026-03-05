import {
  AppUser,
  ListingImage,
  MarketOrder,
  MarketOrderItem,
  MarketplaceListing,
  UserAddress,
  WishlistItem,
  City,
  Prisma, // Added Prisma import
} from "@prisma/client";
import { randomUUID } from "crypto";
import { Router, type Request, type Response } from "express";
import { prisma } from "../../lib/prisma";
import { requireAnyRole } from "../../lib/session";
import {
  toClientCondition,
  toClientRole,
  toProfileOrderStatus,
} from "../../utils/format";

const profileRouter = Router();
const ROLE_BUYER = "BUYER";
const ROLE_SELLER = "SELLER";
const ROLE_ADMIN = "ADMIN";
const FALLBACK_LISTING_IMAGE =
  "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&q=80";

type YooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  confirmation?: {
    type?: string;
    confirmation_url?: string;
  };
};

type YooKassaConfig = {
  shopId: string;
  secretKey: string;
  returnUrl: string;
  apiUrl: string;
};

function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const cause = (error as { cause?: unknown }).cause as
    | { code?: unknown }
    | undefined;
  const code = typeof cause?.code === "string" ? cause.code : "";
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toLocalizedDeliveryDate(date: Date): string {
  const deliveryDate = new Date(date.getTime());
  deliveryDate.setDate(deliveryDate.getDate() + 3);
  return deliveryDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
}

function getYooKassaConfig(): YooKassaConfig {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim();
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim();

  if (!shopId || !secretKey) {
    throw new Error(
      "YooKassa is not configured. Set YOOKASSA_SHOP_ID and YOOKASSA_SECRET_KEY.",
    );
  }

  return {
    shopId,
    secretKey,
    returnUrl:
      process.env.YOOKASSA_RETURN_URL?.trim() || "http://127.0.0.1:3000",
    apiUrl: process.env.YOOKASSA_API_URL?.trim() || "https://api.yookassa.ru/v3",
  };
}

async function createYooKassaPayment(params: {
  amountRub: number;
  description: string;
  metadata: Record<string, string>;
}): Promise<YooKassaPayment> {
  const config = getYooKassaConfig();
  const authToken = Buffer.from(
    `${config.shopId}:${config.secretKey}`,
    "utf8",
  ).toString("base64");

  const payloadBody = JSON.stringify({
    amount: {
      value: params.amountRub.toFixed(2),
      currency: "RUB",
    },
    capture: true,
    confirmation: {
      type: "redirect",
      return_url: config.returnUrl,
    },
    description: params.description,
    metadata: params.metadata,
  });

  let response: globalThis.Response | null = null;
  let lastError: unknown = null;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      response = await fetch(`${config.apiUrl}/payments`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${authToken}`,
          "Content-Type": "application/json",
          "Idempotence-Key": randomUUID(),
        },
        body: payloadBody,
      });
      break;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === maxAttempts) {
        throw error;
      }
      await delay(300 * attempt);
    }
  }

  if (!response) {
    if (isRetryableNetworkError(lastError)) {
      throw new Error(
        "YooKassa is temporarily unavailable (DNS/network). Check internet, VPN/proxy, and DNS settings.",
      );
    }
    throw new Error("YooKassa request failed");
  }

  const rawBody = await response.text();
  const payload = rawBody ? (JSON.parse(rawBody) as unknown) : {};

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "description" in payload &&
      typeof (payload as { description?: unknown }).description === "string"
        ? (payload as { description: string }).description
        : `YooKassa request failed with status ${response.status}`;
    throw new Error(message);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof (payload as { id?: unknown }).id !== "string" ||
    typeof (payload as { status?: unknown }).status !== "string"
  ) {
    throw new Error("Invalid YooKassa response");
  }

  return payload as YooKassaPayment;
}

profileRouter.get("/me", async (req: Request, res: Response) => {
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

    const user = await prisma.appUser.findUnique({
      where: { id: session.user.id },
      include: {
        city: true, // Include City for AppUser
        addresses: {
          orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
          include: { city: true }, // Include City for UserAddress
        },
        wishlist_items: {
          include: {
            listing: {
              include: {
                seller: { include: { city: true } }, // Include City for seller in listing
                images: {
                  orderBy: [{ sort_order: "asc" }, { id: "asc" }],
                },
                city: true, // Include City for listing
              },
            },
          },
          orderBy: [{ added_at: "desc" }],
        },
        orders_as_buyer: {
          include: {
            seller: { include: { city: true } }, // Include City for seller in order
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

    // Type for AppUser with included relations
    type UserWithRelations = AppUser & {
      city: City | null;
      addresses: (UserAddress & { city: City })[];
      orders_as_buyer: (MarketOrder & {
        seller: AppUser & { city: City | null };
        items: (MarketOrderItem & { listing: { public_id: string } | null })[];
      })[];
      wishlist_items: (WishlistItem & {
        listing: MarketplaceListing & {
          seller: AppUser & { city: City | null };
          images: ListingImage[];
          city: City;
        };
      })[];
    };

    const userWithRelations = user as UserWithRelations;

    res.json({
      user: {
        id: userWithRelations.id,
        public_id: userWithRelations.public_id,
        role: toClientRole(userWithRelations.role),
        firstName: userWithRelations.first_name ?? "",
        lastName: userWithRelations.last_name ?? "",
        displayName: userWithRelations.display_name ?? userWithRelations.name,
        name: userWithRelations.name,
        email: userWithRelations.email,
        avatar: userWithRelations.avatar,
        city: userWithRelations.city?.name ?? null, // Use city.name
        joinDate: userWithRelations.joined_at.getFullYear().toString(),
      },
      addresses: userWithRelations.addresses.map((address) => ({
        id: String(address.id),
        name: address.label,
        region: address.city.region, // Use address.city.region
        city: address.city.name, // Use address.city.name
        street: address.street,
        building: address.building,
        postalCode: address.postal_code,
        isDefault: address.is_default,
      })),
      orders: userWithRelations.orders_as_buyer.map(
        (order) => ({
          id: String(order.id),
          orderNumber: `#${order.public_id}`,
          date: order.created_at,
          status: toProfileOrderStatus(order.status),
          total: order.total_price,
          deliveryDate: toLocalizedDeliveryDate(order.created_at),
          deliveryAddress: order.delivery_address ?? "Адрес не указан",
          deliveryCost: order.delivery_cost,
          discount: order.discount,
          seller: {
            name: order.seller.name,
            avatar: order.seller.avatar,
            phone: order.seller.phone ?? "",
            address: `${order.seller.city?.name ?? "Город не указан"}`, // Use order.seller.city.name
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
        }),
      ),
      wishlist: userWithRelations.wishlist_items.map(
        (item) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location: item.listing.city.name, // Use item.listing.city.name
          condition: toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        }),
      ),
      wishlist: userWithRelations.wishlist_items.map(
        (item) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location: item.listing.city.name, // Use item.listing.city.name
          condition: toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        }),
      ),
      wishlist: userWithRelations.wishlist_items.map(
        (item) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location: item.listing.city.name, // Use item.listing.city.name
          condition: toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        }),
      ),
      wishlist: userWithRelations.wishlist_items.map(
        (item) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location: item.listing.city.name, // Use item.listing.city.name
          condition: toClientCondition(item.listing.condition),
          seller: item.listing.seller.name,
          addedDate: item.added_at.toISOString().split("T")[0],
        }),
      ),
    });
  } catch (error) {
    console.error("Error fetching profile data:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.patch("/me", async (req: Request, res: Response) => {
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
      firstName?: unknown;
      lastName?: unknown;
      displayName?: unknown;
      email?: unknown;
      oldPassword?: unknown;
      newPassword?: unknown;
    };

    const user = await prisma.appUser.findUnique({
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
    const oldPassword =
      typeof body.oldPassword === "string" ? body.oldPassword : "";
    const newPassword =
      typeof body.newPassword === "string" ? body.newPassword : "";

    if (newPassword && oldPassword !== user.password) {
      res.status(400).json({ error: "Старый пароль указан неверно" });
      return;
    }

    const updated = await prisma.appUser.update({
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
        password: newPassword || undefined,
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
        role: toClientRole(updated.role),
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

profileRouter.get("/addresses", async (req: Request, res: Response) => {
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

    const addresses = await prisma.userAddress.findMany({
      where: { user_id: session.user.id },
      include: { city: true }, // Include City for UserAddress
      orderBy: [{ is_default: "desc" }, { created_at: "desc" }],
    });

    res.json(
      addresses.map((address: UserAddress & { city: City }) => ({
        id: String(address.id),
        label: address.label,
        fullAddress: `${address.city.region}, ${address.city.name}, ${address.street}, ${address.building}`,
        isDefault: address.is_default,
        region: address.city.region, // Use address.city.region
        city: address.city.name, // Use address.city.name
        street: address.street,
        building: address.building,
        postalCode: address.postal_code,
      })),
    );
  } catch (error) {
    console.error("Error fetching addresses:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post("/addresses", async (req: Request, res: Response) => {
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
      name?: unknown;
      cityId?: unknown; // Changed from city and region
      street?: unknown;
      building?: unknown;
      postalCode?: unknown;
      isDefault?: unknown;
    };

    const label = typeof body.name === "string" ? body.name.trim() : "";
    const cityId = typeof body.cityId === "number" ? body.cityId : 0; // Changed from region and city
    const street = typeof body.street === "string" ? body.street.trim() : "";
    const building =
      typeof body.building === "string" ? body.building.trim() : "";
    const postalCode =
      typeof body.postalCode === "string" ? body.postalCode.trim() : "";
    const isDefault = Boolean(body.isDefault);

    if (!label || !cityId || !street) { // Updated validation
      res.status(400).json({ error: "Missing required address fields" });
      return;
    }

    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { user_id: session.user.id },
        data: { is_default: false },
      });
    }

    const created = await prisma.userAddress.create({
      data: {
        user_id: session.user.id,
        label,
        city_id: cityId, // Use city_id
        street,
        building,
        postal_code: postalCode,
        is_default: isDefault,
      },
      include: { city: true }, // Include City for response mapping
    });

    res.status(201).json({
      id: String(created.id),
      name: created.label,
      region: created.city.region, // Use created.city.region
      city: created.city.name, // Use created.city.name
      street: created.street,
      building: created.building,
      postalCode: created.postal_code,
      isDefault: created.is_default,
    });
  } catch (error) {
    console.error("Error creating address:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.patch("/addresses/:id", async (req: Request, res: Response) => {
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

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid address id" });
      return;
    }

    const existing = await prisma.userAddress.findFirst({
      where: { id, user_id: session.user.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    const body = (req.body ?? {}) as {
      name?: unknown;
      cityId?: unknown; // Changed from city and region
      street?: unknown;
      building?: unknown;
      postalCode?: unknown;
      isDefault?: unknown;
    };

    const isDefault = Boolean(body.isDefault);
    if (isDefault) {
      await prisma.userAddress.updateMany({
        where: { user_id: session.user.id },
        data: { is_default: false },
      });
    }

    const updated = await prisma.userAddress.update({
      where: { id: existing.id },
      data: {
        label: typeof body.name === "string" ? body.name.trim() : undefined,
        city_id: typeof body.cityId === "number" ? body.cityId : undefined, // Use city_id
        street:
          typeof body.street === "string" ? body.street.trim() : undefined,
        building:
          typeof body.building === "string" ? body.building.trim() : undefined,
        postal_code:
          typeof body.postalCode === "string"
            ? body.postalCode.trim()
            : undefined,
        is_default: isDefault,
      },
      include: { city: true }, // Add missing include here
    });

    res.json({
      id: String(updated.id),
      name: updated.label,
      region: updated.city.region, // Use updated.city.region
      city: updated.city.name, // Use updated.city.name
      street: updated.street,
      building: updated.building,
      postalCode: updated.postal_code,
      isDefault: updated.is_default,
    });
  } catch (error) {
    console.error("Error updating address:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.delete("/addresses/:id", async (req: Request, res: Response) => {
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

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid address id" });
      return;
    }

    const existing = await prisma.userAddress.findFirst({
      where: { id, user_id: session.user.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    await prisma.userAddress.delete({
      where: { id: existing.id },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting address:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.post(
  "/addresses/:id/default",
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

      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "Invalid address id" });
        return;
      }

      const existing = await prisma.userAddress.findFirst({
        where: { id, user_id: session.user.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      await prisma.$transaction([
        prisma.userAddress.updateMany({
          where: { user_id: session.user.id },
          data: { is_default: false },
        }),
        prisma.userAddress.update({
          where: { id: existing.id },
          data: { is_default: true },
        }),
      ]);

      res.json({ success: true });
    } catch (error) {
      console.error("Error changing default address:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.post("/orders", async (req: Request, res: Response) => {
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
      items?: unknown;
      addressId?: unknown;
      customAddress?: unknown;
      deliveryType?: unknown;
      paymentMethod?: unknown;
    };

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const parsedItems = rawItems
      .map((item) => item as { listingId?: unknown; quantity?: unknown })
      .map((item: { listingId?: unknown; quantity?: unknown }) => ({
        listingId: typeof item.listingId === "string" ? item.listingId : "",
        quantity: Number(item.quantity ?? 0),
      }))
      .filter(
        (item) =>
          item.listingId &&
          Number.isInteger(item.quantity) &&
          item.quantity > 0,
      );

    if (parsedItems.length === 0) {
      res
        .status(400)
        .json({ error: "Корзина пуста или содержит некорректные позиции" });
      return;
    }

    const listingPublicIds = [
      ...new Set(
        parsedItems.map((item: { listingId: string }) => item.listingId),
      ),
    ];
    const listings = await prisma.marketplaceListing.findMany({
      where: {
        public_id: { in: listingPublicIds },
        moderation_status: "APPROVED",
        status: "ACTIVE",
      },
      include: {
        images: {
          select: { url: true },
          orderBy: [{ sort_order: "asc" }, { id: "asc" }],
          take: 1,
        },
      },
    });

    if (listings.length !== listingPublicIds.length) {
      res
        .status(400)
        .json({ error: "Некоторые товары недоступны для заказа" });
      return;
    }

    const listingByPublicId = new Map<string, {
      id: number;
      public_id: string;
      seller_id: number;
      title: string;
      images: Array<{ url: string }>;
      price: number;
    }>(
      listings.map((listing: {
        id: number;
        public_id: string;
        seller_id: number;
        title: string;
        images: Array<{ url: string }>;
        price: number;
      }) => [listing.public_id, listing]),
    );
    const groupedBySeller = new Map<
      number,
      Array<{
        listing_id: number;
        name: string;
        image: string | null;
        price: number;
        quantity: number;
      }>
    >();

    for (const item of parsedItems) {
      const listing = listingByPublicId.get(item.listingId);
      if (!listing) {
        res.status(400).json({ error: `Товар ${item.listingId} не найден` });
        return;
      }

      const current = groupedBySeller.get(listing.seller_id) ?? [];
      current.push({
        listing_id: listing.id,
        name: listing.title,
        image: listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
        price: listing.price,
        quantity: item.quantity,
      });
      groupedBySeller.set(listing.seller_id, current);
    }

    const deliveryType =
      body.deliveryType === "pickup" ? "PICKUP" : "DELIVERY";
    const paymentMethod = body.paymentMethod === "cash" ? "cash" : "card";

    const customAddress =
      typeof body.customAddress === "string" ? body.customAddress.trim() : "";
    const addressId = Number(body.addressId ?? 0);

    let deliveryAddress = customAddress;
    if (!deliveryAddress && Number.isInteger(addressId) && addressId > 0) {
      const selectedAddress = await prisma.userAddress.findFirst({
        where: {
          id: addressId,
          user_id: session.user.id,
        },
        include: { city: true }, // Add missing include here
      });
      if (selectedAddress) {
        deliveryAddress = `${selectedAddress.city.region}, ${selectedAddress.city.name}, ${selectedAddress.street}, ${selectedAddress.building}`;
      }
    }

    if (!deliveryAddress) {
      const defaultAddress = await prisma.userAddress.findFirst({
        where: {
          user_id: session.user.id,
          is_default: true,
        },
        include: { city: true }, // Add missing include here
      });
      if (defaultAddress) {
        deliveryAddress = `${defaultAddress.city.region}, ${defaultAddress.city.name}, ${defaultAddress.street}, ${defaultAddress.building}`;
      }
    }

    if (deliveryType === "DELIVERY" && !deliveryAddress) {
      res.status(400).json({ error: "Укажите адрес доставки" });
      return;
    }

    const preparedOrders = Array.from(groupedBySeller.entries()).map(
      ([sellerId, items], index) => {
        const subtotal = items.reduce(
          (sum: number, item: { price: number; quantity: number }) =>
            sum + item.price * item.quantity,
          0,
        );
        const deliveryCost = deliveryType === "DELIVERY" ? 500 : 0;
        const discount = 0;
        const totalPrice = subtotal + deliveryCost - discount;
        const publicId = `ORD-${Date.now()}-${index + 1}`;
        return {
          sellerId,
          items,
          subtotal,
          deliveryCost,
          discount,
          totalPrice,
          publicId,
        };
      },
    );

    const totalAmount = preparedOrders.reduce(
      (sum, order) => sum + order.totalPrice,
      0,
    );
    const yookassaPayment =
      paymentMethod === "card"
        ? await createYooKassaPayment({
            amountRub: totalAmount,
            description: `Оплата заказа в Ecomm (${preparedOrders.length} шт.)`,
            metadata: {
              source: "avito-2",
              buyer_id: String(session.user.id),
              orders_count: String(preparedOrders.length),
            },
          })
        : null;

    if (
      paymentMethod === "card" &&
      !yookassaPayment?.confirmation?.confirmation_url
    ) {
      throw new Error(
        "YooKassa did not return confirmation URL for redirect payment",
      );
    }

    const createdOrders = await prisma.$transaction(async (tx) => {
      const result: Array<{
        order_id: string;
        total_price: number;
      }> = [];

      let sequence = 0;
      for (const preparedOrder of preparedOrders) {
        sequence += 1;
        const order = await tx.marketOrder.create({
          data: {
            public_id: preparedOrder.publicId,
            buyer_id: session.user.id,
            seller_id: preparedOrder.sellerId,
            status: "PAID",
            delivery_type: deliveryType,
            delivery_address:
              deliveryType === "DELIVERY" ? deliveryAddress : "Самовывоз",
            total_price: preparedOrder.totalPrice,
            delivery_cost: preparedOrder.deliveryCost,
            discount: preparedOrder.discount,
            items: {
              create: preparedOrder.items.map((item) => ({
                listing_id: item.listing_id,
                name: item.name,
                image: item.image,
                price: item.price,
                quantity: item.quantity,
              })),
            },
          },
        });

        const commissionRate = 3.5;
        const commission = Math.round(
          (preparedOrder.totalPrice * commissionRate) / 100,
        );
        await tx.platformTransaction.create({
          data: {
            public_id: `TXN-${Date.now()}-${sequence}`,
            order_id: order.id,
            buyer_id: session.user.id,
            seller_id: preparedOrder.sellerId,
            amount: preparedOrder.totalPrice,
            status: paymentMethod === "cash" ? "SUCCESS" : "HELD",
            commission_rate: commissionRate,
            commission,
            payment_provider: paymentMethod === "cash" ? "Cash" : "YooMoney",
            payment_intent_id:
              paymentMethod === "cash"
                ? `pay_${Date.now()}_${sequence}`
                : yookassaPayment?.id ?? `pay_${Date.now()}_${sequence}`,
          },
        });

        result.push({
          order_id: order.public_id,
          total_price: preparedOrder.totalPrice,
        });
      }

      return result;
    });

    // await prisma.auditLog.create({ // Removed AuditLog
    //   data: {
    //     public_id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1_000)}`,
    //     admin_id: session.user.id,
    //     action: "create_order",
    //     target_id: createdOrders.map((o: {order_id: string}) => o.order_id).join(", "),
    //     target_type: "order",
    //     details: `Пользователь ${
    //       session.user.email
    //     } создал ${createdOrders.length} заказ(а/ов) на сумму ${createdOrders.reduce(
    //       (sum: number, order: { total_price: number }) => sum + order.total_price,
    //       0,
    //     )}.`,
    //     ip_address: req.ip || "127.0.0.1",
    //   },
    // });

    res.status(201).json({
      success: true,
      orders: createdOrders,
      total: createdOrders.reduce(
        (sum: number, order: { total_price: number }) => sum + order.total_price,
        0,
      ),
      payment:
        paymentMethod === "card"
          ? {
              provider: "yoomoney",
              paymentId: yookassaPayment?.id ?? null,
              status: yookassaPayment?.status ?? null,
              confirmationUrl:
                yookassaPayment?.confirmation?.confirmation_url ?? null,
            }
          : null,
    });
  } catch (error) {
    console.error("Error creating orders:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message.includes("YooKassa") || message.includes("YooMoney")) {
      res.status(502).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.get("/orders", async (req: Request, res: Response) => {
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

    const orders = await prisma.marketOrder.findMany({
      where: { buyer_id: session.user.id },
      include: {
        seller: { include: { city: true } }, // Include City for seller in order
        items: true,
      },
      orderBy: [{ created_at: "desc" }],
    });

    res.json(
      orders.map(
        (
          order: MarketOrder & { seller: AppUser & { city: City | null }; items: MarketOrderItem[] },
        ) => ({
          id: String(order.id),
          orderNumber: `#${order.public_id}`,
          date: order.created_at,
          status: toProfileOrderStatus(order.status),
          total: order.total_price,
          deliveryDate: toLocalizedDeliveryDate(order.created_at),
          deliveryAddress: order.delivery_address ?? "Адрес не указан",
          deliveryCost: order.delivery_cost,
          discount: order.discount,
          seller: {
            name: order.seller.name,
            avatar: order.seller.avatar,
            phone: order.seller.phone ?? "",
            address: `${order.seller.city?.name ?? "Город не указан"}`, // Use order.seller.city.name
            workingHours: "пн — вс: 9:00-21:00",
          },
          items: order.items.map((item: MarketOrderItem) => ({
            id: String(item.id),
            name: item.name,
            image: item.image ?? "",
            price: item.price,
            quantity: item.quantity,
          })),
        }),
      ),
    );
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.get("/wishlist", async (req: Request, res: Response) => {
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

    const wishlist = await prisma.wishlistItem.findMany({
      where: { user_id: session.user.id },
      include: {
        listing: {
          include: {
            seller: true,
            images: {
              orderBy: [{ sort_order: "asc" }, { id: "asc" }],
            },
            city: true, // Include City for listing
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
              seller: AppUser;
              images: ListingImage[];
              city: City; // Include City in type definition
            };
          },
        ) => ({
          id: item.listing.public_id,
          name: item.listing.title,
          price: item.listing.sale_price ?? item.listing.price,
          image: item.listing.images[0]?.url ?? FALLBACK_LISTING_IMAGE,
          location: item.listing.city.name, // Use item.listing.city.name
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

profileRouter.post(
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
        select: { id: true },
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

      // await prisma.auditLog.create({ // Removed AuditLog
      //   data: {
      //     public_id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1_000)}`,
      //     admin_id: session.user.id,
      //     action: "add_to_wishlist",
      //     target_id: String(listingPublicId),
      //     target_type: "listing",
      //     details: `Пользователь ${
      //       session.user.email
      //     } добавил товар ${listingPublicId} в избранное.`,
      //     ip_address: req.ip || "127.0.0.1",
      //   },
      // });

      res.status(201).json({ success: true });
    } catch (error) {
      console.error("Error adding wishlist item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.delete(
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
        select: { id: true },
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

      // await prisma.auditLog.create({ // Removed AuditLog
      //   data: {
      //     public_id: `LOG-${Date.now()}-${Math.floor(Math.random() * 1_000)}`,
      //     admin_id: session.user.id,
      //     action: "remove_from_wishlist",
      //     target_id: String(listingPublicId),
      //     target_type: "listing",
      //     details: `Пользователь ${
      //       session.user.email
      //     } удалил товар ${listingPublicId} из избранного.`,
      //     ip_address: req.ip || "127.0.0.1",
      //   },
      // });

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting wishlist item:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

profileRouter.post(
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

      const sellerTypeRaw =
        typeof body.sellerType === "string" ? body.sellerType : "company";
      const sellerType = sellerTypeRaw === "private" ? "PRIVATE" : "COMPANY";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const contact =
        typeof body.contact === "string" ? body.contact.trim() : "";
      const link = typeof body.link === "string" ? body.link.trim() : "";
      const category =
        typeof body.category === "string" ? body.category.trim() : "";
      const whyUs = typeof body.whyUs === "string" ? body.whyUs.trim() : "";

      if (!name || !email || !contact || !link || !category || !whyUs) {
        res.status(400).json({ error: "Заполните обязательные поля заявки" });
        return;
      }

      const created = await prisma.partnershipRequest.create({
        data: {
          public_id: `PRQ-${Date.now()}`,
          user_id: session.user.id,
          seller_type: sellerType,
          name,
          email,
          contact,
          link,
          category,
          inn: typeof body.inn === "string" ? body.inn.trim() : null,
          geography:
            typeof body.geography === "string" ? body.geography.trim() : null,
          social_profile:
            typeof body.socialProfile === "string"
              ? body.socialProfile.trim()
              : null,
          credibility:
            typeof body.credibility === "string"
              ? body.credibility.trim()
              : null,
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

profileRouter.post(
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
        res.status(400).json({ error: "Rating must be an integer from 1 to 5" });
        return;
      }

      if (comment.length < 3) {
        res.status(400).json({ error: "Comment is too short" });
        return;
      }

      const listing = await prisma.marketplaceListing.findUnique({
        where: { public_id: String(listingPublicId) },
        select: { id: true },
      });

      if (!listing) {
        res.status(404).json({ error: "Listing not found" });
        return;
      }

      // Verify the user has purchased this item
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
        res.status(403).json({ error: "You can only review items you have purchased." });
        return;
      }

      // Verify the user has not already reviewed this item
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

      // Recalculate average rating for the listing
      const avgRating = await prisma.listingReview.aggregate({
        _avg: {
          rating: true,
        },
        where: {
          listing_id: listing.id,
        },
      });

      await prisma.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          rating: avgRating._avg.rating ?? 0,
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

profileRouter.get("/notifications", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
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

    res.json({
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
    res.status(500).json({ error: "Internal server error" });
  }
});

profileRouter.patch("/notifications/mark-as-read", async (req: Request, res: Response) => {
  try {
    const session = await requireAnyRole(req, [ROLE_BUYER, ROLE_SELLER, ROLE_ADMIN]);
    if (!session.ok) {
      return res.status(session.status).json({ error: session.message });
    }

    await prisma.notification.updateMany({
      where: { user_id: session.user.id, is_read: false },
      data: { is_read: true },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { profileRouter };