import type {
  AppUser,
  ListingImage,
  MarketOrder,
  MarketOrderItem,
  MarketplaceListing,
  UserAddress,
  WishlistItem,
} from "@prisma/client";
import { notFound, validationError } from "../../../../common/application-error";
import type { ProfileAddressDto } from "../../profile.shared";

export type ProfileUserViewHelpers = {
  fallbackListingImage: string;
  toClientRole: (role: string) => "regular" | "partner" | "admin";
  toProfileOrderStatus: (
    status: string,
  ) => "processing" | "prepared" | "completed" | "cancelled" | "shipped";
  toClientCondition: (condition: string) => "new" | "used";
  toLocalizedDeliveryDate: (date: Date) => string;
  stripPickupPointTag: (address: string | null) => string;
  extractPrimaryCityFromAddresses: (
    addresses: Array<{ city: string | null | undefined }>,
  ) => string | null;
  mapUserAddressToDto: (address: UserAddress) => ProfileAddressDto;
};

export type ProfileOverviewUser = AppUser & {
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

export function buildProfileOverviewDto(
  user: ProfileOverviewUser,
  reviewedListingIds: Set<number>,
  helpers: ProfileUserViewHelpers,
) {
  return {
    user: {
      id: user.id,
      public_id: user.public_id,
      role: helpers.toClientRole(user.role),
      firstName: user.first_name ?? "",
      lastName: user.last_name ?? "",
      displayName: user.display_name ?? user.name,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      city: helpers.extractPrimaryCityFromAddresses(user.addresses),
      joinDate: user.joined_at.getFullYear().toString(),
    },
    addresses: user.addresses.map((address) => helpers.mapUserAddressToDto(address)),
    orders: user.orders_as_buyer.map((order) => ({
      id: String(order.id),
      orderNumber: `#${order.public_id}`,
      date: order.created_at,
      status: helpers.toProfileOrderStatus(order.status),
      total: order.total_price,
      deliveryDate: helpers.toLocalizedDeliveryDate(order.created_at),
      deliveryAddress:
        helpers.stripPickupPointTag(order.delivery_address) || "Адрес не указан",
      deliveryCost: order.delivery_cost,
      discount: order.discount,
      trackingProvider: order.tracking_provider,
      trackingNumber: order.tracking_number,
      trackingUrl: order.tracking_url,
      deliveryExternalStatus: order.delivery_ext_status,
      seller: {
        name: order.seller.name,
        avatar: order.seller.avatar,
        phone: order.seller.phone ?? "",
        address: `${helpers.extractPrimaryCityFromAddresses(order.seller.addresses) ?? "Город не указан"}`,
        workingHours: "пн — вс: 9:00-21:00",
      },
      items: order.items.map((item) => {
        const reviewed =
          item.listing_id !== null && reviewedListingIds.has(item.listing_id);
        return {
          id: String(item.id),
          listingPublicId: item.listing?.public_id ?? "",
          name: item.name,
          image: item.image ?? "",
          price: item.price,
          quantity: item.quantity,
          reviewed,
          canReview:
            order.status === "COMPLETED" &&
            item.listing_id !== null &&
            !reviewed,
        };
      }),
    })),
    wishlist: user.wishlist_items.map((item) => ({
      id: item.listing.public_id,
      name: item.listing.title,
      price: item.listing.sale_price ?? item.listing.price,
      image: item.listing.images[0]?.url ?? helpers.fallbackListingImage,
      location:
        helpers.extractPrimaryCityFromAddresses(item.listing.seller.addresses) ??
        "",
      condition: helpers.toClientCondition(item.listing.condition),
      seller: item.listing.seller.name,
      addedDate: item.added_at.toISOString().split("T")[0],
    })),
  };
}

export function assertProfileUserExists<T>(user: T | null): T {
  if (!user) {
    throw notFound("User not found");
  }
  return user;
}

export function parseProfileUserUpdate(body: {
  firstName?: unknown;
  lastName?: unknown;
  displayName?: unknown;
  email?: unknown;
  oldPassword?: unknown;
  newPassword?: unknown;
}) {
  return {
    firstName:
      typeof body.firstName === "string" ? body.firstName.trim() : undefined,
    lastName:
      typeof body.lastName === "string" ? body.lastName.trim() : undefined,
    displayName:
      typeof body.displayName === "string"
        ? body.displayName.trim()
        : undefined,
    email:
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : undefined,
    oldPassword: typeof body.oldPassword === "string" ? body.oldPassword : "",
    newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
  };
}

export function validatePasswordChangeInput(input: {
  oldPassword: string;
  newPassword: string;
}) {
  if (input.newPassword && !input.oldPassword) {
    throw validationError("Укажите текущий пароль");
  }
}
